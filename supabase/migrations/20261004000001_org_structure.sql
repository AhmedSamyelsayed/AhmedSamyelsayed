-- =============================================================================
-- 0004 Organization structure: holidays, departments, positions, employees,
-- reporting lines and manager visibility (CONTEXT.md sections 5.2, 6.1, 9).
--
-- Cross-table references use composite (company_id, id) foreign keys so a row
-- can never point at another tenant's department, position or employee.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Public holidays
-- ---------------------------------------------------------------------------
create table public.company_holidays (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  holiday_date  date not null,
  name_en       text not null check (char_length(btrim(name_en)) between 1 and 120),
  name_ar       text check (name_ar is null or char_length(name_ar) <= 120),
  created_at    timestamptz not null default now(),
  unique (company_id, holiday_date)
);

-- ---------------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------------
create table public.departments (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  name_en           text not null check (char_length(btrim(name_en)) between 1 and 120),
  name_ar           text check (name_ar is null or char_length(name_ar) <= 120),
  head_position_id  uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id, id)
);

create unique index departments_company_name_idx
  on public.departments (company_id, lower(btrim(name_en)));

create trigger departments_updated_at
before update on public.departments
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Positions (reporting lines live here: reports_to_position_id)
-- ---------------------------------------------------------------------------
create table public.positions (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.companies (id) on delete cascade,
  department_id           uuid,
  title_en                text not null check (char_length(btrim(title_en)) between 1 and 160),
  title_ar                text check (title_ar is null or char_length(title_ar) <= 160),
  reports_to_position_id  uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, department_id)
    references public.departments (company_id, id) on delete set null (department_id),
  foreign key (company_id, reports_to_position_id)
    references public.positions (company_id, id) on delete set null (reports_to_position_id),
  check (reports_to_position_id is distinct from id)
);

-- Titles are unique per company so imports and reporting lines can refer to them.
create unique index positions_company_title_idx
  on public.positions (company_id, lower(btrim(title_en)));
create index positions_reports_to_idx on public.positions (reports_to_position_id);

create trigger positions_updated_at
before update on public.positions
for each row execute function public.set_updated_at();

alter table public.departments
  add foreign key (company_id, head_position_id)
  references public.positions (company_id, id) on delete set null (head_position_id);

