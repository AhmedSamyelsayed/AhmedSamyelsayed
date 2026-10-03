import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export function useMyInvitations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-invitations', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_invitations');
      if (error) throw error;
      return data;
    },
  });
}
