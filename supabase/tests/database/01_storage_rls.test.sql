-- pgTAP: storage objects are isolated by the {company_id}/ path prefix.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

create function pg_temp.login(_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@co1.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@co2.test'),
  ('00000000-0000-0000-0000-00000000000c', 'c@co1.test');

insert into public.companies (id, name_en, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'Company One', '00000000-0000-0000-0000-00000000000a'),
  ('22222222-2222-2222-2222-222222222222', 'Company Two', '00000000-0000-0000-0000-00000000000b');

insert into public.company_members (company_id, user_id, role, status) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 'company_owner', 'active'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c', 'employee',      'active'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000b', 'company_owner', 'active');

select is(public.storage_company_id('not-a-uuid/logo.png'), null, 'invalid prefix maps to no company');

-- Owner uploads a logo and a document for co1
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                   values ('company-assets', '11111111-1111-1111-1111-111111111111/logo.png', '00000000-0000-0000-0000-00000000000a') $$,
  'owner can upload a logo');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                   values ('documents', '11111111-1111-1111-1111-111111111111/documents/jd.pdf', '00000000-0000-0000-0000-00000000000a') $$,
  'owner can upload a document');

select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('documents', '22222222-2222-2222-2222-222222222222/documents/x.pdf', '00000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'cannot upload into another tenant prefix');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('documents', 'documents/x.pdf', '00000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'cannot upload without a company prefix');

-- Employee: reads logo, cannot upload logo, cannot read others' documents
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select results_eq($$ select count(*)::int from storage.objects where bucket_id = 'company-assets' $$, array[1],
  'employee can read company logo');
select is_empty($$ select 1 from storage.objects where bucket_id = 'documents' $$,
  'employee cannot read documents uploaded by others');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('company-assets', '11111111-1111-1111-1111-111111111111/logo2.png', '00000000-0000-0000-0000-00000000000c') $$,
  '42501', null, 'employee cannot upload company assets');

-- Other tenant sees nothing
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is_empty($$ select 1 from storage.objects $$, 'other tenant sees no co1 objects');

select * from finish();
rollback;
