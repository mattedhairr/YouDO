/**
 * YouDO's email template, shared by the Admin Hub's preview (the app) and the
 * admin-email edge function, so what the preview shows is what people get.
 * A plain letter (v9.1): the "YouDO" wordmark in text over a thin sand line,
 * then the message and a signature, on the mail app's own page. No forced dark
 * page, hidden preview text, badge or remote logo: those read as marketing to
 * spam filters, and Gmail darkens a plain email by itself in dark mode.
 * No imports: Deno and Vite both load this file.
 *
 * The message is plain text, as pasted:
 * - a blank line starts a new paragraph, a single line break stays a break;
 * - a paragraph that is only a link becomes a button;
 * - other links become links, and **words** become bold;
 * - {name} is the person's first name ("there" without one) and {amount} what a
 *   backer gave (₹50), for thank-yous.
 */

/** 'update' (News) is retired: release news lives in the app's own updates. It still renders, for sends made before. */
export type EmailKind = 'update' | 'thanks' | 'note';

/** The looks offered when writing. */
export const OFFERED_KINDS: EmailKind[] = ['thanks', 'note'];

/** A preview shows the footer's Stop link as people see it; this address goes nowhere. */
export const PREVIEW_STOP_URL = 'https://youdo-app.vercel.app/email-stop.html';

export const SITE_URL = 'https://youdo-app.vercel.app';
export const SUBJECT_MAX = 120;
export const BODY_MAX = 6000;

/** What each kind is for, and the text it starts with. */
export const EMAIL_KINDS: Record<EmailKind, { label: string; hint: string; subject: string; body: string }> = {
  update: {
    label: 'News',
    hint: 'Retired. Release news lives in the app’s own updates.',
    subject: '',
    body: 'Hi {name},\n\n\n\n' + SITE_URL,
  },
  thanks: {
    label: 'Thank you',
    hint: 'For backers: {amount} becomes what each one gave, and Backers marks them thanked. It looks like a note: a plain letter signed by you.',
    subject: 'Thank you for backing YouDO',
    body: 'Hi {name},\n\nThank you for backing YouDO. You are one of the very first people to do it, and that means a lot.\n\nYour {amount} helps keep YouDO free, ad-free and growing, and your Founding Backer ring now shows around your picture everywhere in the app.\n\nThank you for believing in YouDO from the start.',
  },
  note: {
    label: 'Note',
    hint: 'For anyone: one person, a few, or everyone. A plain letter signed by you.',
    subject: '',
    body: 'Hi {name},\n\n',
  },
};

export interface EmailContent {
  kind: EmailKind;
  subject: string;
  body: string;
  /** First name; empty for "there". */
  name?: string;
  /** What a backer gave in rupees, for {amount}. */
  amount?: number;
  /** Who signs a thank-you or a note (the sender's name in YouDO). */
  signer?: string;
  /** The person's own "Stop these emails" link; a preview leaves it out. */
  unsubscribeUrl?: string;
}

const escape = (text: string) => text
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const URL_ONLY = /^https?:\/\/\S+$/i;
const URL_ANYWHERE = /https?:\/\/[^\s<]+[^\s<.,;:!?)'"]/gi;

