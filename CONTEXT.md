# CONTEXT.md — Figure (figure.aseautomation.online)

> Project context file for AI coding assistants (Claude Code, Cursor, Gemini CLI, etc.).
> Read this file fully before writing any code. It is the single source of truth for scope, architecture, data model, security rules and conventions.

---

## 1. Product Summary

**Figure** is a multi-tenant SaaS platform for **AI-powered KPI and workforce productivity analysis**, built under the **ASE Automation** brand.

Companies sign up, define their organization (logo, departments, positions, reporting lines), assign and track tasks, and use AI to:

1. Analyze jobs (from an uploaded Job Analysis or from a JD plus a guided questionnaire).
2. Generate role-specific KPI frameworks and task keyword maps.
3. Review uploaded documents (timesheets, reports, JDs) and score productivity against the job analysis.
4. Detect training gaps and produce audit justifications.

**AI is bring-your-own-key, per person.** Supported providers are Anthropic (Claude), Google (Gemini), OpenAI (ChatGPT) and DeepSeek. There are no platform keys and no platform credits: every AI call uses the personal API key of the user who triggered it (section 8). Users without a key can use everything except AI features.

The original single-company prototype (`prototype/BloomKPIDashboard.jsx`) is the functional reference. Every hardcoded element in it (JD_MAP, TNA, employees, CEO name, departments) becomes **tenant data stored in Supabase** and generated or edited per company.

**Domain:** `figure.aseautomation.online` (Cloudflare subdomain)
**Primary languages:** English and Arabic (full RTL support required)
**Primary market:** Egypt and MENA (Egyptian Labour Law No. 14 of 2025 awareness)

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | SPA, deployed to Cloudflare Pages |
| Styling | Tailwind CSS + shadcn/ui | Dark theme default (matches prototype), RTL via `dir` attribute and logical properties |
| Charts | Recharts | Same as prototype |
| File parsing | SheetJS (xlsx), pdf.js, mammoth (docx) | Client-side preview, server-side re-parse for trust. See section 16 for the libraries actually in use |
| i18n | i18next | `en` and `ar` namespaces, no tashkeel in Arabic strings |
| Hosting | Cloudflare Pages | Custom domain `figure.aseautomation.online` |
| AI gateway | Cloudflare Worker `workers/ai-gateway` | Provider-agnostic AI proxy; the only place a personal AI key is ever decrypted |
| Mail worker | Cloudflare Worker `workers/mail` + Cron Triggers | SMTP sending and IMAP reply polling from users' mailboxes (TCP sockets via `connect()`) |
| Edge Functions | Supabase Edge Functions | Invites and other service-role jobs that are not AI or mail |
| Scheduled DB jobs | `pg_cron` in Supabase | Overdue task marking, visibility refresh fallbacks |
| Database | Supabase Postgres | Row Level Security on every tenant table |
| Auth | Supabase Auth | Email/password, magic link, Google OAuth; invite flow for company users |
| Storage | Supabase Storage | Logos, JDs, job analyses, timesheets, reports |
| Secrets | Supabase Vault (pgsodium) | Personal AI keys and mailbox credentials, encrypted at rest |
| Repo / CI | GitHub + GitHub Actions | Lint, typecheck, test, migrate, deploy |

---

## 3. Repository Structure

```
figure/
├── CONTEXT.md                  # this file
├── apps/
│   └── web/                    # React SPA (Cloudflare Pages)
│       ├── src/
│       │   ├── app/            # routes, layouts, guards
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   ├── onboarding/
│       │   │   ├── org/            # departments, positions, employees, reporting lines
│       │   │   ├── tasks/          # task assignment, status updates, task history
│       │   │   ├── job-analysis/   # upload or AI questionnaire
│       │   │   ├── documents/      # uploads + AI review
│       │   │   ├── timesheets/     # Schema A/B ingestion (from prototype)
│       │   │   ├── kpi/            # TUR, TAI, PES, TCR, dashboards
│       │   │   ├── training/       # TNA, gaps, recommendations
│       │   │   ├── audit/          # audit flags + justifications
│       │   │   ├── ai-key/         # personal AI key (each user manages their own)
│       │   │   ├── mail/           # mailbox settings (admin) + read-only own view
│       │   │   └── admin/          # users, roles, permissions, audit log
│       │   ├── lib/
│       │   │   ├── supabase.ts
│       │   │   ├── permissions.ts  # client-side permission helpers (UI only)
│       │   │   ├── parsing/        # ported parseSchemaA, parseSchemaBRows, detectSchema
│       │   │   └── metrics/        # ported calcTUR, calcTAI, calcPES
│       │   └── i18n/
├── workers/
│   ├── ai-gateway/             # Cloudflare Worker: provider-agnostic AI proxy, personal keys
│   └── mail/                   # Cloudflare Worker: SMTP outbox + IMAP reply polling (cron)
├── supabase/
│   ├── migrations/             # numbered SQL migrations (source of truth for schema)
│   ├── functions/              # Edge Functions (invites, other service-role jobs)
│   └── seed.sql                # demo tenant only
├── packages/
│   └── shared/                 # shared TS types, zod schemas, metric formulas
├── prototype/
│   └── BloomKPIDashboard.jsx   # original reference, do not deploy
└── .github/workflows/
```

