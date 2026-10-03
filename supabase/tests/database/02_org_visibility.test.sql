-- pgTAP: org structure, cross-tenant references, cycles and manager visibility.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

create function pg_temp.login(_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', '', true);
$$;

-- Users: A owner, C employee, D hr_admin, E ceo, F manager (co1); B owner (co2)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@co1.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@co2.test'),
  ('00000000-0000-0000-0000-00000000000c', 'c@co1.test'),
  ('00000000-0000-0000-0000-00000000000d', 'd@co1.test'),
  ('00000000-0000-0000-0000-00000000000e', 'e@co1.test'),
  ('00000000-0000-0000-0000-00000000000f', 'f@co1.test');

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

insert into public.departments (id, company_id, name_en) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sales'),
  ('d0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Ops');

-- Position tree (co1):  CEO <- Sales Manager <- Sales Rep
--                            <- Sales Manager <- Team Lead (vacant) <- Junior
--                       CEO <- HR Manager
insert into public.positions (id, company_id, title_en, department_id) values
  ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CEO', null),
  ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Sales Manager', 'd0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Sales Rep', 'd0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'HR Manager', null),
  ('b0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Team Lead', 'd0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Junior', 'd0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', 'Ops Lead', null);

update public.positions set reports_to_position_id = 'b0000000-0000-0000-0000-000000000001'
where id in ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000004');
update public.positions set reports_to_position_id = 'b0000000-0000-0000-0000-000000000002'
where id in ('b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000005');
update public.positions set reports_to_position_id = 'b0000000-0000-0000-0000-000000000005'
where id = 'b0000000-0000-0000-0000-000000000006';

