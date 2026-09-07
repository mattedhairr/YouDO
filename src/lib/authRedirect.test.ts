import { describe, expect, it } from 'vitest';
import { confirmationStatus, DEFAULT_AUTH_REDIRECT_URL, resolveAuthRedirectUrl } from './authRedirect';

describe('confirmation redirect', () => {
  it('uses the public confirmation page even in preview and Android builds', () => {
    expect(resolveAuthRedirectUrl()).toBe(DEFAULT_AUTH_REDIRECT_URL);
    expect(resolveAuthRedirectUrl('')).toBe(DEFAULT_AUTH_REDIRECT_URL);
    expect(resolveAuthRedirectUrl(' https://youdo.example/auth-confirm.html ')).toBe('https://youdo.example/auth-confirm.html');
  });
  it.each(['http://youdo.example', 'https://localhost', 'https://127.0.0.1:5173', 'https://[::1]', 'https://192.168.1.1', 'https://youdo.local', 'https://user:pass@youdo.example', 'javascript:alert(1)', 'https://youdo.example/#token', 'https://youdo.example/?next=unsafe'])('rejects unsuitable destinations: %s', (url) => {
    expect(() => resolveAuthRedirectUrl(url)).toThrow();
  });
});

describe('confirmation landing states', () => {
  it('prioritizes expired and error states over success-shaped parameters', () => {
    expect(confirmationStatus('#error_code=otp_expired&access_token=redacted&type=email_change')).toBe('expired');
    expect(confirmationStatus('#error=access_denied&message=anything')).toBe('error');
    expect(confirmationStatus('', '?error_code=otp_expired')).toBe('expired');
  });
  it('does not mistake the first inbox confirmation for a completed change', () => {
    expect(confirmationStatus('#message=Confirmation+link+accepted')).toBe('pending');
  });
  it('recognizes supported callback types without persisting their tokens', () => {
    expect(confirmationStatus('#access_token=redacted&type=email_change')).toBe('received');
    expect(confirmationStatus('#access_token=redacted&type=signup')).toBe('received');
  });
  it('does not claim success on a bare, unknown, recovery, or PKCE callback', () => {
    for (const hash of ['', '#type=email_change', '#access_token=redacted&type=recovery', '#code=abc', '#evil=<script>', '#message=Unexpected+response']) {
      expect(confirmationStatus(hash)).toBe('unknown');
    }
  });
});
