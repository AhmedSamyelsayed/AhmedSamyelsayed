-- pgTAP: tenant isolation, roles, permissions and guard rules.
-- Run with `supabase test db` (CI) or scripts/test-db-local.sh.
begin;
create extension if not exists pgtap with schema extensions;

select plan(48);

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------
create function pg_temp.login(_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.login_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  select set_config('role', 'anon', true);
$$;

create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', '', true);
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres; server-side writes have no auth.uid())
--   co1: A owner, C employee, D hr_admin, E ceo, F manager
--   co2: B owner
--   G: no company
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@co1.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@co2.test'),
  ('00000000-0000-0000-0000-00000000000c', 'c@co1.test'),
  ('00000000-0000-0000-0000-00000000000d', 'd@co1.test'),
  ('00000000-0000-0000-0000-00000000000e', 'e@co1.test'),
  ('00000000-0000-0000-0000-00000000000f', 'f@co1.test'),
  ('00000000-0000-0000-0000-000000000009', 'g@nowhere.test');

insert into public.companies (id, name_en, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'Company One', '00000000-0000-0000-0000-00000000000a'),
  ('22222222-2222-2222-2222-222222222222', 'Company Two', '00000000-0000-0000-0000-00000000000b');

insert into public.company_members (company_id, user_id, role, status) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 'company_owner', 'active'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c', 'employee',      'active'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000d', 'hr_admin',      'active'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000e', 'ceo',           'active'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000f', 'manager',       'active'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000b', 'company_owner', 'active');

-- ---------------------------------------------------------------------------
-- Structural checks
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and not c.relrowsecurity $$,
  'RLS is enabled on every public table'
);

select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prosecdef
       and not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%') $$,
  'every SECURITY DEFINER function pins search_path'
);

-- ---------------------------------------------------------------------------
-- Company visibility
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select results_eq($$ select name_en from public.companies $$, array['Company One'],
  'owner of co1 sees only co1');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select results_eq($$ select name_en from public.companies $$, array['Company Two'],
  'owner of co2 sees only co2');

select pg_temp.login('00000000-0000-0000-0000-000000000009');
select is_empty($$ select 1 from public.companies $$, 'user without company sees no companies');
select is_empty($$ select 1 from public.company_members $$, 'user without company sees no members');
select is(public.has_permission('11111111-1111-1111-1111-111111111111', 'kpi.read'), false,
  'non-member has no permissions');

select pg_temp.login_anon();
select throws_ok($$ select * from public.companies $$, '42501', null, 'anon cannot read companies');
select throws_ok($$ select public.create_company('x') $$, '42501', null, 'anon cannot call create_company');

-- ---------------------------------------------------------------------------
-- Default role permissions
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is(public.has_permission('11111111-1111-1111-1111-111111111111', 'billing.manage'), true, 'owner has billing.manage');
select is(public.has_permission('22222222-2222-2222-2222-222222222222', 'kpi.read'), false, 'owner of co1 has nothing in co2');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is(public.has_permission('11111111-1111-1111-1111-111111111111', 'users.manage'), true, 'hr_admin has users.manage');
select is(public.has_permission('11111111-1111-1111-1111-111111111111', 'billing.manage'), false, 'hr_admin lacks billing.manage');
select is(public.has_permission('11111111-1111-1111-1111-111111111111', 'ai.configure'), false, 'hr_admin lacks ai.configure');

select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select is(public.has_permission('11111111-1111-1111-1111-111111111111', 'audit.read'), true, 'ceo has audit.read');
select is(public.has_permission('11111111-1111-1111-1111-111111111111', 'employees.write'), false, 'ceo is read-only for employees');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is(public.has_permission('11111111-1111-1111-1111-111111111111', 'kpi.read'), true, 'employee has kpi.read');
select is(public.has_permission('11111111-1111-1111-1111-111111111111', 'users.manage'), false, 'employee lacks users.manage');
select is(public.company_role('11111111-1111-1111-1111-111111111111'), 'employee'::public.app_role, 'company_role returns employee');

-- ---------------------------------------------------------------------------
-- Company profile updates
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
update public.companies set name_en = 'Hacked' where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select results_eq($$ select name_en from public.companies $$, array['Company One'],
  'employee update of company profile is silently filtered by RLS');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update public.companies set name_en = 'Hacked' where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select results_eq($$ select name_en from public.companies $$, array['Company One'],
  'another tenant cannot update co1');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select lives_ok($$ update public.companies set name_en = 'Company One Ltd'
                   where id = '11111111-1111-1111-1111-111111111111' $$,
  'hr_admin (org.manage) can update the profile');
