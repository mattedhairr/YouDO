import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { tokenMatches } from '../_shared/emailLink.ts';

/**
 * "Stop these emails": the link at the bottom of every Admin Hub email.
 * No sign-in (verify_jwt = false): the link carries the person's id and a
 * token only YouDO can make (_shared/emailLink.ts).
 *
 * - POST ?u=&t= with Gmail's one-click body (List-Unsubscribe-Post), or
 * - POST { u, t, again? } from email-stop.html on the website
 *   (again: true starts the emails again).
 * Sign-in mails (confirm, reset) are never affected.
 */
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, apikey, authorization',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return Response.json({ ok: false }, { status: 405, headers: cors });
  const url = new URL(request.url);
  const json = (request.headers.get('content-type') ?? '').includes('application/json')
    ? await request.json().catch(() => ({})) as { u?: string; t?: string; again?: boolean }
    : {};
  const userId = json.u ?? url.searchParams.get('u') ?? '';
  const token = json.t ?? url.searchParams.get('t') ?? '';
  if (!(await tokenMatches(userId, token))) {
    return Response.json({ ok: false, error: 'This link is not valid.' }, { status: 400, headers: cors });
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await admin.rpc('email_set_stopped', { person: userId, stopped: json.again !== true });
  if (error) {
    console.error('email-stop failed', error);
    return Response.json({ ok: false, error: 'Could not save that. Try again in a minute.' }, { status: 500, headers: cors });
  }
  return Response.json({ ok: true, stopped: json.again !== true }, { headers: cors });
});
