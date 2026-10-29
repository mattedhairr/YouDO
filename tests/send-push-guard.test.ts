import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_LENGTH,
  MAX_TARGETS,
  isAuthorizedCaller,
  isStaleTokenError,
  parsePushRequest,
} from '../supabase/functions/send-push/guard';

const SECRET = 'k'.repeat(64);
const USER = '30000000-0000-0000-0000-000000000003';

describe('send-push caller check', () => {
  it('accepts only the exact shared secret', () => {
    expect(isAuthorizedCaller(SECRET, SECRET)).toBe(true);
    expect(isAuthorizedCaller(`${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorizedCaller(SECRET.slice(1), SECRET)).toBe(false);
    expect(isAuthorizedCaller('k'.repeat(63) + 'j', SECRET)).toBe(false);
  });

  it('rejects requests without a header, like the ones apps used to send', () => {
    expect(isAuthorizedCaller(null, SECRET)).toBe(false);
    expect(isAuthorizedCaller('', SECRET)).toBe(false);
  });

  it('fails closed when the server secret is missing or weak', () => {
    expect(isAuthorizedCaller('anything', undefined)).toBe(false);
    expect(isAuthorizedCaller('', '')).toBe(false);
    expect(isAuthorizedCaller('short-secret', 'short-secret')).toBe(false);
  });
});

describe('send-push payload', () => {
  it('normalises recipients, text, data and channel', () => {
    const parsed = parsePushRequest({
      userIds: [USER, USER],
      title: '  Hashtag   Support ',
      body: 'Admin replied',
      data: { type: 'hashtag_reply', channel: 'private-hub', count: 2, nested: { no: true } },
    });
    expect(parsed).toEqual({
      ok: true,
      request: {
        userIds: [USER],
        title: 'Hashtag Support',
        body: 'Admin replied',
        data: { type: 'hashtag_reply', channel: 'private-hub', count: '2' },
        channel: 'private-hub',
        silent: false,
      },
    });
  });

  it('marks data-only widget refreshes as silent', () => {
    const parsed = parsePushRequest({ userIds: [USER], title: 'YouDO', data: { type: 'focus_status', silent: 'true' } });
    expect(parsed.ok && parsed.request.silent).toBe(true);
    const shown = parsePushRequest({ userIds: [USER], title: 'YouDO', data: { silent: true } });
    expect(shown.ok && shown.request.silent).toBe(true);
    const normal = parsePushRequest({ userIds: [USER], title: 'YouDO', data: { silent: 'yes' } });
    expect(normal.ok && normal.request.silent).toBe(false);
  });

  it('accepts a single userId and defaults unknown channels to public-hub', () => {
    const parsed = parsePushRequest({ userId: USER, title: 'Hi', data: { channel: 'made-up' } });
    expect(parsed.ok && parsed.request.channel).toBe('public-hub');
    expect(parsed.ok && parsed.request.userIds).toEqual([USER]);
  });

  it('rejects missing or invalid recipients and titles', () => {
    expect(parsePushRequest(null).ok).toBe(false);
    expect(parsePushRequest({ title: 'Hi' }).ok).toBe(false);
    expect(parsePushRequest({ userIds: [USER, 'not-a-uuid'], title: 'Hi' }).ok).toBe(false);
    expect(parsePushRequest({ userIds: [USER], title: '   ' }).ok).toBe(false);
    const tooMany = Array.from({ length: MAX_TARGETS + 1 }, (_, i) => `30000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
    expect(parsePushRequest({ userIds: tooMany, title: 'Hi' }).ok).toBe(false);
  });

  it('clips long bodies', () => {
    const parsed = parsePushRequest({ userId: USER, title: 'Hi', body: 'x'.repeat(1000) });
    expect(parsed.ok && parsed.request.body.length).toBe(MAX_BODY_LENGTH);
  });
});

describe('stale FCM tokens', () => {
  it('drops tokens only when FCM says the device is gone', () => {
    expect(isStaleTokenError(404, {})).toBe(true);
    expect(isStaleTokenError(400, { error: { status: 'INVALID_ARGUMENT', details: [{ errorCode: 'UNREGISTERED' }] } })).toBe(true);
    expect(isStaleTokenError(400, { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } })).toBe(true);
  });

  it('keeps tokens when the message itself was malformed or FCM is down', () => {
    expect(isStaleTokenError(400, { error: { status: 'INVALID_ARGUMENT', message: 'Invalid value at message.data' } })).toBe(false);
    expect(isStaleTokenError(503, { error: { status: 'UNAVAILABLE' } })).toBe(false);
    expect(isStaleTokenError(500, null)).toBe(false);
  });
});
