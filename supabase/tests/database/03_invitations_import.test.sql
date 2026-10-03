-- pgTAP: invitations, member directory and bulk org import.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

create function pg_temp.login(_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- A owner, C employee, D hr_admin, F manager; N/O invitees; G stranger; U unconfirmed
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'a@co1.test', now()),
  ('00000000-0000-0000-0000-00000000000c', 'c@co1.test', now()),
  ('00000000-0000-0000-0000-00000000000d', 'd@co1.test', now()),
  ('00000000-0000-0000-0000-00000000000f', 'f@co1.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'New@X.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'owner2@x.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'g@nowhere.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'unconfirmed@x.test', null);

insert into public.companies (id, name_en, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'Company One', '00000000-0000-0000-0000-00000000000a');

insert into public.company_members (company_id, user_id, role, status) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 'company_owner', 'active'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c', 'employee',      'active'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000d', 'hr_admin',      'active'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000f', 'manager',       'active');

insert into public.employees (id, company_id, code, full_name) values
  ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'N1', 'New Person');

-- ---------------------------------------------------------------------------
-- Creating invitations
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select lives_ok($$ select public.create_invitation('11111111-1111-1111-1111-111111111111', ' NEW@x.test ', 'employee',
                                                    'e0000000-0000-0000-0000-000000000001') $$,
  'hr_admin invites an employee linked to an employee record');
select results_eq($$ select email from public.company_invitations $$, array['new@x.test'], 'email is normalized');
select throws_ok($$ select public.create_invitation('11111111-1111-1111-1111-111111111111', 'owner2@x.test', 'company_owner') $$,
  '42501', null, 'hr_admin cannot invite an owner');
select throws_ok($$ select public.create_invitation('11111111-1111-1111-1111-111111111111', 'c@co1.test', 'manager') $$,
  '23505', null, 'cannot invite an existing member');
select throws_ok($$ select public.create_invitation('11111111-1111-1111-1111-111111111111', 'not-an-email', 'employee') $$,
  '22023', null, 'invalid email is rejected');
select throws_ok($$ insert into public.company_members (company_id, user_id, role, status)
                    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000009', 'employee', 'active') $$,
  '42501', null, 'members cannot be inserted directly, only via invitation');
select results_eq($$ select count(*)::int from public.list_company_members('11111111-1111-1111-1111-111111111111') $$,
  array[4], 'hr_admin lists members with emails');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.create_invitation('11111111-1111-1111-1111-111111111111', 'z@x.test', 'employee') $$,
  '42501', null, 'employee cannot invite');
select throws_ok($$ select * from public.list_company_members('11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'employee cannot list members');
select is_empty($$ select 1 from public.company_invitations $$, 'employee cannot read invitations');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.create_invitation('11111111-1111-1111-1111-111111111111', 'owner2@x.test', 'company_owner') $$,
  'owner can invite a co-owner');
select lives_ok($$ select public.create_invitation('11111111-1111-1111-1111-111111111111', 'unconfirmed@x.test', 'employee') $$,
  'owner invites an address whose account is unconfirmed');

-- ---------------------------------------------------------------------------
-- Accepting invitations
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000009');
select is_empty($$ select * from public.my_invitations() $$, 'stranger sees no invitations');
select throws_ok($$ select public.accept_invitation((select id from public.company_invitations limit 1)) $$,
  'P0002', null, 'stranger cannot accept someone else''s invitation');

select pg_temp.login('00000000-0000-0000-0000-000000000003');
select is_empty($$ select * from public.my_invitations() $$, 'unconfirmed email sees no invitations');

select pg_temp.login('00000000-0000-0000-0000-000000000001');
select results_eq($$ select company_name_en from public.my_invitations() $$, array['Company One'],
  'invitee sees their invitation');
select lives_ok($$ select public.accept_invitation((select id from public.my_invitations())) $$,
  'invitee accepts');
select is(public.company_role('11111111-1111-1111-1111-111111111111'), 'employee'::public.app_role,
  'invitee joins with the invited role');
select results_eq($$ select code from public.employees $$, array['N1'],
  'invitee is linked to their employee record and can see it');
select is_empty($$ select * from public.my_invitations() $$, 'accepted invitation disappears');

select pg_temp.login('00000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.accept_invitation((select id from public.my_invitations())) $$,
  'co-owner accepts an owner invitation');
select is(public.company_role('11111111-1111-1111-1111-111111111111'), 'company_owner'::public.app_role,
  'owner invitation grants the owner role');

-- Revoked invitations cannot be accepted
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select public.create_invitation('11111111-1111-1111-1111-111111111111', 'g@nowhere.test', 'hr_staff');
select public.revoke_invitation((select id from public.company_invitations where email = 'g@nowhere.test'));
select pg_temp.login('00000000-0000-0000-0000-000000000009');
select is_empty($$ select * from public.my_invitations() $$, 'revoked invitation is hidden');

-- ---------------------------------------------------------------------------
-- Bulk import
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select results_eq(
  $$ select public.import_org('11111111-1111-1111-1111-111111111111', '{
       "departments": [{"name_en": "Sales", "name_ar": "المبيعات"}, {"name_en": "Finance"}],
       "positions": [
         {"title_en": "Head of Sales", "department": "sales"},
         {"title_en": "Account Exec", "department": "Sales", "reports_to": "head of sales"}
       ],
       "employees": [
         {"code": "S1", "full_name": "Sara", "position": "Head of Sales", "employment_type": "ft", "start_date": "2024-01-15"},
         {"code": "S2", "full_name": "Omar", "position": "Account Exec", "manager_code": "S1", "work_email": "Omar@X.test"},
         {"code": "n1", "full_name": "New Person Renamed"}
       ]
     }'::jsonb) $$,
  array['{"positions": {"created": 2, "updated": 0}, "employees": {"created": 2, "updated": 1}, "departments": {"created": 2, "updated": 0}}'::jsonb],
  'import creates and updates rows and reports counts'
);
select results_eq(
  $$ select e.code || ':' || coalesce(m.code, '-') || ':' || coalesce(d.name_en, '-')
     from public.employees e
     left join public.employees m on m.id = e.manager_employee_id
     left join public.departments d on d.id = e.department_id
     where e.code in ('S1', 'S2') order by e.code $$,
  array['S1:-:Sales', 'S2:S1:Sales'],
  'import resolves positions, departments and manager codes'
);
select results_eq($$ select full_name from public.employees where code = 'N1' $$, array['New Person Renamed'],
  'import matches existing employee codes case-insensitively');

select throws_ok(
  $$ select public.import_org('11111111-1111-1111-1111-111111111111',
       '{"employees": [{"code": "S3", "full_name": "Ok"}, {"code": "S4", "full_name": "Bad", "position": "Nope"}]}') $$,
  '22023', 'Employees row 3: unknown position "Nope"', 'import reports the failing row'
);
select is_empty($$ select 1 from public.employees where code = 'S3' $$, 'a failed import writes nothing');
select throws_ok(
  $$ select public.import_org('11111111-1111-1111-1111-111111111111',
       '{"positions": [{"title_en": "Head of Sales", "reports_to": "Account Exec"}]}') $$,
  '23514', null, 'import rejects reporting cycles'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select throws_ok(
  $$ select public.import_org('11111111-1111-1111-1111-111111111111', '{"departments": [{"name_en": "X"}]}') $$,
  '42501', null, 'manager cannot import'
);

select * from finish();
rollback;
