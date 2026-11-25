/**
 * The "Stop these emails" link's token: an HMAC of the person's id, so the
 * link works without signing in and can't be made for someone else.
 * The key is the EMAIL_LINK_SECRET secret, else the project's service key
 * (changing either makes old links stop working; the person can still reply).
 */
const encoder = new TextEncoder();

function linkSecret(): string {
  const env = (globalThis as unknown as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno?.env;
  const secret = env?.get('EMAIL_LINK_SECRET') || env?.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) throw new Error('No secret for email links.');
  return secret;
}

async function sign(userId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`email-stop:${userId}`)));
  return btoa(String.fromCharCode(...mac.slice(0, 18))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function emailToken(userId: string, secret = linkSecret()): Promise<string> {
  return sign(userId, secret);
}

export async function tokenMatches(userId: string, token: string, secret = linkSecret()): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !token) return false;
  const expected = await sign(userId, secret);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
