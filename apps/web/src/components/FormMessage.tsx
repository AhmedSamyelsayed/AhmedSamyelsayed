import { cn } from '@/lib/utils';

export function FormMessage({ kind, text }: { kind: 'error' | 'info'; text: string | null }) {
  if (!text) return null;
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn('text-sm', kind === 'error' ? 'text-destructive' : 'text-primary')}
    >
      {text}
    </p>
  );
}
