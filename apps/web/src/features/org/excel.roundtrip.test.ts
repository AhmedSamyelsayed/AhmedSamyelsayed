// @vitest-environment node
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sheetToRows, validateOrgImport, type Cell } from '@figure/shared';
import readXlsxFile from 'read-excel-file/node';
import writeXlsxFile from 'write-excel-file/node';
import { expect, it } from 'vitest';

it('parses a real .xlsx (numeric codes, Excel dates) into a valid import payload', async () => {
  const file = join(tmpdir(), `figure-roundtrip-${process.pid}.xlsx`);
  await writeXlsxFile([
    {
      sheet: 'Departments',
      data: [
        ['name_en', 'name_ar'],
        ['Sales', 'المبيعات'],
      ],
    },
    {
      sheet: 'Positions',
      data: [
        ['title_en', 'department', 'reports_to'],
        ['Head', 'Sales', null],
        ['Rep', 'Sales', 'Head'],
      ],
    },
    {
      sheet: 'Employees',
      data: [
        ['code', 'full_name', 'position', 'manager_code', 'start_date'],
        [
          1001,
          'Sara',
          'Head',
          null,
          { value: new Date(Date.UTC(2024, 0, 15)), format: 'yyyy-mm-dd' },
        ],
        ['1002', 'Omar', 'Rep', 1001, '2024-02-01'],
      ],
    },
  ]).toFile(file);

  const sheets = await readXlsxFile(file);
  const get = (name: string) => sheets.find((s) => s.sheet === name)!.data as unknown as Cell[][];
  const payload = {
    departments: sheetToRows('departments', get('Departments')).rows,
    positions: sheetToRows('positions', get('Positions')).rows,
    employees: sheetToRows('employees', get('Employees')).rows,
  };

  expect(payload.employees).toEqual([
    { code: '1001', full_name: 'Sara', position: 'Head', start_date: '2024-01-15' },
    {
      code: '1002',
      full_name: 'Omar',
      position: 'Rep',
      manager_code: '1001',
      start_date: '2024-02-01',
    },
  ]);
  expect(validateOrgImport(payload)).toEqual([]);
});
