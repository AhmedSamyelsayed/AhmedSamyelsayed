import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, ROLE_DEFAULT_PERMISSIONS, hasAll, isRole } from './permissions';

const migration = readFileSync(
  fileURLToPath(
    new URL('../../../supabase/migrations/20261003000001_tenancy_core.sql', import.meta.url),
  ),
  'utf8',
);

describe('permissions mirror the database seed', () => {
  it('has the same permission catalog', () => {
    const block = migration.split('insert into public.permissions')[1]?.split(';')[0] ?? '';
    const keys = [...block.matchAll(/\('([a-z_]+\.[a-z_]+)',/g)].map((m) => m[1]);
    expect(keys).toEqual([...PERMISSIONS]);
  });

  it('has the same explicit role grants', () => {
    const pairs = [...migration.matchAll(/\('([a-z_]+)', '([a-z_]+\.[a-z_]+)'\)/g)].map(
      ([, role, perm]) => `${role}:${perm}`,
    );
    const explicitRoles = ['ceo', 'hr_staff', 'manager', 'employee'] as const;
    const expected = explicitRoles.flatMap((r) =>
      ROLE_DEFAULT_PERMISSIONS[r].map((p) => `${r}:${p}`),
    );
    expect(pairs.sort()).toEqual(expected.sort());
  });

  it('gives owners everything and hr_admin everything but billing and AI', () => {
    expect(migration).toMatch(/select 'company_owner', key from public\.permissions;/);
    expect(migration).toMatch(
      /select 'hr_admin', key from public\.permissions\s+where key not in \('billing\.manage', 'ai\.configure'\);/,
    );
    expect(ROLE_DEFAULT_PERMISSIONS.company_owner).toEqual(PERMISSIONS);
    expect(ROLE_DEFAULT_PERMISSIONS.hr_admin).not.toContain('billing.manage');
    expect(ROLE_DEFAULT_PERMISSIONS.hr_admin).not.toContain('ai.configure');
    expect(ROLE_DEFAULT_PERMISSIONS.hr_admin).toHaveLength(PERMISSIONS.length - 2);
  });

  it('matches the app_role enum', () => {
    const enumBlock = migration.split('create type public.app_role as enum (')[1]?.split(');')[0];
    const values = [...(enumBlock ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(values).toEqual([...ROLES]);
  });
});

describe('helpers', () => {
  it('hasAll checks every required permission', () => {
    expect(hasAll(['kpi.read', 'audit.read'], 'kpi.read')).toBe(true);
    expect(hasAll(new Set(['kpi.read']), ['kpi.read', 'audit.read'])).toBe(false);
  });

  it('isRole narrows strings', () => {
    expect(isRole('ceo')).toBe(true);
    expect(isRole('platform_admin')).toBe(false);
  });
});
