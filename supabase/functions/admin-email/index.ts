import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from 'jsr:@supabase/server@^1';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { firstName, renderEmail, unsubscribeLink, type EmailKind } from '../_shared/emailTemplate.ts';
import { emailToken } from '../_shared/emailLink.ts';

/**
 * Sends the Admin Hub's emails through YouDO's Gmail (secrets YOUDO_MAIL_USER
 * and YOUDO_MAIL_APP_PASSWORD, a Google app password), never the Gmail that
 * sends sign-in mails, so a big send can't hold up confirmations.
 *
 * Body:
 * - { action: 'test', kind, subject, body }: one copy to the caller's own address.
 * - { action: 'send', sendId }: the next few of a send written by
 *   admin_email_create() (supabase/admin_email.sql), about one a second; the
 *   app calls again while some are waiting. Answers { sent, failed, waiting, leftToday }.
 * Who may send what is checked by the SQL functions, called as the signed-in person;
 * addresses are read with the service key and never reach the app.
 */
const BATCH = 8;
const GAP_MS = 1100;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Mailer = { send: (to: string, mail: { subject: string; html: string; text: string }, stop?: string) => Promise<void>; close: () => Promise<void> };

function mailer(): Mailer {
  const user = Deno.env.get('YOUDO_MAIL_USER');
  const password = Deno.env.get('YOUDO_MAIL_APP_PASSWORD');
  if (!user || !password) throw new MailSetupError('Email isn’t set up yet: add YOUDO_MAIL_USER and YOUDO_MAIL_APP_PASSWORD in Supabase secrets.');
  const client = new SMTPClient({
    connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: user, password: password.replace(/\s+/g, '') } },
  });
  return {
    async send(to, mail, stop) {
      await client.send({
        from: `YouDO <${user}>`,
        to,
        subject: mail.subject,
        content: mail.text,
        html: mail.html,
        headers: stop ? { 'List-Unsubscribe': `<${stop}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {},
      });
    },
    // close() may return nothing or reject once the connection is already gone; either is fine.
    close: async () => { try { await client.close(); } catch { /* already closed */ } },
  };
}

class MailSetupError extends Error {}

/** Gmail turning the login away: wrong address or app password, or the account paused. */
const refusedLogin = (error: unknown) => /auth|535|534|username and password|credentials|login/i.test(String(error instanceof Error ? error.message : error));
const LOGIN_REFUSED = 'Gmail refused the login. Check YOUDO_MAIL_USER and the app password in Supabase secrets; nothing was sent.';

const stopUrl = async (userId: string) => {
  const base = Deno.env.get('SUPABASE_URL');
  const token = await emailToken(userId);
  return { page: unsubscribeLink(userId, token), oneClick: `${base}/functions/v1/email-stop?u=${userId}&t=${encodeURIComponent(token)}` };
};

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') return Response.json({ ok: false, error: 'Method not allowed.' }, { status: 405 });
    const body = await request.json().catch(() => null) as
      { action?: string; kind?: EmailKind; subject?: string; body?: string; sendId?: string } | null;

    try {
      if (body?.action === 'test') {
        const { data: self, error } = await context.supabase.rpc('admin_email_self');
        if (error || !self?.email) return Response.json({ ok: false, error: error?.message ?? 'Admins only.' }, { status: 403 });
        if (self.left_today < 1) return Response.json({ ok: false, error: 'Today’s limit is used up. Try tomorrow.' });
        const kind: EmailKind = body.kind === 'thanks' || body.kind === 'note' ? body.kind : 'update';
        const links = await stopUrl(self.user_id);
        const mail = renderEmail({
          kind, subject: `[Test] ${body.subject ?? ''}`, body: body.body ?? '',
          name: firstName(self.name), amount: kind === 'thanks' ? Number(self.amount) || undefined : undefined, signer: self.name ?? undefined,
          unsubscribeUrl: links.page,
        });
        const out = mailer();
        try { await out.send(self.email, mail); } finally { await out.close(); }
        return Response.json({ ok: true, to: self.email });
      }

      if (body?.action === 'send' && body.sendId) {
        const { data: info, error } = await context.supabase.rpc('admin_email_may_send', { send: body.sendId });
        if (error) return Response.json({ ok: false, error: error.message }, { status: 403 });
        const room = Math.min(BATCH, Number(info.left_today) || 0);
        if (room < 1) return Response.json({ ok: false, error: 'Today’s limit is used up. Send the rest tomorrow.', ...(await progress(context.supabaseAdmin, body.sendId)) });

        const out = mailer();
        const { data: batch, error: claimError } = await context.supabaseAdmin.rpc('email_claim_batch', { send: body.sendId, batch_size: room });
        if (claimError) throw claimError;
        let refused = false;
        // Gmail's own Unsubscribe header marks a mailing: kept for Everyone and Backers, left off an email to
        // picked people so it reads as a personal one. The footer's Stop these emails link is in every email.
        // An older server that doesn't say the audience keeps the header.
        const mailing = info.audience !== 'people';
        try {
          for (const [index, person] of ((batch ?? []) as { user_id: string; email: string; display_name: string | null; amount: number | null }[]).entries()) {
            if (refused) { await mark(context.supabaseAdmin, body.sendId, person.user_id, 'retry'); continue; }
            try {
              const links = await stopUrl(person.user_id);
              const mail = renderEmail({
                kind: info.kind, subject: info.subject, body: info.body,
                name: firstName(person.display_name), amount: person.amount ?? undefined, signer: info.signer ?? undefined,
                unsubscribeUrl: links.page,
              });
              await out.send(person.email, mail, mailing ? links.oneClick : undefined);
              await mark(context.supabaseAdmin, body.sendId, person.user_id, 'sent');
            } catch (sendError) {
              if (refusedLogin(sendError)) { refused = true; await mark(context.supabaseAdmin, body.sendId, person.user_id, 'retry'); continue; }
              console.warn('email not sent', sendError);
              await mark(context.supabaseAdmin, body.sendId, person.user_id, 'failed', sendError instanceof Error ? sendError.message : 'Not sent');
            }
            if (index < (batch?.length ?? 0) - 1) await sleep(GAP_MS);
          }
        } finally {
          await out.close();
        }
        const now = await progress(context.supabaseAdmin, body.sendId);
        return Response.json(refused ? { ok: false, error: LOGIN_REFUSED, ...now } : { ok: true, ...now });
      }

      return Response.json({ ok: false, error: 'Nothing to do.' }, { status: 400 });
    } catch (error) {
      if (error instanceof MailSetupError) return Response.json({ ok: false, error: error.message });
      if (refusedLogin(error)) return Response.json({ ok: false, error: LOGIN_REFUSED });
      console.error('admin-email failed', error);
      return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Sending failed.' }, { status: 500 });
    }
  }),
};

type Admin = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>; from: (table: string) => { select: (columns: string) => { eq: (column: string, value: string) => PromiseLike<{ data: unknown }> } } };

async function mark(admin: Admin, send: string, person: string, outcome: 'sent' | 'failed' | 'retry', why?: string) {
  await admin.rpc('email_mark', { send, person, outcome, why: why ?? null });
}

async function progress(admin: Admin, send: string) {
  const { data } = await admin.from('email_recipients').select('status').eq('send_id', send);
  const rows = (data ?? []) as { status: string }[];
  const [{ data: today }, { data: limit }] = await Promise.all([admin.rpc('email_sent_today', {}), admin.rpc('email_daily_limit', {})]);
  return {
    total: rows.length,
    sent: rows.filter((row) => row.status === 'sent').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    waiting: rows.filter((row) => row.status === 'waiting' || row.status === 'sending').length,
    leftToday: Math.max(0, (Number(limit) || 0) - (Number(today) || 0)),
  };
}
