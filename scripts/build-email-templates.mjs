// Builds supabase/email-templates/*.html from one layout, so the three auth
// emails stay alike: the same plain letter as the Admin Hub's emails
// (supabase/functions/_shared/emailTemplate.ts). Paste each output into
// Supabase → Authentication → Emails → Templates. Email-safe: tables, inline
// styles, a bulletproof button and the plain link; no images, hidden preview
// text or website link (they look like marketing to spam filters).
import fs from 'node:fs';
const INK = '#24221f', SAND = '#d8b47a', MUTED = '#7a736a';
const templates = [
  { file: 'confirm-sign-up.html', subject: 'Confirm your YouDO email', heading: 'Confirm your email',
    body: ['Tap the button to confirm this address and finish setting up your YouDO account.', 'Then go back to YouDO and tap <strong>I&rsquo;ve confirmed, continue</strong>.'],
    button: 'Confirm my email', note: 'Didn&rsquo;t sign up for YouDO? Just ignore this email and nothing will be set up.' },
  { file: 'reset-password.html', subject: 'Reset your YouDO password', heading: 'Reset your password',
    body: ['Someone asked to reset the password for your YouDO account. Tap the button to choose a new one.'],
    button: 'Choose a new password', note: 'Didn&rsquo;t ask for this? Ignore this email and your password stays the same. If you asked more than once, use the newest email.' },
  { file: 'change-email-address.html', subject: 'Confirm your YouDO email change', heading: 'Confirm your new email',
    body: ['You asked to change your YouDO account email to <strong>{{ .NewEmail }}</strong>. Tap the button to confirm it.', 'If an email also comes to your other address, confirm that one too.'],
    button: 'Confirm the change', note: 'Didn&rsquo;t ask for this? Don&rsquo;t tap the button, and your email stays as it is.' },
];
const p = `margin:0 0 16px;font-size:16px;line-height:1.6;color:${INK};`;
const page = (t) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t.subject}</title></head>
<body style="margin:0;padding:0;background:#ffffff;color:${INK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:28px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
    <tr><td style="padding:0 0 12px;font-size:20px;font-weight:700;letter-spacing:-0.01em;color:${INK};">You<span style="color:#b8893f;">DO</span></td></tr>
    <tr><td style="border-top:2px solid ${SAND};padding:22px 0 0;">
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.015em;color:${INK};">${t.heading}</h1>
      <p style="${p}">{{ if .Data.full_name }}Hi {{ .Data.full_name }},{{ else }}Hi,{{ end }}</p>
      ${t.body.map((b) => `<p style="${p}">${b}</p>`).join('\n      ')}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 18px;"><tr>
        <td align="center" bgcolor="${INK}" style="border-radius:10px;background:${INK};">
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 20px;font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${t.button}</a>
        </td>
      </tr></table>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${MUTED};">${t.note}</p>
      <p style="margin:4px 0 0;font-size:16px;line-height:1.6;color:${INK};">YouDO</p>
    </td></tr>
    <tr><td style="padding:28px 0 0;font-size:12px;line-height:1.6;color:#8a8378;">
      The button works once and expires soon. If it doesn&rsquo;t open, copy this link into your browser:<br>
      <a href="{{ .ConfirmationURL }}" style="color:#8a6420;text-decoration:underline;word-break:break-all;">{{ .ConfirmationURL }}</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>
`;

for (const t of templates) fs.writeFileSync(new URL(`../supabase/email-templates/${t.file}`, import.meta.url), page(t));
console.log('wrote', templates.length);
