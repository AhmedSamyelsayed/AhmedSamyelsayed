import { describe, expect, it } from 'vitest';
import { sheetToRows, validateOrgImport, type OrgImportPayload } from './org-import';

describe('sheetToRows', () => {
  it('maps headers case-insensitively, ignores unknown columns, keeps row numbers', () => {
    const { rows, rowNumbers, missingColumns } = sheetToRows('employees', [
      ['Code', 'Full Name', 'Start Date', 'Notes'],
      ['E1', ' Sara ', new Date(Date.UTC(2024, 0, 15)), 'ignored'],
      [null, '', undefined, null],
      [42, 'Omar', '', ''],
    ]);
    expect(rows).toEqual([
      { code: 'E1', full_name: 'Sara', start_date: '2024-01-15' },
      { code: '42', full_name: 'Omar' },
    ]);
    expect(rowNumbers).toEqual([2, 4]);
    expect(missingColumns).toEqual([]);
  });

  it('reports missing required columns', () => {
    expect(sheetToRows('positions', [['Title']]).missingColumns).toEqual(['title_en']);
  });
});

describe('validateOrgImport', () => {
  const valid: OrgImportPayload = {
    departments: [{ name_en: 'Sales' }],
    positions: [
      { title_en: 'Head of Sales', department: 'sales' },
      { title_en: 'Rep', department: 'Sales', reports_to: 'head of sales' },
    ],
    employees: [
      { code: 'S1', full_name: 'Sara', position: 'Head of Sales', start_date: '2024-02-29' },
      { code: 'S2', full_name: 'Omar', position: 'Rep', manager_code: 's1', employment_type: 'pt' },
    ],
  };

  it('accepts a consistent file', () => {
    expect(validateOrgImport(valid)).toEqual([]);
  });

  it('accepts references to existing org data', () => {
    expect(
      validateOrgImport(
        {
          departments: [],
          positions: [],
          employees: [{ code: 'X', full_name: 'X', position: 'CEO', manager_code: 'M1' }],
        },
        { departments: [], positions: ['ceo'], employeeCodes: ['m1'] },
      ),
    ).toEqual([]);
  });

  it('flags unknown references, bad values, duplicates and cycles with row numbers', () => {
    const issues = validateOrgImport({
      departments: [{ name_en: 'Sales' }, { name_en: 'sales' }],
      positions: [
        { title_en: 'A', reports_to: 'B' },
        { title_en: 'B', reports_to: 'A', department: 'Ops' },
      ],
      employees: [
        { code: 'E1', full_name: 'One', position: 'Z', start_date: '2023-02-30' },
        { code: 'E2', full_name: 'Two', manager_code: 'E9', employment_type: 'contract' },
        { code: 'e1', full_name: 'Dup', work_email: 'nope' },
      ],
    });
    expect(issues.map((i) => `${i.sheet}:${i.row}:${i.message}`)).toEqual([
      'departments:3:duplicate department "sales"',
      'employees:2:unknown position "Z"',
      'employees:2:start_date must be YYYY-MM-DD',
      'employees:3:employment_type must be FT or PT',
      'employees:3:unknown manager_code "E9"',
      'employees:4:duplicate employee code "e1"',
      'employees:4:work_email is invalid',
      'positions:2:reporting line of "A" forms a cycle',
      'positions:3:unknown department "Ops"',
      'positions:3:reporting line of "B" forms a cycle',
    ]);
  });
});
