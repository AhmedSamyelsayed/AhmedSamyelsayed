-- =============================================================================
-- 0006 Job analysis (CONTEXT.md sections 6.1, 6.2, 6.3, 8, 9)
--   documents            uploaded files (job analyses and JDs for now)
--   job_analyses         versioned, one approved version per position
--   ja_question_templates bilingual standard questionnaire (global + company)
--   ja_sessions          questionnaire runs answered by a holder or manager
--   ai_usage_log         one row per AI call; never contains document text
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  uploaded_by   uuid references auth.users (id) on delete set null,
  type          text not null check (type in ('timesheet', 'job_analysis', 'jd', 'report', 'other')),
  storage_path  text not null unique,
  file_name     text not null check (char_length(file_name) between 1 and 255),
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  position_id   uuid,
  status        text not null default 'pending'
                check (status in ('pending', 'processing', 'done', 'failed')),
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, position_id)
    references public.positions (company_id, id) on delete set null (position_id),
  -- The object must live under the company's own storage prefix.
  check (public.storage_company_id(storage_path) = company_id)
);

create index documents_company_created_idx on public.documents (company_id, created_at desc);

create trigger documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

alter table public.documents enable row level security;
revoke all on public.documents from anon;

create policy "documents: readers and uploaders read" on public.documents
for select to authenticated
using (
  public.has_permission(company_id, 'documents.read')
  or (uploaded_by = (select auth.uid()) and public.is_member(company_id))
  or (type in ('job_analysis', 'jd') and public.has_permission(company_id, 'job_analysis.write'))
);

create policy "documents: permitted uploaders insert" on public.documents
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (
    public.has_permission(company_id, 'documents.upload')
    or (type = 'timesheet' and public.has_permission(company_id, 'timesheets.upload'))
    or (type in ('job_analysis', 'jd') and public.has_permission(company_id, 'job_analysis.write'))
  )
);

create policy "documents: processors update status" on public.documents
for update to authenticated
using (
  public.has_permission(company_id, 'documents.upload')
  or (type in ('job_analysis', 'jd') and public.has_permission(company_id, 'job_analysis.write'))
)
with check (
  public.has_permission(company_id, 'documents.upload')
  or (type in ('job_analysis', 'jd') and public.has_permission(company_id, 'job_analysis.write'))
);

create policy "documents: uploaders delete" on public.documents
for delete to authenticated
using (public.has_permission(company_id, 'documents.upload'));

-- Only status/error/position may change after upload.
revoke update on public.documents from authenticated;
grant update (status, error, position_id) on public.documents to authenticated;

-- Storage: job analysts can also upload and read JA/JD files in the documents bucket.
create policy "figure documents: job analysts upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'documents'
  and split_part(name, '/', 2) = 'job-analysis'
  and public.has_permission(public.storage_company_id(name), 'job_analysis.write')
);

create policy "figure documents: job analysts read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'documents'
  and split_part(name, '/', 2) = 'job-analysis'
  and public.has_permission(public.storage_company_id(name), 'job_analysis.write')
);

