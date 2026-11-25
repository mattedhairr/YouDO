/**
 * Community chat has no realtime, so an open room checks for new messages by
 * itself. It used to check every 2 s whatever happened, one request each time
 * from every open chat. Now it checks quickly while the room is busy and eases
 * off while it is quiet: every new message, or one you send, brings it back to
 * the quick pace.
 */
export const CHAT_POLL_MIN_MS = 2_500;
export const CHAT_POLL_MAX_MS = 12_000;
const EASE = 1.5;

/** How long to wait before the next check, after a check that did (or didn't) find something new. */
export function nextChatPollMs(current: number, foundNew: boolean): number {
  if (foundNew) return CHAT_POLL_MIN_MS;
  return Math.min(CHAT_POLL_MAX_MS, Math.max(CHAT_POLL_MIN_MS, Math.round(current * EASE)));
}
