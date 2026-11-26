import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';
import { EMAIL_KINDS, type EmailKind } from '../../supabase/functions/_shared/emailTemplate.ts';

/**
 * Admin Hub → People → Email and Owner → Backers (supabase/admin_email.sql and
 * the admin-email edge function). The template itself lives in
 * supabase/functions/_shared/emailTemplate.ts, shared with the sender.
 */
export type EmailAudience = 'everyone' | 'backers' | 'people';

export interface EmailSendSummary {
  id: string;
  kind: EmailKind;
  audience: EmailAudience;
  subject: string;
  createdAt: string;
  sentBy?: string;
  sentByName?: string;
  total: number;
  sent: number;
  failed: number;
  waiting: number;
}

export interface EmailOverview {
  limit: number;
  sentToday: number;
  everyone: number;
  /** The owner only. */
  backers?: number;
  stopped: number;
  sends: EmailSendSummary[];
}

export interface EmailProgress { total: number; sent: number; failed: number; waiting: number; leftToday: number }

export interface Backer {
  id: string;
  username?: string;
  name?: string;
  avatarUrl?: string;
  total: number;
  claims: number;
  since?: string;
  thankedAt?: string;
  stopped: boolean;
  confirmed: boolean;
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0);
const record = (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
const KINDS: EmailKind[] = ['update', 'thanks', 'note'];
const AUDIENCES: EmailAudience[] = ['everyone', 'backers', 'people'];

export function parseEmailOverview(raw: unknown): EmailOverview {
  const row = record(raw);
  return {
    limit: num(row.limit),
    sentToday: num(row.sent_today),
    everyone: num(row.everyone),
    backers: row.backers === null || row.backers === undefined ? undefined : num(row.backers),
    stopped: num(row.stopped),
    sends: (Array.isArray(row.sends) ? row.sends : []).map((item) => {
      const send = record(item);
      return {
        id: String(send.id ?? ''),
        kind: KINDS.includes(send.kind as EmailKind) ? send.kind as EmailKind : 'update',
        audience: AUDIENCES.includes(send.audience as EmailAudience) ? send.audience as EmailAudience : 'everyone',
        subject: String(send.subject ?? ''),
        createdAt: String(send.created_at ?? ''),
        sentBy: text(send.sent_by),
        sentByName: text(send.sent_by_name),
        total: num(send.total), sent: num(send.sent), failed: num(send.failed), waiting: num(send.waiting),
      };
    }).filter((send) => send.id),
  };
}

export function parseBackers(raw: unknown): Backer[] {
  return (Array.isArray(raw) ? raw : []).map((item) => {
    const row = record(item);
    return {
      id: String(row.user_id ?? ''),
      username: text(row.username),
      name: text(row.display_name),
      avatarUrl: text(row.avatar_url),
      total: num(row.total),
      claims: num(row.claims),
      since: text(row.first_at),
      thankedAt: text(row.thanked_at),
      stopped: row.stopped === true,
      confirmed: row.confirmed !== false,
    };
  }).filter((backer) => backer.id);
}

/** Backers' totals: given in all, how many, and the average of those who gave. */
export function backerTotals(backers: Backer[]) {
  const givers = backers.filter((backer) => backer.total > 0);
  const total = givers.reduce((sum, backer) => sum + backer.total, 0);
  return { total, count: backers.length, average: givers.length ? Math.round(total / givers.length) : 0, unthanked: backers.filter((backer) => !backer.thankedAt).length };
}

/** "Sent to 142" / "Sending · 40 of 142" / "Stopped at 40 of 142 · 102 left" for a send in the list. */
export function sendStatus(send: Pick<EmailSendSummary, 'total' | 'sent' | 'failed' | 'waiting'>, running = false): string {
  const done = send.sent + send.failed;
  if (running) return `Sending · ${done} of ${send.total}`;
  if (send.waiting > 0) return `${send.waiting} not sent yet · ${send.sent} of ${send.total} sent`;
  const failed = send.failed ? ` · ${send.failed} didn’t arrive` : '';
  return `Sent to ${send.sent}${send.total !== send.sent ? ` of ${send.total}` : ''}${failed}`;
}

const failure = (error: { message?: string } | null | undefined, fallback: string) =>
  error?.message?.includes('Could not find the function') ? 'Email needs a server update first (admin_email.sql).' : error?.message || fallback;

export async function fetchEmailOverview(): Promise<EmailOverview> {
  const { data, error } = await supabase.rpc('admin_email_overview');
  if (error) throw new Error(failure(error, 'Could not open Email.'));
  return parseEmailOverview(data);
}

export async function fetchEmailReach(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const { data, error } = await supabase.rpc('admin_email_reach', { chosen: ids });
  if (error) throw new Error(failure(error, 'Could not check who can get it.'));
  return num(data);
}

export async function createEmailSend(input: { kind: EmailKind; audience: EmailAudience; people: string[]; subject: string; body: string }): Promise<{ id: string; total: number }> {
  const { data, error } = await supabase.rpc('admin_email_create', {
    email_kind: input.kind, email_audience: input.audience, chosen: input.audience === 'people' ? input.people : null,
    email_subject: input.subject.trim(), email_body: input.body,
  });
  if (error) throw new Error(failure(error, 'Could not start the email.'));
  const row = record(data);
  return { id: String(row.id ?? ''), total: num(row.total) };
}

export async function fetchBackers(): Promise<Backer[]> {
  const { data, error } = await supabase.rpc('owner_backers');
  if (error) throw new Error(failure(error, 'Could not load backers.'));
  return parseBackers(data);
}

async function callSender<T>(body: Record<string, unknown>): Promise<T & { ok: boolean; error?: string }> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('Sign in again first.');
  const response = await fetch(`${supabaseUrl}/functions/v1/admin-email`, {
    method: 'POST',
    headers: { apikey: supabaseAnonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!response) throw new Error('No connection. Nothing more was sent; try again.');
  if (response.status === 404) throw new Error('Email needs a server update first (the admin-email function).');
  const result = await response.json().catch(() => null) as (T & { ok: boolean; error?: string }) | null;
  if (!result) throw new Error('The server did not answer. Open Email again to see what went.');
  return result;
}

/** One copy to your own address, marked [Test]. */
export async function sendTestEmail(kind: EmailKind, subject: string, body: string): Promise<string> {
  const result = await callSender<{ to?: string }>({ action: 'test', kind, subject, body });
  if (!result.ok) throw new Error(result.error || 'The test was not sent.');
  return result.to ?? 'your address';
}

/** The next few of a send; call again while some wait. */
export async function sendNextEmails(sendId: string): Promise<EmailProgress & { ok: boolean; error?: string }> {
  const result = await callSender<Partial<EmailProgress>>({ action: 'send', sendId });
  return {
    ok: result.ok, error: result.error,
    total: num(result.total), sent: num(result.sent), failed: num(result.failed), waiting: num(result.waiting), leftToday: num(result.leftToday),
  };
}

/** A saved text to start an email from (supabase/admin_email.sql, email_templates). */
export interface EmailTemplate { id: string; name: string; kind: EmailKind; subject: string; body: string }

/**
 * The words a kind starts from while nothing is written yet (v9.1): a thank-you
 * from the owner's own thank-you template when there is one, else the built-in
 * text; a note from "Hi {name},".
 */
export function startingText(kind: EmailKind, templates: EmailTemplate[] | null): { subject: string; body: string; templateId?: string } {
  const template = kind === 'thanks' ? templates?.find((item) => item.kind === 'thanks') : undefined;
  return template
    ? { subject: template.subject, body: template.body, templateId: template.id }
    : { subject: EMAIL_KINDS[kind].subject, body: EMAIL_KINDS[kind].body };
}

export function parseTemplates(raw: unknown): EmailTemplate[] {
  return (Array.isArray(raw) ? raw : []).map((item) => {
    const row = record(item);
    return {
      id: String(row.id ?? ''),
      name: String(row.name ?? '').trim(),
      kind: KINDS.includes(row.kind as EmailKind) ? row.kind as EmailKind : 'update',
      subject: String(row.subject ?? ''),
      body: String(row.body ?? ''),
    };
  }).filter((template) => template.id && template.name);
}

/** Templates, or none on a server without them yet (the screen then uses the built-in texts). */
export async function fetchTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await supabase.rpc('admin_email_templates');
  if (error) return [];
  return parseTemplates(data);
}

export async function saveTemplate(template: Omit<EmailTemplate, 'id'> & { id?: string }): Promise<string> {
  const { data, error } = await supabase.rpc('owner_save_email_template', {
    template_id: template.id ?? null, template_name: template.name, template_kind: template.kind,
    template_subject: template.subject, template_body: template.body,
  });
  if (error) throw new Error(failure(error, 'Could not save the template.'));
  return String(data ?? '');
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.rpc('owner_delete_email_template', { template_id: id });
  if (error) throw new Error(failure(error, 'Could not delete the template.'));
}

export type RecipientStatus = 'sent' | 'waiting' | 'failed';
export interface EmailRecipient { id: string; name?: string; username?: string; status: RecipientStatus; sentAt?: string; error?: string }
export interface EmailSendDetail extends Pick<EmailSendSummary, 'id' | 'kind' | 'audience' | 'subject' | 'createdAt' | 'sentBy' | 'sentByName'> {
  body: string;
  recipients: EmailRecipient[];
}

export function parseSendDetail(raw: unknown): EmailSendDetail {
  const row = record(raw);
  return {
    id: String(row.id ?? ''),
    kind: KINDS.includes(row.kind as EmailKind) ? row.kind as EmailKind : 'update',
    audience: AUDIENCES.includes(row.audience as EmailAudience) ? row.audience as EmailAudience : 'everyone',
    subject: String(row.subject ?? ''),
    body: String(row.body ?? ''),
    createdAt: String(row.created_at ?? ''),
    sentBy: text(row.sent_by),
    sentByName: text(row.sent_by_name),
    recipients: (Array.isArray(row.recipients) ? row.recipients : []).map((item) => {
      const person = record(item);
      // 'sending' is a moment inside a batch: it still counts as waiting here.
      const status: RecipientStatus = person.status === 'sent' ? 'sent' : person.status === 'failed' ? 'failed' : 'waiting';
      return { id: String(person.user_id ?? ''), name: text(person.name), username: text(person.username), status, sentAt: text(person.sent_at), error: text(person.error) };
    }).filter((person) => person.id),
  };
}

export async function fetchSendDetail(id: string): Promise<EmailSendDetail> {
  const { data, error } = await supabase.rpc('admin_email_send_detail', { send: id });
  if (error) throw new Error(failure(error, 'Could not open this email.'));
  return parseSendDetail(data);
}

/** The real person an email preview is shown as, with what the sender fills in for them. */
export interface PreviewRecipient {
  /** For {name}: their first name, as the sender reads it; none means the sender writes "there". */
  name?: string;
  /** For {amount}: their own approved total; none means the sender writes "support". */
  amount?: number;
  /** Who it is, for the line above the preview. */
  label: string;
}

// The sender fills {name} from a display name only, never an @username.
// {name} comes from a name only: an @username or an email (the owner's label for a nameless account) gets "there".
const first = (value?: string) => (value && !value.includes('@') && value !== 'No name yet' ? value.trim().split(/\s+/)[0] || undefined : undefined);

/**
 * A preview is the email as one real recipient gets it, never made-up values:
 * the first picked person, the first backer for Backers, yourself for Everyone,
 * or after sending, the first person it went to. A backer's amount is their
 * own approved total, as the sender looks it up.
 */
export function previewRecipient(input: {
  audience: EmailAudience;
  picked?: { id: string; label: string }[];
  recipients?: EmailRecipient[];
  backers?: Backer[] | null;
  self?: { id: string; name?: string };
}): PreviewRecipient {
  const amountFor = (id?: string) => (id ? input.backers?.find((b) => b.id === id)?.total || undefined : undefined);
  const sent = input.recipients?.find((person) => person.status === 'sent') ?? input.recipients?.[0];
  if (sent) return { name: first(sent.name), amount: amountFor(sent.id), label: sent.name ?? (sent.username ? `@${sent.username}` : 'the first person') };
  const picked = input.audience === 'people' ? input.picked?.[0] : undefined;
  if (picked) return { name: first(picked.label), amount: amountFor(picked.id), label: picked.label };
  if (input.audience === 'backers') {
    const backer = input.backers?.find((b) => b.confirmed && !b.stopped) ?? input.backers?.[0];
    if (backer) return { name: first(backer.name), amount: backer.total || undefined, label: backer.name ?? `@${backer.username ?? 'a backer'}` };
    return { label: 'a backer' };
  }
  return { name: first(input.self?.name), amount: amountFor(input.self?.id), label: 'you' };
}

/** Your own names, as the sender reads them: {name} from the display name; a Note signed with it (or your @username). */
export async function fetchSelfName(id: string): Promise<{ name?: string; signer?: string }> {
  const { data } = await supabase.from('profiles').select('display_name, username').eq('id', id).maybeSingle();
  const row = record(data);
  return { name: text(row.display_name), signer: text(row.display_name) ?? text(row.username) };
}