export function formatRupees(amount: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount)}`;
}

/** {name} and {amount}, filled for one person. */
export function fillPlaceholders(text: string, name?: string, amount?: number): string {
  return text
    .replace(/\{name\}/gi, name?.trim() || 'there')
    .replace(/\{amount\}/gi, amount && amount > 0 ? formatRupees(amount) : 'support');
}

/** The first word of a display name, for {name}. */
export function firstName(displayName?: string | null): string {
  const word = (displayName ?? '').trim().split(/\s+/)[0] ?? '';
  return word.replace(/^@/, '').slice(0, 40);
}

/** A problem with the subject or text, or null when it can be sent. */
export function emailProblem(subject: string, body: string): string | null {
  if (!subject.trim()) return 'Add a subject.';
  if (subject.trim().length > SUBJECT_MAX) return `Keep the subject under ${SUBJECT_MAX} characters.`;
  if (!body.trim() || !body.replace(/\{name\}/gi, '').replace(/hi\s*,?/i, '').trim()) return 'Write the message.';
  if (body.length > BODY_MAX) return `Keep the message under ${BODY_MAX} characters.`;
  return null;
}

/** A button's words for a link on its own line. */
function buttonLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (url.startsWith(SITE_URL)) return 'Open YouDO';
    if (host === 'github.com') return 'See it on GitHub';
    if (host === 't.me') return 'Open in Telegram';
    if (host.includes('youtube') || host === 'youtu.be') return 'Watch on YouTube';
    return `Open ${host}`;
  } catch {
    return 'Open the link';
  }
}

const INK = '#24221f';
const SAND = '#d8b47a';
const MUTED = '#7a736a';

const inline = (line: string) => escape(line)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(URL_ANYWHERE, (url) => `<a href="${url}" style="color:#8a6420;text-decoration:underline;">${url}</a>`);

/** The message as paragraphs and buttons. */
export function bodyBlocks(text: string): ({ kind: 'text'; html: string; plain: string } | { kind: 'button'; url: string; label: string })[] {
  return text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).map((part) => (
    URL_ONLY.test(part)
      ? { kind: 'button' as const, url: part, label: buttonLabel(part) }
      : { kind: 'text' as const, html: part.split('\n').map(inline).join('<br>'), plain: part }
  ));
}

const button = (url: string, label: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 18px;"><tr>
  <td align="center" bgcolor="${INK}" style="border-radius:10px;background:${INK};">
    <a href="${escape(url)}" style="display:inline-block;padding:12px 20px;font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${escape(label)}</a>
  </td></tr></table>`;

/** Who signs it: the sender's name over "YouDO" for a thank-you or a note, else the team. */
function signature(content: EmailContent): { html: string; text: string } {
  const name = content.kind !== 'update' ? content.signer?.trim() : '';
  return name
    ? { html: `${escape(name)}<br><span style="color:${MUTED};">YouDO</span>`, text: `${name}\nYouDO` }
    : { html: 'The YouDO team', text: 'The YouDO team' };
}

/** The whole email: html for mail apps, text for the rest. */
export function renderEmail(content: EmailContent): { subject: string; html: string; text: string } {
  const subject = fillPlaceholders(content.subject.trim(), content.name, content.amount);
  const body = fillPlaceholders(content.body, content.name, content.amount);
  const blocks = bodyBlocks(body);
  const titled = content.kind === 'update';
  const sign = signature(content);
  const para = `margin:0 0 16px;font-size:16px;line-height:1.6;color:${INK};`;
  const paragraphs = blocks.map((block) => (block.kind === 'button' ? button(block.url, block.label) : `<p style="${para}">${block.html}</p>`)).join('\n');
  const stop = content.unsubscribeUrl
    ? `<a href="${escape(content.unsubscribeUrl)}" style="color:#8a8378;text-decoration:underline;">Stop these emails</a>`
    : '';
  const title = titled ? `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.015em;color:${INK};">${escape(subject)}</h1>` : '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;color:${INK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:28px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
    <tr><td style="padding:0 0 12px;font-size:20px;font-weight:700;letter-spacing:-0.01em;color:${INK};">You<span style="color:#b8893f;">DO</span></td></tr>
    <tr><td style="border-top:2px solid ${SAND};padding:22px 0 0;">
      ${title}${paragraphs}
      <p style="margin:4px 0 0;font-size:16px;line-height:1.6;color:${INK};">${sign.html}</p>
    </td></tr>
    <tr><td style="padding:28px 0 0;font-size:12px;line-height:1.6;color:#8a8378;">
      You&rsquo;re getting this because you have a YouDO account.${stop ? `<br>
      ${stop}` : ''}
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;

  const text = [
    ...(titled ? [subject, ''] : []),
    ...blocks.map((block) => (block.kind === 'button' ? `${block.label}: ${block.url}` : block.plain.replace(/\*\*(.+?)\*\*/g, '$1'))).flatMap((part) => [part, '']),
    sign.text,
    '',
    content.unsubscribeUrl ? `Stop these emails: ${content.unsubscribeUrl}` : '',
  ].join('\n').trim();

  return { subject, html, text };
}

/** The page that stops a person's emails (email-stop.html on the website). */
export function unsubscribeLink(userId: string, token: string): string {
  return `${SITE_URL}/email-stop.html?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;
}
