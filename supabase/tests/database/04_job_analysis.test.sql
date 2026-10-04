-- pgTAP: documents, job analysis versioning/approval, questionnaires, AI usage log.
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

create function pg_temp.login(_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', '', true);
$$;

-- A owner, C employee (holds Sales Rep), D hr_admin, F manager; B owner of co2
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@co1.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@co2.test'),
  ('00000000-0000-0000-0000-00000000000c', 'c@co1.test'),
  ('00000000-0000-0000-0000-00000000000d', 'd@co1.test'),
  ('00000000-0000-0000-0000-00000000000f', 'f@co1.test');

insert into public.companies (id, name_en, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'Company One', '00000000-0000-0000-0000-00000000000a'),
  ('22222222-2222-2222-2222-222222222222', 'Company Two', '00000000-0000-0000-0000-00000000000b');

insert into public.company_members (company_id, user_id, role, status) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 'company_owner', 'active'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c', 'employee',      'active'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000d', 'hr_admin',      'active'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000f', 'manager',       'active'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000b', 'company_owner', 'active');

insert into public.positions (id, company_id, title_en) values
  ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sales Rep'),
  ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Accountant'),
  ('b0000000-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', 'Ops Lead');

insert into public.employees (company_id, code, full_name, position_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', 'R1', 'Rep', 'b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c');

-- ---------------------------------------------------------------------------
-- Questionnaire templates
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select results_eq($$ select count(*)::int from public.ja_question_templates where company_id is null $$,
  array[10], 'ten global standard questions are seeded and readable');
select is_empty($$ select 1 from public.ja_question_templates
                   where text_ar ~ ('[' || chr(1611) || '-' || chr(1618) || ']') $$, 'Arabic questions have no diacritics');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select lives_ok($$ insert into public.ja_question_templates (company_id, key, sort_order, text_en, text_ar)
                   values ('11111111-1111-1111-1111-111111111111', 'safety', 11, 'Safety duties?', 'مهام السلامة؟') $$,
  'hr_admin adds a company question');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is_empty($$ select 1 from public.ja_question_templates where key = 'safety' $$,
  'other tenant does not see company questions');
select throws_ok($$ insert into public.ja_question_templates (company_id, key, sort_order, text_en, text_ar)
                    values (null, 'hack', 1, 'x', 'x') $$,
  '42501', null, 'nobody can add global questions');

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select lives_ok($$ insert into public.documents (id, company_id, uploaded_by, type, storage_path, file_name, mime_type, size_bytes, position_id)
                   values ('dd000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000d',
                           'jd', '11111111-1111-1111-1111-111111111111/job-analysis/jd.pdf', 'jd.pdf', 'application/pdf', 1000,
                           'b0000000-0000-0000-0000-000000000001') $$,
  'hr_admin registers an uploaded JD');
select throws_ok($$ insert into public.documents (company_id, uploaded_by, type, storage_path, file_name, mime_type, size_bytes)
                    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000d',
                            'jd', '22222222-2222-2222-2222-222222222222/job-analysis/x.pdf', 'x.pdf', 'application/pdf', 10) $$,
  '23514', null, 'document path must be under the company prefix');
select throws_ok($$ update public.documents set storage_path = '11111111-1111-1111-1111-111111111111/other.pdf'
                    where id = 'dd000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'storage path is immutable');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                   values ('documents', '11111111-1111-1111-1111-111111111111/job-analysis/jd.pdf', '00000000-0000-0000-0000-00000000000d') $$,
  'hr_admin uploads the file to storage');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is_empty($$ select 1 from public.documents $$, 'employee cannot see HR documents');
select throws_ok($$ insert into public.documents (company_id, uploaded_by, type, storage_path, file_name, mime_type, size_bytes)
                    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c',
                            'jd', '11111111-1111-1111-1111-111111111111/job-analysis/c.pdf', 'c.pdf', 'application/pdf', 10) $$,
  '42501', null, 'employee cannot register JA documents');

-- ---------------------------------------------------------------------------
-- Job analyses: versioning, immutability, approval
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
insert into public.job_analyses (id, company_id, position_id, version, source, content, core_keywords, source_document_id)
values ('aa000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000001',
        99, 'upload', '{"purpose_en": "Sell"}', '{quotation,visit}', 'dd000000-0000-0000-0000-000000000001');
select is((select version from public.job_analyses where id = 'aa000000-0000-0000-0000-000000000001'), 1,
  'version is assigned by the database, not the client');