-- ---------------------------------------------------------------------------
-- Questionnaire templates (company_id null = global default)
-- ---------------------------------------------------------------------------
create table public.ja_question_templates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies (id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_]{1,60}$'),
  sort_order  int not null,
  text_en     text not null,
  text_ar     text not null,
  help_en     text,
  help_ar     text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index ja_question_templates_key_idx
  on public.ja_question_templates (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

alter table public.ja_question_templates enable row level security;
revoke all on public.ja_question_templates from anon;

create policy "ja templates: global and own company readable" on public.ja_question_templates
for select to authenticated
using (company_id is null or public.is_member(company_id));

create policy "ja templates: job analysts manage company questions" on public.ja_question_templates
for all to authenticated
using (company_id is not null and public.has_permission(company_id, 'job_analysis.write'))
with check (company_id is not null and public.has_permission(company_id, 'job_analysis.write'));

insert into public.ja_question_templates (company_id, key, sort_order, text_en, text_ar, help_en, help_ar) values
  (null, 'purpose', 1,
   'What is the purpose of this job, in one sentence?',
   'ما الغرض من هذه الوظيفة في جملة واحدة؟',
   'Why does the job exist and what would be missing without it?',
   'لماذا توجد هذه الوظيفة وما الذي سيفتقده العمل بدونها؟'),
  (null, 'duties', 2,
   'List the top 5 to 8 duties and roughly what percentage of time each takes.',
   'اذكر من 5 إلى 8 مهام رئيسية والنسبة التقريبية من الوقت لكل منها.',
   'Example: Prepare monthly payroll – 30%.',
   'مثال: إعداد الرواتب الشهرية – 30%.'),
  (null, 'recurring', 3,
   'Which tasks are daily, which are weekly and which are monthly?',
   'ما المهام اليومية وما المهام الأسبوعية وما المهام الشهرية؟',
   null, null),
  (null, 'decisions', 4,
   'Which decisions do you take on your own, and which need approval?',
   'ما القرارات التي تتخذها بنفسك وما القرارات التي تحتاج إلى موافقة؟',
   null, null),
  (null, 'reporting', 5,
   'Who does this job report to, and who reports to it?',
   'لمن تتبع هذه الوظيفة ومن يتبعها؟',
   null, null),
  (null, 'contacts', 6,
   'Who do you deal with inside and outside the company, and why?',
   'مع من تتعامل داخل الشركة وخارجها ولماذا؟',
   null, null),
  (null, 'tools', 7,
   'Which tools, systems and software do you use?',
   'ما الأدوات والأنظمة والبرامج التي تستخدمها؟',
   null, null),
  (null, 'qualifications', 8,
   'What qualifications, experience and certifications does the job need?',
   'ما المؤهلات والخبرات والشهادات التي تحتاجها الوظيفة؟',
   null, null),
  (null, 'outputs', 9,
   'What are the measurable outputs, and how is success judged?',
   'ما المخرجات القابلة للقياس وكيف يتم الحكم على النجاح؟',
   'Think of numbers, deadlines, quality checks and who reviews your work.',
   'فكر في الأرقام والمواعيد وفحوصات الجودة ومن يراجع عملك.'),
  (null, 'conditions', 10,
   'What are the working conditions? Include travel, site visits or shifts.',
   'ما ظروف العمل؟ اذكر السفر أو الزيارات الميدانية أو الورديات.',
   null, null);

-- ---------------------------------------------------------------------------
-- Questionnaire sessions
-- ---------------------------------------------------------------------------
create table public.ja_sessions (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete cascade,
  position_id         uuid not null,
  respondent_user_id  uuid references auth.users (id) on delete set null,
  jd_document_id      uuid,
  status              text not null default 'open'
                      check (status in ('open', 'submitted', 'generated', 'cancelled')),
  answers             jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  followups           jsonb not null default '[]'::jsonb check (jsonb_typeof(followups) = 'array'),
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, position_id)
    references public.positions (company_id, id) on delete cascade,
  foreign key (company_id, jd_document_id)
    references public.documents (company_id, id) on delete set null (jd_document_id)
);

create index ja_sessions_respondent_idx on public.ja_sessions (respondent_user_id);

create trigger ja_sessions_updated_at
before update on public.ja_sessions
for each row execute function public.set_updated_at();

alter table public.ja_sessions enable row level security;
revoke all on public.ja_sessions from anon;

create policy "ja sessions: job analysts and respondent read" on public.ja_sessions
for select to authenticated
using (
  public.has_permission(company_id, 'job_analysis.write')
  or (respondent_user_id = (select auth.uid()) and public.is_member(company_id))
);

create policy "ja sessions: job analysts insert" on public.ja_sessions
for insert to authenticated
with check (public.has_permission(company_id, 'job_analysis.write'));

create policy "ja sessions: job analysts update" on public.ja_sessions
for update to authenticated
using (public.has_permission(company_id, 'job_analysis.write'))
with check (public.has_permission(company_id, 'job_analysis.write'));

create policy "ja sessions: job analysts delete" on public.ja_sessions
for delete to authenticated
using (public.has_permission(company_id, 'job_analysis.write'));

