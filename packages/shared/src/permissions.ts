/**
 * Roles and permissions. Mirrors the seed data in
 * supabase/migrations/20261003000001_tenancy_core.sql; permissions.test.ts
 * fails if the two drift apart.
 *
 * The client uses these only to hide UI. Enforcement is has_permission() in RLS.
 */

export const ROLES = [
  'company_owner',
  'ceo',
  'hr_admin',
  'hr_staff',
  'manager',
  'employee',
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'employees.read',
  'employees.write',
  'org.manage',
  'job_analysis.read',
  'job_analysis.write',
  'documents.upload',
  'documents.read',
  'timesheets.upload',
  'timesheets.read',
  'kpi.read',
  'kpi.configure',
  'training.read',
  'training.write',
  'audit.read',
  'users.manage',
  'ai.configure',
  'billing.manage',
  'export.data',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CEO: readonly Permission[] = [
  'employees.read',
  'job_analysis.read',
  'documents.read',
  'timesheets.read',
  'kpi.read',
  'training.read',
  'audit.read',
  'export.data',
];

const HR_STAFF: readonly Permission[] = [
  'employees.read',
  'job_analysis.read',
  'documents.upload',
  'documents.read',
  'timesheets.upload',
  'timesheets.read',
  'kpi.read',
  'training.read',
  'audit.read',
];

const MANAGER: readonly Permission[] = [
  'employees.read',
  'job_analysis.read',
  'documents.read',
  'timesheets.read',
  'kpi.read',
  'training.read',
  'audit.read',
];

const EMPLOYEE: readonly Permission[] = [
  'employees.read',
  'timesheets.upload',
  'timesheets.read',
  'kpi.read',
  'training.read',
];

export const ROLE_DEFAULT_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  company_owner: PERMISSIONS,
  ceo: CEO,
  hr_admin: PERMISSIONS.filter((p) => p !== 'billing.manage' && p !== 'ai.configure'),
  hr_staff: HR_STAFF,
  manager: MANAGER,
  employee: EMPLOYEE,
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

/** UI helper: true when every required permission is in the granted set. */
export function hasAll(
  granted: ReadonlySet<string> | readonly string[],
  required: Permission | readonly Permission[],
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  const list = typeof required === 'string' ? [required] : required;
  return list.every((p) => set.has(p));
}
