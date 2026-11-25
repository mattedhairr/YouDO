import { describe, expect, it } from 'vitest';
import {
  EMAIL_KINDS, bodyBlocks, emailProblem, fillPlaceholders, firstName, formatRupees, renderEmail, unsubscribeLink,
} from '../../supabase/functions/_shared/emailTemplate.ts';
import { emailToken, tokenMatches } from '../../supabase/functions/_shared/emailLink.ts';

describe('email template', () => {
  it('fills a first name and what a backer gave', () => {
    expect(fillPlaceholders('Hi {name}, your {amount} helped', 'Riya', 300)).toBe('Hi Riya, your ₹300 helped');
    expect(fillPlaceholders('Hi {Name}', '')).toBe('Hi there');
    expect(fillPlaceholders('your {amount}')).toBe('your support');
    expect(formatRupees(1350)).toBe('₹1,350');
    expect(firstName('Riya Mehta')).toBe('Riya');
    expect(firstName('@kabir')).toBe('kabir');
    expect(firstName(null)).toBe('');
  });

  it('turns pasted text into paragraphs, breaks, links and buttons', () => {
    const blocks = bodyBlocks('Hi Riya,\nline two\n\nSee https://example.com/a now.\n\nhttps://youdo-app.vercel.app\n\n**Bold** <b>raw</b>');
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toMatchObject({ kind: 'text', html: 'Hi Riya,<br>line two' });
    expect(blocks[1].kind === 'text' && blocks[1].html).toContain('<a href="https://example.com/a"');
    expect(blocks[1].kind === 'text' && blocks[1].html).toContain('/a</a> now.');
    expect(blocks[2]).toEqual({ kind: 'button', url: 'https://youdo-app.vercel.app', label: 'Open YouDO' });
    expect(blocks[3].kind === 'text' && blocks[3].html).toBe('<strong style="color:#f5f2ec;">Bold</strong> &lt;b&gt;raw&lt;/b&gt;');
    expect(bodyBlocks('https://t.me/youdo')[0]).toMatchObject({ label: 'Open in Telegram' });
  });

  it('renders the YouDO card, the right title and sign-off for each kind', () => {
    const news = renderEmail({ kind: 'update', subject: 'YouDO 9 for {name}', body: 'Hi {name}\n\nhttps://youdo-app.vercel.app', name: 'Riya', unsubscribeUrl: 'https://youdo-app.vercel.app/email-stop.html?u=1&t=2' });
    expect(news.subject).toBe('YouDO 9 for Riya');
    expect(news.html).toContain('icon-192.png');
    expect(news.html).toContain('<h1');
    expect(news.html).toContain('Open YouDO &rarr;');
    expect(news.html).toContain('Stop these emails');
    expect(news.html).toContain('The YouDO team');
    expect(news.text).toContain('Open YouDO: https://youdo-app.vercel.app');
    expect(news.text).toContain('Stop these emails: https://');

    const thanks = renderEmail({ kind: 'thanks', subject: 'Thanks', body: EMAIL_KINDS.thanks.body, name: 'Meera', amount: 300 });
    expect(thanks.html).toContain('FOUNDING BACKER');
    expect(thanks.html).toContain('Your ₹300 helped');
    expect(thanks.html).not.toContain('Stop these emails');

    const note = renderEmail({ kind: 'note', subject: 'About your appeal', body: 'Hi {name}\n\nAll sorted.', name: 'Sana', signer: 'Anjali R' });
    expect(note.html).not.toContain('<h1');
    expect(note.html).toContain('Anjali R, YouDO');
    expect(note.text.startsWith('Hi Sana')).toBe(true);
  });

  it('escapes what was pasted, including the subject', () => {
    const mail = renderEmail({ kind: 'update', subject: '<script>x</script>', body: '"quoted" & <i>' });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('&quot;quoted&quot; &amp; &lt;i&gt;');
  });

  it('says what is missing before sending', () => {
    expect(emailProblem('', 'Hello')).toBe('Add a subject.');
    expect(emailProblem('Hi', EMAIL_KINDS.note.body)).toBe('Write the message.');
    expect(emailProblem('x'.repeat(121), 'Hello')).toMatch(/subject/);
    expect(emailProblem('Hi', 'x'.repeat(6001))).toMatch(/message/);
    expect(emailProblem('Hi', 'Hello {name}')).toBeNull();
  });

  it('makes stop links only YouDO can make', async () => {
    const id = '71000000-0000-0000-0000-000000000003';
    const token = await emailToken(id, 'test-secret');
    expect(await tokenMatches(id, token, 'test-secret')).toBe(true);
    expect(await tokenMatches(id, token, 'other-secret')).toBe(false);
    expect(await tokenMatches('71000000-0000-0000-0000-000000000004', token, 'test-secret')).toBe(false);
    expect(await tokenMatches('not-an-id', token, 'test-secret')).toBe(false);
    expect(unsubscribeLink(id, token)).toBe(`https://youdo-app.vercel.app/email-stop.html?u=${id}&t=${encodeURIComponent(token)}`);
  });
});
