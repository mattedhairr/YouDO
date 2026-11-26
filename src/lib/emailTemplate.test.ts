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
    expect(blocks[3].kind === 'text' && blocks[3].html).toBe('<strong>Bold</strong> &lt;b&gt;raw&lt;/b&gt;');
    expect(bodyBlocks('https://t.me/youdo')[0]).toMatchObject({ label: 'Open in Telegram' });
  });

  it('renders a plain letter, with the right title and sign-off for each kind', () => {
    const news = renderEmail({ kind: 'update', subject: 'YouDO 9 for {name}', body: 'Hi {name}\n\nhttps://youdo-app.vercel.app', name: 'Riya', unsubscribeUrl: 'https://youdo-app.vercel.app/email-stop.html?u=1&t=2' });
    expect(news.subject).toBe('YouDO 9 for Riya');
    expect(news.html).not.toContain('icon-192.png'); // no remote logo
    expect(news.html).not.toContain('display:none'); // no hidden preview text
    expect(news.html).toContain('background:#ffffff'); // the mail app's own page, not a forced dark one
    expect(news.html).toContain('<h1'); // retired News still renders, for sends made before
    expect(news.html).toContain('>Open YouDO</a>');
    expect(news.html).toContain('Stop these emails');
    expect(news.html).not.toContain('>youdo-app.vercel.app</a>'); // no website link at the bottom (v9.1: Gmail is wary of vercel.app)
    expect(news.html).toContain('The YouDO team');
    expect(news.text).toContain('Open YouDO: https://youdo-app.vercel.app');
    expect(news.text).toContain('Stop these emails: https://');

    const thanks = renderEmail({ kind: 'thanks', subject: 'Thanks', body: EMAIL_KINDS.thanks.body, name: 'Meera', amount: 300, signer: 'Itachi' });
    expect(thanks.html).not.toContain('FOUNDING BACKER');
    expect(thanks.html).not.toContain('<h1');
    expect(thanks.html.indexOf('Thank you for backing YouDO.')).toBeLessThan(thanks.html.indexOf('₹300')); // the thanks before the money
    expect(thanks.html).toContain('Itachi<br>');
    expect(thanks.text).toContain('Itachi\nYouDO');
    expect(thanks.html).not.toContain('Stop these emails');

    const note = renderEmail({ kind: 'note', subject: 'About your appeal', body: 'Hi {name}\n\nAll sorted.', name: 'Sana', signer: 'Anjali R' });
    expect(note.html).not.toContain('<h1');
    expect(note.html).toContain('Anjali R<br><span style="color:#7a736a;">YouDO</span>');
    expect(renderEmail({ kind: 'note', subject: 'x', body: 'Hi', name: 'Sana' }).html).toContain('The YouDO team'); // no name to sign with
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
