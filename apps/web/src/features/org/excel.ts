import {
  IMPORT_SHEETS,
  sheetToRows,
  type Cell,
  type ImportSheet,
  type OrgImportPayload,
} from '@figure/shared';

export const SHEET_TITLES: Record<ImportSheet, string> = {
  departments: 'Departments',
  positions: 'Positions',
  employees: 'Employees',
};

const INSTRUCTIONS: string[][] = [
  ['Figure organization import / استيراد الهيكل التنظيمي'],
  [''],
  ['Fill the Departments, Positions and Employees sheets. Keep the header row as is.'],
  ['املأ أوراق الإدارات والوظائف والموظفين مع الإبقاء على صف العناوين كما هو.'],
  [''],
  ['Departments: name_en is required. Rows match existing departments by English name.'],
  [
    'Positions: title_en is required and unique. department = department English name. reports_to = title of the position it reports to.',
  ],
  [
    'Employees: code and full_name are required. position = position title. manager_code = code of a manager who overrides the position reporting line.',
  ],
  ['employment_type: FT or PT (default FT). start_date: YYYY-MM-DD.'],
  ['Existing rows are updated, new rows are created. If any row has an error nothing is imported.'],
  ['يتم تحديث الصفوف الموجودة وإنشاء الجديدة. إذا كان بأي صف خطأ فلن يتم استيراد أي شيء.'],
];

export async function downloadTemplate(): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const header = (sheet: ImportSheet) =>
    IMPORT_SHEETS[sheet].map((c) => ({ value: c, fontWeight: 'bold' as const }));
  await writeXlsxFile([
    { sheet: 'Instructions', data: INSTRUCTIONS, columns: [{ width: 120 }] },
    ...(Object.keys(SHEET_TITLES) as ImportSheet[]).map((s) => ({
      sheet: SHEET_TITLES[s],
      data: [header(s)],
      columns: IMPORT_SHEETS[s].map(() => ({ width: 22 })),
    })),
  ]).toFile('figure-org-import.xlsx');
}

export interface ParsedWorkbook {
  payload: OrgImportPayload;
  /** Spreadsheet row numbers for each payload row, for error messages. */
  rowNumbers: Record<ImportSheet, number[]>;
  missingColumns: { sheet: ImportSheet; columns: string[] }[];
}

export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = await readXlsxFile(file);
  const find = (s: ImportSheet) =>
    sheets.find((x) => x.sheet.trim().toLowerCase() === SHEET_TITLES[s].toLowerCase())?.data ?? [];

  const payload: OrgImportPayload = { departments: [], positions: [], employees: [] };
  const rowNumbers = { departments: [], positions: [], employees: [] } as Record<
    ImportSheet,
    number[]
  >;
  const missingColumns: ParsedWorkbook['missingColumns'] = [];

  for (const s of Object.keys(SHEET_TITLES) as ImportSheet[]) {
    const table = find(s) as unknown as Cell[][];
    if (table.length === 0) continue;
    const parsed = sheetToRows(s, table);
    if (parsed.rows.length && parsed.missingColumns.length) {
      missingColumns.push({ sheet: s, columns: parsed.missingColumns });
    }
    (payload[s] as unknown[]) = parsed.rows;
    rowNumbers[s] = parsed.rowNumbers;
  }
  return { payload, rowNumbers, missingColumns };
}
