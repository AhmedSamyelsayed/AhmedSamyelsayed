-- =============================================================================
-- 0002 RLS helpers, policies, guard triggers, activity log, tenant RPCs
-- Isolation is enforced here, never in the frontend (CONTEXT.md section 4).
--
-- Note: CONTEXT.md names the role helper current_role(company). current_role
-- is a reserved SQL keyword in Postgres, so the function is company_role().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER so they can read membership tables
-- without recursing through RLS. search_path is pinned to '' for safety.
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_member(_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = _company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function public.company_role(_company_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.company_members m
  where m.company_id = _company_id
    and m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

-- Owners always hold every permission and cannot be locked out by overrides.
-- Otherwise a per-user override (grant or revoke) wins over the role default.
create or replace function public.has_permission(_company_id uuid, _perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when m.role = 'company_owner' then true
      when o.granted is not null then o.granted
      else exists (
        select 1 from public.role_permissions rp
        where rp.role = m.role and rp.permission = _perm
      )
    end
    from public.company_members m
    left join public.user_permission_overrides o
      on o.company_id = m.company_id
     and o.user_id = m.user_id
     and o.permission = _perm
    where m.company_id = _company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  ), false);
$$;

-- Effective permission list for the current user, used by the client to hide
-- UI only. Enforcement always happens through has_permission() in policies.
create or replace function public.my_permissions(_company_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.key order by p.key), '{}')
  from public.permissions p
  where public.has_permission(_company_id, p.key);
$$;

revoke execute on function
  public.is_platform_admin(),
  public.is_member(uuid),
  public.company_role(uuid),
  public.has_permission(uuid, text),
  public.my_permissions(uuid)
from public, anon;

grant execute on function
  public.is_platform_admin(),
  public.is_member(uuid),
  public.company_role(uuid),
  public.has_permission(uuid, text),
  public.my_permissions(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------
alter table public.companies                 enable row level security;
alter table public.company_members           enable row level security;
alter table public.permissions               enable row level security;
alter table public.role_permissions          enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.platform_admins           enable row level security;

-- anon never touches tenant data
revoke all on
  public.companies,
  public.company_members,
  public.permissions,
  public.role_permissions,
  public.user_permission_overrides,
  public.platform_admins
from anon;

-- ---------------------------------------------------------------------------
-- companies
-- Insert happens only through create_company(). Delete is a server-side
-- tenant-deletion process. Only profile columns are updatable by tenants.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.companies from authenticated;
grant update (
  name_en, name_ar, logo_path, industry, country, timezone,
  weekend_days, ft_daily_hours, pt_daily_hours, default_locale, onboarding_step
) on public.companies to authenticated;

create policy "companies: members and platform admins can read"
on public.companies for select
to authenticated
using (public.is_member(id) or public.is_platform_admin());

create policy "companies: org.manage can update profile"
on public.companies for update
to authenticated
using (public.has_permission(id, 'org.manage'))
with check (public.has_permission(id, 'org.manage'));

-- ---------------------------------------------------------------------------
-- company_members
-- ---------------------------------------------------------------------------
create policy "members: read own row, user managers and ceo read all"
on public.company_members for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.has_permission(company_id, 'users.manage')
  or public.company_role(company_id) = 'ceo'
);

create policy "members: users.manage can insert"
on public.company_members for insert
to authenticated
with check (public.has_permission(company_id, 'users.manage'));

create policy "members: users.manage can update"
on public.company_members for update
to authenticated
using (public.has_permission(company_id, 'users.manage'))
with check (public.has_permission(company_id, 'users.manage'));

create policy "members: users.manage can delete"
on public.company_members for delete
to authenticated
using (public.has_permission(company_id, 'users.manage'));

-- Business rules RLS cannot express on its own:
--  * membership company/user never change
--  * only an owner may create, change or remove an owner membership
--  * non-owners cannot change their own membership (no self-escalation)
--  * every company keeps at least one active owner
create or replace function public.guard_company_member_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _actor uuid := auth.uid();
  _company uuid := coalesce(new.company_id, old.company_id);
  _actor_role public.app_role;
  _bootstrap boolean := false;
