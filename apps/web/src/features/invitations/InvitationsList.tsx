import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FormMessage } from '@/components/FormMessage';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCompany } from '@/features/company/CompanyProvider';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useLocalizedName } from '@/lib/useDate';
import { useMyInvitations } from './api';

/** Pending invitations for the signed-in user, with accept buttons. */
export function InvitationsList({ emptyText }: { emptyText?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const name = useLocalizedName();
  const { refresh, selectCompany } = useCompany();
  const invitations = useMyInvitations();
  const accept = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('accept_invitation', { _invitation_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: async (companyId) => {
      selectCompany(companyId);
      await refresh();
      await qc.invalidateQueries({ queryKey: ['my-invitations'] });
      navigate('/app/dashboard', { replace: true });
    },
  });

  if (!invitations.data?.length) {
    return emptyText ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null;
  }

  return (
    <div className="flex flex-col gap-3">
      {invitations.data.map((i) => (
        <Card key={i.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div>
              <p className="font-medium">{name(i.company_name_en, i.company_name_ar)}</p>
              <p className="text-sm text-muted-foreground">
                {t('invitations.asRole', { role: t(`roles.${i.role}`) })}
              </p>
            </div>
            <Button disabled={accept.isPending} onClick={() => accept.mutate(i.id)}>
              {t('invitations.accept')}
            </Button>
          </CardContent>
        </Card>
      ))}
      <FormMessage kind="error" text={accept.error ? friendlyError(accept.error, t) : null} />
    </div>
  );
}
