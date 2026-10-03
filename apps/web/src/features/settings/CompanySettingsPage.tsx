import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Tabs } from '@/components/Tabs';
import { Card, CardContent } from '@/components/ui/card';
import { CompanyProfileForm } from './CompanyProfileForm';
import { WorkingTimeForm } from './WorkingTimeForm';

export function CompanySettingsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'profile' | 'time'>('profile');
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={t('settings.companyTitle')} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'profile', label: t('settings.profile') },
          { value: 'time', label: t('settings.workingTime') },
        ]}
      />
      <Card>
        <CardContent className="pt-6">
          {tab === 'profile' ? <CompanyProfileForm /> : <WorkingTimeForm />}
        </CardContent>
      </Card>
    </div>
  );
}
