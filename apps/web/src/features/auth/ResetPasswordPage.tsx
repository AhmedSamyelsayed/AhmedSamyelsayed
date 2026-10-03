import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FormMessage } from '@/components/FormMessage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authRedirect, supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';
import { useFormStatus } from './useFormStatus';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const { pending, error, info, run } = useFormStatus();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(
      () =>
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: authRedirect('/auth/update-password'),
        }),
      t('auth.resetSent'),
    );
  }

  return (
    <AuthLayout
      title={t('auth.resetTitle')}
      footer={
        <Link className="text-primary hover:underline" to="/auth/sign-in">
          {t('common.back')}
        </Link>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <FormMessage kind="error" text={error} />
        <FormMessage kind="info" text={info} />
        <Button type="submit" disabled={pending}>
          {t('auth.resetSend')}
        </Button>
      </form>
    </AuthLayout>
  );
}
