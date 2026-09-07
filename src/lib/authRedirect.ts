export const DEFAULT_AUTH_REDIRECT_URL = 'https://tu-do-psi.vercel.app/auth-confirm.html';

/** Never send confirmation links to a device-local preview or native localhost. */
export function resolveAuthRedirectUrl(configured?: string): string {
  if (!configured?.trim()) return DEFAULT_AUTH_REDIRECT_URL;
  const url = new URL(configured.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search ||
      url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
      url.hostname === '[::1]' || /^\d+(\.\d+){3}$/.test(url.hostname) ||
      url.hostname.endsWith('.local') || !url.hostname.includes('.')) {
    throw new Error('Email confirmation requires a public HTTPS address.');
  }
  return url.href;
}

export type ConfirmationStatus = 'expired' | 'error' | 'pending' | 'received' | 'unknown';

/** Only classify Supabase callback shapes. Never render arbitrary URL text or save tokens. */
export function confirmationStatus(hash: string, search = ''): ConfirmationStatus {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const query = new URLSearchParams(search.replace(/^\?/, ''));
  const read = (key: string) => params.get(key) ?? query.get(key);
  if (read('error_code') === 'otp_expired') return 'expired';
  if (read('error') || read('error_code')) return 'error';
  if (read('message')?.startsWith('Confirmation link accepted')) return 'pending';
  if (read('access_token') && ['email_change', 'signup', 'email'].includes(read('type') ?? '')) return 'received';
  return 'unknown';
}
