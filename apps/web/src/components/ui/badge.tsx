import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const tones = {
  default: 'bg-muted text-foreground',
  primary: 'bg-primary/15 text-primary',
  warn: 'bg-amber-500/15 text-amber-400',
  danger: 'bg-destructive/15 text-destructive',
  success: 'bg-emerald-500/15 text-emerald-400',
};

export function Badge({
  tone = 'default',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
