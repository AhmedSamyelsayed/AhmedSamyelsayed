import { normalizeKeywords } from '@figure/shared';
import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Chip input for keyword lists. Enter or comma adds; × removes. */
export function KeywordEditor({
  id,
  value,
  onChange,
  readOnly,
  tone,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
  tone: 'core' | 'ancillary';
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  function commit() {
    const parts = draft.split(/[,،\n]/);
    if (parts.some((p) => p.trim())) onChange(normalizeKeywords([...value, ...parts]));
    setDraft('');
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === '،') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-1.5">
        {value.map((k) => (
          <li
            key={k}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs',
              tone === 'core' ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground',
            )}
          >
            <span dir="auto">{k}</span>
            {!readOnly && (
              <button
                type="button"
                aria-label={t('jobAnalysis.removeKeyword', { keyword: k })}
                onClick={() => onChange(value.filter((x) => x !== k))}
                className="rounded-full hover:bg-black/20"
              >
                <X className="size-3" />
              </button>
            )}
          </li>
        ))}
        {value.length === 0 && <li className="text-xs text-muted-foreground">—</li>}
      </ul>
      {!readOnly && (
        <Input
          id={id}
          dir="auto"
          value={draft}
          placeholder={t('jobAnalysis.addKeyword')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
        />
      )}
    </div>
  );
}
