import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/Field';
import { FormMessage } from '@/components/FormMessage';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, Td, Th } from '@/components/ui/table';
import { useCan } from '@/features/company/useCan';
import { friendlyError } from '@/lib/errors';
import { useLocalizedName } from '@/lib/useDate';
import {
  orgApi,
  useDepartments,
  useEmployees,
  useOrgMutation,
  usePositions,
  type Position,
} from './api';
import { descendantsOf } from './hierarchy';

export function PositionsManager() {
  const { t } = useTranslation();
  const can = useCan();
  const name = useLocalizedName();
  const positions = usePositions();
  const departments = useDepartments();
  const employees = useEmployees();
  const [editing, setEditing] = useState<Partial<Position> | null>(null);
  const remove = useOrgMutation((_id, positionId: string) =>
    orgApi.deleteRow('positions', positionId),
  );
  const canEdit = can('org.manage');

  const byId = useMemo(
    () => new Map(positions.data?.map((p) => [p.id, p]) ?? []),
    [positions.data],
  );
  const deptById = useMemo(
    () => new Map(departments.data?.map((d) => [d.id, d]) ?? []),
    [departments.data],
  );

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <Button className="self-start" onClick={() => setEditing({})}>
          <Plus className="size-4" aria-hidden />
          {t('org.addPosition')}
        </Button>
      )}
      <FormMessage kind="error" text={remove.error ? friendlyError(remove.error, t) : null} />
      <QueryState loading={positions.isLoading} error={positions.error}>
        {positions.data?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('org.title')}</Th>
                <Th>{t('org.department')}</Th>
                <Th>{t('org.reportsTo')}</Th>
                <Th>{t('org.holders')}</Th>
                {canEdit && <Th className="w-24" />}
              </tr>
            </thead>
            <tbody>
              {positions.data.map((p) => {
                const dept = p.department_id ? deptById.get(p.department_id) : undefined;
                const parent = p.reports_to_position_id
                  ? byId.get(p.reports_to_position_id)
                  : undefined;
                return (
                  <tr key={p.id}>
                    <Td>{name(p.title_en, p.title_ar)}</Td>
                    <Td>{dept ? name(dept.name_en, dept.name_ar) : '—'}</Td>
                    <Td>{parent ? name(parent.title_en, parent.title_ar) : '—'}</Td>
                    <Td>
                      {employees.data?.filter(
                        (e) => e.position_id === p.id && e.status === 'active',
                      ).length ?? 0}
                    </Td>
                    {canEdit && (
                      <Td className="whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('common.edit')}
                          onClick={() => setEditing(p)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('common.delete')}
                          onClick={() =>
                            window.confirm(t('org.confirmDeletePosition')) && remove.mutate(p.id)
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">{t('org.noPositions')}</p>
        )}
      </QueryState>
      {editing && <PositionDialog position={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PositionDialog({
  position,
  onClose,
}: {
  position: Partial<Position>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const name = useLocalizedName();
  const positions = usePositions();
  const departments = useDepartments();
  const [titleEn, setTitleEn] = useState(position.title_en ?? '');
  const [titleAr, setTitleAr] = useState(position.title_ar ?? '');
  const [departmentId, setDepartmentId] = useState(position.department_id ?? '');
  const [reportsTo, setReportsTo] = useState(position.reports_to_position_id ?? '');
  const save = useOrgMutation((id, p: Parameters<typeof orgApi.savePosition>[1]) =>
    orgApi.savePosition(id, p),
  );

  // A position cannot report to itself or to anything below it.
  const excluded = useMemo(
    () =>
      position.id
        ? descendantsOf(positions.data ?? [], (p) => p.reports_to_position_id, position.id)
        : new Set<string>(),
    [positions.data, position.id],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await save.mutateAsync({
      id: position.id,
      title_en: titleEn.trim(),
      title_ar: titleAr.trim() || null,
      department_id: departmentId || null,
      reports_to_position_id: reportsTo || null,
    });
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={position.id ? t('org.editPosition') : t('org.addPosition')}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
      >
        <Field id="pEn" label={t('org.titleEn')}>
          <Input
            id="pEn"
            dir="ltr"
            required
            maxLength={160}
            value={titleEn}
            onChange={(e) => setTitleEn(e.target.value)}
          />
        </Field>
        <Field id="pAr" label={t('org.titleAr')}>
          <Input
            id="pAr"
            dir="rtl"
            lang="ar"
            maxLength={160}
            value={titleAr}
            onChange={(e) => setTitleAr(e.target.value)}
          />
        </Field>
        <Field id="pDept" label={t('org.department')}>
          <Select id="pDept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">—</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {name(d.name_en, d.name_ar)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="pReports" label={t('org.reportsTo')} hint={t('org.reportsToHint')}>
          <Select id="pReports" value={reportsTo} onChange={(e) => setReportsTo(e.target.value)}>
            <option value="">{t('org.topLevel')}</option>
            {positions.data
              ?.filter((p) => !excluded.has(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {name(p.title_en, p.title_ar)}
                </option>
              ))}
          </Select>
        </Field>
        <FormMessage kind="error" text={save.error ? friendlyError(save.error, t) : null} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending || !titleEn.trim()}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
