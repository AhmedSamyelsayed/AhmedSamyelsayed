import { z } from 'zod';

/** Weekday numbering follows JS Date#getDay(): 0 = Sunday ... 6 = Saturday. */
export const DEFAULT_WEEKEND_DAYS = [5, 6] as const;
export const DEFAULT_TIMEZONE = 'Africa/Cairo';
export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const createCompanySchema = z.object({
  nameEn: z.string().trim().min(1).max(200),
  nameAr: z.string().trim().max(200).optional(),
  isPersonal: z.boolean().default(false),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const companyProfileSchema = z
  .object({
    nameEn: z.string().trim().min(1).max(200),
    nameAr: z.string().trim().max(200).nullable(),
    industry: z.string().trim().max(120).nullable(),
    country: z.string().regex(/^[A-Z]{2}$/),
    timezone: z.string().min(1),
    weekendDays: z.array(z.number().int().min(0).max(6)).max(6),
    ftDailyHours: z.number().gt(0).max(24),
    ptDailyHours: z.number().gt(0).max(24),
    defaultLocale: z.enum(LOCALES),
  })
  .refine((v) => v.ptDailyHours <= v.ftDailyHours, {
    message: 'Part-time hours cannot exceed full-time hours',
    path: ['ptDailyHours'],
  });

export type CompanyProfile = z.infer<typeof companyProfileSchema>;

/** Storage object paths are always prefixed with the company id. */
export function companyStoragePath(companyId: string, ...segments: string[]): string {
  const clean = segments.map((s) => s.replace(/^\/+|\/+$/g, '')).filter(Boolean);
  if (clean.some((s) => s.split('/').includes('..'))) {
    throw new Error('Path traversal is not allowed');
  }
  return [companyId, ...clean].join('/');
}
