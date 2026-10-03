import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FormMessage } from '@/components/FormMessage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';
import { useFormStatus } from './useFormStatus';

/** Reached from the password-recovery email; the link signs the user in first. */
export function UpdatePasswordPage() {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const { pending, error, info, run } = useFormStatus();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(() => supabase.auth.updateUser({ password }), t('auth.passwordUpdated'));
  }

  return (
    <AuthLayout
      title={t('auth.updatePassword')}
      footer={
        info && (
          <Link className="text-primary hover:underline" to="/app/dashboard">
            {t('common.continue')}
          </Link>
        )
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">{t('auth.newPassword')}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            dir="ltr"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('auth.passwordHint')}</p>
        </div>
        <FormMessage kind="error" text={error} />
        <FormMessage kind="info" text={info} />
        <Button type="submit" disabled={pending}>
          {t('auth.updatePassword')}
        </Button>
      </form>
    </AuthLayout>
  );
}
