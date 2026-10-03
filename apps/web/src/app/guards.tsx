import type { Permission } from '@figure/shared';
import { hasAll } from '@figure/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageMessage } from '@/components/FullPageMessage';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCompany } from '@/features/company/CompanyProvider';

function Loading() {
  const { t } = useTranslation();
  return <FullPageMessage>{t('common.loading')}</FullPageMessage>;
}

/** Signed-in users only; others go to sign-in and come back afterwards. */
export function RequireAuth() {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) {
    return <Navigate to="/auth/sign-in" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Signed-out users only (auth pages). */
export function RequireGuest() {
  const { loading, user } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/app/dashboard" replace />;
  return <Outlet />;
}

/** Users with at least one active company; others go to onboarding. */
export function RequireCompany() {
  const { loading, active } = useCompany();
  if (loading) return <Loading />;
  if (!active) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/**
 * Hides UI the user lacks permission for. This is a UX convenience only:
 * the data behind it is protected by RLS whether or not this renders.
 */
export function RequirePermission({
  permission,
  children,
  fallback,
}: {
  permission: Permission | readonly Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { t } = useTranslation();
  const { permissions } = useCompany();
  if (hasAll(permissions, permission)) return <>{children}</>;
  return <>{fallback ?? <FullPageMessage>{t('errors.forbidden')}</FullPageMessage>}</>;
}
