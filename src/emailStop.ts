import { supabaseAnonKey, supabaseUrl } from './lib/supabaseConfig';
import './authConfirmation.css';
import './emailStop.css';

// email-stop.html: the "Stop these emails" link from an Admin Hub email.
// It never loads the app, so opening it can't touch anyone's session or data.
const params = new URLSearchParams(window.location.search);
const u = params.get('u') ?? '';
const t = params.get('t') ?? '';
const title = document.getElementById('stop-title')!;
const detail = document.getElementById('stop-detail')!;
const again = document.getElementById('stop-again') as HTMLButtonElement;

async function save(stop: boolean) {
  const response = await fetch(`${supabaseUrl}/functions/v1/email-stop`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: supabaseAnonKey },
    body: JSON.stringify({ u, t, again: !stop }),
  }).catch(() => null);
  const result = await response?.json().catch(() => null) as { ok?: boolean; error?: string } | null;
  if (!result?.ok) {
    title.textContent = 'That didn’t work';
    detail.textContent = result?.error ?? 'Check your connection and open the link again, or reply to the email.';
    again.hidden = true;
    return;
  }
  title.textContent = stop ? 'You won’t get these emails any more' : 'Emails are back on';
  detail.textContent = stop
    ? 'YouDO won’t send you news or notes by email. Changed your mind?'
    : 'You’ll get YouDO’s news and notes again.';
  again.hidden = !stop;
}

if (!u || !t) {
  title.textContent = 'This link is incomplete';
  detail.textContent = 'Open the link from the email again, or reply to the email to stop them.';
} else {
  void save(true);
  again.addEventListener('click', () => { again.disabled = true; void save(false).finally(() => { again.disabled = false; }); });
}
