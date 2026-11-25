import { describe, expect, it } from 'vitest';
import { EMAIL_CODES, aiTemplatePrompt } from './emailHelp';
import { parseSendDetail } from './adminEmail';

describe('email help', () => {
  it('lists every code the sender understands', () => {
    expect(EMAIL_CODES.map((item) => item.code)).toEqual(['{name}', '{amount}', 'Blank line', 'Link on its own line', 'Link inside a sentence', '**words**']);
  });

  it('gives the AI the fixed parts, the looks, the codes, the limits and the reply shape', () => {
    const prompt = aiTemplatePrompt();
    expect(prompt).toContain('[Describe it here');
    expect(prompt).toContain('do NOT write any of this');
    expect(prompt).toContain('Stop these emails');
    expect(prompt).toContain('- News:');
    expect(prompt).toContain('- Thank you:');
    expect(prompt).toContain('- Note:');
    expect(prompt).toContain('{amount}');
    expect(prompt).toContain('under 120 characters');
    expect(prompt).toContain('under 6000 characters');
    expect(prompt).toMatch(/Name: .*\nLook: .*\nSubject: \.\.\.\nMessage:\n\.\.\.$/);
  });
});

describe('a send in full', () => {
  it('reads who got it, counting a batch in progress as waiting', () => {
    const detail = parseSendDetail({
      id: 's1', kind: 'thanks', audience: 'backers', subject: 'Thank you', body: 'Hi {name}', created_at: '2026-11-25T10:00:00Z', sent_by_name: 'Itachi',
      recipients: [
        { user_id: 'a', name: 'Riya Mehta', status: 'failed', error: 'Mailbox full' },
        { user_id: 'b', username: 'kabirs', status: 'sending' },
        { user_id: 'c', name: 'Anaya', status: 'sent', sent_at: '2026-11-25T10:01:00Z' },
        { status: 'sent' },
      ],
    });
    expect(detail).toMatchObject({ kind: 'thanks', audience: 'backers', sentByName: 'Itachi' });
    expect(detail.recipients.map((person) => person.status)).toEqual(['failed', 'waiting', 'sent']);
    expect(detail.recipients[0].error).toBe('Mailbox full');
    expect(detail.recipients[2].sentAt).toBe('2026-11-25T10:01:00Z');
  });
});