begin
  if tg_op = 'UPDATE'
     and (new.company_id <> old.company_id or new.user_id <> old.user_id) then
    raise exception 'membership company and user are immutable' using errcode = '42501';
  end if;

  -- Company is being deleted (cascade): nothing to guard.
  if tg_op = 'DELETE'
     and not exists (select 1 from public.companies c where c.id = old.company_id) then
    return old;
  end if;

  -- End-user requests carry a JWT; trusted server code (service role) does not.
  if _actor is not null then
    _actor_role := public.company_role(_company);

    -- Bootstrap: the creator becomes the first owner of an empty company.
    if tg_op = 'INSERT' and _actor_role is null then
      select (c.created_by = _actor) and not exists (
        select 1 from public.company_members m where m.company_id = _company
      )
      into _bootstrap
      from public.companies c
      where c.id = _company;
    end if;

    if not coalesce(_bootstrap, false) and _actor_role is distinct from 'company_owner' then
      if (tg_op in ('UPDATE', 'DELETE') and old.role = 'company_owner')
         or (tg_op in ('INSERT', 'UPDATE') and new.role = 'company_owner') then
        raise exception 'only a company owner can manage owner memberships'
          using errcode = '42501';
      end if;
      if tg_op in ('UPDATE', 'DELETE') and old.user_id = _actor then
        raise exception 'you cannot change your own membership' using errcode = '42501';
      end if;
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and old.role = 'company_owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'company_owner' or new.status <> 'active')
     and not exists (
       select 1 from public.company_members m
       where m.company_id = old.company_id
         and m.role = 'company_owner'
         and m.status = 'active'
         and m.id <> old.id
     ) then
    raise exception 'a company must keep at least one active owner' using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger company_members_guard
before insert or update or delete on public.company_members
for each row execute function public.guard_company_member_change();

-- ---------------------------------------------------------------------------
-- permissions / role_permissions: readable reference data, no client writes
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.permissions, public.role_permissions from authenticated;

create policy "permissions: readable by signed-in users"
on public.permissions for select to authenticated using (true);

create policy "role_permissions: readable by signed-in users"
on public.role_permissions for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- user_permission_overrides
-- ---------------------------------------------------------------------------
create policy "overrides: read own, users.manage reads all"
on public.user_permission_overrides for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.has_permission(company_id, 'users.manage')
);

create policy "overrides: users.manage can insert"
on public.user_permission_overrides for insert
to authenticated
with check (public.has_permission(company_id, 'users.manage'));

create policy "overrides: users.manage can update"
on public.user_permission_overrides for update
to authenticated
using (public.has_permission(company_id, 'users.manage'))
with check (public.has_permission(company_id, 'users.manage'));

create policy "overrides: users.manage can delete"
on public.user_permission_overrides for delete
to authenticated
using (public.has_permission(company_id, 'users.manage'));

-- Non-owners may only grant or revoke permissions they hold themselves, never
-- on their own account and never on an owner. Target must be a member.
create or replace function public.guard_permission_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _actor uuid := auth.uid();
  _row public.user_permission_overrides := coalesce(new, old);
  _target_role public.app_role;
begin
  if tg_op = 'DELETE'
     and not exists (select 1 from public.companies c where c.id = old.company_id) then
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (new.company_id <> old.company_id
          or new.user_id <> old.user_id
          or new.permission <> old.permission) then
    raise exception 'override key is immutable' using errcode = '42501';
  end if;

  select m.role into _target_role
  from public.company_members m
  where m.company_id = _row.company_id and m.user_id = _row.user_id;

  if tg_op <> 'DELETE' and _target_role is null then
    raise exception 'override target is not a member of this company' using errcode = '23503';
  end if;

  if _actor is not null and public.company_role(_row.company_id) is distinct from 'company_owner' then
    if _row.user_id = _actor then
      raise exception 'you cannot change your own permissions' using errcode = '42501';
    end if;
    if _target_role = 'company_owner' then
      raise exception 'owner permissions cannot be overridden' using errcode = '42501';
    end if;
    if not public.has_permission(_row.company_id, _row.permission) then
      raise exception 'you can only delegate permissions you hold' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, _actor);
  end if;

  return coalesce(new, old);
