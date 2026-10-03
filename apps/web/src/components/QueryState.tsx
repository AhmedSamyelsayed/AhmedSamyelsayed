import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { friendlyError } from '@/lib/errors';

/** Loading / error wrapper for react-query results. */
export function QueryState({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: unknown;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (loading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {friendlyError(error, t)}
      </p>
    );
  return <>{children}</>;
}
