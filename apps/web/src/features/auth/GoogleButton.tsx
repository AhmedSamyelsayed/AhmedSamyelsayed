import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { authRedirect, supabase } from '@/lib/supabase';

export function GoogleButton({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={() =>
        void supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: authRedirect('/app/dashboard') },
        })
      }
    >
      {t('auth.google')}
    </Button>
  );
}

export function OrDivider() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {t('common.or')}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
