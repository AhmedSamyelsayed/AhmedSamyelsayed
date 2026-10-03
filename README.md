# Figure

AI-powered KPI and workforce productivity analysis, by ASE Automation.
Production: `figure.aseautomation.online`

**Read [CONTEXT.md](CONTEXT.md) first.** It is the source of truth for scope, architecture,
data model and security rules.

## Status

**Phase 0 (Foundation)** done: monorepo, CI, auth, tenancy, roles, RLS helpers, storage.

**Phase 1 (Org + Onboarding)** done:

| Area              | What exists                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Onboarding wizard | Profile + logo, working week + FT/PT hours + holidays, structure, employees, team invites; resumable |
| Org structure     | Departments, positions with `reports_to`, employees with optional manager override                   |
| Integrity         | Composite `(company_id, id)` foreign keys (no cross-tenant links), cycle prevention on both trees    |
| Visibility        | `can_view_employee()` + materialized `employee_visibility`, refreshed by triggers on org changes     |
| Excel import      | Template download, client preview with row-level errors, atomic server-side `import_org()`           |
| Invitations       | `create_invitation` / `accept_invitation` RPCs, `send-invite` Edge Function, invitations inbox       |
| Users & roles     | Member list, role and status changes, per-user permission overrides, pending invitations             |
| Tests             | 114 pgTAP tests across 4 files; Vitest for shared logic, guards, i18n and xlsx parsing               |

Manager visibility rule: an employee's manager is `manager_employee_id` when set, otherwise the
active holder(s) of the nearest ancestor position that has a holder (vacant positions are skipped).
A user with role `manager` sees everyone below their linked employee record, at any depth. Owner,
CEO, HR admin and HR staff see the whole company; everyone sees their own record.

## Layout

```
apps/web/            React 18 + Vite + Tailwind SPA (Cloudflare Pages)
packages/shared/     Roles, permissions, zod schemas, Excel import parsing/validation
supabase/migrations/ Schema, RLS, storage (the only way to change the DB)
supabase/functions/  Edge Functions (send-invite)
supabase/tests/      pgTAP tests per role (database/) + local Supabase stub (local/)
workers/ai-gateway/  Phase 4 placeholder
prototype/           Reference prototype (not deployed)
scripts/             Local DB test runner, client-bundle secret scan
```

## Local development

Requirements: Node 20.19+, pnpm 10, Docker + Supabase CLI.

```bash
pnpm install
supabase start                      # local Postgres, Auth, Storage on :54321
cp apps/web/.env.example apps/web/.env.local
# paste the anon key printed by `supabase start` into VITE_SUPABASE_ANON_KEY
pnpm dev                            # http://localhost:5173
```

Checks:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:secrets
supabase test db                    # pgTAP RLS tests against the local stack
pnpm db:test:local                  # same tests without Docker (plain Postgres + pgTAP)
```

After each migration, regenerate types:
`supabase gen types typescript --local > apps/web/src/lib/database.types.ts`

## Authorization model

- Roles: `company_owner`, `ceo`, `hr_admin`, `hr_staff`, `manager`, `employee`, plus
  `platform_admin` (ASE staff, a separate table, metadata-only access).
- `has_permission(company_id, perm)` resolves: owner gets everything, then a per-user override
  (grant or revoke) if one exists, then the role default.
- Non-owners can only delegate permissions they hold, never to themselves, and never to an owner.
  Only owners can create, change or remove owners. A company always keeps one active owner.
- Tenants can update only profile columns of `companies`. `plan` is not updatable from the client.
- All writes to companies, memberships and overrides are recorded in `activity_log`.
- The client calls `my_permissions()` only to hide UI. Postgres enforces everything.

Deviation from CONTEXT.md: the role helper is `company_role(company)` because `current_role`
is a reserved SQL keyword.

## Production setup checklist

1. **Supabase project** (region close to Egypt, e.g. `eu-central-1`). In Auth settings:
   site URL `https://figure.aseautomation.online`, redirect URLs
   `https://figure.aseautomation.online/**`, enable Google, configure SMTP.
2. **Cloudflare Pages** project named `figure`, custom domain `figure.aseautomation.online`.
3. **GitHub secrets** (environment `production`): `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
   The service role key is never a CI or frontend secret.
4. Edge Function secrets: `supabase secrets set APP_URL=https://figure.aseautomation.online
APP_ORIGINS=https://figure.aseautomation.online`. Add `https://figure.aseautomation.online/invitations`
   to the Auth redirect URLs.
5. Push to `main`: migrations apply, the `send-invite` function deploys, then the site deploys.
