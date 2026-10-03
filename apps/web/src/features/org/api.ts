import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/features/company/CompanyProvider';
import type { Database, Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

type Tables = Database['public']['Tables'];
export type Company = Tables['companies']['Row'];
export type Department = Tables['departments']['Row'];
export type Position = Tables['positions']['Row'];
export type Employee = Tables['employees']['Row'];
export type Holiday = Tables['company_holidays']['Row'];

function useCompanyId(): string {
  const { active } = useCompany();
  if (!active) throw new Error('No active company');
  return active.company.id;
}

/** Throws the PostgREST error so react-query surfaces it. */
function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

export const orgKeys = {
  all: (companyId: string) => ['org', companyId] as const,
  company: (id: string) => ['org', id, 'company'] as const,
  departments: (id: string) => ['org', id, 'departments'] as const,
  positions: (id: string) => ['org', id, 'positions'] as const,
  employees: (id: string) => ['org', id, 'employees'] as const,
  holidays: (id: string) => ['org', id, 'holidays'] as const,
};

export function useCompanyRecord() {
  const id = useCompanyId();
  return useQuery({
    queryKey: orgKeys.company(id),
    queryFn: async () =>
      unwrap(await supabase.from('companies').select('*').eq('id', id).single()) as Company,
  });
}

export function useDepartments() {
  const id = useCompanyId();
  return useQuery({
    queryKey: orgKeys.departments(id),
    queryFn: async () =>
      unwrap(
        await supabase.from('departments').select('*').eq('company_id', id).order('name_en'),
      ) as Department[],
  });
}

export function usePositions() {
  const id = useCompanyId();
  return useQuery({
    queryKey: orgKeys.positions(id),
    queryFn: async () =>
      unwrap(
        await supabase.from('positions').select('*').eq('company_id', id).order('title_en'),
      ) as Position[],
  });
}

export function useEmployees() {
  const id = useCompanyId();
  return useQuery({
    queryKey: orgKeys.employees(id),
    queryFn: async () =>
      unwrap(
        await supabase.from('employees').select('*').eq('company_id', id).order('full_name'),
      ) as Employee[],
  });
}

export function useHolidays() {
  const id = useCompanyId();
  return useQuery({
    queryKey: orgKeys.holidays(id),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('company_holidays')
          .select('*')
          .eq('company_id', id)
          .order('holiday_date'),
      ) as Holiday[],
  });
}

/** Generic mutation that refreshes the company's org data afterwards. */
export function useOrgMutation<TInput, TResult = unknown>(
  fn: (companyId: string, input: TInput) => Promise<TResult>,
) {
  const id = useCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => fn(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.all(id) }),
  });
}

export const orgApi = {
  async updateCompany(id: string, patch: Tables['companies']['Update']) {
    return unwrap(await supabase.from('companies').update(patch).eq('id', id).select().single());
  },
  async saveDepartment(
    companyId: string,
    d: { id?: string; name_en: string; name_ar: string | null },
  ) {
    if (d.id) {
      return unwrap(
        await supabase
          .from('departments')
          .update({ name_en: d.name_en, name_ar: d.name_ar })
          .eq('id', d.id)
          .select()
          .single(),
      );
    }
    return unwrap(
      await supabase
        .from('departments')
        .insert({ company_id: companyId, name_en: d.name_en, name_ar: d.name_ar })
        .select()
        .single(),
    );
  },
  async deleteRow(
    table: 'departments' | 'positions' | 'employees' | 'company_holidays',
    id: string,
  ) {
    return unwrap(await supabase.from(table).delete().eq('id', id));
  },
  async savePosition(
    companyId: string,
    p: {
      id?: string;
      title_en: string;
      title_ar: string | null;
      department_id: string | null;
      reports_to_position_id: string | null;
    },
  ) {
    const { id, ...fields } = p;
    if (id) {
      return unwrap(await supabase.from('positions').update(fields).eq('id', id).select().single());
    }
    return unwrap(
      await supabase
        .from('positions')
        .insert({ company_id: companyId, ...fields })
        .select()
        .single(),
    );
  },
  async saveEmployee(
    companyId: string,
    e: Omit<Tables['employees']['Insert'], 'company_id'> & { id?: string },
  ) {
    const { id, ...fields } = e;
    if (id) {
      return unwrap(await supabase.from('employees').update(fields).eq('id', id).select().single());
    }
    return unwrap(
      await supabase
        .from('employees')
        .insert({ company_id: companyId, ...fields })
        .select()
        .single(),
    );
  },
  async addHoliday(
    companyId: string,
    h: { holiday_date: string; name_en: string; name_ar: string | null },
  ) {
    return unwrap(
      await supabase
        .from('company_holidays')
        .insert({ company_id: companyId, ...h })
        .select()
        .single(),
    );
  },
  async importOrg(companyId: string, payload: Json) {
    return unwrap(await supabase.rpc('import_org', { _company_id: companyId, _payload: payload }));
  },
};
