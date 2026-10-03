import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const next = i18n.resolvedLanguage === 'ar' ? 'en' : 'ar';
  return (
    <Button variant="ghost" size="sm" onClick={() => void i18n.changeLanguage(next)}>
      <Languages className="size-4" aria-hidden />
      {t('common.language')}
    </Button>
  );
}
