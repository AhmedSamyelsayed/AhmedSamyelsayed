import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Pending/error/info state for simple async forms. */
export function useFormStatus() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function run(action: () => Promise<{ error: { message: string } | null }>, ok?: string) {
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      const { error: err } = await action();
      if (err) setError(err.message);
      else if (ok) setInfo(ok);
      return !err;
    } catch {
      setError(t('common.error'));
      return false;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, info, run };
}
