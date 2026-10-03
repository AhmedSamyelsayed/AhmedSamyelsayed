import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FullPageMessage } from '@/components/FullPageMessage';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <FullPageMessage>
      <div className="flex flex-col gap-3">
        <p>{t('errors.notFound')}</p>
        <Link className="text-primary hover:underline" to="/">
          {t('common.back')}
        </Link>
      </div>
    </FullPageMessage>
  );
}
