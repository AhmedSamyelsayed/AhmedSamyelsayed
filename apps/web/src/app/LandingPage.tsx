import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between p-4">
        <span className="text-lg font-bold text-primary">{t('app.name')}</span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button asChild variant="outline" size="sm">
            <Link to="/auth/sign-in">{t('landing.signIn')}</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="text-sm uppercase tracking-wide text-primary">{t('app.tagline')}</p>
        <h1 className="text-4xl font-bold leading-tight md:text-5xl">{t('landing.headline')}</h1>
        <p className="text-lg text-muted-foreground">{t('landing.body')}</p>
        <Button asChild size="lg">
          <Link to="/auth/sign-up">{t('landing.getStarted')}</Link>
        </Button>
      </main>
      <footer className="p-4 text-center text-xs text-muted-foreground">{t('app.by')}</footer>
    </div>
  );
}
