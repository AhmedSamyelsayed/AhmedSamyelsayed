import { ROLES, type Role } from '@figure/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/Field';
import { FormMessage } from '@/components/FormMessage';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useCompany } from '@/features/company/CompanyProvider';
import { env } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export function InviteDialog({
  open,
  onClose,
  email: initialEmail = '',
  employeeId = null,
  defaultRole = 'employee',
}: {
  open: boolean;
  onClose: () => void;
  email?: string;
  employeeId?: string | null;
  defaultRole?: Role;
}) {
  const { t } = useTranslation();
  const { active } = useCompany();
  const qc = useQueryClient();
  const [email, setEmail] = useState(initialEmail);
  const [role, setRole] = useState<Role>(defaultRole);
  const [result, setResult] = useState<'sent' | 'created' | null>(null);
  const isOwner = active?.role === 'company_owner';

  const invite = useMutation({
    mutationFn: async () => {
      const { data: invitationId, error } = await supabase.rpc('create_invitation', {
        _company_id: active!.company.id,
        _email: email,
        _role: role,
        _employee_id: employeeId,
      });
      if (error) throw error;
      // Email delivery is best-effort; the invitation also appears after sign-up.
      const sent = await supabase.functions.invoke('send-invite', { body: { invitationId } });
      return sent.error ? 'created' : 'sent';
    },
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: ['members'] });
    },
  });

  function close() {
    setResult(null);
    invite.reset();
    onClose();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    invite.mutate();
  }

  return (
    <Dialog open={open} onClose={close} title={t('members.inviteTitle')}>
      {result ? (
        <div className="flex flex-col gap-4">
          <FormMessage
            kind="info"
            text={
              result === 'sent'
                ? t('members.inviteSent', { email })
                : t('members.inviteCreated', { email, url: `${env.VITE_APP_URL}/auth/sign-up` })
            }
          />
          <Button onClick={close} className="self-end">
            {t('common.done')}
          </Button>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Field id="inviteEmail" label={t('auth.email')}>
            <Input
              id="inviteEmail"
              type="email"
              dir="ltr"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field id="inviteRole" label={t('members.role')} hint={t(`roleHints.${role}`)}>
            <Select id="inviteRole" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.filter((r) => isOwner || r !== 'company_owner').map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          <FormMessage kind="error" text={invite.error ? friendlyError(invite.error, t) : null} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {t('members.sendInvite')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
