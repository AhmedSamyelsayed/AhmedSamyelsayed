import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** Short-lived signed URL for the private company logo. */
export function useLogoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['logo', path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('company-assets')
        .createSignedUrl(path!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
