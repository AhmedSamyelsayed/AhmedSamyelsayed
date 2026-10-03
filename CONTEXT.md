# CONTEXT.md — Figure (figure.aseautomation.online)

> Project context file for AI coding assistants (Claude Code, Cursor, Gemini CLI, etc.).
> Read this file fully before writing any code. It is the single source of truth for scope, architecture, data model, security rules and conventions.

---

## 1. Product Summary

**Figure** is a multi-tenant SaaS platform for **AI-powered KPI and workforce productivity analysis**, built under the **ASE Automation** brand.

Companies sign up, define their organization (logo, departments, positions, reporting lines), and the platform uses a pluggable AI model (Claude, Gemini, DeepSeek, ChatGPT) to:

1. Analyze jobs (from an uploaded Job Analysis or from a JD plus a guided questionnaire).
2. Generate role-specific KPI frameworks and task keyword maps.
3. Review uploaded documents (timesheets, reports, JDs) and score productivity against the job analysis.
4. Detect training gaps and produce audit justifications.

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
| File parsing | SheetJS (xlsx), pdf.js, mammoth (docx) | Client-side preview, server-side re-parse for trust |
| i18n | i18next | `en` and `ar` namespaces, no tashkeel in Arabic strings |
| Hosting | Cloudflare Pages | Custom domain `figure.aseautomation.online` |
| Edge API | Cloudflare Workers (or Supabase Edge Functions) | AI proxy, document processing, webhooks |
| Database | Supabase Postgres | Row Level Security on every tenant table |
| Auth | Supabase Auth | Email/password, magic link, Google OAuth; invite flow for company users |
| Storage | Supabase Storage | Logos, JDs, job analyses, timesheets, reports |
| Secrets | Supabase Vault (pgsodium) | Encrypted per-tenant AI API keys |
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
│       │   │   ├── job-analysis/   # upload or AI questionnaire
│       │   │   ├── documents/      # uploads + AI review
│       │   │   ├── timesheets/     # Schema A/B ingestion (from prototype)
│       │   │   ├── kpi/            # TUR, TAI, PES, dashboards
│       │   │   ├── training/       # TNA, gaps, recommendations
│       │   │   ├── audit/          # audit flags + justifications
│       │   │   ├── ai-settings/    # provider + model + key per tenant
│       │   │   └── admin/          # users, roles, permissions, audit log
│       │   ├── lib/
│       │   │   ├── supabase.ts
│       │   │   ├── permissions.ts  # client-side permission helpers (UI only)
│       │   │   ├── parsing/        # ported parseSchemaA, parseSchemaBRows, detectSchema
│       │   │   └── metrics/        # ported calcTUR, calcTAI, calcPES
│       │   └── i18n/
├── workers/
│   └── ai-gateway/             # Cloudflare Worker: provider-agnostic AI proxy
├── supabase/
│   ├── migrations/             # numbered SQL migrations (source of truth for schema)
│   ├── functions/              # Edge Functions (document processing, invites)
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
7. Tenant AI API keys are stored encrypted in Vault, decrypted only server-side, and never returned to the client (show last 4 chars only).
8. Individual users (no company) are modeled as a **personal company** with one member, so the same isolation rules apply.
9. AI providers must be called with data-retention-off / zero-training settings where the provider offers it.

---

## 5. Roles and Authorization

### 5.1 Roles

| Role | Scope | Description |
|---|---|---|
| `platform_admin` | All tenants (metadata only) | ASE Automation staff. Manages plans, billing, support. **Cannot read tenant employee data** unless granted a time-limited support session by the company owner. |
| `company_owner` | Whole company | The account that signed up. Billing, AI settings, can assign any role. |
| `ceo` | Whole company, read-everything | Sees all employees, all departments, all analyses, full audit log. Read-mostly. |
| `hr_admin` (super user) | Whole company, full write | HR staff. Manage org structure, employees, job analyses, uploads, training, users and permissions. |
| `hr_staff` | Whole company or assigned departments | Operational HR. Upload timesheets, view analyses, cannot change roles or AI settings. |
| `manager` | Own subtree | Sees only employees who report to them **directly or indirectly**, per the reporting lines in the job analysis. |
| `employee` | Self | Sees own timesheets, own KPI scores, own training plan. Can submit own timesheets. |

### 5.2 Visibility Rule (core logic)

Visibility for managers is derived from the **reporting hierarchy defined in the job analysis**:

- Each `position` has `reports_to_position_id`.
- Each `employee` holds a `position_id` and optionally a direct `manager_employee_id` override.
- A manager can see an employee if that employee is anywhere below them in the tree.
- Implemented as a Postgres function `can_view_employee(target_employee_id uuid)` using a recursive CTE, cached in a materialized table `employee_visibility(viewer_user_id, employee_id)` refreshed on org changes.

### 5.3 Granular Permissions

Roles map to default permission sets; `hr_admin` and `company_owner` can override per user.

