import { describe, expect, it } from 'vitest';
import {
  emptyJobAnalysis,
  followUpsSchema,
  jobAnalysisContentSchema,
  normalizeJobAnalysis,
  normalizeKeywords,
  rebalanceTo100,
  toStructuredOutputSchema,
} from './job-analysis';

describe('rebalanceTo100', () => {
  it('scales to whole numbers that sum to exactly 100', () => {
    const out = rebalanceTo100([1, 1, 1]);
    expect(out.reduce((a, b) => a + b, 0)).toBe(100);
    expect(out).toEqual([34, 33, 33]);
    expect(rebalanceTo100([50, 30, 30])).toEqual([46, 27, 27]);
  });

  it('splits evenly when all values are zero or invalid, keeps empty input empty', () => {
    expect(rebalanceTo100([0, Number.NaN, -5, 0])).toEqual([25, 25, 25, 25]);
    expect(rebalanceTo100([])).toEqual([]);
  });
});

describe('normalizeKeywords', () => {
  it('lowercases, trims, collapses spaces and dedupes in order, Arabic included', () => {
    expect(normalizeKeywords([' Sales  Report', 'sales report', 'عرض سعر', '', 'CRM'])).toEqual([
      'sales report',
      'عرض سعر',
      'crm',
    ]);
  });
});

describe('normalizeJobAnalysis', () => {
  it('balances KPI weights and duty shares and removes core keywords from ancillary', () => {
    const base = emptyJobAnalysis();
    const out = normalizeJobAnalysis({
      ...base,
      kpis: [
        {
          name_en: 'A',
          name_ar: '',
          description: '',
          unit: '%',
          target: '95',
          frequency: 'monthly',
          weight: 30,
        },
        {
          name_en: 'B',
          name_ar: '',
          description: '',
          unit: '%',
          target: '90',
          frequency: 'monthly',
          weight: 30,
        },
      ],
      duties: [
        {
          title_en: 'X',
          title_ar: '',
          description: '',
          time_percent: 70,
          frequency: 'daily',
          type: 'core',
        },
        {
          title_en: 'Y',
          title_ar: '',
          description: '',
          time_percent: 10,
          frequency: 'weekly',
          type: 'ancillary',
        },
      ],
      core_keywords: ['Invoice', 'payroll'],
      ancillary_keywords: ['invoice', 'filing'],
    });
    expect(out.kpis.map((k) => k.weight)).toEqual([50, 50]);
    expect(out.duties.map((d) => d.time_percent)).toEqual([88, 12]);
    expect(out.core_keywords).toEqual(['invoice', 'payroll']);
    expect(out.ancillary_keywords).toEqual(['filing']);
    expect(jobAnalysisContentSchema.parse(out)).toEqual(out);
  });
});

describe('toStructuredOutputSchema', () => {
  it('produces a closed object schema without unsupported constraints', () => {
    const schema = toStructuredOutputSchema(jobAnalysisContentSchema);
    const json = JSON.stringify(schema);
    for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'maxItems', '$schema']) {
      expect(json).not.toContain(`"${k}"`);
    }
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain('kpis');
    const followups = toStructuredOutputSchema(followUpsSchema) as {
      properties: { questions: { items: { additionalProperties: boolean } } };
    };
    expect(followups.properties.questions.items.additionalProperties).toBe(false);
  });
});
