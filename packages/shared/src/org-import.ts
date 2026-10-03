/**
 * Excel org import: template definition, row normalization and client-side
 * preview validation. The server (import_org) re-validates everything; this
 * module only lets users fix mistakes before uploading.
 */

export const IMPORT_SHEETS = {
  departments: ['name_en', 'name_ar'],
  positions: ['title_en', 'title_ar', 'department', 'reports_to'],
  employees: [
    'code',
    'full_name',
    'work_email',
    'position',
    'department',
    'manager_code',
    'employment_type',
    'start_date',
  ],
} as const;

export type ImportSheet = keyof typeof IMPORT_SHEETS;
type Columns<S extends ImportSheet> = (typeof IMPORT_SHEETS)[S][number];
export type ImportRow<S extends ImportSheet> = Partial<Record<Columns<S>, string>>;

export interface OrgImportPayload {
  departments: ImportRow<'departments'>[];
  positions: ImportRow<'positions'>[];
  employees: ImportRow<'employees'>[];
}

export interface ImportIssue {
  sheet: ImportSheet;
  /** Spreadsheet row number (header is row 1). */
  row: number;
  message: string;
}

/** What already exists in the company, so references to it are valid. */
export interface ExistingOrg {
  departments: string[];
  positions: string[];
  employeeCodes: string[];
}

export type Cell = string | number | boolean | Date | null | undefined;

const key = (s: string) => s.trim().toLowerCase();
const headerKey = (s: string) => key(s).replace(/[\s-]+/g, '_');

function cellToString(cell: Cell): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) {
    return Number.isNaN(cell.getTime()) ? '' : cell.toISOString().slice(0, 10);
  }
  return String(cell).trim();
}

/**
 * Converts a sheet (first row = headers) into objects keyed by template
 * columns. Unknown columns are ignored; fully empty rows are dropped but
 * still counted so row numbers match the spreadsheet.
 */
export function sheetToRows<S extends ImportSheet>(
  sheet: S,
  table: readonly (readonly Cell[])[],
): { rows: ImportRow<S>[]; rowNumbers: number[]; missingColumns: string[] } {
  const columns = IMPORT_SHEETS[sheet] as readonly string[];
  const [header = [], ...body] = table;
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    const k = headerKey(cellToString(h));
    if (columns.includes(k) && !index.has(k)) index.set(k, i);
  });

  const rows: ImportRow<S>[] = [];
  const rowNumbers: number[] = [];
  body.forEach((cells, i) => {
    const row: Record<string, string> = {};
    for (const [col, at] of index) {
      const value = cellToString(cells[at]);
      if (value) row[col] = value;
    }
    if (Object.keys(row).length > 0) {
      rows.push(row as ImportRow<S>);
      rowNumbers.push(i + 2);
    }
  });

  const required: Record<ImportSheet, string[]> = {
    departments: ['name_en'],
    positions: ['title_en'],
    employees: ['code', 'full_name'],
  };
  return {
    rows,
    rowNumbers,
    missingColumns: required[sheet].filter((c) => !index.has(c)),
  };
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Preview validation mirroring import_org() so most errors show up before upload. */
export function validateOrgImport(
  payload: OrgImportPayload,
  existing: ExistingOrg = { departments: [], positions: [], employeeCodes: [] },
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const add = (sheet: ImportSheet, i: number, message: string) =>
    issues.push({ sheet, row: i + 2, message });

  const departments = new Set(existing.departments.map(key));
  const seenDepartments = new Set<string>();
  payload.departments.forEach((r, i) => {
    if (!r.name_en) return add('departments', i, 'name_en is required');
    if (seenDepartments.has(key(r.name_en)))
      add('departments', i, `duplicate department "${r.name_en}"`);
    seenDepartments.add(key(r.name_en));
    departments.add(key(r.name_en));
  });

  const positions = new Set(existing.positions.map(key));
  const seenPositions = new Set<string>();
  payload.positions.forEach((r, i) => {
    if (!r.title_en) return add('positions', i, 'title_en is required');
    if (seenPositions.has(key(r.title_en)))
      add('positions', i, `duplicate position "${r.title_en}"`);
    seenPositions.add(key(r.title_en));
    positions.add(key(r.title_en));
    if (r.department && !departments.has(key(r.department)))
      add('positions', i, `unknown department "${r.department}"`);
  });

  const parent = new Map<string, string>();
  payload.positions.forEach((r, i) => {
    if (!r.title_en || !r.reports_to) return;
    if (!positions.has(key(r.reports_to)))
      return add('positions', i, `unknown reports_to position "${r.reports_to}"`);
    if (key(r.reports_to) === key(r.title_en))
      return add('positions', i, 'a position cannot report to itself');
    parent.set(key(r.title_en), key(r.reports_to));
  });
  payload.positions.forEach((r, i) => {
    if (!r.title_en) return;
    const start = key(r.title_en);
    const seen = new Set<string>([start]);
    for (let p = parent.get(start); p; p = parent.get(p)) {
      if (p === start) {
        add('positions', i, `reporting line of "${r.title_en}" forms a cycle`);
        break;
      }
      if (seen.has(p)) break;
      seen.add(p);
    }
  });

  const codes = new Set(existing.employeeCodes.map(key));
  const seenCodes = new Set<string>();
  payload.employees.forEach((r, i) => {
    if (!r.code || !r.full_name) return add('employees', i, 'code and full_name are required');
    if (seenCodes.has(key(r.code))) add('employees', i, `duplicate employee code "${r.code}"`);
    seenCodes.add(key(r.code));
    codes.add(key(r.code));
    if (r.position && !positions.has(key(r.position)))
      add('employees', i, `unknown position "${r.position}"`);
    if (r.department && !departments.has(key(r.department)))
      add('employees', i, `unknown department "${r.department}"`);
    if (r.employment_type && !['FT', 'PT'].includes(r.employment_type.toUpperCase()))
      add('employees', i, 'employment_type must be FT or PT');
    if (r.start_date && !isValidDate(r.start_date))
      add('employees', i, 'start_date must be YYYY-MM-DD');
    if (r.work_email && !EMAIL.test(r.work_email)) add('employees', i, 'work_email is invalid');
  });
  payload.employees.forEach((r, i) => {
    if (r.manager_code && !codes.has(key(r.manager_code)))
      add('employees', i, `unknown manager_code "${r.manager_code}"`);
    if (r.manager_code && r.code && key(r.manager_code) === key(r.code))
      add('employees', i, 'an employee cannot manage themselves');
  });

  return issues.sort((a, b) => a.sheet.localeCompare(b.sheet) || a.row - b.row);
}