end;
$$;

create trigger user_permission_overrides_guard
before insert or update or delete on public.user_permission_overrides
for each row execute function public.guard_permission_override();

-- ---------------------------------------------------------------------------
-- platform_admins: a user can see their own row only; no client writes
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.platform_admins from authenticated;

create policy "platform_admins: read own row"
on public.platform_admins for select
to authenticated
using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- activity_log: written only by triggers, read with audit.read
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  action      text not null check (action in ('insert', 'update', 'delete')),
  entity      text not null,
  entity_id   text,
  diff        jsonb,
  created_at  timestamptz not null default now()
);

create index activity_log_company_created_idx
  on public.activity_log (company_id, created_at desc);

alter table public.activity_log enable row level security;
revoke all on public.activity_log from anon;
revoke insert, update, delete on public.activity_log from authenticated;

create policy "activity_log: audit.read can read"
on public.activity_log for select
to authenticated
using (public.has_permission(company_id, 'audit.read'));

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _old jsonb;
  _new jsonb;
  _rec jsonb;
  _company uuid;
  _entity_id text;
  _diff jsonb;
begin
  if tg_op <> 'INSERT' then _old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then _new := to_jsonb(new); end if;
  _rec := coalesce(_new, _old);

  _company := case
    when tg_table_name = 'companies' then (_rec ->> 'id')::uuid
    else (_rec ->> 'company_id')::uuid
  end;

  -- Tenant is being deleted: its log goes with it.
  if not exists (select 1 from public.companies c where c.id = _company) then
    return coalesce(new, old);
  end if;

  _entity_id := coalesce(
    _rec ->> 'id',
    concat_ws(':', _rec ->> 'user_id', _rec ->> 'permission')
  );

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('old', _old -> n.key, 'new', n.value))
    into _diff
    from jsonb_each(_new) n
    where n.key <> 'updated_at'
      and n.value is distinct from (_old -> n.key);
    if _diff is null then
      return new;
    end if;
  else
    _diff := _rec;
  end if;

  insert into public.activity_log (company_id, user_id, action, entity, entity_id, diff)
  values (_company, auth.uid(), lower(tg_op), tg_table_name, _entity_id, _diff);

  return coalesce(new, old);
end;
$$;

create trigger companies_activity
after insert or update or delete on public.companies
for each row execute function public.log_activity();

create trigger company_members_activity
after insert or update or delete on public.company_members
for each row execute function public.log_activity();

create trigger user_permission_overrides_activity
after insert or update or delete on public.user_permission_overrides
for each row execute function public.log_activity();

-- ---------------------------------------------------------------------------
-- Tenant RPCs
-- ---------------------------------------------------------------------------

-- Creates a company and makes the caller its owner. Used by sign-up and by
-- individuals (is_personal = true gives a one-member personal company).
create or replace function public.create_company(
  _name_en text,
  _name_ar text default null,
  _is_personal boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _company uuid;
begin
  if _uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if _is_personal and exists (
    select 1
    from public.company_members m
    join public.companies c on c.id = m.company_id
    where m.user_id = _uid and c.is_personal
  ) then
    raise exception 'personal workspace already exists' using errcode = '23505';
  end if;

  if (select count(*) from public.company_members m
      where m.user_id = _uid and m.role = 'company_owner') >= 10 then
    raise exception 'company limit reached' using errcode = '54000';
  end if;

  insert into public.companies (name_en, name_ar, is_personal, created_by)
  values (btrim(_name_en), nullif(btrim(_name_ar), ''), _is_personal, _uid)
  returning id into _company;

  insert into public.company_members (company_id, user_id, role, status)
  values (_company, _uid, 'company_owner', 'active');

  return _company;
end;
$$;

revoke execute on function public.create_company(text, text, boolean) from public, anon;
grant execute on function public.create_company(text, text, boolean) to authenticated;

-- Internal trigger functions are never callable as RPCs.
revoke execute on function
  public.guard_company_member_change(),
  public.guard_permission_override(),
  public.log_activity(),
  public.set_updated_at()
from public, anon, authenticated;