---

## 4. Multi-Tenancy and Data Isolation (NON-NEGOTIABLE)

1. Every tenant-owned table has a `company_id uuid not null references companies(id)`.
2. **RLS is enabled on every table.** No table is ever readable without a policy.
3. The frontend never filters by `company_id` as a security measure. Isolation is enforced only in Postgres policies.
4. Storage paths are prefixed `{company_id}/...` and protected by storage RLS policies using the same membership check.
5. The `service_role` key is used **only** inside Workers and Edge Functions, never shipped to the browser.
6. AI calls never mix data from two companies in one prompt. Each request is built from a single `company_id` scope.
7. **Personal AI keys** (`user_ai_keys`) are stored encrypted in Vault, decrypted only inside the AI gateway Worker, and never returned to the client (only `last4` is ever shown). A key is private to its owner: it is never used for, shared with, or readable by any other user, including admins of the same company. The gateway selects the key strictly from the caller's verified JWT `sub`, never from a request parameter.
8. **Mailbox credentials** (`user_mail_accounts`) are stored encrypted in Vault, decrypted only inside the mail Worker, and never sent to the client.
9. Individual users (no company) are modeled as a **personal company** with one member, so the same isolation rules apply.
10. AI providers must be called with data-retention-off / zero-training settings where the provider offers them per request. Where retention is an account-level setting, the AI key page tells the user so.
11. There are **no platform AI keys or platform credits**. No environment variable, Worker secret or Edge Function secret holds a provider API key.

---

## 5. Roles and Authorization

### 5.1 Roles

| Role | Scope | Description |
|---|---|---|
| `platform_admin` | All tenants (metadata only) | ASE Automation staff. Manages plans, billing, support. **Cannot read tenant employee data** unless granted a time-limited support session by the company owner. |
| `company_owner` | Whole company | The account that signed up. Billing, mailbox settings, can assign any role. |
| `ceo` | Whole company, read-everything | Sees all employees, all departments, all analyses, all tasks, full audit log. Read-mostly. |
| `hr_admin` (super user) | Whole company, full write | HR staff. Manage org structure, employees, job analyses, uploads, training, users, permissions and mailbox settings. Sees all tasks. |
| `hr_staff` | Whole company or assigned departments | Operational HR. Upload timesheets, view analyses, cannot change roles or mailbox settings. |
| `manager` | Own subtree | Sees only employees who report to them **directly or indirectly**, per the reporting lines in the job analysis. The only role that creates tasks by default. |
| `employee` | Self | Sees own timesheets, own KPI scores, own training plan and own tasks. Can submit own timesheets and update the status of own tasks. |

Every role, including `employee`, manages **its own** personal AI key. No role can read or use another user's key.

### 5.2 Visibility Rule (core logic)

Visibility for managers is derived from the **reporting hierarchy defined in the job analysis**:

- Each `position` has `reports_to_position_id`.
- Each `employee` holds a `position_id` and optionally a direct `manager_employee_id` override.
- A manager can see an employee if that employee is anywhere below them in the tree.
- Implemented as a Postgres function `can_view_employee(target_employee_id uuid)` using a recursive CTE, cached in a materialized table `employee_visibility(viewer_user_id, employee_id)` refreshed on org changes.
- The same rule decides **who a manager may assign tasks to** and **whose tasks a manager may see** (section 6.5).

### 5.3 Granular Permissions

Roles map to default permission sets; `hr_admin` and `company_owner` can override per user (a non-owner can only grant permissions they hold themselves).

```
employees.read | employees.write
org.manage
job_analysis.read | job_analysis.write
documents.upload | documents.read
timesheets.upload | timesheets.read
tasks.create | tasks.read | tasks.update_own
kpi.read | kpi.configure
training.read | training.write
audit.read
users.manage
mail.manage
billing.manage
export.data
```

