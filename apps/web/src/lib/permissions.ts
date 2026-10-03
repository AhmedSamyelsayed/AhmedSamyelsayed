// UI-only permission helpers. Hiding a button is not security: every read and
// write is enforced by has_permission() in Postgres RLS.
export { hasAll, type Permission, type Role } from '@figure/shared';