insert into public.employees (id, company_id, code, full_name, position_id, user_id) values
  ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CEO1', 'Chief',     'b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000e'),
  ('e0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'SM1',  'Sales Mgr', 'b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000f'),
  ('e0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'R1',   'Rep One',   'b0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000c'),
  ('e0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'R2',   'Rep Two',   'b0000000-0000-0000-0000-000000000003', null),
  ('e0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'HR1',  'HR Mgr',    'b0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000d'),
  ('e0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'X1',   'Dotted',    'b0000000-0000-0000-0000-000000000004', null),
  ('e0000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'J1',   'Junior',    'b0000000-0000-0000-0000-000000000006', null),
  ('e0000000-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', 'O1',   'Other Co',  'b0000000-0000-0000-0000-000000000009', null);

-- X1 sits in HR by position but reports to the Sales Manager by override.
update public.employees set manager_employee_id = 'e0000000-0000-0000-0000-000000000002'
where id = 'e0000000-0000-0000-0000-000000000006';

-- ---------------------------------------------------------------------------
select is(
  (select department_id from public.employees where id = 'e0000000-0000-0000-0000-000000000003'),
  'd0000000-0000-0000-0000-000000000001'::uuid,
  'employee department defaults from position'
);

-- Visibility by role ---------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select results_eq(
  $$ select code from public.employees order by code $$,
  array['J1', 'R1', 'R2', 'SM1', 'X1'],
  'manager sees self, direct and indirect reports, override reports, and reports under a vacant position'
);
select results_eq(
  $$ select count(*)::int from public.employee_visibility $$, array[4],
  'manager reads only their own visibility rows'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select results_eq($$ select code from public.employees $$, array['R1'], 'employee sees only self');

select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select results_eq($$ select count(*)::int from public.employees $$, array[7], 'ceo sees the whole company');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select results_eq($$ select count(*)::int from public.employees $$, array[7], 'hr_admin sees the whole company');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select results_eq($$ select code from public.employees $$, array['O1'], 'other tenant sees only its own employees');
select is_empty($$ select 1 from public.positions where company_id = '11111111-1111-1111-1111-111111111111' $$,
  'other tenant cannot read co1 positions');

-- Visibility follows org changes ---------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select lives_ok($$ update public.employees set manager_employee_id = 'e0000000-0000-0000-0000-000000000005'
                   where code = 'R2' $$, 'hr_admin can reassign a manager');
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select results_eq($$ select code from public.employees order by code $$,
  array['J1', 'R1', 'SM1', 'X1'], 'reassigned employee leaves the old manager subtree');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
update public.employees set status = 'inactive' where code = 'SM1';
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select results_eq($$ select code from public.employees $$, array['SM1'],
  'an inactive manager record loses subtree visibility');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
update public.employees set status = 'active' where code = 'SM1';

-- Permissions -----------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select throws_ok($$ insert into public.employees (company_id, code, full_name)
                    values ('11111111-1111-1111-1111-111111111111', 'Z9', 'Nope') $$,
  '42501', null, 'manager cannot create employees');
update public.employees set full_name = 'Hacked' where code = 'R1';
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select results_eq($$ select full_name from public.employees where code = 'R1' $$, array['Rep One'],
  'manager update of an employee is filtered by RLS');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select results_eq($$ select count(*)::int from public.departments $$, array[1], 'members can read departments');
select throws_ok($$ insert into public.departments (company_id, name_en)
                    values ('11111111-1111-1111-1111-111111111111', 'Rogue') $$,
  '42501', null, 'employee cannot create departments');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into public.user_permission_overrides (company_id, user_id, permission, granted)
                   values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000f', 'employees.read', false) $$,
  'owner revokes employees.read from the manager');
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select is_empty($$ select 1 from public.employees $$, 'revoked employees.read hides even the subtree');

-- Cross-tenant references and cycles --------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select throws_ok($$ insert into public.employees (company_id, code, full_name, position_id)
                    values ('11111111-1111-1111-1111-111111111111', 'Z1', 'Cross', 'b0000000-0000-0000-0000-000000000009') $$,
  '23503', null, 'cannot point at another tenant position');
select throws_ok($$ update public.positions set department_id = 'd0000000-0000-0000-0000-000000000002'
                    where id = 'b0000000-0000-0000-0000-000000000003' $$,
  '23503', null, 'cannot point at another tenant department');
select throws_ok($$ update public.employees set manager_employee_id = 'e0000000-0000-0000-0000-000000000009'
                    where code = 'R1' $$,
  '23503', null, 'cannot report to another tenant employee');
select throws_ok($$ update public.positions set reports_to_position_id = 'b0000000-0000-0000-0000-000000000006'
                    where id = 'b0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'position reporting cycle is rejected');
select throws_ok($$ update public.employees set manager_employee_id = 'e0000000-0000-0000-0000-000000000006'
                    where code = 'SM1' $$,
  '23514', null, 'manager cycle is rejected');
select throws_ok($$ insert into public.positions (company_id, title_en)
                    values ('11111111-1111-1111-1111-111111111111', '  sales rep ') $$,
  '23505', null, 'position titles are unique per company, case-insensitive');

-- Holidays --------------------------------------------------------------------
select lives_ok($$ insert into public.company_holidays (company_id, holiday_date, name_en, name_ar)
                   values ('11111111-1111-1111-1111-111111111111', '2026-10-06', 'Armed Forces Day', 'عيد القوات المسلحة') $$,
  'hr_admin adds a public holiday');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select results_eq($$ select count(*)::int from public.company_holidays $$, array[1], 'members read holidays');

-- Activity log ----------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select ok((select count(*) from public.activity_log where entity = 'employees' and action = 'update') >= 2,
  'employee updates are logged');

-- Deleting a position detaches holders instead of failing
select pg_temp.logout();
delete from public.positions where id = 'b0000000-0000-0000-0000-000000000005';
select is((select reports_to_position_id from public.positions where id = 'b0000000-0000-0000-0000-000000000006'),
  null, 'deleting a position clears reporting lines that pointed to it');

select lives_ok($$ delete from public.companies where id = '11111111-1111-1111-1111-111111111111' $$,
  'deleting a company with a full org structure cascades cleanly');

select * from finish();
rollback;
