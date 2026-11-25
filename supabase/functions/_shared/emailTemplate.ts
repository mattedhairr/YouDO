/**
 * YouDO's email template, shared by the Admin Hub's preview (the app) and the
 * admin-email edge function, so what the preview shows is what people get.
 * It matches the sign-up mails (supabase/email-templates/): the dark card, the
 * YouDO mark and the sand line. No imports: Deno and Vite both load this file.
 *
 * The message is plain text, as pasted:
 * - a blank line starts a new paragraph, a single line break stays a break;
 * - a paragraph that is only a link becomes a button;
 * - other links become links, and **words** become bold;
 * - {name} is the person's first name ("there" without one) and {amount} what a
 *   backer gave (₹50), for thank-yous.
 */

export type EmailKind = 'update' | 'thanks' | 'note';

export const SITE_URL = 'https://youdo-app.vercel.app';
export const SUBJECT_MAX = 120;
export const BODY_MAX = 6000;

/** What each kind is for, and the text it starts with. */
export const EMAIL_KINDS: Record<EmailKind, { label: string; hint: string; subject: string; body: string }> = {
  update: {
    label: 'News',
    hint: 'A big title under “From YouDO”, signed by the YouDO team. For releases and announcements.',
    subject: '',
    body: 'Hi {name},\n\n\n\n' + SITE_URL,
  },
  thanks: {
    label: 'Thank you',
    hint: 'A gold Founding Backer seal and title, signed by the YouDO team. {amount} is what each backer gave.',
    subject: 'Thank you for backing YouDO',
    body: 'Hi {name},\n\nYour {amount} helped keep YouDO free, ad-free and growing. You are one of the very first people to back it, and that means a lot.\n\nYour Founding Backer ring now shows around your picture everywhere in YouDO.\n\nThank you for believing in YouDO from the start.',
  },
  note: {
    label: 'Note',
    hint: 'No title, like a letter, signed with your name. For one person or a few.',
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
  /** Who signs a note (the sender's name in YouDO). */
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

const inline = (line: string) => escape(line)
  .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f5f2ec;">$1</strong>')
  .replace(URL_ANYWHERE, (url) => `<a href="${url}" style="color:#d8b47a;text-decoration:underline;">${url}</a>`);

/** The message as paragraphs and buttons. */
export function bodyBlocks(text: string): ({ kind: 'text'; html: string; plain: string } | { kind: 'button'; url: string; label: string })[] {
  return text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).map((part) => (
    URL_ONLY.test(part)
      ? { kind: 'button' as const, url: part, label: buttonLabel(part) }
      : { kind: 'text' as const, html: part.split('\n').map(inline).join('<br>'), plain: part }
  ));
}

const button = (url: string, label: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;"><tr>
  <td align="center" bgcolor="#d8b47a" style="border-radius:12px;background:#d8b47a;">
    <a href="${escape(url)}" style="display:inline-block;padding:14px 24px;font-size:15px;font-weight:700;line-height:1;color:#171612;text-decoration:none;border-radius:12px;">${escape(label)} &rarr;</a>
  </td></tr></table>`;

/** The whole email: html for mail apps, text for the rest. */
export function renderEmail(content: EmailContent): { subject: string; html: string; text: string } {
  const subject = fillPlaceholders(content.subject.trim(), content.name, content.amount);
  const body = fillPlaceholders(content.body, content.name, content.amount);
  const blocks = bodyBlocks(body);
  const thanks = content.kind === 'thanks';
  const signer = content.kind === 'note' && content.signer?.trim() ? `${content.signer.trim()}, YouDO` : 'The YouDO team';
  const line = thanks ? 'linear-gradient(90deg,#c9a24a,#f1d58a 50%,#c9a24a)' : 'linear-gradient(90deg,#d8b47a,#e9cf9f 50%,#d8b47a)';

  const eyebrow = thanks
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr><td style="padding:6px 12px;border:1px solid #6b5626;border-radius:999px;background:#2a2314;font-size:12px;font-weight:700;letter-spacing:0.06em;color:#f1d58a;">&#9829;&nbsp; FOUNDING BACKER</td></tr></table>`
    : content.kind === 'update' ? '<p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#d8b47a;">From YouDO</p>' : '';
  const title = content.kind === 'note' ? '' : `<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-0.015em;color:#f5f2ec;">${escape(subject)}</h1>`;
  const paragraphs = blocks.map((block) => block.kind === 'button'
    ? button(block.url, block.label)
    : `<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#d5cfc5;">${block.html}</p>`).join('\n');
  const stop = content.unsubscribeUrl
    ? `<a href="${escape(content.unsubscribeUrl)}" style="color:#8a8378;text-decoration:underline;">Stop these emails</a> &middot; `
    : '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#0f0e0c;color:#f5f2ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0f0e0c;">${escape((blocks.find((block) => block.kind === 'text') as { plain?: string } | undefined)?.plain?.slice(0, 120) ?? '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f0e0c;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
    <tr><td style="padding:0 4px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle;"><img src="${SITE_URL}/icon-192.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:9px;"></td>
        <td style="vertical-align:middle;padding-left:10px;font-size:20px;font-weight:700;letter-spacing:-0.01em;color:#f5f2ec;">You<span style="color:#d8b47a;">DO</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#1c1a17;border:1px solid #33302a;border-radius:20px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:4px;line-height:4px;font-size:0;background:#d8b47a;background-image:${line};">&nbsp;</td></tr>
        <tr><td style="padding:30px 28px 12px;">
          ${eyebrow}${title}${paragraphs}
          <p style="margin:6px 0 18px;font-size:15px;line-height:1.5;color:#ada69b;">&mdash; ${escape(signer)}</p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:22px 12px 0;font-size:12px;line-height:1.6;color:#6f695f;">
      You get this because you have a YouDO account.<br>
      ${stop}<a href="${SITE_URL}" style="color:#8a8378;text-decoration:underline;">YouDO</a> &middot; Built for serious aspirants
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;

  const text = [
    ...(content.kind === 'note' ? [] : [subject, '']),
    ...blocks.map((block) => (block.kind === 'button' ? `${block.label}: ${block.url}` : block.plain.replace(/\*\*(.+?)\*\*/g, '$1'))).flatMap((part) => [part, '']),
    `— ${signer}`,
    '',
    content.unsubscribeUrl ? `Stop these emails: ${content.unsubscribeUrl}` : '',
  ].join('\n').trim();

  return { subject, html, text };
}

/** The page that stops a person's emails (email-stop.html on the website). */
export function unsubscribeLink(userId: string, token: string): string {
  return `${SITE_URL}/email-stop.html?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;
}
