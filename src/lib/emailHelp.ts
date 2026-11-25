import { BODY_MAX, EMAIL_KINDS, SUBJECT_MAX, type EmailKind } from '../../supabase/functions/_shared/emailTemplate.ts';

/**
 * The Email screen's help: what can be typed in a message, and a prompt to
 * paste into any AI chat to draft a new template that fits YouDO's fixed design.
 * Kept beside the template rules (supabase/functions/_shared/emailTemplate.ts),
 * so the help always matches what the sender does.
 */
export const EMAIL_CODES: { code: string; meaning: string }[] = [
  { code: '{name}', meaning: 'Each person’s first name (“there” if they have none).' },
  { code: '{amount}', meaning: 'What a backer gave, like ₹300. Only in thank-yous.' },
  { code: 'Blank line', meaning: 'Starts a new paragraph.' },
  { code: 'Link on its own line', meaning: 'Becomes a big button (YouDO’s own link says “Open YouDO”).' },
  { code: 'Link inside a sentence', meaning: 'Stays a normal link.' },
  { code: '**words**', meaning: 'Bold.' },
];

/** The parts YouDO adds by itself, which a message never needs to repeat. */
export const EMAIL_FIXED = [
  'The YouDO icon and name at the top, and the dark card.',
  'News and Thank you: the title is the subject (Thank you adds a gold Founding Backer seal).',
  'The sign-off: “The YouDO team”, or your name on a Note.',
  'The footer with “Stop these emails”.',
];

export function aiTemplatePrompt(): string {
  const looks = (Object.keys(EMAIL_KINDS) as EmailKind[]).map((kind) => `- ${EMAIL_KINDS[kind].label}: ${EMAIL_KINDS[kind].hint}`).join('\n');
  const codes = EMAIL_CODES.map((item) => `- ${item.code}: ${item.meaning}`).join('\n');
  return `Write an email template for YouDO, a study planner and focus app for students in India preparing for exams (JEE, NEET, UPSC, GATE, CAT, Boards).

What I want the email to say:
[Describe it here: who it is for, what happened, what you want them to do.]

How YouDO's emails work (follow these exactly):
The design is fixed and added automatically, so do NOT write any of this:
${EMAIL_FIXED.map((line) => `- ${line}`).join('\n')}

I only fill in a Subject and a Message, as plain text (no HTML, no images, no emojis in the subject).
Choose one Look:
${looks}

In the Message you can use:
${codes}

Rules:
- Subject: under ${SUBJECT_MAX} characters, clear, no clickbait.
- Message: under ${BODY_MAX} characters; start with "Hi {name}," on its own line, then a blank line.
- Short paragraphs (2–3 sentences), friendly and plain, like a person writing, not marketing.
- At most one button link (https://youdo-app.vercel.app opens YouDO), on its own line.
- Don't promise things that aren't true, and don't ask for passwords, payments or personal details.

Reply in exactly this form so I can paste each part:
Name: (a short template name, under 60 characters)
Look: (News, Thank you or Note)
Subject: ...
Message:
...`;
}
