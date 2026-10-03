import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { FormMessage } from '@/components/FormMessage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authRedirect, supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';
import { GoogleButton, OrDivider } from './GoogleButton';
import { useFormStatus } from './useFormStatus';

export function SignUpPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { pending, error, info, run } = useFormStatus();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    let hasSession = false;
    await run(async () => {
      const res = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: authRedirect('/onboarding'),
        },
      });
      hasSession = !!res.data.session;
      return res;
    }, t('auth.confirmEmail'));
    // With email confirmation disabled the user is signed in immediately.
    if (hasSession) navigate('/onboarding', { replace: true });
  }

  return (
    <AuthLayout
      title={t('auth.signUpTitle')}
      description={t('app.tagline')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link className="text-primary hover:underline" to="/auth/sign-in">
            {t('auth.signIn')}
          </Link>
        </>
      }
    >
      <GoogleButton disabled={pending} />
      <OrDivider />
      <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fullName">{t('auth.fullName')}</Label>
          <Input
            id="fullName"
            autoComplete="name"
            required
            maxLength={120}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
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
          <Label htmlFor="password">{t('auth.password')}</Label>
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
          {t('auth.signUp')}
        </Button>
      </form>
    </AuthLayout>
  );
}
