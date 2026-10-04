import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Shown while a Claude call runs; job analyses can take a minute or two. */
export function AiBusy({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm"
    >
      <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
      <span>{label ?? t('ai.working')}</span>
    </div>
  );
}
