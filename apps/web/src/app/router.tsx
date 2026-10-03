import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { FullPageMessage } from '@/components/FullPageMessage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { SignInPage } from '@/features/auth/SignInPage';
import { SignUpPage } from '@/features/auth/SignUpPage';
import { UpdatePasswordPage } from '@/features/auth/UpdatePasswordPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { InvitationsPage } from '@/features/invitations/InvitationsPage';
import { CreateCompanyPage } from '@/features/onboarding/CreateCompanyPage';
import { AppLayout } from './AppLayout';
import { RequireAuth, RequireCompany, RequireGuest, RequirePermission } from './guards';
import { LandingPage } from './LandingPage';
import { NotFoundPage } from './NotFoundPage';

// Heavier screens load on demand to keep the first page fast.
const OrgPage = lazy(() => import('@/features/org/OrgPage').then((m) => ({ default: m.OrgPage })));
const MembersPage = lazy(() =>
  import('@/features/members/MembersPage').then((m) => ({ default: m.MembersPage })),
);
const CompanySettingsPage = lazy(() =>
  import('@/features/settings/CompanySettingsPage').then((m) => ({
    default: m.CompanySettingsPage,
  })),
);
const WizardPage = lazy(() =>
  import('@/features/onboarding/WizardPage').then((m) => ({ default: m.WizardPage })),
);

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<FullPageMessage>…</FullPageMessage>}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  {
    element: <RequireGuest />,
    children: [
      { path: '/auth/sign-in', element: <SignInPage /> },
      { path: '/auth/sign-up', element: <SignUpPage /> },
      { path: '/auth/reset', element: <ResetPasswordPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/auth/update-password', element: <UpdatePasswordPage /> },
      { path: '/invitations', element: <InvitationsPage /> },
      { path: '/onboarding', element: <CreateCompanyPage /> },
      {
        element: <RequireCompany />,
        children: [
          {
            path: '/onboarding/setup/:step',
            element: (
              <Lazy>
                <WizardPage />
              </Lazy>
            ),
          },
          {
            path: '/app',
            element: <AppLayout />,
            children: [
              { index: true, element: <Navigate to="/app/dashboard" replace /> },
              { path: 'dashboard', element: <DashboardPage /> },
              {
                path: 'org',
                element: (
                  <RequirePermission permission="employees.read">
                    <Lazy>
                      <OrgPage />
                    </Lazy>
                  </RequirePermission>
                ),
              },
              {
                path: 'settings/company',
                element: (
                  <RequirePermission permission="org.manage">
                    <Lazy>
                      <CompanySettingsPage />
                    </Lazy>
                  </RequirePermission>
                ),
              },
              {
                path: 'settings/users',
                element: (
                  <RequirePermission permission="users.manage">
                    <Lazy>
                      <MembersPage />
                    </Lazy>
                  </RequirePermission>
                ),
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