select results_eq($$ select name_en from public.companies $$, array['Company One Ltd'], 'profile update applied');
select throws_ok($$ update public.companies set plan = 'enterprise'
                    where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'plan column is not updatable by tenants');

-- ---------------------------------------------------------------------------
-- Membership visibility and guard rules
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select results_eq($$ select count(*)::int from public.company_members $$, array[1],
  'employee sees only their own membership');

select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select results_eq($$ select count(*)::int from public.company_members $$, array[5],
  'ceo sees all co1 memberships');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$ insert into public.company_members (company_id, user_id, role, status)
                    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000b', 'company_owner', 'active') $$,
  '42501', null, 'another tenant cannot add itself to co1');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$ insert into public.company_members (company_id, user_id, role, status)
                    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000009', 'employee', 'active') $$,
  '42501', null, 'employee cannot add members');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select throws_ok($$ update public.company_members set role = 'company_owner'
                    where user_id = '00000000-0000-0000-0000-00000000000c' $$,
  '42501', null, 'hr_admin cannot promote to owner');
select throws_ok($$ update public.company_members set role = 'employee'
                    where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'hr_admin cannot demote an owner');
select throws_ok($$ update public.company_members set status = 'suspended'
                    where user_id = '00000000-0000-0000-0000-00000000000d' $$,
  '42501', null, 'hr_admin cannot change own membership');
select lives_ok($$ update public.company_members set role = 'hr_staff'
                   where user_id = '00000000-0000-0000-0000-00000000000f' $$,
  'hr_admin can change a member role');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ delete from public.company_members
                    where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'last owner cannot remove themselves');

-- ---------------------------------------------------------------------------
-- Permission overrides
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select throws_ok($$ insert into public.user_permission_overrides (company_id, user_id, permission, granted)
                    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000d', 'billing.manage', true) $$,
  '42501', null, 'hr_admin cannot grant themselves permissions');
select throws_ok($$ insert into public.user_permission_overrides (company_id, user_id, permission, granted)
                    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c', 'billing.manage', true) $$,
  '42501', null, 'hr_admin cannot delegate a permission they lack');
select lives_ok($$ insert into public.user_permission_overrides (company_id, user_id, permission, granted)
                   values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c', 'export.data', true) $$,
  'hr_admin can delegate a permission they hold');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into public.user_permission_overrides (company_id, user_id, permission, granted)
                   values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c', 'kpi.read', false) $$,
  'owner can revoke a default permission');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is(public.has_permission('11111111-1111-1111-1111-111111111111', 'export.data'), true, 'grant override applies');
select is(public.has_permission('11111111-1111-1111-1111-111111111111', 'kpi.read'), false, 'revoke override applies');
select ok(not ('kpi.read' = any(public.my_permissions('11111111-1111-1111-1111-111111111111'))),
  'my_permissions reflects overrides');

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select ok((select count(*) from public.activity_log where entity = 'user_permission_overrides') = 2,
  'override writes are logged');
select ok((select count(*) from public.activity_log where entity = 'company_members' and action = 'update') = 1,
  'role change is logged');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is_empty($$ select 1 from public.activity_log $$, 'member without audit.read cannot read the log');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is_empty($$ select 1 from public.activity_log
                   where company_id = '11111111-1111-1111-1111-111111111111' $$,
  'other tenant cannot read co1 log');

-- ---------------------------------------------------------------------------
-- create_company RPC
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000009');
select lives_ok($$ select public.create_company('Solo', null, true) $$, 'user can create a personal company');
select is(public.company_role((select id from public.companies where name_en = 'Solo')),
  'company_owner'::public.app_role, 'creator becomes owner');
select throws_ok($$ select public.create_company('Solo 2', null, true) $$, '23505', null,
  'only one personal company per user');

-- ---------------------------------------------------------------------------
-- Tenant deletion (server-side) cascades cleanly
-- ---------------------------------------------------------------------------
select pg_temp.logout();
select lives_ok($$ delete from public.companies where id = '22222222-2222-2222-2222-222222222222' $$,
  'deleting a company cascades through guarded tables');

select * from finish();
rollback;
