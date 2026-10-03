import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/features/company/CompanyProvider';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

type Fns = Database['public']['Functions'];
export type Member = Fns['list_company_members']['Returns'][number];
export type Invitation = Database['public']['Tables']['company_invitations']['Row'];
export type Override = Database['public']['Tables']['user_permission_overrides']['Row'];
type AppRole = Database['public']['Enums']['app_role'];
type MemberStatus = Database['public']['Enums']['member_status'];

function useCompanyId() {
  const { active } = useCompany();
  return active!.company.id;
}

export function useMembers() {
  const id = useCompanyId();
  return useQuery({
    queryKey: ['members', id, 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_company_members', { _company_id: id });
      if (error) throw error;
      return data;
    },
  });
}

export function usePendingInvitations() {
  const id = useCompanyId();
  return useQuery({
    queryKey: ['members', id, 'invitations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_invitations')
        .select('*')
        .eq('company_id', id)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useOverrides(userId: string) {
  const id = useCompanyId();
  return useQuery({
    queryKey: ['members', id, 'overrides', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_permission_overrides')
        .select('*')
        .eq('company_id', id)
        .eq('user_id', userId);
      if (error) throw error;
      return data;
    },
  });
}

export function useMemberMutation<T>(fn: (companyId: string, input: T) => Promise<unknown>) {
  const id = useCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', id] }),
  });
}

async function check<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
  const res = await p;
  if (res.error) throw res.error;
  return res;
}

export const membersApi = {
  updateMember: (companyId: string, m: { userId: string; role?: AppRole; status?: MemberStatus }) =>
    check(
      supabase
        .from('company_members')
        .update({ ...(m.role && { role: m.role }), ...(m.status && { status: m.status }) })
        .eq('company_id', companyId)
        .eq('user_id', m.userId),
    ),
  removeMember: (companyId: string, userId: string) =>
    check(
      supabase.from('company_members').delete().eq('company_id', companyId).eq('user_id', userId),
    ),
  revokeInvitation: (_companyId: string, invitationId: string) =>
    check(supabase.rpc('revoke_invitation', { _invitation_id: invitationId })),
  setOverride: (
    companyId: string,
    o: { userId: string; permission: string; state: 'inherit' | 'grant' | 'revoke' },
  ) =>
    o.state === 'inherit'
      ? check(
          supabase
            .from('user_permission_overrides')
            .delete()
            .eq('company_id', companyId)
            .eq('user_id', o.userId)
            .eq('permission', o.permission),
        )
      : check(
          supabase.from('user_permission_overrides').upsert({
            company_id: companyId,
            user_id: o.userId,
            permission: o.permission,
            granted: o.state === 'grant',
          }),
        ),
};
