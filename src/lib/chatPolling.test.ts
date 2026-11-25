import { describe, expect, it } from 'vitest';
import { CHAT_POLL_MAX_MS, CHAT_POLL_MIN_MS, nextChatPollMs } from './chatPolling';

describe('community chat polling', () => {
  it('eases off while the room is quiet, up to the slowest pace', () => {
    let delay = CHAT_POLL_MIN_MS;
    const seen: number[] = [];
    for (let i = 0; i < 8; i++) {
      delay = nextChatPollMs(delay, false);
      seen.push(delay);
    }
    expect(seen[0]).toBeGreaterThan(CHAT_POLL_MIN_MS);
    expect(seen.every((d, i) => i === 0 || d >= seen[i - 1])).toBe(true);
    expect(seen[seen.length - 1]).toBe(CHAT_POLL_MAX_MS);
  });

  it('goes back to the quick pace as soon as something new arrives', () => {
    expect(nextChatPollMs(CHAT_POLL_MAX_MS, true)).toBe(CHAT_POLL_MIN_MS);
  });

  it('a quiet minute costs far fewer checks than the old 2 s timer', () => {
    let delay = CHAT_POLL_MIN_MS;
    let elapsed = 0;
    let checks = 0;
    while (elapsed < 60_000) {
      elapsed += delay;
      checks++;
      delay = nextChatPollMs(delay, false);
    }
    expect(checks).toBeLessThan(10); // was 30
  });
});