`ai.configure` is **removed**: there are no company-level AI settings. Managing one's own AI key needs no permission; seeing other users' key status (provider, model, `last4`, set/not set) uses `users.manage`.

Default task and mail permissions per role:

| Permission | owner | ceo | hr_admin | hr_staff | manager | employee |
|---|---|---|---|---|---|---|
| `tasks.create` | ✓ (owners hold all) | | | | ✓ | |
| `tasks.read` | ✓ | ✓ | ✓ | | ✓ (subtree) | |
| `tasks.update_own` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `mail.manage` | ✓ | | ✓ | | | |

Stored in `role_permissions` (defaults) and `user_permission_overrides` (grant/revoke). The DB function `has_permission(perm text)` is used inside RLS policies. The client mirrors this only to hide UI, never to enforce.

---

## 6. Core User Flows

### 6.1 Company Sign-up and Onboarding Wizard

1. Sign up (email or Google) → create `companies` row → user becomes `company_owner`.
2. **Company profile**: name (EN/AR), logo upload, industry, country, working week (default Sunday to Thursday, Friday/Saturday weekend), FT/PT daily hours, public holidays.
3. **Your AI key (optional)**: the owner may add their own personal key (provider, model, key). The wizard explains that every user who wants AI features adds their own key at `/app/settings/ai-key`; there is no company key. Skipping disables AI steps for this user only.
4. **Organization structure**: departments, then positions with reporting lines. Can import from Excel.
5. **Job analysis**, per position, one of two paths (AI paths need the acting user's key; manual entry always works):
   - **Path A, upload**: upload an existing Job Analysis (docx/pdf/xlsx). AI extracts purpose, duties, responsibilities, KPIs, qualifications, reporting line, and core/ancillary task keywords. HR reviews and approves.
   - **Path B, guided**: upload a JD (or none). AI asks a **standard job analysis questionnaire** (see 6.2), the position holder or manager answers, AI produces the structured job analysis. HR approves.
6. **Employees**: add manually or import (code, name, position, department, manager, FT/PT, start date, work email). Send invites with roles.
7. **Mail (optional, hr_admin or owner)**: connect managers' mailboxes so task emails go out from them (section 6.6).
8. Done → dashboard.

### 6.2 Standard Job Analysis Questionnaire (AI-driven)

Bilingual question bank stored in `ja_question_templates`, AI may add follow-ups based on answers:

1. Job purpose in one sentence
2. Top 5 to 8 duties and approximate % of time each
3. Daily / weekly / monthly recurring tasks
4. Decisions taken independently vs requiring approval
5. Who the role reports to and who reports to it
6. Internal and external contacts
7. Tools, systems and software used
8. Required qualifications, experience, certifications
9. Measurable outputs and how success is judged
10. Working conditions, travel, site visits

Output is saved as a versioned `job_analyses` record and generates the position's **task keyword map** (replaces the hardcoded `JD_MAP`) and **KPI set**. Follow-up questions are generated with the key of the user who asks for them (respondent or HR).

### 6.3 Document Upload and AI Review

- Supported: xlsx, xls, csv, pdf, docx, images (OCR via the AI model's vision capability).
- Flow: upload → stored at `{company_id}/documents/...` → `documents` row with status `pending` → Worker extracts text → AI analyzes against the relevant job analysis **using the uploader's personal key** → results saved to `document_analyses` → status `done`.
- If the uploader has no key, the document is stored with status `pending` and a "needs AI key" note; any user with access and a key can run the review later.
- Document types: `timesheet`, `job_analysis`, `jd`, `report`, `other`.
- Large jobs run asynchronously; UI subscribes via Supabase Realtime.

### 6.4 Timesheet Ingestion (ported from prototype)

Keep the prototype's proven logic, moved to `packages/shared`:

- `detectSchema(rows)` → `A` (individual daily template) or `B` (master grid).
- `parseSchemaA` / `parseSchemaBRows` unchanged in behavior.
- `findEmpByName` fuzzy matching, plus manual mapping in the preview modal.
- Rules retained: pre-start-date entries rejected and logged as violations; duplicate (employee + date) triggers Skip / Overwrite conflict resolution.
- Re-parse server-side before persisting. Client parsing is for preview only.
- Rule-based scores never need AI. AI-enhanced TAI (section 7) runs with the uploader's key, or is skipped when they have none.

### 6.5 Task Workflow

Lifecycle and statuses:

```
assigned ──accept──▶ accepted ──start──▶ in_progress ──done──▶ done
    │                   │                    │
    └──────── due_at passes and status ≠ done ────────▶ overdue
                                                          │
                     overdue ──start/done──▶ in_progress / done (completed late)
```

Rules:

1. **Only managers create tasks** (`tasks.create`, granted by default to `manager`; owners hold every permission; other users only via an explicit override). A task can be assigned only to an employee for whom `can_view_employee(assigned_to)` is true for the creator, and never to the creator's own employee record.
2. **Employees update the status of their own tasks only** (`tasks.update_own`, task's `assigned_to` employee is linked to `auth.uid()`). Allowed transitions: `assigned→accepted`, `accepted→in_progress`, `assigned|accepted|in_progress|overdue→done`, `overdue→in_progress`. Status changes go through the RPC `set_task_status(task_id, to_status)`; direct `UPDATE` of `status` is not granted to clients.
3. The creator (`assigned_by`) may edit title, description, due date and priority while status is `assigned` or `accepted`. Nobody can rewrite a task's history.
4. **Every status change writes one `task_events` row** with `from_status`, `to_status`, `actor_user_id`, `source` and `created_at`, from a trigger, so it cannot be skipped. `accepted_at`, `started_at` and `completed_at` are set by the same trigger.
5. **Overdue**: a `pg_cron` job (every 15 minutes) runs `mark_overdue_tasks()`, setting `status = 'overdue'` where `due_at < now()` and status is not `done` (nor already `overdue`), writing `task_events` with `actor_user_id = null` and `source = 'system'`.
6. **Visibility**: the assignee sees their own tasks; the creator sees tasks they created; users with `tasks.read` see tasks of employees they can view (managers: their subtree; `ceo`, `hr_admin`, `company_owner`: all tasks).
7. **KPI feed**: completed and overdue tasks feed `kpi_scores` (Task Completion Rate, section 7).
8. Email notifications and email replies are optional and covered in 6.6. The app always works without email.

### 6.6 Email Integration

Each user may have one connected mailbox per company (`user_mail_accounts`), set up **only by `hr_admin` or `company_owner`** (`mail.manage`). Users see their own mail settings read-only.

Sending (SMTP, from the **task creator's** mailbox to the assignee's `employees.work_email`):

- **Assignment** email when a task is created.
- **Reminder** email before `due_at` (default 24 hours, configurable per company later).
- **Overdue** email when the task becomes `overdue`.
- If the creator has no active mailbox or the assignee has no work email, no email is sent; the in-app task is unaffected.
- Outgoing mail is queued in `task_email_messages` (direction `out`) by triggers and sent by the mail Worker, with retries.

Reference token:

- Every outgoing email carries a task reference token in the subject (`[FIG-<token>]`) and a matching `Message-ID`; the token is random per message, stored only as a hash (`token_hash`), and bound to one task and one recipient address.

Replies (IMAP, polled by the mail Worker every 5 minutes from the creator's mailbox):

- A reply is processed only if **all** hold: the token in the subject or `In-Reply-To` matches an outgoing message; the `From` address equals the recipient that message was sent to; the token is not older than 30 days; the message was not processed before (`message_id` dedupe).
- The first word of the reply body (above any quoted text) decides the action, case-insensitive: `Accept` → `accepted`, `Done` → `done`. Arabic equivalents `قبول` and `تم` are also recognized. Anything else is logged as `ignored`.
- The status change goes through the same transition rules as the app and is logged in `task_events` with `source = 'email'` and `actor_user_id` = the assignee's user (or null if the assignee has no account).
- Processed and ignored replies are recorded in `task_email_messages` (direction `in`) without storing the body.

Credentials:

- SMTP/IMAP password (or app password) stored in Vault (`secret_vault_id`), decrypted only in the mail Worker, never returned to the client, never logged.
- `status`: `unverified` → `active` after a successful SMTP + IMAP login test; `error` after repeated failures (the admin sees the last error, not the secret); `disabled` by an admin.

### 6.7 Personal AI Key

- Route `/app/settings/ai-key`, available to every signed-in member for their own key only.
- The user chooses a provider (Anthropic, Google, OpenAI, DeepSeek), a model from that provider's supported list, and pastes the key.
- The key is sent once over HTTPS to the AI gateway (`POST /api/ai/key`), which validates it with a minimal provider call, writes it to Vault, and stores only `last4` in `user_ai_keys`. It is never returned, displayed in full, or logged.
- One key per user per company (`unique (user_id, company_id)`); saving a new key replaces the old one and deletes the old Vault secret. The user can delete their key at any time.
- Users without a key see AI buttons disabled with a link to this page; the gateway returns `412 ai_key_required` for them.
- Admins (`users.manage`) see, per member, only: key set or not, provider, model, `last4`, date set.

---

## 7. KPI Engine

Formulas from the prototype become the **default** model; each company can tune weights in `kpi_settings`.

| Metric | Default formula |
|---|---|
| **TUR** Time Utilization Rate | `min(100, hours_worked / expected_hours × 100)`, expected from FT/PT setting |
| **TAI** Task Alignment Index | Keyword match vs position core/ancillary keywords. Core ≥40% → 80–100, core ≥20% → 65–79, ancillary only → 70, none → 45 |
| **PES** Productivity Efficiency Score | `TUR × 0.40 + TAI × 0.60` (+ `TCR × tcr_weight` when the company enables it; weights renormalized) |
| **TRI** Training Reflection Index | `(post_PES − pre_PES) / pre_PES × 100` |
| **TCR** Task Completion Rate | `tasks done on or before due_at / tasks due in the period × 100`; overdue tasks count as not completed |

**AI-enhanced TAI (v2):** in addition to keyword matching, the AI model classifies each task line as core / ancillary / out-of-scope against the full job analysis text and returns a rationale. Store both scores; show the AI score with the rule-based score as fallback. Runs with the key of the user who triggered scoring; without a key only the rule-based score is stored.

**Task feed:** per employee and period, `kpi_scores` stores `tasks_due`, `tasks_done_on_time`, `tasks_done_late`, `tasks_overdue` and `tcr`. `tcr_weight` defaults to 0, so PES matches the prototype until a company opts in.

Score colors: ≥85 green, ≥70 blue, ≥55 amber, else red.

Audit flags (per entry): `under_hours` (medium), `low_task_alignment` TAI<70 (high), `pre_start_date` (critical), `task_overdue` (medium). Each flag stores an auto-generated justification text in EN and AR.

Transfers: `employee_transfers` history is honored so past entries are scored against the department and role held on that date (prototype behavior).

---

## 8. AI Gateway (provider-agnostic, personal keys)

A Cloudflare Worker at `/api/ai/*` exposes one internal interface:

```ts
interface AIRequest {
  companyId: string;
  task: 'extract_job_analysis' | 'ja_questionnaire_next' | 'generate_job_analysis'
      | 'classify_tasks' | 'review_document' | 'training_recommendations' | 'audit_justification';
  input: Record<string, unknown>;
  locale: 'en' | 'ar';
}
```

Plus key management:

```
POST   /api/ai/key      { companyId, provider, model, apiKey }  → validate, store in Vault, return { provider, model, last4 }
DELETE /api/ai/key      { companyId }                            → delete Vault secret and row
GET    /api/ai/key      ?companyId=                              → { set, provider, model, last4 } for the caller only
```

- **Key resolution:** verify the JWT, take `sub` as the user, load that user's `user_ai_keys` row for `companyId`, decrypt the Vault secret through a `SECURITY DEFINER` function executable only by `service_role`, use it for this request only, and discard it. No key → `412 ai_key_required`. The key is never logged, cached across requests, or included in errors.
- Adapters: `anthropic.ts`, `gemini.ts`, `deepseek.ts`, `openai.ts`, all returning the same normalized JSON. Each adapter declares its supported models; the model comes from the user's key row.
- Prompts are versioned templates (`ai_prompt_templates`, see section 16); responses are validated with zod. Invalid JSON → one retry → fail gracefully.
- Every call logged to `ai_usage_log` (company, user, provider, model, task, tokens, cost estimate, latency). No raw document text in logs. Users see their own usage; `audit.read` sees the company's.
- Per-user rate limits to protect the platform. No platform quotas or credits: usage is billed by the provider to the key owner.
- Verify JWT, company membership and the task's permission before every call. Background jobs (AI-enhanced TAI, document review) run with the key of the user who started them, recorded on the job.

---

## 9. Database Schema (initial)

```sql
companies(id, name_en, name_ar, logo_path, industry, country, timezone,
          weekend_days int[], ft_daily_hours, pt_daily_hours, plan, created_at)
company_members(id, company_id, user_id, role, status, invited_by, created_at)
role_permissions(role, permission)
user_permission_overrides(company_id, user_id, permission, granted bool)

departments(id, company_id, name_en, name_ar, head_position_id)
positions(id, company_id, department_id, title_en, title_ar, reports_to_position_id)
job_analyses(id, company_id, position_id, version, source ['upload','questionnaire','manual'],
             content jsonb, core_keywords text[], ancillary_keywords text[],
             status ['draft','approved','superseded'], approved_by, created_at)
ja_question_templates(id, company_id null=global, order, text_en, text_ar)
ja_sessions(id, company_id, position_id, answers jsonb, status)

employees(id, company_id, code, full_name, work_email, position_id, department_id,
          manager_employee_id, user_id null, employment_type ['FT','PT'],
          start_date, status ['active','inactive'])
employee_transfers(id, company_id, employee_id, effective_date, from_dept, to_dept,
                   from_position, to_position, from_manager, to_manager)
employee_visibility(company_id, viewer_user_id, employee_id)

tasks(id, company_id, assigned_by, assigned_to, title, description, due_at,
      priority ['low','normal','high','urgent'],
      status ['assigned','accepted','in_progress','done','overdue'],
      accepted_at, started_at, completed_at, created_at)
      -- assigned_by → auth.users; assigned_to → employees(company_id, id)
task_events(id, company_id, task_id, actor_user_id null, from_status, to_status,
            source ['app','email','system'], created_at)
task_email_messages(id, company_id, task_id, direction ['out','in'],
                    kind ['assignment','reminder','overdue','reply'],
                    from_user_id, to_email, message_id, token_hash,
                    status ['queued','sent','failed','processed','ignored'],
                    attempts, error, created_at, processed_at)

user_mail_accounts(id, user_id, company_id, email, smtp_host, smtp_port, imap_host, imap_port,
                   username, secret_vault_id, status ['unverified','active','error','disabled'],
                   last_error, updated_by, updated_at)
                   -- unique (user_id, company_id)

documents(id, company_id, uploaded_by, type, storage_path, file_name, status, created_at)
document_analyses(id, company_id, document_id, provider, model, requested_by, result jsonb, created_at)

timesheet_entries(id, company_id, employee_id, work_date, time_in, time_out,
                  hours_worked, tasks text, comments text, source_document_id)
kpi_scores(id, company_id, employee_id, work_date, tur, tai_rule, tai_ai, pes,
           tasks_due, tasks_done_on_time, tasks_done_late, tasks_overdue, tcr)
kpi_settings(company_id, tur_weight, tai_weight, tcr_weight default 0, thresholds jsonb)
audit_flags(id, company_id, employee_id, work_date, flag_type, severity,
            metrics, justification_en, justification_ar)

training_catalog(id, company_id, name_en, name_ar, track, priority, provider)
training_assignments(id, company_id, employee_id, course_id, status, is_custom, removed)

user_ai_keys(id, user_id, company_id, provider ['anthropic','google','openai','deepseek'],
             model, key_vault_id, last4, created_at)
             -- unique (user_id, company_id)
ai_prompt_templates(id, task, version, template, active)
ai_usage_log(id, company_id, user_id, provider, model, task, tokens_in, tokens_out, cost, ms)

activity_log(id, company_id, user_id, action, entity, entity_id, diff jsonb, created_at)
```

`ai_settings` (company-level provider/key) is **removed**.

### Key RLS helpers

```sql
is_member(company uuid) returns bool
company_role(company uuid) returns app_role      -- named current_role in early drafts; current_role is reserved in SQL
has_permission(company uuid, perm text) returns bool
can_view_employee(emp uuid) returns bool          -- self, manager subtree, hr, ceo, owner
my_employee_id(company uuid) returns uuid         -- the caller's employee record in that company, if any
```

Example policies:

```sql
create policy "view employees"
on employees for select
using ( is_member(company_id) and can_view_employee(id) );

-- tasks: assignee, creator, or tasks.read within visibility
create policy "view tasks" on tasks for select using (
  is_member(company_id) and (
    assigned_to = my_employee_id(company_id)
    or assigned_by = auth.uid()
    or (has_permission(company_id, 'tasks.read') and can_view_employee(assigned_to))
  )
);

-- only managers (tasks.create) and only for employees they can view
create policy "create tasks" on tasks for insert with check (
  has_permission(company_id, 'tasks.create')
  and assigned_by = auth.uid()
  and can_view_employee(assigned_to)
  and assigned_to is distinct from my_employee_id(company_id)
  and status = 'assigned'
);
-- status changes only through set_task_status(); clients get no UPDATE on status.
-- task_events and task_email_messages: insert by triggers / service role only;
-- select follows the parent task's visibility.

-- personal AI keys: the owner sees their own row; key_vault_id is never selectable
create policy "own ai key" on user_ai_keys for select
using ( user_id = auth.uid() and is_member(company_id) );
-- revoke select (key_vault_id) from authenticated; writes only via the AI gateway.
-- admins read status through list_ai_key_status(company) (users.manage): provider, model, last4, created_at.

-- mailboxes: admins manage, users read their own (never secret_vault_id)
create policy "manage mail accounts" on user_mail_accounts for all
using ( has_permission(company_id, 'mail.manage') )
with check ( has_permission(company_id, 'mail.manage') );
create policy "read own mail account" on user_mail_accounts for select
using ( user_id = auth.uid() and is_member(company_id) );
-- revoke select (secret_vault_id) from authenticated; password changes go through the mail Worker.
```

Vault access: `vault.decrypted_secrets` is never exposed to `authenticated`. Two `SECURITY DEFINER` functions, executable only by `service_role`, return a single decrypted secret: `get_user_ai_key(user_id, company_id)` for the AI gateway and `get_mail_secret(account_id)` for the mail Worker.

---

## 10. Pages / Routes

```
/                       marketing landing (EN/AR)
/auth/*                 sign in, sign up, invite accept, reset
/onboarding/*           wizard steps
/app/dashboard          executive dashboard (KPIs, dept charts, leaderboard, my tasks)
/app/tasks              task list and board: mine, assigned by me, team (tasks.read); create (tasks.create)
/app/timesheets         upload, preview, conflict resolution, records table
/app/documents          all uploads + AI review results
/app/org                departments, positions, org chart, employees
/app/job-analysis/:id   view, edit, approve, version history, questionnaire
/app/training           TNA matrix, per-employee gaps, AI recommendations
/app/audit              audit flags ledger with justifications
/app/reports            exports (xlsx, pdf)
/app/profile            own profile, own AI key status, read-only own mail settings
/app/settings/company   profile, logo, working hours, holidays
/app/settings/ai-key    own personal AI key (every user, own key only)
/app/settings/mail      mailbox accounts for members (mail.manage)
/app/settings/users     members, roles, permission overrides, AI key status (last4 only)
/app/settings/kpi       weights, thresholds
/admin/*                platform_admin only
```

`/app/settings/ai` (company AI settings) is **removed**.

Every route is wrapped in a permission guard. Lists are filtered by RLS automatically, so a manager opening `/app/dashboard` or `/app/tasks` sees only their subtree. AI buttons anywhere in the app are disabled when the current user has no key.

---

## 11. Security Checklist

- RLS on all tables, tested with pgTAP per role.
- No service key and no provider API key in the client bundle (CI check greps for both).
- No provider API key in any environment variable or Worker/Edge Function secret (CI check on workflow files and `wrangler.toml`).
- Personal AI keys: Vault only, decrypted only in the AI gateway Worker, never returned, never logged, never usable by another user; `key_vault_id` not selectable by clients; pgTAP tests prove admins cannot read another user's key row or secret.
- Mailbox credentials: Vault only, decrypted only in the mail Worker, never returned or logged; only `mail.manage` can create, edit or delete accounts.
- Email replies: token + sender address + age + dedupe checks before any status change; replies follow the same transition rules as the app; bodies are not stored.
- Task status changes only through `set_task_status()` or the mail Worker, always with a `task_events` row.
- Signed URLs (short expiry) for file downloads.
- File type and size validation (default 20 MB) server-side.
- Prompt-injection hardening: uploaded document text is wrapped as data, never as instructions; AI output is schema-validated before writing.
- Activity log for all writes to employees, roles, permissions, tasks, mail accounts and AI key changes (the change, never the key).
- Data export and full tenant deletion on request (including Vault secrets).
- Personal data handled in line with Egypt's Personal Data Protection Law No. 151 of 2020.

---

## 12. Conventions

- TypeScript strict mode. No `any` in shared packages.
- Database changes only through numbered migrations in `supabase/migrations`.
- Generate types with `supabase gen types typescript` after each migration.
- Components small and feature-scoped. Port prototype logic into pure functions with unit tests (Vitest) before wiring UI.
- All user-facing strings through i18n. Arabic strings without diacritics.
- Dates stored as ISO `date`/`timestamptz`; displayed in company timezone (default Africa/Cairo).
- Conventional commits; PRs must pass lint, typecheck, tests, RLS tests.

---

## 13. Environment Variables

```
# web (public)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_APP_URL=https://figure.aseautomation.online
VITE_AI_GATEWAY_URL=https://figure.aseautomation.online/api/ai

# workers/ai-gateway and workers/mail (secret)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
MAIL_TOKEN_SECRET=          # mail worker only: HMAC key for task reference tokens
APP_URL=https://figure.aseautomation.online
APP_ORIGINS=https://figure.aseautomation.online

# Edge Functions (secret, provided by Supabase)
SUPABASE_SERVICE_ROLE_KEY=
APP_URL=
```

There are **no** `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY` or `OPENAI_API_KEY` variables. Provider keys exist only as personal keys in Vault.

---

## 14. Delivery Roadmap

| Phase | Scope | Status |
|---|---|---|
| **0. Foundation** | Repo, CI, Supabase project, auth, companies, members, roles, RLS helpers, Cloudflare Pages deploy | Done |
| **1. Personal AI Keys** | `workers/ai-gateway` skeleton (JWT, membership, permission checks), `user_ai_keys` + Vault, `/api/ai/key`, `/app/settings/ai-key`, admin key status, AI buttons gated on key, Anthropic adapter first, `ai_usage_log` per user, removal of platform keys | Next |
| **2. Org + Onboarding** | Wizard, logo, departments, positions, employees, reporting lines, visibility table, invites | Done |
| **3. Task Workflow + Email** | `tasks`, `task_events`, `set_task_status`, overdue `pg_cron` job, `/app/tasks`, `user_mail_accounts` + Vault, `/app/settings/mail`, `workers/mail` (SMTP outbox, IMAP reply polling, reference tokens), TCR into `kpi_scores` | Planned |
| **4. Job Analysis** | Upload extraction + AI questionnaire, approval, keyword map generation | Done (moves to personal keys in phase 1) |
| **5. Timesheets + KPI** | Port parsing engine, ingestion, TUR/TAI/PES/TCR, dashboard, leaderboard, audit flags | Planned |
| **6. AI Gateway (multi-provider)** | Gemini, OpenAI and DeepSeek adapters, model lists, per-user rate limits, AI-enhanced TAI | Planned |
| **7. Training** | Catalog, auto-assignment from job analysis, gaps, recommendations, TRI | Planned |
| **8. Documents** | General document review, reports, exports | Planned |
| **9. SaaS** | Plans, billing, platform admin, support sessions (no AI credits) | Planned |

---

## 15. Open Decisions

1. Billing provider (Paymob / Stripe / Paddle) for Egypt and MENA.
2. ~~Platform credits vs bring-your-own-key only at launch.~~ **Decided:** personal bring-your-own-key only; no platform keys or credits.
3. ~~Workers vs Supabase Edge Functions as the single backend runtime.~~ **Decided:** AI gateway and mail run as Cloudflare Workers; Supabase Edge Functions remain for invites and other service-role jobs.
4. Whether employees log in at launch or only HR/managers. Email replies (Accept/Done) let employees act on tasks without logging in.
5. Pricing tiers and employee-count limits.
6. **Mailbox authentication.** Microsoft 365 / Exchange Online has retired basic authentication for IMAP and is retiring it for SMTP AUTH, and Google Workspace increasingly requires OAuth. Username + app password covers many hosted mailboxes, but M365 and Gmail customers will likely need OAuth 2.0 (XOAUTH2) connections. Decide before phase 3 ships.
7. Reminder timing (fixed 24 hours vs per-company setting) and whether reminders also go to the creator.

---

## 16. Implementation Notes (decisions recorded while building)

- `current_role(company)` is implemented as `company_role(company)` because `current_role` is a reserved SQL keyword.
- Excel import uses `read-excel-file` / `write-excel-file` (`.xlsx` only). SheetJS on npm is stuck at 0.18.5 with known vulnerabilities and its official CDN was unreachable from the build sandbox; revisit for `.xls` timesheets in phase 5. DOCX text extraction uses `fflate` (mammoth fails in Deno/Workers runtimes).
- Prompts are versioned in code (`PROMPT_VERSION`, recorded on each analysis and usage row) rather than in `ai_prompt_templates`; the table remains the target if prompts need runtime editing.
- The job-analysis schema lives in `packages/shared/src/job-analysis.ts` and is synced into server code by `pnpm sync:functions`; CI fails on drift.
- **Gap to close in phase 1:** the job-analysis AI currently runs in a Supabase Edge Function (`supabase/functions/ai`) with a platform `ANTHROPIC_API_KEY`. Under this spec that function moves to `workers/ai-gateway`, the platform key and its deploy step are removed, and calls use the caller's personal key.
