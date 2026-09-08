export const DEFAULT_AUTH_REDIRECT_URL = 'https://tu-do-psi.vercel.app/auth-confirm.html';
export const DEFAULT_AUTH_RECOVERY_URL = 'https://tu-do-psi.vercel.app/?auth=recovery';

function requirePublicHttps(url: URL, purpose: string): void {
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
      url.hostname === '[::1]' || /^\d+(\.\d+){3}$/.test(url.hostname) ||
      url.hostname.endsWith('.local') || !url.hostname.includes('.')) {
    throw new Error(`${purpose} requires a public HTTPS address.`);
  }
}

/** Never send confirmation links to a device-local preview or native localhost. */
export function resolveAuthRedirectUrl(configured?: string): string {
  if (!configured?.trim()) return DEFAULT_AUTH_REDIRECT_URL;
  const url = new URL(configured.trim());
  requirePublicHttps(url, 'Email confirmation');
  if (url.search) throw new Error('Email confirmation requires a public HTTPS address.');
  return url.href;
}

/** Password recovery returns to the app with an explicit marker, never localhost. */
export function resolveAuthRecoveryUrl(configured?: string): string {
  const url = new URL(configured?.trim() || DEFAULT_AUTH_RECOVERY_URL);
  requirePublicHttps(url, 'Password recovery');
  if ([...url.searchParams.keys()].some((key) => key !== 'auth') ||
      (url.searchParams.has('auth') && url.searchParams.get('auth') !== 'recovery')) {
    throw new Error('Password recovery URL may only contain the recovery marker.');
  }
  url.searchParams.set('auth', 'recovery');
  return url.href;
}

export function isAuthRecoveryUrl(search: string): boolean {
  return new URLSearchParams(search.replace(/^\?/, '')).get('auth') === 'recovery';
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
