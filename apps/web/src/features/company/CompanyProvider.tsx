import type { Role } from '@figure/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Database } from '@/lib/database.types';
import { ACTIVE_COMPANY_KEY } from '@/lib/storage-keys';
import { supabase } from '@/lib/supabase';

type Company = Pick<
  Database['public']['Tables']['companies']['Row'],
  'id' | 'name_en' | 'name_ar' | 'logo_path' | 'is_personal' | 'onboarding_step'
>;

export interface Membership {
  role: Role;
  company: Company;
}

interface CompanyState {
  loading: boolean;
  error: string | null;
  memberships: Membership[];
  active: Membership | null;
  /** UI hint only; RLS is the enforcement layer. */
  permissions: ReadonlySet<string>;
  selectCompany: (companyId: string) => void;
  refresh: () => Promise<void>;
}

interface Loaded {
  userId: string;
  memberships: Membership[];
  error: string | null;
}

const CompanyContext = createContext<CompanyState | null>(null);
const NO_PERMISSIONS: ReadonlySet<string> = new Set();

function readStoredCompany(): string | null {
  try {
    return localStorage.getItem(ACTIVE_COMPANY_KEY);
  } catch {
    return null;
  }
}

async function fetchMemberships(userId: string): Promise<Loaded> {
  // Selecting the caller's own rows; isolation itself is enforced by RLS.
  const { data, error } = await supabase
    .from('company_members')
    .select('role, companies(id, name_en, name_ar, logo_path, is_personal, onboarding_step)')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) return { userId, memberships: [], error: error.message };
  const memberships: Membership[] = (data ?? []).flatMap((row) =>
    row.companies ? [{ role: row.role, company: row.companies as Company }] : [],
  );
  return { userId, memberships, error: null };
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [activeId, setActiveId] = useState<string | null>(readStoredCompany);
  const [granted, setGranted] = useState<{ companyId: string; perms: ReadonlySet<string> } | null>(
    null,
  );

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchMemberships(userId).then((result) => {
      if (!cancelled) setLoaded(result);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refresh = useCallback(async () => {
    if (userId) setLoaded(await fetchMemberships(userId));
  }, [userId]);

  // Ignore results that belong to a previous user (sign-out / switch account).
  const current = loaded && loaded.userId === userId ? loaded : null;
  const memberships = useMemo(() => current?.memberships ?? [], [current]);

  const active = useMemo(
    () => memberships.find((m) => m.company.id === activeId) ?? memberships[0] ?? null,
    [memberships, activeId],
  );
  const activeCompanyId = active?.company.id ?? null;

  useEffect(() => {
    if (!activeCompanyId) return;
    let cancelled = false;
    void supabase.rpc('my_permissions', { _company_id: activeCompanyId }).then(({ data }) => {
      if (!cancelled) setGranted({ companyId: activeCompanyId, perms: new Set(data ?? []) });
    });
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId]);

  const permissions =
    granted && granted.companyId === activeCompanyId ? granted.perms : NO_PERMISSIONS;

  const selectCompany = useCallback((companyId: string) => {
    setActiveId(companyId);
    try {
      localStorage.setItem(ACTIVE_COMPANY_KEY, companyId);
    } catch {
      // storage unavailable (private mode); selection lasts for this tab only
    }
  }, []);

  const value = useMemo<CompanyState>(
    () => ({
      loading: !!userId && !current,
      error: current?.error ?? null,
      memberships,
      active,
      permissions,
      selectCompany,
      refresh,
    }),
    [userId, current, memberships, active, permissions, selectCompany, refresh],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyState {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used inside <CompanyProvider>');
  return ctx;
}
