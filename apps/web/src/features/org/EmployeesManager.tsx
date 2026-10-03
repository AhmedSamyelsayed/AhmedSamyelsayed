import { Mail, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/Field';
import { FormMessage } from '@/components/FormMessage';
import { QueryState } from '@/components/QueryState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, Td, Th } from '@/components/ui/table';
import { useCan } from '@/features/company/useCan';
import { InviteDialog } from '@/features/members/InviteDialog';
import { friendlyError } from '@/lib/errors';
import { useFormatDate, useLocalizedName } from '@/lib/useDate';
import {
  orgApi,
  useDepartments,
  useEmployees,
  useOrgMutation,
  usePositions,
  type Employee,
} from './api';
import { descendantsOf } from './hierarchy';
import { ImportDialog } from './ImportDialog';

export function EmployeesManager() {
  const { t } = useTranslation();
  const can = useCan();
  const name = useLocalizedName();
  const formatDate = useFormatDate();
  const employees = useEmployees();
  const positions = usePositions();
  const departments = useDepartments();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Partial<Employee> | null>(null);
  const [inviting, setInviting] = useState<Employee | null>(null);
  const [importing, setImporting] = useState(false);
  const remove = useOrgMutation((_id, employeeId: string) =>
    orgApi.deleteRow('employees', employeeId),
  );
  const canEdit = can('employees.write');
  const canInvite = can('users.manage');

  const positionById = useMemo(
    () => new Map(positions.data?.map((p) => [p.id, p]) ?? []),
    [positions.data],
  );
  const deptById = useMemo(
    () => new Map(departments.data?.map((d) => [d.id, d]) ?? []),
    [departments.data],
  );
  const empById = useMemo(
    () => new Map(employees.data?.map((e) => [e.id, e]) ?? []),
    [employees.data],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees.data ?? [];
    return (employees.data ?? []).filter((e) =>
      [e.code, e.full_name, e.work_email ?? ''].some((v) => v.toLowerCase().includes(q)),
    );
  }, [employees.data, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="ps-9"
            placeholder={t('org.searchEmployees')}
            aria-label={t('org.searchEmployees')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {canEdit && (
          <>
            <Button variant="outline" onClick={() => setImporting(true)}>
              {t('import.button')}
            </Button>
            <Button onClick={() => setEditing({ employment_type: 'FT', status: 'active' })}>
              <Plus className="size-4" aria-hidden />
              {t('org.addEmployee')}
            </Button>
          </>
        )}
      </div>
      <FormMessage kind="error" text={remove.error ? friendlyError(remove.error, t) : null} />
      <QueryState loading={employees.isLoading} error={employees.error}>
        {filtered.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('org.code')}</Th>
                <Th>{t('org.fullName')}</Th>
                <Th>{t('org.position')}</Th>
                <Th>{t('org.department')}</Th>
                <Th>{t('org.manager')}</Th>
                <Th>{t('org.type')}</Th>
                <Th>{t('org.startDate')}</Th>
                <Th>{t('org.account')}</Th>
                {canEdit && <Th className="w-32" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const pos = e.position_id ? positionById.get(e.position_id) : undefined;
                const dept = e.department_id ? deptById.get(e.department_id) : undefined;
                const mgr = e.manager_employee_id ? empById.get(e.manager_employee_id) : undefined;
                return (
                  <tr key={e.id} className={e.status === 'inactive' ? 'opacity-60' : undefined}>
                    <Td dir="ltr" className="font-mono text-xs">
                      {e.code}
                    </Td>
                    <Td>
                      {e.full_name}
                      {e.status === 'inactive' && (
                        <Badge className="ms-2">{t('org.inactive')}</Badge>
                      )}
                    </Td>
                    <Td>{pos ? name(pos.title_en, pos.title_ar) : '—'}</Td>
                    <Td>{dept ? name(dept.name_en, dept.name_ar) : '—'}</Td>
                    <Td>
                      {mgr ? (
                        mgr.full_name
                      ) : (
                        <span className="text-muted-foreground">{t('org.byPosition')}</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{t(`org.${e.employment_type}`)}</Td>
                    <Td className="whitespace-nowrap">{formatDate(e.start_date)}</Td>
                    <Td className="whitespace-nowrap">
                      {e.user_id ? (
                        <Badge tone="success">{t('org.linked')}</Badge>
                      ) : (
                        <Badge>{t('org.notLinked')}</Badge>
                      )}
                    </Td>
                    {canEdit && (
                      <Td className="whitespace-nowrap">
                        {canInvite && !e.user_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('members.invite')}
                            title={t('members.invite')}
                            onClick={() => setInviting(e)}
                          >
                            <Mail className="size-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('common.edit')}
                          onClick={() => setEditing(e)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('common.delete')}
                          onClick={() =>
                            window.confirm(t('org.confirmDeleteEmployee')) && remove.mutate(e.id)
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
          <p className="text-sm text-muted-foreground">{t('org.noEmployees')}</p>
        )}
      </QueryState>
      {editing && <EmployeeDialog employee={editing} onClose={() => setEditing(null)} />}
      {inviting && (
        <InviteDialog
          open
          onClose={() => setInviting(null)}
          email={inviting.work_email ?? ''}
          employeeId={inviting.id}
        />
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

function EmployeeDialog({
  employee,
  onClose,
}: {
  employee: Partial<Employee>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const name = useLocalizedName();
  const positions = usePositions();
  const departments = useDepartments();
  const employees = useEmployees();
  const [form, setForm] = useState({
    code: employee.code ?? '',
    full_name: employee.full_name ?? '',
    work_email: employee.work_email ?? '',
    position_id: employee.position_id ?? '',
    department_id: employee.department_id ?? '',
    manager_employee_id: employee.manager_employee_id ?? '',
    employment_type: employee.employment_type ?? 'FT',
    start_date: employee.start_date ?? '',
    status: employee.status ?? 'active',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = useOrgMutation((id, input: Parameters<typeof orgApi.saveEmployee>[1]) =>
    orgApi.saveEmployee(id, input),
  );

  const excluded = useMemo(
    () =>
      employee.id
        ? descendantsOf(employees.data ?? [], (e) => e.manager_employee_id, employee.id)
        : new Set<string>(),
    [employees.data, employee.id],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await save.mutateAsync({
      id: employee.id,
      code: form.code.trim(),
      full_name: form.full_name.trim(),
      work_email: form.work_email.trim().toLowerCase() || null,
      position_id: form.position_id || null,
      department_id: form.department_id || null,
      manager_employee_id: form.manager_employee_id || null,
      employment_type: form.employment_type as 'FT' | 'PT',
      start_date: form.start_date || null,
      status: form.status as 'active' | 'inactive',
    });
    onClose();
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={employee.id ? t('org.editEmployee') : t('org.addEmployee')}
    >
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
      >
        <Field id="eCode" label={t('org.code')}>
          <Input
            id="eCode"
            dir="ltr"
            required
            maxLength={40}
            value={form.code}
            onChange={set('code')}
          />
        </Field>
        <Field id="eName" label={t('org.fullName')}>
          <Input
            id="eName"
            required
            maxLength={160}
            value={form.full_name}
            onChange={set('full_name')}
          />
        </Field>
        <Field id="eEmail" label={t('org.workEmail')}>
          <Input
            id="eEmail"
            type="email"
            dir="ltr"
            value={form.work_email}
            onChange={set('work_email')}
          />
        </Field>
        <Field id="eStart" label={t('org.startDate')}>
          <Input id="eStart" type="date" value={form.start_date} onChange={set('start_date')} />
        </Field>
        <Field id="ePos" label={t('org.position')}>
          <Select id="ePos" value={form.position_id} onChange={set('position_id')}>
            <option value="">—</option>
            {positions.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {name(p.title_en, p.title_ar)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="eDept" label={t('org.department')} hint={t('org.departmentHint')}>
          <Select id="eDept" value={form.department_id} onChange={set('department_id')}>
            <option value="">—</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {name(d.name_en, d.name_ar)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="eMgr" label={t('org.managerOverride')} hint={t('org.managerOverrideHint')}>
          <Select id="eMgr" value={form.manager_employee_id} onChange={set('manager_employee_id')}>
            <option value="">{t('org.byPosition')}</option>
            {employees.data
              ?.filter((e) => !excluded.has(e.id) && e.status === 'active')
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} ({e.code})
                </option>
              ))}
          </Select>
        </Field>
        <Field id="eType" label={t('org.type')}>
          <Select id="eType" value={form.employment_type} onChange={set('employment_type')}>
            <option value="FT">{t('org.FT')}</option>
            <option value="PT">{t('org.PT')}</option>
          </Select>
        </Field>
        <Field id="eStatus" label={t('org.status')}>
          <Select id="eStatus" value={form.status} onChange={set('status')}>
            <option value="active">{t('org.active')}</option>
            <option value="inactive">{t('org.inactive')}</option>
          </Select>
        </Field>
        <div className="flex flex-col gap-2 md:col-span-2">
          <FormMessage kind="error" text={save.error ? friendlyError(save.error, t) : null} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={save.isPending || !form.code.trim() || !form.full_name.trim()}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
