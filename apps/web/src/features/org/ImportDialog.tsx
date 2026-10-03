import { validateOrgImport, type ImportIssue } from '@figure/shared';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormMessage } from '@/components/FormMessage';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Table, Td, Th } from '@/components/ui/table';
import type { Json } from '@/lib/database.types';
import { friendlyError } from '@/lib/errors';
import { orgApi, useDepartments, useEmployees, useOrgMutation, usePositions } from './api';
import { downloadTemplate, parseWorkbook, SHEET_TITLES, type ParsedWorkbook } from './excel';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface ImportStats {
  [sheet: string]: { created: number; updated: number };
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const departments = useDepartments();
  const positions = usePositions();
  const employees = useEmployees();
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const run = useOrgMutation((id, payload: Json) => orgApi.importOrg(id, payload));

  const issues: ImportIssue[] = useMemo(() => {
    if (!parsed) return [];
    // Map payload indexes back to real spreadsheet row numbers.
    return validateOrgImport(parsed.payload, {
      departments: departments.data?.map((d) => d.name_en) ?? [],
      positions: positions.data?.map((p) => p.title_en) ?? [],
      employeeCodes: employees.data?.map((e) => e.code) ?? [],
    }).map((i) => ({ ...i, row: parsed.rowNumbers[i.sheet][i.row - 2] ?? i.row }));
  }, [parsed, departments.data, positions.data, employees.data]);

  async function onFile(file: File | undefined) {
    setFileError(null);
    setParsed(null);
    run.reset();
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setFileError(t('import.tooLarge'));
    try {
      setParsed(await parseWorkbook(file));
    } catch {
      setFileError(t('import.unreadable'));
    }
  }

  async function onImport() {
    if (!parsed) return;
    const result = await run.mutateAsync(parsed.payload as unknown as Json);
    setStats(result as unknown as ImportStats);
  }

  const counts = parsed
    ? (Object.keys(SHEET_TITLES) as (keyof typeof SHEET_TITLES)[]).map((s) => ({
        sheet: s,
        rows: parsed.payload[s].length,
      }))
    : [];
  const total = counts.reduce((n, c) => n + c.rows, 0);
  const blocked = issues.length > 0 || (parsed?.missingColumns.length ?? 0) > 0 || total === 0;

  return (
    <Dialog open wide onClose={onClose} title={t('import.title')}>
      {stats ? (
        <div className="flex flex-col gap-4">
          <FormMessage kind="info" text={t('import.done')} />
          <ul className="text-sm">
            {Object.entries(stats).map(([sheet, s]) => (
              <li key={sheet}>
                {t(`import.sheet.${sheet}`)}:{' '}
                {t('import.createdUpdated', { created: s.created, updated: s.updated })}
              </li>
            ))}
          </ul>
          <Button className="self-end" onClick={onClose}>
            {t('common.done')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <ol className="list-decimal space-y-1 ps-5 text-sm text-muted-foreground">
            <li>{t('import.step1')}</li>
            <li>{t('import.step2')}</li>
            <li>{t('import.step3')}</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void downloadTemplate()}>
              <Download className="size-4" aria-hidden />
              {t('import.template')}
            </Button>
            <Button asChild variant="outline">
              <label className="cursor-pointer">
                <FileSpreadsheet className="size-4" aria-hidden />
                {t('import.chooseFile')}
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
              </label>
            </Button>
          </div>
          <FormMessage kind="error" text={fileError} />

          {parsed && (
            <>
              <p className="text-sm">
                {counts.map((c) => `${t(`import.sheet.${c.sheet}`)}: ${c.rows}`).join(' · ')}
              </p>
              {parsed.missingColumns.map((m) => (
                <FormMessage
                  key={m.sheet}
                  kind="error"
                  text={t('import.missingColumns', {
                    sheet: SHEET_TITLES[m.sheet],
                    columns: m.columns.join(', '),
                  })}
                />
              ))}
              {issues.length > 0 && (
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <thead>
                      <tr>
                        <Th>{t('import.sheetCol')}</Th>
                        <Th>{t('import.row')}</Th>
                        <Th>{t('import.problem')}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {issues.map((i, n) => (
                        <tr key={n}>
                          <Td>{SHEET_TITLES[i.sheet]}</Td>
                          <Td>{i.row}</Td>
                          <Td dir="ltr" className="text-start">
                            {i.message}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
              {total === 0 && <FormMessage kind="error" text={t('import.empty')} />}
              <FormMessage kind="error" text={run.error ? friendlyError(run.error, t) : null} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>
                  {t('common.cancel')}
                </Button>
                <Button
                  disabled={blocked || run.isPending}
                  onClick={() => void onImport().catch(() => undefined)}
                >
                  {run.isPending ? t('common.loading') : t('import.run', { count: total })}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
