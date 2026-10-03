import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/Field';
import { FormMessage } from '@/components/FormMessage';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { useCan } from '@/features/company/useCan';
import { friendlyError } from '@/lib/errors';
import {
  orgApi,
  useDepartments,
  useEmployees,
  useOrgMutation,
  usePositions,
  type Department,
} from './api';

export function DepartmentsManager() {
  const { t } = useTranslation();
  const can = useCan();
  const departments = useDepartments();
  const positions = usePositions();
  const employees = useEmployees();
  const [editing, setEditing] = useState<Partial<Department> | null>(null);
  const remove = useOrgMutation((_id, deptId: string) => orgApi.deleteRow('departments', deptId));
  const canEdit = can('org.manage');

  const count = (list: { department_id: string | null }[] | undefined, id: string) =>
    list?.filter((x) => x.department_id === id).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <Button className="self-start" onClick={() => setEditing({})}>
          <Plus className="size-4" aria-hidden />
          {t('org.addDepartment')}
        </Button>
      )}
      <FormMessage kind="error" text={remove.error ? friendlyError(remove.error, t) : null} />
      <QueryState loading={departments.isLoading} error={departments.error}>
        {departments.data?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('org.nameEn')}</Th>
                <Th>{t('org.nameAr')}</Th>
                <Th>{t('org.positions')}</Th>
                <Th>{t('org.employees')}</Th>
                {canEdit && <Th className="w-24" />}
              </tr>
            </thead>
            <tbody>
              {departments.data.map((d) => (
                <tr key={d.id}>
                  <Td dir="ltr" className="text-start">
                    {d.name_en}
                  </Td>
                  <Td dir="rtl" className="text-start">
                    {d.name_ar ?? '—'}
                  </Td>
                  <Td>{count(positions.data, d.id)}</Td>
                  <Td>{count(employees.data, d.id)}</Td>
                  {canEdit && (
                    <Td className="whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('common.edit')}
                        onClick={() => setEditing(d)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('common.delete')}
                        onClick={() =>
                          window.confirm(t('org.confirmDeleteDepartment')) && remove.mutate(d.id)
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">{t('org.noDepartments')}</p>
        )}
      </QueryState>
      {editing && <DepartmentDialog department={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DepartmentDialog({
  department,
  onClose,
}: {
  department: Partial<Department>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [nameEn, setNameEn] = useState(department.name_en ?? '');
  const [nameAr, setNameAr] = useState(department.name_ar ?? '');
  const save = useOrgMutation((id, d: Parameters<typeof orgApi.saveDepartment>[1]) =>
    orgApi.saveDepartment(id, d),
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await save.mutateAsync({
      id: department.id,
      name_en: nameEn.trim(),
      name_ar: nameAr.trim() || null,
    });
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={department.id ? t('org.editDepartment') : t('org.addDepartment')}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
      >
        <Field id="dEn" label={t('org.nameEn')}>
          <Input
            id="dEn"
            dir="ltr"
            required
            maxLength={120}
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
          />
        </Field>
        <Field id="dAr" label={t('org.nameAr')}>
          <Input
            id="dAr"
            dir="rtl"
            lang="ar"
            maxLength={120}
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
          />
        </Field>
        <FormMessage kind="error" text={save.error ? friendlyError(save.error, t) : null} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending || !nameEn.trim()}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
