# Figure

AI-powered KPI and workforce productivity analysis, by ASE Automation.
Production: `figure.aseautomation.online`

**Read [CONTEXT.md](CONTEXT.md) first.** It is the source of truth for scope, architecture,
data model and security rules.

## Status: Phase 0 (Foundation)

| Area               | State                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| Monorepo + tooling | pnpm workspaces, TypeScript strict, ESLint, Prettier, Vitest                           |
| Database           | companies, members, roles, permissions, overrides, platform admins, activity log       |
| RLS                | Enabled on every table; `is_member`, `company_role`, `has_permission` helpers          |
| Guards             | Owner-only owner changes, no self-escalation, last-owner protection, delegation limits |
| Storage            | Private `company-assets` and `documents` buckets, `{company_id}/` prefix policies      |
| Auth (web)         | Email/password, magic link, Google OAuth, password reset                               |
| Onboarding         | Step 1: create company (or personal workspace) via `create_company()` RPC              |
| i18n               | English and Arabic with RTL; tests enforce key parity and no tashkeel                  |
| CI                 | Format, lint, typecheck, unit tests, build, secret scan, pgTAP RLS tests               |
| Deploy             | GitHub Actions: `supabase db push`, then Cloudflare Pages                              |

## Layout

```
apps/web/            React 18 + Vite + Tailwind SPA (Cloudflare Pages)
packages/shared/     Roles, permissions, zod schemas shared by app and workers
supabase/migrations/ Schema, RLS, storage (the only way to change the DB)
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
4. Push to `main`: migrations apply, then the site deploys.
