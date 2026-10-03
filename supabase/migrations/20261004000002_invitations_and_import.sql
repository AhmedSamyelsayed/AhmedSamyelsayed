-- =============================================================================
-- 0005 Invitations, member directory and bulk org import
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Memberships are created only by create_company() or by accepting an
-- invitation, never by inserting another user's id directly.
-- ---------------------------------------------------------------------------
drop policy "members: users.manage can insert" on public.company_members;
revoke insert on public.company_members from authenticated;

-- Email of the signed-in user, only when confirmed.
create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email)
  from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;

revoke execute on function public.current_user_email() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create table public.company_invitations (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  email        text not null check (
                 email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
               ),
  role         public.app_role not null,
  employee_id  uuid,
  invited_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users (id) on delete set null,
  revoked_at   timestamptz,
  foreign key (company_id, employee_id)
    references public.employees (company_id, id) on delete set null (employee_id)
);

create unique index company_invitations_pending_idx
  on public.company_invitations (company_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.company_invitations enable row level security;
revoke all on public.company_invitations from anon;
revoke insert, update, delete on public.company_invitations from authenticated;

create policy "invitations: users.manage reads" on public.company_invitations
for select to authenticated
using (public.has_permission(company_id, 'users.manage'));

create trigger company_invitations_activity
after insert or update or delete on public.company_invitations
for each row execute function public.log_activity();

-- Allow the owner-membership insert only when it comes from a matching invitation.
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
  _allowed_insert boolean := false;
begin
  if tg_op = 'UPDATE'
     and (new.company_id <> old.company_id or new.user_id <> old.user_id) then
    raise exception 'membership company and user are immutable' using errcode = '42501';
  end if;

  if tg_op = 'DELETE'
     and not exists (select 1 from public.companies c where c.id = old.company_id) then
    return old;
  end if;

  if _actor is not null then
    _actor_role := public.company_role(_company);

    if tg_op = 'INSERT' and _actor_role is null and new.user_id = _actor then
      -- Bootstrap: the creator becomes the first owner of an empty company.
      select (c.created_by = _actor) and not exists (
        select 1 from public.company_members m where m.company_id = _company
      )
      into _allowed_insert
      from public.companies c
      where c.id = _company;

      -- Invitation acceptance for exactly the invited role.
      _allowed_insert := coalesce(_allowed_insert, false) or exists (
        select 1 from public.company_invitations i
        where i.company_id = _company
          and i.email = public.current_user_email()
          and i.role = new.role
          and i.accepted_at is null
          and i.revoked_at is null
          and i.expires_at > now()
      );
    end if;

    if not _allowed_insert and _actor_role is distinct from 'company_owner' then
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

create or replace function public.create_invitation(
  _company_id uuid,
  _email text,
  _role public.app_role,
  _employee_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _addr text := lower(btrim(_email));
  _id uuid;
  _linked uuid;
begin
  if not public.has_permission(_company_id, 'users.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if _role = 'company_owner' and public.company_role(_company_id) is distinct from 'company_owner' then
    raise exception 'only a company owner can invite owners' using errcode = '42501';
  end if;
  if _addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email address' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.company_members m
    join auth.users u on u.id = m.user_id
    where m.company_id = _company_id and lower(u.email) = _addr
  ) then
    raise exception 'this person is already a member' using errcode = '23505';
  end if;

  if _employee_id is not null then
    select e.user_id into _linked
    from public.employees e
    where e.id = _employee_id and e.company_id = _company_id;
    if not found then
      raise exception 'employee not found' using errcode = 'P0002';
    end if;
    if _linked is not null then
      raise exception 'employee is already linked to a user' using errcode = '23505';
    end if;
  end if;

  update public.company_invitations
  set revoked_at = now()
  where company_id = _company_id and email = _addr
    and accepted_at is null and revoked_at is null;

  insert into public.company_invitations (company_id, email, role, employee_id, invited_by)
  values (_company_id, _addr, _role, _employee_id, auth.uid())
  returning id into _id;

  return _id;
end;
$$;

create or replace function public.revoke_invitation(_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _inv public.company_invitations;
begin
  select * into _inv from public.company_invitations where id = _invitation_id;
  if not found or not public.has_permission(_inv.company_id, 'users.manage') then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if _inv.role = 'company_owner'
     and public.company_role(_inv.company_id) is distinct from 'company_owner' then
    raise exception 'only a company owner can revoke owner invitations' using errcode = '42501';
  end if;
  update public.company_invitations
  set revoked_at = now()
  where id = _invitation_id and accepted_at is null and revoked_at is null;
end;
$$;

-- Pending invitations addressed to the signed-in user's confirmed email.
create or replace function public.my_invitations()
returns table (
  id uuid,
  company_id uuid,
  company_name_en text,
  company_name_ar text,
  role public.app_role,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.company_id, c.name_en, c.name_ar, i.role, i.expires_at
  from public.company_invitations i
  join public.companies c on c.id = i.company_id
  where i.email = public.current_user_email()
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
    and not exists (
      select 1 from public.company_members m
      where m.company_id = i.company_id and m.user_id = (select auth.uid())
    )
  order by i.created_at;
$$;

create or replace function public.accept_invitation(_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _inv public.company_invitations;
begin
  if _uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into _inv
  from public.company_invitations i
  where i.id = _invitation_id
    and i.email = public.current_user_email()
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  for update;
  if not found then
    raise exception 'invitation not found or expired' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.company_members m
    where m.company_id = _inv.company_id and m.user_id = _uid
  ) then
    raise exception 'you are already a member of this company' using errcode = '23505';
  end if;

  insert into public.company_members (company_id, user_id, role, status, invited_by)
  values (_inv.company_id, _uid, _inv.role, 'active', _inv.invited_by);

  if _inv.employee_id is not null and not exists (
    select 1 from public.employees e where e.company_id = _inv.company_id and e.user_id = _uid
  ) then
    update public.employees
    set user_id = _uid
    where id = _inv.employee_id and company_id = _inv.company_id and user_id is null;
  end if;

  update public.company_invitations
  set accepted_at = now(), accepted_by = _uid
  where id = _inv.id;

  return _inv.company_id;
end;
$$;

-- Member list with emails (auth.users is not readable by clients).
create or replace function public.list_company_members(_company_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role public.app_role,
  status public.member_status,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission(_company_id, 'users.manage')
          or public.company_role(_company_id) = 'ceo') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
  select m.user_id, u.email::text, (u.raw_user_meta_data ->> 'full_name'), m.role, m.status,
         m.created_at, u.last_sign_in_at
  from public.company_members m
  join auth.users u on u.id = m.user_id
  where m.company_id = _company_id
  order by m.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bulk import (Excel template). Runs in one transaction: all rows or none.
-- Server-side validation is authoritative; client parsing is only a preview.
-- Rows are matched case-insensitively: departments by name_en, positions by
-- title_en, employees by code. Existing rows are updated, new rows created.
-- ---------------------------------------------------------------------------
create or replace function public.import_org(_company_id uuid, _payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _deps jsonb := coalesce(_payload -> 'departments', '[]'::jsonb);
  _poss jsonb := coalesce(_payload -> 'positions', '[]'::jsonb);
  _emps jsonb := coalesce(_payload -> 'employees', '[]'::jsonb);
  _row jsonb;
  _i int;
  _id uuid;
  _ref uuid;
  _dept uuid;
  _pos uuid;
  _type text;
  _start date;
  _stats jsonb := jsonb_build_object(
    'departments', jsonb_build_object('created', 0, 'updated', 0),
    'positions',   jsonb_build_object('created', 0, 'updated', 0),
    'employees',   jsonb_build_object('created', 0, 'updated', 0)
  );
begin
  if jsonb_typeof(_deps) <> 'array' or jsonb_typeof(_poss) <> 'array'
     or jsonb_typeof(_emps) <> 'array' then
    raise exception 'payload must contain arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(_deps) + jsonb_array_length(_poss) + jsonb_array_length(_emps) > 5000 then
    raise exception 'import is limited to 5000 rows' using errcode = '54000';
  end if;
  if (jsonb_array_length(_deps) > 0 or jsonb_array_length(_poss) > 0)
     and not public.has_permission(_company_id, 'org.manage') then
    raise exception 'permission denied: org.manage' using errcode = '42501';
  end if;
  if jsonb_array_length(_emps) > 0
     and not public.has_permission(_company_id, 'employees.write') then
    raise exception 'permission denied: employees.write' using errcode = '42501';
  end if;

  perform set_config('figure.defer_visibility', 'on', true);

  -- Departments ------------------------------------------------------------
  for _i in 0 .. jsonb_array_length(_deps) - 1 loop
    _row := _deps -> _i;
    if coalesce(btrim(_row ->> 'name_en'), '') = '' then
      raise exception 'Departments row %: name_en is required', _i + 2 using errcode = '22023';
    end if;
    select d.id into _id from public.departments d
    where d.company_id = _company_id and lower(btrim(d.name_en)) = lower(btrim(_row ->> 'name_en'));
    if _id is null then
      insert into public.departments (company_id, name_en, name_ar)
      values (_company_id, btrim(_row ->> 'name_en'), nullif(btrim(_row ->> 'name_ar'), ''));
      _stats := jsonb_set(_stats, '{departments,created}', to_jsonb((_stats #>> '{departments,created}')::int + 1));
    else
      update public.departments
      set name_ar = coalesce(nullif(btrim(_row ->> 'name_ar'), ''), name_ar)
      where id = _id;
      _stats := jsonb_set(_stats, '{departments,updated}', to_jsonb((_stats #>> '{departments,updated}')::int + 1));
    end if;
  end loop;

  -- Positions: pass 1 upsert, pass 2 reporting lines -------------------------
  for _i in 0 .. jsonb_array_length(_poss) - 1 loop
    _row := _poss -> _i;
    if coalesce(btrim(_row ->> 'title_en'), '') = '' then
      raise exception 'Positions row %: title_en is required', _i + 2 using errcode = '22023';
    end if;
    _dept := null;
    if coalesce(btrim(_row ->> 'department'), '') <> '' then
      select d.id into _dept from public.departments d
      where d.company_id = _company_id and lower(btrim(d.name_en)) = lower(btrim(_row ->> 'department'));
      if _dept is null then
        raise exception 'Positions row %: unknown department "%"', _i + 2, _row ->> 'department'
          using errcode = '22023';
      end if;
    end if;
    select p.id into _id from public.positions p
    where p.company_id = _company_id and lower(btrim(p.title_en)) = lower(btrim(_row ->> 'title_en'));
    if _id is null then
      insert into public.positions (company_id, title_en, title_ar, department_id)
      values (_company_id, btrim(_row ->> 'title_en'), nullif(btrim(_row ->> 'title_ar'), ''), _dept);
      _stats := jsonb_set(_stats, '{positions,created}', to_jsonb((_stats #>> '{positions,created}')::int + 1));
    else
      update public.positions
      set title_ar = coalesce(nullif(btrim(_row ->> 'title_ar'), ''), title_ar),
          department_id = coalesce(_dept, department_id)
      where id = _id;
      _stats := jsonb_set(_stats, '{positions,updated}', to_jsonb((_stats #>> '{positions,updated}')::int + 1));
    end if;
  end loop;

  for _i in 0 .. jsonb_array_length(_poss) - 1 loop
    _row := _poss -> _i;
    continue when coalesce(btrim(_row ->> 'reports_to'), '') = '';
    select p.id into _ref from public.positions p
    where p.company_id = _company_id and lower(btrim(p.title_en)) = lower(btrim(_row ->> 'reports_to'));
    if _ref is null then
      raise exception 'Positions row %: unknown reports_to position "%"', _i + 2, _row ->> 'reports_to'
        using errcode = '22023';
    end if;
    update public.positions p
    set reports_to_position_id = _ref
    where p.company_id = _company_id and lower(btrim(p.title_en)) = lower(btrim(_row ->> 'title_en'));
  end loop;

  -- Employees: pass 1 upsert, pass 2 manager overrides -----------------------
  for _i in 0 .. jsonb_array_length(_emps) - 1 loop
    _row := _emps -> _i;
    if coalesce(btrim(_row ->> 'code'), '') = '' or coalesce(btrim(_row ->> 'full_name'), '') = '' then
      raise exception 'Employees row %: code and full_name are required', _i + 2 using errcode = '22023';
    end if;

    _pos := null;
    if coalesce(btrim(_row ->> 'position'), '') <> '' then
      select p.id into _pos from public.positions p
      where p.company_id = _company_id and lower(btrim(p.title_en)) = lower(btrim(_row ->> 'position'));
      if _pos is null then
        raise exception 'Employees row %: unknown position "%"', _i + 2, _row ->> 'position'
          using errcode = '22023';
      end if;
    end if;

    _dept := null;
    if coalesce(btrim(_row ->> 'department'), '') <> '' then
      select d.id into _dept from public.departments d
      where d.company_id = _company_id and lower(btrim(d.name_en)) = lower(btrim(_row ->> 'department'));
      if _dept is null then
        raise exception 'Employees row %: unknown department "%"', _i + 2, _row ->> 'department'
          using errcode = '22023';
      end if;
    end if;

    _type := upper(coalesce(nullif(btrim(_row ->> 'employment_type'), ''), 'FT'));
    if _type not in ('FT', 'PT') then
      raise exception 'Employees row %: employment_type must be FT or PT', _i + 2 using errcode = '22023';
    end if;

    _start := null;
    if coalesce(btrim(_row ->> 'start_date'), '') <> '' then
      begin
        _start := (btrim(_row ->> 'start_date'))::date;
      exception when others then
        raise exception 'Employees row %: start_date must be YYYY-MM-DD', _i + 2 using errcode = '22023';
      end;
    end if;

    select e.id into _id from public.employees e
    where e.company_id = _company_id and lower(btrim(e.code)) = lower(btrim(_row ->> 'code'));
    if _id is null then
      insert into public.employees (
        company_id, code, full_name, work_email, position_id, department_id, employment_type, start_date
      ) values (
        _company_id, btrim(_row ->> 'code'), btrim(_row ->> 'full_name'),
        nullif(lower(btrim(_row ->> 'work_email')), ''), _pos, _dept, _type, _start
      );
      _stats := jsonb_set(_stats, '{employees,created}', to_jsonb((_stats #>> '{employees,created}')::int + 1));
    else
      update public.employees
      set full_name = btrim(_row ->> 'full_name'),
          work_email = coalesce(nullif(lower(btrim(_row ->> 'work_email')), ''), work_email),
          position_id = coalesce(_pos, position_id),
          department_id = coalesce(_dept, department_id),
          employment_type = _type,
          start_date = coalesce(_start, start_date)
      where id = _id;
      _stats := jsonb_set(_stats, '{employees,updated}', to_jsonb((_stats #>> '{employees,updated}')::int + 1));
    end if;
  end loop;

  for _i in 0 .. jsonb_array_length(_emps) - 1 loop
    _row := _emps -> _i;
    continue when coalesce(btrim(_row ->> 'manager_code'), '') = '';
    select e.id into _ref from public.employees e
    where e.company_id = _company_id and lower(btrim(e.code)) = lower(btrim(_row ->> 'manager_code'));
    if _ref is null then
      raise exception 'Employees row %: unknown manager_code "%"', _i + 2, _row ->> 'manager_code'
        using errcode = '22023';
    end if;
    update public.employees e
    set manager_employee_id = _ref
    where e.company_id = _company_id and lower(btrim(e.code)) = lower(btrim(_row ->> 'code'));
  end loop;

  perform set_config('figure.defer_visibility', 'off', true);
  perform public.refresh_employee_visibility(_company_id);

  return _stats;
end;
$$;

revoke execute on function
  public.create_invitation(uuid, text, public.app_role, uuid),
  public.revoke_invitation(uuid),
  public.my_invitations(),
  public.accept_invitation(uuid),
  public.list_company_members(uuid),
  public.import_org(uuid, jsonb)
from public, anon;

grant execute on function
  public.create_invitation(uuid, text, public.app_role, uuid),
  public.revoke_invitation(uuid),
  public.my_invitations(),
  public.accept_invitation(uuid),
  public.list_company_members(uuid),
  public.import_org(uuid, jsonb)
to authenticated;
