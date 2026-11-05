import { describe, expect, it } from 'vitest';
import { draftSignature, EMPTY_UPDATE_DRAFT, parseUpdateAction, parseUpdateState, updateResetKind, validateDraft } from './boardUpdate';

describe('updateResetKind', () => {
  it('takes down what is live, even while the form is empty or edited', () => {
    expect(updateResetKind('Live now', 'Live now', EMPTY_UPDATE_DRAFT)).toBe('live');
    expect(updateResetKind('Live now', '', EMPTY_UPDATE_DRAFT)).toBe('live');
    expect(updateResetKind('Live now', 'Edited', EMPTY_UPDATE_DRAFT)).toBe('live');
  });
  it('only empties a draft when nothing is live', () => {
    expect(updateResetKind('', 'Draft', EMPTY_UPDATE_DRAFT)).toBe('draft');
    expect(updateResetKind('  ', '', { ...EMPTY_UPDATE_DRAFT, allowReplies: true })).toBe('draft');
  });
  it('has nothing to reset on an empty form', () => {
    expect(updateResetKind('', '  ', EMPTY_UPDATE_DRAFT)).toBeNull();
  });
  it('leaves nothing behind that differs from a cleared update', () => {
    expect(draftSignature('', EMPTY_UPDATE_DRAFT)).toBe(draftSignature('', { ...EMPTY_UPDATE_DRAFT, allowReplies: true }));
  });
});

describe('parseUpdateState', () => {
  it('reads a poll, reactions, replies and the action', () => {
    expect(parseUpdateState({
      revision: 7,
      poll: { options: ['Classic', 'New look'], closed: false, my_choice: 1, counts: [3, 9], total: 12 },
      reactions: { '👍': 4, '🔥': 2, '💩': 9 },
      my_reaction: '👍',
      replies: true,
      replied: false,
      action: { kind: 'updater', label: 'Check for updates' },
    })).toEqual({
      revision: 7,
      poll: { options: ['Classic', 'New look'], closed: false, myChoice: 1, counts: [3, 9], total: 12 },
      reactions: { '👍': 4, '🔥': 2 },
      myReaction: '👍',
      replies: true,
      replied: false,
      action: { kind: 'updater', label: 'Check for updates' },
    });
  });

  it('hides results the server did not send (before voting)', () => {
    expect(parseUpdateState({ revision: 1, poll: { options: ['A', 'B'], my_choice: null, counts: null, total: 5 } })?.poll)
      .toMatchObject({ myChoice: null, counts: null });
  });

  it('ignores a malformed answer', () => {
    expect(parseUpdateState(null)).toBeNull();
    expect(parseUpdateState({ revision: 'x' })).toBeNull();
    expect(parseUpdateState({ revision: 1, poll: { options: ['only one'] } })?.poll).toBeNull();
  });
});

describe('parseUpdateAction', () => {
  it('only opens YouDO on GitHub or Telegram', () => {
    expect(parseUpdateAction({ kind: 'link', label: 'Release notes', url: 'https://github.com/mattedhairr/YouDO/releases/latest' }))
      .toEqual({ kind: 'link', label: 'Release notes', url: 'https://github.com/mattedhairr/YouDO/releases/latest' });
    expect(parseUpdateAction({ kind: 'link', label: 'Join', url: 'https://t.me/YouDO_Updates' })?.kind).toBe('link');
    expect(parseUpdateAction({ kind: 'link', label: 'Win', url: 'https://evil.example/x' })).toBeNull();
    expect(parseUpdateAction({ kind: 'link', label: 'Win', url: 'https://github.com/someone-else/repo' })).toBeNull();
    expect(parseUpdateAction({ kind: 'script', label: 'x' })).toBeNull();
  });
});

describe('validateDraft', () => {
  const base = { pollOptions: [], allowReplies: false, action: null };
  it('accepts a plain update or a good poll', () => {
    expect(validateDraft('Hello', base)).toBeNull();
    expect(validateDraft('Pick one', { ...base, pollOptions: ['A', 'B', ''] })).toBeNull();
  });
  it('explains what to fix', () => {
    expect(validateDraft('Pick', { ...base, pollOptions: ['A'] })).toBe('A poll needs at least 2 options.');
    expect(validateDraft('Pick', { ...base, pollOptions: ['A', 'a'] })).toBe('Poll options must be different.');
    expect(validateDraft('Go', { ...base, action: { kind: 'link', label: 'Go', url: 'https://example.com' } }))
      .toBe('Links can only open YouDO on GitHub or Telegram.');
  });
});

describe('draftSignature', () => {
  it('treats blank poll rows as no poll, so an unchanged update stays unchanged', () => {
    const base = { pollOptions: [], allowReplies: false, action: null };
    expect(draftSignature('Hi', { ...base, pollOptions: ['', ' '] })).toBe(draftSignature('Hi', base));
    expect(draftSignature('Hi', { ...base, allowReplies: true })).not.toBe(draftSignature('Hi', base));
    expect(draftSignature('  ', { pollOptions: ['A', 'B'], allowReplies: true, action: null })).toBe(draftSignature('', base));
  });
});
