// Sends the email for an invitation that already exists in public.company_invitations.
//
// Authorization: the invitation is read with the CALLER's JWT, so RLS only
// returns it when the caller holds users.manage in that company. The service
// role is used only afterwards, to send the auth email.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (provided by
// Supabase), APP_URL (e.g. https://figure.aseautomation.online), APP_ORIGINS.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') ?? 'https://figure.aseautomation.online';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'method_not_allowed' });

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json(req, 401, { error: 'unauthorized' });

  let invitationId: unknown;
  try {
    ({ invitationId } = await req.json());
  } catch {
    return json(req, 400, { error: 'invalid_json' });
  }
  if (typeof invitationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(invitationId)) {
    return json(req, 400, { error: 'invalid_invitation_id' });
  }

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data: invitation, error } = await asCaller
    .from('company_invitations')
    .select('id, email, accepted_at, revoked_at, expires_at')
    .eq('id', invitationId)
    .maybeSingle();

  if (error || !invitation) return json(req, 404, { error: 'invitation_not_found' });
  if (
    invitation.accepted_at ||
    invitation.revoked_at ||
    new Date(invitation.expires_at) < new Date()
  ) {
    return json(req, 409, { error: 'invitation_not_pending' });
  }

  const redirectTo = `${APP_URL}/invitations`;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // New users get an invite email that creates their account on click.
  const invited = await admin.auth.admin.inviteUserByEmail(invitation.email, { redirectTo });
  if (!invited.error) return json(req, 200, { sent: true, method: 'invite' });

  // Existing users get a magic link; the invitation shows up after sign-in.
  const otp = await createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  }).auth.signInWithOtp({
    email: invitation.email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });
  if (otp.error) return json(req, 502, { error: 'email_failed' });
  return json(req, 200, { sent: true, method: 'magic_link' });
});