-- A respondent must be a member of the company.
create or replace function public.guard_ja_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.respondent_user_id is not null and not exists (
    select 1 from public.company_members m
    where m.company_id = new.company_id and m.user_id = new.respondent_user_id and m.status = 'active'
  ) then
    raise exception 'respondent is not an active member of this company' using errcode = '23503';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger ja_sessions_guard
before insert or update of respondent_user_id on public.ja_sessions
for each row execute function public.guard_ja_session();

-- Respondents (who may lack job_analysis.write) save answers through this RPC.
create or replace function public.save_ja_answers(
  _session_id uuid,
  _answers jsonb,
  _followup_answers jsonb default '{}'::jsonb,
  _submit boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _s public.ja_sessions;
  _clean jsonb;
begin
  select * into _s from public.ja_sessions where id = _session_id for update;
  if not found or not (
    public.has_permission(_s.company_id, 'job_analysis.write')
    or (_s.respondent_user_id = auth.uid() and public.is_member(_s.company_id))
  ) then
    raise exception 'questionnaire not found' using errcode = 'P0002';
  end if;
  if _s.status <> 'open' then
    raise exception 'questionnaire is no longer open' using errcode = '22023';
  end if;
  if jsonb_typeof(_answers) <> 'object' or jsonb_typeof(_followup_answers) <> 'object' then
    raise exception 'answers must be objects' using errcode = '22023';
  end if;

  -- Keep only string answers of reasonable length.
  select coalesce(jsonb_object_agg(key, left(value #>> '{}', 4000)), '{}'::jsonb)
  into _clean
  from jsonb_each(_answers)
  where jsonb_typeof(value) = 'string' and key ~ '^[a-z0-9_]{1,60}$';

  update public.ja_sessions
  set answers = _clean,
      followups = (
        select coalesce(jsonb_agg(
          case when _followup_answers ? (f ->> 'key')
                    and jsonb_typeof(_followup_answers -> (f ->> 'key')) = 'string'
               then f || jsonb_build_object('answer', left(_followup_answers ->> (f ->> 'key'), 4000))
               else f end
          order by ord), '[]'::jsonb)
        from jsonb_array_elements(followups) with ordinality as x(f, ord)
      ),
      status = case when _submit then 'submitted' else status end
  where id = _session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Job analyses
-- ---------------------------------------------------------------------------
create table public.job_analyses (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete cascade,
  position_id         uuid not null,
  version             int not null,
  source              text not null check (source in ('upload', 'questionnaire', 'manual')),
  status              text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  content             jsonb not null check (jsonb_typeof(content) = 'object'),
  core_keywords       text[] not null default '{}',
  ancillary_keywords  text[] not null default '{}',
  source_document_id  uuid,
  ja_session_id       uuid,
  generation          jsonb,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  approved_by         uuid references auth.users (id) on delete set null,
  approved_at         timestamptz,
  unique (company_id, id),
  unique (position_id, version),
  foreign key (company_id, position_id)
    references public.positions (company_id, id) on delete cascade,
  foreign key (company_id, source_document_id)
    references public.documents (company_id, id) on delete set null (source_document_id),
  foreign key (company_id, ja_session_id)
    references public.ja_sessions (company_id, id) on delete set null (ja_session_id)
);

create unique index job_analyses_one_approved_idx
  on public.job_analyses (position_id) where status = 'approved';
create index job_analyses_company_idx on public.job_analyses (company_id, position_id, version desc);

create trigger job_analyses_updated_at
before update on public.job_analyses
for each row execute function public.set_updated_at();

-- Versioning and immutability: version = next number per position; approved
-- and superseded versions never change (except approved -> superseded).
create or replace function public.guard_job_analysis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext(new.position_id::text));
    select coalesce(max(version), 0) + 1 into new.version
    from public.job_analyses where position_id = new.position_id;
    new.status := 'draft';
    new.created_by := coalesce(new.created_by, auth.uid());
    new.approved_by := null;
    new.approved_at := null;
    return new;
  end if;

  if new.company_id <> old.company_id or new.position_id <> old.position_id
     or new.version <> old.version then
    raise exception 'job analysis identity is immutable' using errcode = '42501';
  end if;

  if old.status <> 'draft' then
    if not (old.status = 'approved' and new.status = 'superseded'
            and new.content = old.content
            and new.core_keywords = old.core_keywords
            and new.ancillary_keywords = old.ancillary_keywords) then
      raise exception 'approved job analyses cannot be edited; create a new version'
        using errcode = '42501';
    end if;
  elsif new.status <> 'draft' and current_setting('figure.approving', true) is distinct from 'on' then
    raise exception 'use approve_job_analysis() to approve' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger job_analyses_guard
before insert or update on public.job_analyses
for each row execute function public.guard_job_analysis();

create trigger job_analyses_activity
after insert or update or delete on public.job_analyses
for each row execute function public.log_activity();

alter table public.job_analyses enable row level security;
revoke all on public.job_analyses from anon;

create policy "job analyses: readers read" on public.job_analyses
for select to authenticated
using (
  public.has_permission(company_id, 'job_analysis.read')
  or (
    -- Everyone can read the approved analysis of their own position.
    status = 'approved' and exists (
      select 1 from public.employees e
      where e.company_id = job_analyses.company_id
        and e.position_id = job_analyses.position_id
        and e.user_id = (select auth.uid())
    ) and public.is_member(company_id)
  )
);

create policy "job analyses: writers insert" on public.job_analyses
for insert to authenticated
with check (public.has_permission(company_id, 'job_analysis.write'));

create policy "job analyses: writers update" on public.job_analyses
for update to authenticated
using (public.has_permission(company_id, 'job_analysis.write'))
with check (public.has_permission(company_id, 'job_analysis.write'));

create policy "job analyses: writers delete drafts" on public.job_analyses
for delete to authenticated
using (status = 'draft' and public.has_permission(company_id, 'job_analysis.write'));

create or replace function public.approve_job_analysis(_job_analysis_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _ja public.job_analyses;
begin
  select * into _ja from public.job_analyses where id = _job_analysis_id for update;
  if not found or not public.has_permission(_ja.company_id, 'job_analysis.write') then
    raise exception 'job analysis not found' using errcode = 'P0002';
  end if;
  if _ja.status <> 'draft' then
    raise exception 'only drafts can be approved' using errcode = '22023';
  end if;
  if coalesce(array_length(_ja.core_keywords, 1), 0) = 0 then
    raise exception 'add at least one core keyword before approving' using errcode = '22023';
  end if;

  perform set_config('figure.approving', 'on', true);
  update public.job_analyses set status = 'superseded'
  where position_id = _ja.position_id and status = 'approved';
  update public.job_analyses
  set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = _job_analysis_id;
  perform set_config('figure.approving', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- AI usage log (written by the ai Edge Function with the service role)
-- ---------------------------------------------------------------------------
create table public.ai_usage_log (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  user_id          uuid references auth.users (id) on delete set null,
  provider         text not null,
  model            text not null,
  task             text not null,
  prompt_version   text not null,
  status           text not null check (status in ('ok', 'refused', 'invalid_output', 'error')),
  tokens_in        int not null default 0,
  tokens_out       int not null default 0,
  cache_read       int not null default 0,
  cost_usd         numeric(10, 5) not null default 0,
  ms               int not null default 0,
  created_at       timestamptz not null default now()
);

create index ai_usage_log_company_created_idx on public.ai_usage_log (company_id, created_at desc);

alter table public.ai_usage_log enable row level security;
revoke all on public.ai_usage_log from anon;
revoke insert, update, delete on public.ai_usage_log from authenticated;

create policy "ai usage: ai.configure or audit.read" on public.ai_usage_log
for select to authenticated
using (
  public.has_permission(company_id, 'ai.configure')
  or public.has_permission(company_id, 'audit.read')
);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function
  public.save_ja_answers(uuid, jsonb, jsonb, boolean),
  public.approve_job_analysis(uuid)
from public, anon;
grant execute on function
  public.save_ja_answers(uuid, jsonb, jsonb, boolean),
  public.approve_job_analysis(uuid)
to authenticated;

revoke execute on function public.guard_ja_session(), public.guard_job_analysis()
from public, anon, authenticated;
