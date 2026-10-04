import type { TFunction } from 'i18next';
import { AiCallError } from './ai';

interface DbError {
  code?: string;
  message?: string;
}

/**
 * Turns a Postgres/PostgREST error into a message for the user. Known business
 * rules map to translated text; row-level import errors (22023) are shown as-is
 * because they name the spreadsheet row.
 */
export function friendlyError(error: unknown, t: TFunction): string {
  if (error instanceof AiCallError) {
    return t(`ai.errors.${error.code}`, { defaultValue: t('ai.errors.generic') });
  }
  const e = (error ?? {}) as DbError;
  const msg = e.message ?? '';
  if (/cycle/i.test(msg)) return t('errors.cycle');
  if (/at least one active owner/i.test(msg)) return t('errors.lastOwner');
  if (/owner/i.test(msg) && e.code === '42501') return t('errors.ownerOnly');
  if (/own (membership|permissions)/i.test(msg)) return t('errors.self');
  if (/already a member/i.test(msg)) return t('errors.alreadyMember');
  if (/core keyword/i.test(msg)) return t('jobAnalysis.needCoreKeyword');
  if (/no longer open/i.test(msg)) return t('jobAnalysis.sessionClosed');
  if (e.code === 'unsupported_type') return t('ai.errors.unsupported_type');
  if (e.code === 'too_large') return t('jobAnalysis.tooLarge');
  if (/delegate/i.test(msg)) return t('errors.delegate');
  switch (e.code) {
    case '23505':
      return t('errors.duplicate');
    case '23503':
      return t('errors.reference');
    case '42501':
      return t('errors.forbidden');
    case 'P0002':
      return t('errors.notFoundItem');
    case '22023':
      return msg;
    default:
      return t('common.error');
  }
}