select throws_ok($$ update public.job_analyses set status = 'approved' where id = 'aa000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'status cannot be set to approved directly');
select lives_ok($$ select public.approve_job_analysis('aa000000-0000-0000-0000-000000000001') $$, 'hr_admin approves v1');
select throws_ok($$ update public.job_analyses set content = '{"purpose_en": "Changed"}'
                    where id = 'aa000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'approved content is immutable');

insert into public.job_analyses (id, company_id, position_id, version, source, content, core_keywords)
values ('aa000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000001',
        1, 'manual', '{"purpose_en": "Sell more"}', '{}');
select is((select version from public.job_analyses where id = 'aa000000-0000-0000-0000-000000000002'), 2, 'next version is 2');
select throws_ok($$ select public.approve_job_analysis('aa000000-0000-0000-0000-000000000002') $$,
  '22023', null, 'approval needs at least one core keyword');
update public.job_analyses set core_keywords = '{quotation}' where id = 'aa000000-0000-0000-0000-000000000002';
select lives_ok($$ select public.approve_job_analysis('aa000000-0000-0000-0000-000000000002') $$, 'v2 approved');
select results_eq($$ select version || ':' || status from public.job_analyses
                     where position_id = 'b0000000-0000-0000-0000-000000000001' order by version $$,
  array['1:superseded', '2:approved'], 'approving v2 supersedes v1');
delete from public.job_analyses where id = 'aa000000-0000-0000-0000-000000000002';
select results_eq($$ select count(*)::int from public.job_analyses where id = 'aa000000-0000-0000-0000-000000000002' $$,
  array[1], 'approved versions cannot be deleted');

-- Readers
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select results_eq($$ select version from public.job_analyses $$, array[2],
  'employee reads only the approved analysis of their own position');
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select results_eq($$ select count(*)::int from public.job_analyses $$, array[2],
  'manager with job_analysis.read sees all versions');
select throws_ok($$ insert into public.job_analyses (company_id, position_id, version, source, content)
                    values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000002', 1, 'manual', '{}') $$,
  '42501', null, 'manager cannot create analyses');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is_empty($$ select 1 from public.job_analyses $$, 'other tenant sees no analyses');
select throws_ok($$ insert into public.job_analyses (company_id, position_id, version, source, content)
                    values ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 1, 'manual', '{}') $$,
  '23503', null, 'cannot attach an analysis to another tenant position');

-- ---------------------------------------------------------------------------
-- Questionnaire sessions
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
insert into public.ja_sessions (id, company_id, position_id, respondent_user_id, followups)
values ('5e000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-00000000000c', '[{"key": "targets", "text_en": "What are your targets?", "text_ar": "ما أهدافك؟"}]');
select throws_ok($$ insert into public.ja_sessions (company_id, position_id, respondent_user_id)
                    values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b') $$,
  '23503', null, 'respondent must be a member');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select results_eq($$ select count(*)::int from public.ja_sessions $$, array[1], 'respondent sees their questionnaire');
select lives_ok($$ select public.save_ja_answers('5e000000-0000-0000-0000-000000000001',
                     '{"purpose": "Win new customers", "BAD KEY": "x", "duties": 5}', '{"targets": "20 visits a week"}', true) $$,
  'respondent saves and submits answers');
select results_eq($$ select (answers ->> 'purpose') || '|' || (answers ? 'duties')::text || '|' ||
                            (followups -> 0 ->> 'answer') || '|' || status from public.ja_sessions $$,
  array['Win new customers|false|20 visits a week|submitted'],
  'answers are sanitized, follow-up answers stored, session submitted');
select throws_ok($$ select public.save_ja_answers('5e000000-0000-0000-0000-000000000001', '{}') $$,
  '22023', null, 'submitted questionnaire is locked');

select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select throws_ok($$ select public.save_ja_answers('5e000000-0000-0000-0000-000000000001', '{}') $$,
  'P0002', null, 'non-respondent without write access cannot answer');

-- ---------------------------------------------------------------------------
-- AI usage log
-- ---------------------------------------------------------------------------
select pg_temp.logout();
insert into public.ai_usage_log (company_id, provider, model, task, prompt_version, status, tokens_in, tokens_out)
values ('11111111-1111-1111-1111-111111111111', 'anthropic', 'claude-opus-5-5', 'extract_job_analysis', 'ja-v1', 'ok', 1000, 500);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is_empty($$ select 1 from public.ai_usage_log $$, 'employees cannot read AI usage');

select * from finish();
rollback;
