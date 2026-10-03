import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { SignInPage } from '@/features/auth/SignInPage';
import { SignUpPage } from '@/features/auth/SignUpPage';
import { UpdatePasswordPage } from '@/features/auth/UpdatePasswordPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { CreateCompanyPage } from '@/features/onboarding/CreateCompanyPage';
import { AppLayout } from './AppLayout';
import { RequireAuth, RequireCompany, RequireGuest } from './guards';
import { LandingPage } from './LandingPage';
import { NotFoundPage } from './NotFoundPage';

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
      { path: '/onboarding', element: <CreateCompanyPage /> },
      {
        element: <RequireCompany />,
        children: [
          {
            path: '/app',
            element: <AppLayout />,
            children: [
              { index: true, element: <Navigate to="/app/dashboard" replace /> },
              { path: 'dashboard', element: <DashboardPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
