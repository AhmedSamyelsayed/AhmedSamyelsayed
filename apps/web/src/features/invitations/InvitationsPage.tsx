import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { InvitationsList } from './InvitationsList';

export function InvitationsPage() {
  const { t } = useTranslation();
  return (
    <AuthLayout
      title={t('invitations.title')}
      description={t('invitations.description')}
      footer={
        <span className="flex flex-col gap-1">
          <Link className="text-primary hover:underline" to="/auth/update-password">
            {t('invitations.setPassword')}
          </Link>
          <Link className="text-primary hover:underline" to="/app/dashboard">
            {t('common.continue')}
          </Link>
        </span>
      }
    >
      <InvitationsList emptyText={t('invitations.none')} />
    </AuthLayout>
  );
}
