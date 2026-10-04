// Pure helpers for questionnaire sessions (unit-tested).
import type { FollowUpQuestion } from '../generated/job-analysis.ts';
import type { Locale, QA } from './prompts.ts';

export interface QuestionTemplate {
  key: string;
  sort_order: number;
  text_en: string;
  text_ar: string;
  company_id: string | null;
}

/** Company questions override global ones with the same key; sorted. */
export function effectiveQuestions(templates: QuestionTemplate[]): QuestionTemplate[] {
  const byKey = new Map<string, QuestionTemplate>();
  for (const t of [...templates].sort(
    (a, b) => Number(a.company_id !== null) - Number(b.company_id !== null),
  )) {
    byKey.set(t.key, t);
  }
  return [...byKey.values()].sort(
    (a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key),
  );
}

export function questionsAndAnswers(
  templates: QuestionTemplate[],
  answers: Record<string, unknown>,
  followups: FollowUpQuestion[],
  locale: Locale,
): QA[] {
  const text = (en: string, ar: string) => (locale === 'ar' && ar ? ar : en);
  const asString = (v: unknown) => (typeof v === 'string' ? v : '');
  return [
    ...effectiveQuestions(templates).map((t) => ({
      question: text(t.text_en, t.text_ar),
      answer: asString(answers[t.key]),
    })),
    ...followups.map((f) => ({ question: text(f.text_en, f.text_ar), answer: f.answer ?? '' })),
  ];
}

/** Adds new follow-ups, skipping keys already used, up to 8 in total. */
export function mergeFollowUps(
  existing: FollowUpQuestion[],
  incoming: { key: string; text_en: string; text_ar: string }[],
  reservedKeys: string[],
  max = 8,
): FollowUpQuestion[] {
  const used = new Set([...reservedKeys, ...existing.map((f) => f.key)]);
  const out = [...existing];
  for (const q of incoming) {
    const key =
      q.key
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 60) || 'followup';
    if (used.has(key) || out.length >= max) continue;
    used.add(key);
    out.push({ key, text_en: q.text_en, text_ar: q.text_ar });
  }
  return out;
}

/** The questionnaire needs at least purpose and duties before generating. */
export function hasEnoughAnswers(answers: Record<string, unknown>): boolean {
  const filled = (k: string) =>
    typeof answers[k] === 'string' && (answers[k] as string).trim().length > 0;
  return filled('purpose') && filled('duties');
}
