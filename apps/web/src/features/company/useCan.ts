import { hasAll, type Permission } from '@figure/shared';
import { useCompany } from './CompanyProvider';

/** UI-only permission check (RLS enforces the real rule). */
export function useCan() {
  const { permissions } = useCompany();
  return (permission: Permission | readonly Permission[]) => hasAll(permissions, permission);
}
