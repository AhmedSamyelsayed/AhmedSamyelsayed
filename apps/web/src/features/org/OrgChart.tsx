import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryState } from '@/components/QueryState';
import { useLocalizedName } from '@/lib/useDate';
import { useDepartments, useEmployees, usePositions, type Employee, type Position } from './api';
import { buildTree, type TreeNode } from './hierarchy';

/** Position tree with the people holding each position. */
export function OrgChart() {
  const { t } = useTranslation();
  const positions = usePositions();
  const employees = useEmployees();
  const departments = useDepartments();
  const name = useLocalizedName();

  const tree = useMemo(
    () =>
      buildTree(
        positions.data ?? [],
        (p) => p.reports_to_position_id,
        (p) => p.title_en,
      ),
    [positions.data],
  );
  const holders = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const e of employees.data ?? []) {
      if (e.position_id && e.status === 'active')
        map.set(e.position_id, [...(map.get(e.position_id) ?? []), e]);
    }
    return map;
  }, [employees.data]);
  const empById = useMemo(
    () => new Map(employees.data?.map((e) => [e.id, e]) ?? []),
    [employees.data],
  );
  const deptById = useMemo(
    () => new Map(departments.data?.map((d) => [d.id, d]) ?? []),
    [departments.data],
  );

  function renderNode(node: TreeNode<Position>) {
    const p = node.item;
    const dept = p.department_id ? deptById.get(p.department_id) : undefined;
    const people = holders.get(p.id) ?? [];
    return (
      <li key={p.id} className="relative">
        <div className="mb-2 inline-flex min-w-56 flex-col rounded-lg border bg-card px-3 py-2">
          <span className="font-medium">{name(p.title_en, p.title_ar)}</span>
          {dept && (
            <span className="text-xs text-muted-foreground">
              {name(dept.name_en, dept.name_ar)}
            </span>
          )}
          <span className="mt-1 text-sm">
            {people.length ? (
              people.map((e) => {
                const mgr = e.manager_employee_id ? empById.get(e.manager_employee_id) : undefined;
                return (
                  <span key={e.id} className="block">
                    {e.full_name}
                    {mgr && (
                      <span className="text-xs text-primary">
                        {' '}
                        · {t('org.reportsToPerson', { name: mgr.full_name })}
                      </span>
                    )}
                  </span>
                );
              })
            ) : (
              <span className="text-xs text-amber-400">{t('org.vacant')}</span>
            )}
          </span>
        </div>
        {node.children.length > 0 && (
          <ul className="ms-6 border-s ps-4">{node.children.map(renderNode)}</ul>
        )}
      </li>
    );
  }

  return (
    <QueryState
      loading={positions.isLoading || employees.isLoading}
      error={positions.error ?? employees.error}
    >
      {tree.length ? (
        <ul className="flex flex-col gap-2">{tree.map(renderNode)}</ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('org.noPositions')}</p>
      )}
    </QueryState>
  );
}
