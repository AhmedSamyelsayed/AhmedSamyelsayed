import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FormMessage } from '@/components/FormMessage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authRedirect, supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';
import { GoogleButton, OrDivider } from './GoogleButton';
import { useFormStatus } from './useFormStatus';

export function SignInPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/app/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { pending, error, info, run } = useFormStatus();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => supabase.auth.signInWithPassword({ email, password }));
    if (ok) navigate(from.startsWith('/app') ? from : '/app/dashboard', { replace: true });
  }

  function sendMagicLink() {
    void run(
      () =>
        supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: authRedirect('/app/dashboard'), shouldCreateUser: false },
        }),
      t('auth.magicLinkSent'),
    );
  }

  return (
    <AuthLayout
      title={t('auth.signInTitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link className="text-primary hover:underline" to="/auth/sign-up">
            {t('auth.signUp')}
          </Link>
        </>
      }
    >
      <GoogleButton disabled={pending} />
      <OrDivider />
      <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
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
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Link className="text-xs text-primary hover:underline" to="/auth/reset">
              {t('auth.forgot')}
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            dir="ltr"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <FormMessage kind="error" text={error} />
        <FormMessage kind="info" text={info} />
        <Button type="submit" disabled={pending}>
          {t('auth.signIn')}
        </Button>
        <Button type="button" variant="link" disabled={pending || !email} onClick={sendMagicLink}>
          {t('auth.magicLink')}
        </Button>
      </form>
    </AuthLayout>
  );
}
