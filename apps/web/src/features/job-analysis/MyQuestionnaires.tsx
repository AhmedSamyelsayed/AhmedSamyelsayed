import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCompany } from '@/features/company/CompanyProvider';
import { supabase } from '@/lib/supabase';

/** Dashboard card: questionnaires assigned to the signed-in user. */
export function MyQuestionnaires() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { active } = useCompany();
  const sessions = useQuery({
    queryKey: ['ja', active?.company.id, 'mine', user?.id],
    enabled: !!user && !!active,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ja_sessions')
        .select('id, position_id, status')
        .eq('company_id', active!.company.id)
        .eq('respondent_user_id', user!.id)
        .eq('status', 'open');
      if (error) throw error;
      return data;
    },
  });
  if (!sessions.data?.length) return null;
  return (
    <Card className="border-primary/50">
      <CardHeader>
        <CardTitle>{t('jobAnalysis.myTitle')}</CardTitle>
        <CardDescription>{t('jobAnalysis.myBody')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {sessions.data.map((s, i) => (
          <Button key={s.id} asChild>
            <Link to={`/app/job-analysis/questionnaire/${s.id}`}>
              {t('jobAnalysis.answerN', { n: i + 1 })}
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
