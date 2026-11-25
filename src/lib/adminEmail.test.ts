import { describe, expect, it } from 'vitest';
import { backerTotals, parseBackers, parseEmailOverview, parseTemplates, sendStatus } from './adminEmail';

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
