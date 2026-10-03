import { describe, expect, it } from 'vitest';
import { companyProfileSchema, companyStoragePath, createCompanySchema } from './company';

describe('companyStoragePath', () => {
  it('prefixes paths with the company id', () => {
    expect(companyStoragePath('c1', '/logos/', 'logo.png')).toBe('c1/logos/logo.png');
  });

  it('rejects traversal', () => {
    expect(() => companyStoragePath('c1', '../c2/logo.png')).toThrow();
  });
});

describe('schemas', () => {
  it('trims and validates company names', () => {
    expect(createCompanySchema.parse({ nameEn: '  Acme ' })).toEqual({
      nameEn: 'Acme',
      isPersonal: false,
    });
    expect(createCompanySchema.safeParse({ nameEn: '   ' }).success).toBe(false);
  });

  it('rejects part-time hours above full-time hours', () => {
    const result = companyProfileSchema.safeParse({
      nameEn: 'Acme',
      nameAr: null,
      industry: null,
      country: 'EG',
      timezone: 'Africa/Cairo',
      weekendDays: [5, 6],
      ftDailyHours: 8,
      ptDailyHours: 9,
      defaultLocale: 'en',
    });
    expect(result.success).toBe(false);
  });
});
