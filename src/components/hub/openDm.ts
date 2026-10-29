/**
 * "Open a chat with this person" from outside the Private Hub (a Public Board
 * profile, a notification tap). The request survives until the Private Hub
 * mounts and takes it, so switching tabs first is fine.
 */
export const OPEN_DM_EVENT = 'youdo-open-dm';

let pendingUserId: string | null = null;

export function requestOpenDm(userId: string): void {
  pendingUserId = userId;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_DM_EVENT, { detail: userId }));
}

/** Returns and clears the waiting request, if any. */
export function takePendingDm(): string | null {
  const id = pendingUserId;
  pendingUserId = null;
  return id;
}

/** "Open this room" from outside the Private Hub (a Room widget tap), handed over the same way. */
export const OPEN_ROOM_EVENT = 'youdo-open-room';

let pendingRoomId: string | null = null;

export function requestOpenRoom(roomId: string): void {
  pendingRoomId = roomId;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_ROOM_EVENT, { detail: roomId }));
}

export function takePendingRoom(): string | null {
  const id = pendingRoomId;
  pendingRoomId = null;
  return id;
}