-- ---------------------------------------------------------------------------
-- Employees
-- manager_employee_id overrides the manager implied by the position tree.
-- ---------------------------------------------------------------------------
create table public.employees (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies (id) on delete cascade,
  code                 text not null check (char_length(btrim(code)) between 1 and 40),
  full_name            text not null check (char_length(btrim(full_name)) between 1 and 160),
  work_email           text check (work_email is null or work_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  position_id          uuid,
  department_id        uuid,
  manager_employee_id  uuid,
  user_id              uuid references auth.users (id) on delete set null,
  employment_type      text not null default 'FT' check (employment_type in ('FT', 'PT')),
  start_date           date,
  status               text not null default 'active' check (status in ('active', 'inactive')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, user_id),
  foreign key (company_id, position_id)
    references public.positions (company_id, id) on delete set null (position_id),
  foreign key (company_id, department_id)
    references public.departments (company_id, id) on delete set null (department_id),
  foreign key (company_id, manager_employee_id)
    references public.employees (company_id, id) on delete set null (manager_employee_id),
  check (manager_employee_id is distinct from id)
);

create unique index employees_company_code_idx on public.employees (company_id, lower(btrim(code)));
create index employees_position_idx on public.employees (position_id);
create index employees_manager_idx on public.employees (manager_employee_id);
create index employees_user_idx on public.employees (user_id);

create trigger employees_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

-- Default the department from the position when not given explicitly.
create or replace function public.employees_default_department()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.department_id is null and new.position_id is not null then
    select p.department_id into new.department_id
    from public.positions p where p.id = new.position_id;
  end if;
  return new;
end;
$$;

create trigger employees_default_department
before insert or update of position_id, department_id on public.employees
for each row execute function public.employees_default_department();

-- ---------------------------------------------------------------------------
-- Cycle prevention for both hierarchies
-- ---------------------------------------------------------------------------
create or replace function public.prevent_position_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reports_to_position_id is null then
    return new;
  end if;
  if exists (
    with recursive up (id) as (
      select new.reports_to_position_id
      union
      select p.reports_to_position_id
      from public.positions p join up on p.id = up.id
      where p.reports_to_position_id is not null
    )
    select 1 from up where id = new.id
  ) then
    raise exception 'reporting line would create a cycle' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger positions_prevent_cycle
before insert or update of reports_to_position_id on public.positions
for each row execute function public.prevent_position_cycle();

create or replace function public.prevent_manager_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.manager_employee_id is null then
    return new;
  end if;
  if exists (
    with recursive up (id) as (
      select new.manager_employee_id
      union
      select e.manager_employee_id
      from public.employees e join up on e.id = up.id
      where e.manager_employee_id is not null
    )
    select 1 from up where id = new.id
  ) then
    raise exception 'manager assignment would create a cycle' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger employees_prevent_cycle
before insert or update of manager_employee_id on public.employees
for each row execute function public.prevent_manager_cycle();

-- ---------------------------------------------------------------------------
-- Manager visibility (materialized)
--
-- An employee's manager is manager_employee_id when set; otherwise the active
-- holder(s) of the nearest ancestor position that has a holder. A viewer sees
-- everyone below the employee record linked to their user, at any depth.
-- ---------------------------------------------------------------------------
create table public.employee_visibility (
  company_id      uuid not null references public.companies (id) on delete cascade,
  viewer_user_id  uuid not null references auth.users (id) on delete cascade,
  employee_id     uuid not null references public.employees (id) on delete cascade,
  primary key (viewer_user_id, employee_id)
);

create index employee_visibility_company_idx on public.employee_visibility (company_id);

create or replace function public.refresh_employee_visibility(_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.employee_visibility v where v.company_id = _company_id;

  insert into public.employee_visibility (company_id, viewer_user_id, employee_id)
  with recursive
  pos_up (position_id, ancestor_id, depth) as (
    select p.id, p.reports_to_position_id, 1
    from public.positions p
    where p.company_id = _company_id and p.reports_to_position_id is not null
    union all
    select u.position_id, p.reports_to_position_id, u.depth + 1
    from pos_up u
    join public.positions p on p.id = u.ancestor_id
    where p.reports_to_position_id is not null and u.depth < 100
  ),
  holders as (
    select e.id as employee_id, e.position_id
    from public.employees e
    where e.company_id = _company_id and e.status = 'active' and e.position_id is not null
  ),
  nearest_held as (
    select distinct on (u.position_id) u.position_id, u.ancestor_id
    from pos_up u
    where exists (select 1 from holders h where h.position_id = u.ancestor_id)
    order by u.position_id, u.depth
  ),
  edges (manager_id, report_id) as (
    select e.manager_employee_id, e.id
    from public.employees e
    where e.company_id = _company_id and e.manager_employee_id is not null
    union
    select h.employee_id, e.id
    from public.employees e
    join nearest_held n on n.position_id = e.position_id
    join holders h on h.position_id = n.ancestor_id
    where e.company_id = _company_id
      and e.manager_employee_id is null
      and h.employee_id <> e.id
  ),
  closure (manager_id, report_id) as (
    select manager_id, report_id from edges
    union
    select c.manager_id, ed.report_id
    from closure c join edges ed on ed.manager_id = c.report_id
  )
  select distinct _company_id, m.user_id, c.report_id
  from closure c
  join public.employees m on m.id = c.manager_id
  where m.user_id is not null
    and m.status = 'active'
    and c.manager_id <> c.report_id;
end;
$$;

-- Statement-level refresh for every company touched by the statement.
create or replace function public.refresh_visibility_from_new()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _company uuid;
begin
  -- Bulk operations (import_org) defer and refresh once at the end.
  if current_setting('figure.defer_visibility', true) = 'on' then
    return null;
  end if;
  for _company in select distinct company_id from new_rows loop
    perform public.refresh_employee_visibility(_company);
  end loop;
  return null;
end;
$$;

create or replace function public.refresh_visibility_from_old()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _company uuid;
begin
  if current_setting('figure.defer_visibility', true) = 'on' then
    return null;
  end if;
  for _company in
    select distinct o.company_id from old_rows o
    where exists (select 1 from public.companies c where c.id = o.company_id)
  loop
    perform public.refresh_employee_visibility(_company);
  end loop;
  return null;
end;
$$;

create trigger employees_visibility_ins after insert on public.employees
referencing new table as new_rows
for each statement execute function public.refresh_visibility_from_new();
create trigger employees_visibility_upd after update on public.employees
referencing new table as new_rows
for each statement execute function public.refresh_visibility_from_new();
create trigger employees_visibility_del after delete on public.employees
referencing old table as old_rows
for each statement execute function public.refresh_visibility_from_old();

create trigger positions_visibility_ins after insert on public.positions
referencing new table as new_rows
for each statement execute function public.refresh_visibility_from_new();
create trigger positions_visibility_upd after update on public.positions
referencing new table as new_rows
for each statement execute function public.refresh_visibility_from_new();
create trigger positions_visibility_del after delete on public.positions
referencing old table as old_rows
for each statement execute function public.refresh_visibility_from_old();

-- Owner, CEO and HR see the whole company; managers see their subtree; everyone
-- sees their own record. Callers still need employees.read in each policy.
create or replace function public.can_view_employee(_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employees e
    join public.company_members m
      on m.company_id = e.company_id
     and m.user_id = (select auth.uid())
     and m.status = 'active'
    where e.id = _employee_id
      and (
        m.role in ('company_owner', 'ceo', 'hr_admin', 'hr_staff')
        or e.user_id = m.user_id
        or (
          m.role = 'manager'
          and exists (
            select 1 from public.employee_visibility v
            where v.viewer_user_id = m.user_id and v.employee_id = e.id
          )
        )
      )
  );
$$;

revoke execute on function public.can_view_employee(uuid) from public, anon;
grant execute on function public.can_view_employee(uuid) to authenticated, service_role;

revoke execute on function
  public.refresh_employee_visibility(uuid),
  public.refresh_visibility_from_new(),
  public.refresh_visibility_from_old(),
  public.employees_default_department(),
  public.prevent_position_cycle(),
  public.prevent_manager_cycle()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.company_holidays    enable row level security;
alter table public.departments         enable row level security;
alter table public.positions           enable row level security;
alter table public.employees           enable row level security;
alter table public.employee_visibility enable row level security;

revoke all on
  public.company_holidays, public.departments, public.positions,
  public.employees, public.employee_visibility
from anon;
revoke insert, update, delete on public.employee_visibility from authenticated;

create policy "holidays: members read" on public.company_holidays
for select to authenticated using (public.is_member(company_id));
create policy "holidays: org.manage writes" on public.company_holidays
for all to authenticated
using (public.has_permission(company_id, 'org.manage'))
with check (public.has_permission(company_id, 'org.manage'));

create policy "departments: members read" on public.departments
for select to authenticated using (public.is_member(company_id));
create policy "departments: org.manage writes" on public.departments
for all to authenticated
using (public.has_permission(company_id, 'org.manage'))
with check (public.has_permission(company_id, 'org.manage'));

create policy "positions: members read" on public.positions
for select to authenticated using (public.is_member(company_id));
create policy "positions: org.manage writes" on public.positions
for all to authenticated
using (public.has_permission(company_id, 'org.manage'))
with check (public.has_permission(company_id, 'org.manage'));

create policy "employees: visible to permitted viewers" on public.employees
for select to authenticated
using (
  public.has_permission(company_id, 'employees.read')
  and public.can_view_employee(id)
);
create policy "employees: employees.write inserts" on public.employees
for insert to authenticated
with check (public.has_permission(company_id, 'employees.write'));
create policy "employees: employees.write updates" on public.employees
for update to authenticated
using (public.has_permission(company_id, 'employees.write'))
with check (public.has_permission(company_id, 'employees.write'));
create policy "employees: employees.write deletes" on public.employees
for delete to authenticated
using (public.has_permission(company_id, 'employees.write'));

create policy "employee_visibility: read own" on public.employee_visibility
for select to authenticated using (viewer_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Activity log for org writes (CONTEXT.md section 11)
-- ---------------------------------------------------------------------------
create trigger employees_activity
after insert or update or delete on public.employees
for each row execute function public.log_activity();
create trigger positions_activity
after insert or update or delete on public.positions
for each row execute function public.log_activity();
create trigger departments_activity
after insert or update or delete on public.departments
for each row execute function public.log_activity();
create trigger company_holidays_activity
after insert or update or delete on public.company_holidays
for each row execute function public.log_activity();
