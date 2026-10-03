import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Tabs } from '@/components/Tabs';
import { DepartmentsManager } from './DepartmentsManager';
import { EmployeesManager } from './EmployeesManager';
import { OrgChart } from './OrgChart';
import { PositionsManager } from './PositionsManager';

type Tab = 'chart' | 'departments' | 'positions' | 'employees';
const TABS: Tab[] = ['chart', 'departments', 'positions', 'employees'];

export function OrgPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((x) => x === params.get('tab')) ?? 'chart') as Tab;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={t('nav.org')} description={t('org.description')} />
      <Tabs
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        tabs={TABS.map((v) => ({ value: v, label: t(`org.tab.${v}`) }))}
      />
      {tab === 'chart' && <OrgChart />}
      {tab === 'departments' && <DepartmentsManager />}
      {tab === 'positions' && <PositionsManager />}
      {tab === 'employees' && <EmployeesManager />}
    </div>
  );
}
