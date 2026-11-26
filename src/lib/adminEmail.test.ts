import { describe, expect, it } from 'vitest';
import { backerTotals, parseBackers, parseEmailOverview, parseTemplates, previewRecipient, sendStatus, startingText } from './adminEmail';

describe('admin email', () => {
  it('reads the Email screen, hiding backers from admins', () => {
    const overview = parseEmailOverview({
      limit: 450, sent_today: '12', everyone: 142, backers: null, stopped: 3,
      sends: [{ id: 's1', kind: 'thanks', audience: 'backers', subject: 'Thank you', created_at: '2026-11-24T10:00:00Z', sent_by: 'u1', sent_by_name: 'Owner', total: 14, sent: 10, failed: 1, waiting: 3 }, { kind: 'update' }],
    });
    expect(overview).toMatchObject({ limit: 450, sentToday: 12, everyone: 142, backers: undefined, stopped: 3 });
    expect(overview.sends).toHaveLength(1);
    expect(overview.sends[0]).toMatchObject({ kind: 'thanks', audience: 'backers', sentByName: 'Owner', waiting: 3 });
    expect(parseEmailOverview({ backers: 0 }).backers).toBe(0);
  });

  it('describes a send', () => {
    expect(sendStatus({ total: 142, sent: 142, failed: 0, waiting: 0 })).toBe('Sent to 142');
    expect(sendStatus({ total: 142, sent: 140, failed: 2, waiting: 0 })).toBe('Sent to 140 of 142 · 2 didn’t arrive');
    expect(sendStatus({ total: 142, sent: 40, failed: 0, waiting: 102 })).toBe('102 not sent yet · 40 of 142 sent');
    expect(sendStatus({ total: 142, sent: 40, failed: 1, waiting: 101 }, true)).toBe('Sending · 41 of 142');
  });

  it('adds up backers', () => {
    const backers = parseBackers([
      { user_id: 'a', display_name: 'Riya M', total: '300', claims: 2, first_at: '2026-11-03', thanked_at: '2026-11-20' },
      { user_id: 'b', username: 'kabirs', total: 100, claims: 1 },
      { user_id: 'c', total: 0, claims: 0, stopped: true, confirmed: false },
      { total: 50 },
    ]);
    expect(backers).toHaveLength(3);
    expect(backers[2]).toMatchObject({ stopped: true, confirmed: false });
    expect(backerTotals(backers)).toEqual({ total: 400, count: 3, average: 200, unthanked: 2 });
    expect(backerTotals([])).toEqual({ total: 0, count: 0, average: 0, unthanked: 0 });
  });
  it('reads templates, dropping broken ones', () => {
    const list = parseTemplates([
      { id: 't1', name: ' Thank a backer ', kind: 'thanks', subject: 'Thank you', body: 'Hi {name}' },
      { id: 't2', name: 'Odd', kind: 'spam', body: 'x' },
      { id: 't3', name: '' },
      null,
    ]);
    expect(list).toEqual([
      { id: 't1', name: 'Thank a backer', kind: 'thanks', subject: 'Thank you', body: 'Hi {name}' },
      { id: 't2', name: 'Odd', kind: 'update', subject: '', body: 'x' },
    ]);
    expect(parseTemplates({})).toEqual([]);
  });
});

describe('the email preview', () => {
  const backers = parseBackers([
    { user_id: 'b1', display_name: 'Anjali Rao', username: 'anjali', total: '100', claims: 1, confirmed: true },
    { user_id: 'b2', display_name: null, username: 'kabir', total: '50', claims: 1, confirmed: true },
  ]);

  it('shows a sent email as the first person who got it, with their own amount, never sample values', () => {
    const shown = previewRecipient({ audience: 'people', backers, recipients: [
      { id: 'w', name: 'Waiting Person', status: 'waiting' },
      { id: 'b1', name: 'Anjali Rao', status: 'sent' },
    ] });
    expect(shown).toEqual({ name: 'Anjali', amount: 100, label: 'Anjali Rao' });
    const one = previewRecipient({ audience: 'people', recipients: [{ id: 'x', name: 'Nikita Shah', status: 'sent' }] });
    expect(one.name).toBe('Nikita');
    expect(one.amount).toBeUndefined(); // the sender writes "support", not ₹300
  });

  it('before sending: the picked person, the first backer, or yourself for Everyone', () => {
    expect(previewRecipient({ audience: 'people', picked: [{ id: 'b1', label: 'Anjali Rao' }], backers })).toEqual({ name: 'Anjali', amount: 100, label: 'Anjali Rao' });
    expect(previewRecipient({ audience: 'backers', backers }).name).toBe('Anjali');
    expect(previewRecipient({ audience: 'everyone', self: { id: 'me', name: 'Itachi Uchiha' } })).toEqual({ name: 'Itachi', amount: undefined, label: 'you' });
  });

  it('fills {name} only from a display name, as the sender does: an @username gets "there"', () => {
    expect(previewRecipient({ audience: 'people', picked: [{ id: 'k', label: '@kabir' }] }).name).toBeUndefined();
    expect(previewRecipient({ audience: 'people', picked: [{ id: 'm', label: 'meera@example.com' }] }).name).toBeUndefined();
    expect(previewRecipient({ audience: 'people', recipients: [{ id: 'k', username: 'kabir', status: 'sent' }] })).toEqual({ name: undefined, amount: undefined, label: '@kabir' });
  });
  it('starts a kind from its own words: a thank-you from the owner’s template, a note from Hi {name}', () => {
    const templates = [
      { id: 't1', name: 'Personal note', kind: 'note' as const, subject: '', body: 'Hi {name},\n\n' },
      { id: 't2', name: 'Thank a backer', kind: 'thanks' as const, subject: 'Thanks, {name}', body: 'Hi {name},\n\nYour {amount} matters.' },
    ];
    expect(startingText('thanks', templates)).toEqual({ subject: 'Thanks, {name}', body: 'Hi {name},\n\nYour {amount} matters.', templateId: 't2' });
    expect(startingText('thanks', []).subject).toBe('Thank you for backing YouDO');
    expect(startingText('thanks', []).templateId).toBeUndefined();
    expect(startingText('thanks', null).body).toContain('{amount}');
    expect(startingText('note', templates)).toEqual({ subject: '', body: 'Hi {name},\n\n' });
  });
});
