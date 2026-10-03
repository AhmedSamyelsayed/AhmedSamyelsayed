import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { RequireCompany, RequirePermission } from './guards';

const companyState = vi.hoisted(() => ({
  loading: false,
  active: null as null | { role: string },
  permissions: new Set<string>(),
}));

vi.mock('@/features/company/CompanyProvider', () => ({
  useCompany: () => companyState,
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('RequirePermission', () => {
  beforeEach(() => {
    companyState.permissions = new Set();
  });

  it('renders children when the permission is granted', () => {
    companyState.permissions = new Set(['audit.read']);
    render(
      <RequirePermission permission="audit.read">
        <p>secret ledger</p>
      </RequirePermission>,
    );
    expect(screen.getByText('secret ledger')).toBeInTheDocument();
  });

  it('renders the fallback when a permission is missing', () => {
    companyState.permissions = new Set(['audit.read']);
    render(
      <RequirePermission permission={['audit.read', 'users.manage']} fallback={<p>nope</p>}>
        <p>secret ledger</p>
      </RequirePermission>,
    );
    expect(screen.queryByText('secret ledger')).not.toBeInTheDocument();
    expect(screen.getByText('nope')).toBeInTheDocument();
  });
});

describe('RequireCompany', () => {
  it('sends users without a company to onboarding', () => {
    companyState.active = null;
    render(
      <MemoryRouter initialEntries={['/app/dashboard']}>
        <Routes>
          <Route element={<RequireCompany />}>
            <Route path="/app/dashboard" element={<p>dashboard</p>} />
          </Route>
          <Route path="/onboarding" element={<p>onboarding</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('onboarding')).toBeInTheDocument();
  });

  it('lets members through', () => {
    companyState.active = { role: 'employee' };
    render(
      <MemoryRouter initialEntries={['/app/dashboard']}>
        <Routes>
          <Route element={<RequireCompany />}>
            <Route path="/app/dashboard" element={<p>dashboard</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });
});