```
employees.read | employees.write
org.manage
job_analysis.read | job_analysis.write
documents.upload | documents.read
timesheets.upload | timesheets.read
kpi.read | kpi.configure
training.read | training.write
audit.read
users.manage
ai.configure
billing.manage
export.data
```

Stored in `role_permissions` (defaults) and `user_permission_overrides` (grant/revoke). The DB function `has_permission(perm text)` is used inside RLS policies. The client mirrors this only to hide UI, never to enforce.

---

## 6. Core User Flows

### 6.1 Company Sign-up and Onboarding Wizard

1. Sign up (email or Google) → create `companies` row → user becomes `company_owner`.
2. **Company profile**: name (EN/AR), logo upload, industry, country, working week (default Sunday to Thursday, Friday/Saturday weekend), FT/PT daily hours, public holidays.
3. **AI configuration**: choose provider (Claude / Gemini / DeepSeek / OpenAI), model, and either bring-your-own key or use platform credits (per plan).
4. **Organization structure**: departments, then positions with reporting lines. Can import from Excel.
5. **Job analysis**, per position, one of two paths:
   - **Path A, upload**: upload an existing Job Analysis (docx/pdf/xlsx). AI extracts purpose, duties, responsibilities, KPIs, qualifications, reporting line, and core/ancillary task keywords. HR reviews and approves.
   - **Path B, guided**: upload a JD (or none). AI asks a **standard job analysis questionnaire** (see 6.2), the position holder or manager answers, AI produces the structured job analysis. HR approves.
6. **Employees**: add manually or import (code, name, position, department, manager, FT/PT, start date). Send invites with roles.
7. Done → dashboard.

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

Output is saved as a versioned `job_analyses` record and generates the position's **task keyword map** (replaces the hardcoded `JD_MAP`) and **KPI set**.

### 6.3 Document Upload and AI Review

