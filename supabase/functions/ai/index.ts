// AI gateway (CONTEXT.md section 8), Supabase Edge Function edition.
//   POST /functions/v1/ai  { task, companyId, locale, input }
// Verifies the caller's JWT and company membership, enforces a monthly call
// quota, runs one company-scoped task, and logs usage without document text.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (provided by
// Supabase), ANTHROPIC_API_KEY (platform credits), FIGURE_AI_MODEL (default
// claude-opus-5-5), AI_MONTHLY_CALL_LIMIT (default 300), APP_ORIGINS.
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { corsHeaders, json } from '../_shared/cors.ts';
import { AnthropicProvider, estimateCostUsd, type Usage } from '../_shared/ai/provider.ts';
import { PROMPT_VERSION } from '../_shared/ai/prompts.ts';
import { AIError } from '../_shared/ai/run.ts';
import { UnsupportedDocumentError } from '../_shared/ai/extract.ts';
import {
  extractJobAnalysis,
  generateFromQuestionnaire,
  nextQuestions,
  TaskError,
  type TaskDeps,
} from './tasks.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MONTHLY_LIMIT = Number(Deno.env.get('AI_MONTHLY_CALL_LIMIT') ?? 300);

const uuid = z.string().uuid();
const requestSchema = z.discriminatedUnion('task', [
  z.object({
    task: z.literal('extract_job_analysis'),
    companyId: uuid,
    locale: z.enum(['en', 'ar']),
    input: z.object({ documentId: uuid }),
  }),
  z.object({
    task: z.literal('ja_questionnaire_next'),
    companyId: uuid,
    locale: z.enum(['en', 'ar']),
    input: z.object({ sessionId: uuid }),
  }),
  z.object({
    task: z.literal('generate_job_analysis'),
    companyId: uuid,
    locale: z.enum(['en', 'ar']),
    input: z.object({ sessionId: uuid }),
  }),
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'method_not_allowed' });

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json(req, 401, { error: 'unauthorized' });

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, 400, { error: 'invalid_request' });
  const body = parsed.data;

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: auth } = await caller.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return json(req, 401, { error: 'unauthorized' });

  const { data: member } = await caller.rpc('is_member', { _company_id: body.companyId });
  if (member !== true) return json(req, 403, { error: 'forbidden' });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json(req, 503, { error: 'ai_not_configured' });

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from('ai_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', body.companyId)
    .gte('created_at', monthStart.toISOString());
  if ((count ?? 0) >= MONTHLY_LIMIT) return json(req, 429, { error: 'ai_quota_exceeded' });

  const provider = new AnthropicProvider(
    apiKey,
    Deno.env.get('FIGURE_AI_MODEL') ?? 'claude-opus-5-5',
  );
  const started = Date.now();
  let usage: Usage = { tokensIn: 0, tokensOut: 0, cacheRead: 0 };
  let model = provider.model;
  let called = false;

  const log = (status: 'ok' | 'refused' | 'invalid_output' | 'error') =>
    called
      ? admin.from('ai_usage_log').insert({
          company_id: body.companyId,
          user_id: userId,
          provider: provider.name,
          model,
          task: body.task,
          prompt_version: PROMPT_VERSION,
          status,
          tokens_in: usage.tokensIn,
          tokens_out: usage.tokensOut,
          cache_read: usage.cacheRead,
          cost_usd: estimateCostUsd(model, usage),
          ms: Date.now() - started,
        })
      : Promise.resolve();

  const deps: TaskDeps = {
    caller,
    admin,
    provider,
    userId,
    companyId: body.companyId,
    locale: body.locale,
    onUsage: (r) => {
      called = true;
      usage = r.usage;
      model = r.model;
    },
  };

  try {
    const result =
      body.task === 'extract_job_analysis'
        ? await extractJobAnalysis(deps, body.input)
        : body.task === 'ja_questionnaire_next'
          ? await nextQuestions(deps, body.input)
          : await generateFromQuestionnaire(deps, body.input);
    await log('ok');
    return json(req, 200, result);
  } catch (e) {
    if (e instanceof AIError) {
      called = true;
      usage = e.usage;
      model = e.model;
      await log(e.code === 'refused' ? 'refused' : 'invalid_output');
      return json(req, 422, { error: `ai_${e.code}` });
    }
    await log('error');
    if (e instanceof TaskError) return json(req, e.status, { error: e.code });
    if (e instanceof UnsupportedDocumentError) return json(req, 422, { error: e.code });
    console.error('ai task failed', body.task, e instanceof Error ? e.name : 'unknown');
    return json(req, 500, { error: 'internal_error' });
  }
});
