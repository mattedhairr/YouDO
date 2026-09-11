import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './authError';

describe('auth error guidance', () => {
  it('explains the confirmation-email limit during signup', () => {
    const message = authErrorMessage({
      code: 'over_email_send_rate_limit',
      message: 'email rate limit exceeded',
      status: 429,
    }, 'signup');

    expect(message).toContain('confirmation-email limit');
    expect(message).toContain('wait');
    expect(message).toContain('Sign in');
  });

  it('explains that an unconfirmed account must use its email link', () => {
    expect(authErrorMessage({ code: 'email_not_confirmed' }, 'signin'))
      .toContain('Confirm your email');
  });

  it('turns invalid credentials into plain language', () => {
    expect(authErrorMessage(new Error('Invalid login credentials'), 'signin'))
      .toBe('The email or password is incorrect.');
  });

  it('explains expired recovery sessions', () => {
    expect(authErrorMessage({ code: 'session_expired' }, 'password'))
      .toBe('This reset link is invalid or has expired. Request a new one.');
  });

  it('provides actionable network guidance', () => {
    expect(authErrorMessage({ message: 'Failed to fetch', status: 0 }, 'forgot'))
      .toContain('Check your connection');
  });

  it('does not expose unexpected provider details', () => {
    expect(authErrorMessage(new Error('internal table auth.users leaked details'), 'signup'))
      .toBe('The account could not be created. Please try again.');
  });
});