- Supported: xlsx, xls, csv, pdf, docx, images (OCR via the AI model's vision capability).
- Flow: upload → stored at `{company_id}/documents/...` → `documents` row with status `pending` → Worker extracts text → AI analyzes against the relevant job analysis → results saved to `document_analyses` → status `done`.
- Document types: `timesheet`, `job_analysis`, `jd`, `report`, `other`.
- Large jobs run asynchronously; UI subscribes via Supabase Realtime.

### 6.4 Timesheet Ingestion (ported from prototype)

Keep the prototype's proven logic, moved to `packages/shared`:

- `detectSchema(rows)` → `A` (individual daily template) or `B` (master grid).
- `parseSchemaA` / `parseSchemaBRows` unchanged in behavior.
- `findEmpByName` fuzzy matching, plus manual mapping in the preview modal.
- Rules retained: pre-start-date entries rejected and logged as violations; duplicate (employee + date) triggers Skip / Overwrite conflict resolution.
- Re-parse server-side before persisting. Client parsing is for preview only.

---

## 7. KPI Engine

Formulas from the prototype become the **default** model; each company can tune weights in `kpi_settings`.

| Metric | Default formula |
|---|---|
| **TUR** Time Utilization Rate | `min(100, hours_worked / expected_hours × 100)`, expected from FT/PT setting |
| **TAI** Task Alignment Index | Keyword match vs position core/ancillary keywords. Core ≥40% → 80–100, core ≥20% → 65–79, ancillary only → 70, none → 45 |
| **PES** Productivity Efficiency Score | `TUR × 0.40 + TAI × 0.60` |
| **TRI** Training Reflection Index | `(post_PES − pre_PES) / pre_PES × 100` |

**AI-enhanced TAI (v2):** in addition to keyword matching, the AI model classifies each task line as core / ancillary / out-of-scope against the full job analysis text and returns a rationale. Store both scores; show the AI score with the rule-based score as fallback.

Score colors: ≥85 green, ≥70 blue, ≥55 amber, else red.

Audit flags (per entry): `under_hours` (medium), `low_task_alignment` TAI<70 (high), `pre_start_date` (critical). Each flag stores an auto-generated justification text in EN and AR.

Transfers: `employee_transfers` history is honored so past entries are scored against the department and role held on that date (prototype behavior).

---

## 8. AI Gateway (provider-agnostic)

A Cloudflare Worker at `/api/ai/*` exposes one internal interface:

```ts
interface AIRequest {
  companyId: string;
  task: 'extract_job_analysis' | 'ja_questionnaire_next' | 'classify_tasks'
      | 'review_document' | 'training_recommendations' | 'audit_justification';
  input: Record<string, unknown>;
  locale: 'en' | 'ar';
}
```

- Adapters: `anthropic.ts`, `gemini.ts`, `deepseek.ts`, `openai.ts`, all returning the same normalized JSON.
- Prompts are versioned templates in `ai_prompt_templates`; responses are validated with zod. Invalid JSON → one retry → fail gracefully.
- Every call logged to `ai_usage_log` (company, user, provider, model, task, tokens, cost estimate, latency). No raw document text in logs.
- Rate limits and monthly token quotas per plan.
- Verify JWT and company membership before every call.

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
job_analyses(id, company_id, position_id, version, source ['upload','questionnaire'],
             content jsonb, core_keywords text[], ancillary_keywords text[],
             status ['draft','approved'], approved_by, created_at)
ja_question_templates(id, company_id null=global, order, text_en, text_ar)
ja_sessions(id, company_id, position_id, answers jsonb, status)

employees(id, company_id, code, full_name, position_id, department_id,
          manager_employee_id, user_id null, employment_type ['FT','PT'],
          start_date, status ['active','inactive'])
employee_transfers(id, company_id, employee_id, effective_date, from_dept, to_dept,
                   from_position, to_position, from_manager, to_manager)
employee_visibility(company_id, viewer_user_id, employee_id)

documents(id, company_id, uploaded_by, type, storage_path, file_name, status, created_at)
document_analyses(id, company_id, document_id, provider, model, result jsonb, created_at)

timesheet_entries(id, company_id, employee_id, work_date, time_in, time_out,
                  hours_worked, tasks text, comments text, source_document_id)
kpi_scores(id, company_id, employee_id, work_date, tur, tai_rule, tai_ai, pes)
kpi_settings(company_id, tur_weight, tai_weight, thresholds jsonb)
audit_flags(id, company_id, employee_id, work_date, flag_type, severity,
            metrics, justification_en, justification_ar)

training_catalog(id, company_id, name_en, name_ar, track, priority, provider)
training_assignments(id, company_id, employee_id, course_id, status, is_custom, removed)

ai_settings(company_id, provider, model, key_vault_id, use_platform_credits)
ai_prompt_templates(id, task, version, template, active)
ai_usage_log(id, company_id, user_id, provider, model, task, tokens_in, tokens_out, cost, ms)

activity_log(id, company_id, user_id, action, entity, entity_id, diff jsonb, created_at)
```

### Key RLS helpers

```sql
is_member(company uuid) returns bool
current_role(company uuid) returns text
has_permission(company uuid, perm text) returns bool
can_view_employee(emp uuid) returns bool   -- self, manager subtree, hr, ceo, owner
```

Example policy:

```sql
create policy "view employees"
on employees for select
using ( is_member(company_id) and can_view_employee(id) );
```

---

## 10. Pages / Routes

```
/                       marketing landing (EN/AR)
/auth/*                 sign in, sign up, invite accept, reset
/onboarding/*           wizard steps
/app/dashboard          executive dashboard (KPIs, dept charts, leaderboard)
/app/timesheets         upload, preview, conflict resolution, records table
/app/documents          all uploads + AI review results
/app/org                departments, positions, org chart, employees
/app/job-analysis/:id   view, edit, approve, version history, questionnaire
/app/training           TNA matrix, per-employee gaps, AI recommendations
/app/audit              audit flags ledger with justifications
/app/reports            exports (xlsx, pdf)
/app/settings/company   profile, logo, working hours, holidays
/app/settings/ai        provider, model, key
/app/settings/users     members, roles, permission overrides
/app/settings/kpi       weights, thresholds
/admin/*                platform_admin only
```

Every route is wrapped in a permission guard. Lists are filtered by RLS automatically, so a manager opening `/app/dashboard` sees only their subtree.

---

## 11. Security Checklist

- RLS on all tables, tested with pgTAP per role.
- No service key in client bundle (CI check greps for it).
- Signed URLs (short expiry) for file downloads.
- File type and size validation (default 20 MB) server-side.
- Prompt-injection hardening: uploaded document text is wrapped as data, never as instructions; AI output is schema-validated before writing.
- Activity log for all writes to employees, roles, permissions, AI settings.
- Data export and full tenant deletion on request.
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

# workers / edge (secret)
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=        # platform credits
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
OPENAI_API_KEY=
```

---

## 14. Delivery Roadmap

| Phase | Scope |
|---|---|
| **0. Foundation** | Repo, CI, Supabase project, auth, companies, members, roles, RLS helpers, Cloudflare Pages deploy |
| **1. Org + Onboarding** | Wizard, logo, departments, positions, employees, reporting lines, visibility table, invites |
| **2. Job Analysis** | Upload extraction + AI questionnaire, approval, keyword map generation |
| **3. Timesheets + KPI** | Port parsing engine, ingestion, TUR/TAI/PES, dashboard, leaderboard, audit flags |
| **4. AI Gateway** | Multi-provider adapters, per-tenant keys, usage logging, AI-enhanced TAI |
| **5. Training** | Catalog, auto-assignment from job analysis, gaps, recommendations, TRI |
| **6. Documents** | General document review, reports, exports |
| **7. SaaS** | Plans, billing, quotas, platform admin, support sessions |

---

## 15. Open Decisions

1. Billing provider (Paymob / Stripe / Paddle) for Egypt and MENA.
2. Platform credits vs bring-your-own-key only at launch.
3. Workers vs Supabase Edge Functions as the single backend runtime.
4. Whether employees log in at launch or only HR/managers.
5. Pricing tiers and employee-count limits.
