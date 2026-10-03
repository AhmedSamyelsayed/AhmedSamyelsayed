-- =============================================================================
-- 0001 Tenancy core: companies, members, roles, permissions, platform admins
-- See CONTEXT.md sections 4, 5 and 9.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'company_owner',
  'ceo',
  'hr_admin',
  'hr_staff',
  'manager',
  'employee'
);

create type public.member_status as enum ('invited', 'active', 'suspended');

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Companies (tenants). Individuals are modeled as a personal company.
-- weekend_days uses JS getDay() numbering: 0 = Sunday ... 6 = Saturday.
-- Default weekend is Friday (5) and Saturday (6).
-- ---------------------------------------------------------------------------
create table public.companies (
  id              uuid primary key default gen_random_uuid(),
  name_en         text not null check (char_length(btrim(name_en)) between 1 and 200),
  name_ar         text check (name_ar is null or char_length(name_ar) <= 200),
  logo_path       text,
  industry        text check (industry is null or char_length(industry) <= 120),
  country         text not null default 'EG' check (country ~ '^[A-Z]{2}$'),
  timezone        text not null default 'Africa/Cairo',
  weekend_days    int[] not null default '{5,6}'
                  check (weekend_days <@ array[0,1,2,3,4,5,6]),
  ft_daily_hours  numeric(4,2) not null default 8 check (ft_daily_hours > 0 and ft_daily_hours <= 24),
  pt_daily_hours  numeric(4,2) not null default 4 check (pt_daily_hours > 0 and pt_daily_hours <= 24),
  default_locale  text not null default 'en' check (default_locale in ('en', 'ar')),
  plan            text not null default 'trial',
  is_personal     boolean not null default false,
  onboarding_step text not null default 'profile',
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger companies_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Company members
-- ---------------------------------------------------------------------------
create table public.company_members (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.app_role not null default 'employee',
  status      public.member_status not null default 'invited',
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, user_id)
);

create index company_members_user_idx on public.company_members (user_id);

create trigger company_members_updated_at
before update on public.company_members
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Permission catalog and role defaults
-- ---------------------------------------------------------------------------
create table public.permissions (
  key         text primary key,
  description text not null
);

create table public.role_permissions (
  role        public.app_role not null,
  permission  text not null references public.permissions (key) on delete cascade,
  primary key (role, permission)
);

create table public.user_permission_overrides (
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  permission  text not null references public.permissions (key) on delete cascade,
  granted     boolean not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (company_id, user_id, permission)
);

-- ---------------------------------------------------------------------------
-- Platform admins (ASE Automation staff). Not tied to a company.
-- Granted only by the service role / SQL console, never from the app.
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Seed permission catalog and default role mapping.
-- Keep in sync with packages/shared/src/permissions.ts (a unit test checks it).
-- ---------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('employees.read',     'View employee records (scoped by visibility rules)'),
  ('employees.write',    'Create and edit employee records'),
  ('org.manage',         'Manage company profile, departments, positions and reporting lines'),
  ('job_analysis.read',  'View job analyses'),
  ('job_analysis.write', 'Create, edit and approve job analyses'),
  ('documents.upload',   'Upload documents'),
  ('documents.read',     'View documents and AI reviews'),
  ('timesheets.upload',  'Upload timesheets'),
  ('timesheets.read',    'View timesheets'),
  ('kpi.read',           'View KPI scores and dashboards'),
  ('kpi.configure',      'Configure KPI weights and thresholds'),
  ('training.read',      'View training plans'),
  ('training.write',     'Manage training catalog and assignments'),
  ('audit.read',         'View audit flags and activity log'),
  ('users.manage',       'Invite users, assign roles and permission overrides'),
  ('ai.configure',       'Configure AI provider, model and keys'),
  ('billing.manage',     'Manage plan and billing'),
  ('export.data',        'Export company data');

-- company_owner: everything
insert into public.role_permissions (role, permission)
select 'company_owner', key from public.permissions;

-- ceo: read everything
insert into public.role_permissions (role, permission) values
  ('ceo', 'employees.read'),
  ('ceo', 'job_analysis.read'),
  ('ceo', 'documents.read'),
  ('ceo', 'timesheets.read'),
  ('ceo', 'kpi.read'),
  ('ceo', 'training.read'),
  ('ceo', 'audit.read'),
  ('ceo', 'export.data');

-- hr_admin: full write except billing and AI settings
insert into public.role_permissions (role, permission)
select 'hr_admin', key from public.permissions
where key not in ('billing.manage', 'ai.configure');

-- hr_staff: operational HR
insert into public.role_permissions (role, permission) values
  ('hr_staff', 'employees.read'),
  ('hr_staff', 'job_analysis.read'),
  ('hr_staff', 'documents.upload'),
  ('hr_staff', 'documents.read'),
  ('hr_staff', 'timesheets.upload'),
  ('hr_staff', 'timesheets.read'),
  ('hr_staff', 'kpi.read'),
  ('hr_staff', 'training.read'),
  ('hr_staff', 'audit.read');

-- manager: read within own subtree (subtree scoping is enforced per table)
insert into public.role_permissions (role, permission) values
  ('manager', 'employees.read'),
  ('manager', 'job_analysis.read'),
  ('manager', 'documents.read'),
  ('manager', 'timesheets.read'),
  ('manager', 'kpi.read'),
  ('manager', 'training.read'),
  ('manager', 'audit.read');

-- employee: self only (self scoping is enforced per table)
insert into public.role_permissions (role, permission) values
  ('employee', 'employees.read'),
  ('employee', 'timesheets.upload'),
  ('employee', 'timesheets.read'),
  ('employee', 'kpi.read'),
  ('employee', 'training.read');
