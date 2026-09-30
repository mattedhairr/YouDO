/** Readiness belongs to an account, never to the AuthGate component itself. */
export function canOpenAccountWorkspace(userId: string | null, inspectedUserId: string | null, owner: string | null): boolean {
  return userId !== null && userId === inspectedUserId && userId === owner;
}

/** Offline access is available when the device has no owner or when an existing local workspace is present (including after account deletion). */
export function canContinueOffline(hasLocalWorkspace: boolean, owner: string | null): boolean {
  return owner === null || hasLocalWorkspace;
}

/** Open the local workspace in offline mode only when signed out and eligible. */
export function canOpenOfflineWorkspace(options: {
  user: unknown;
  offlineMode: boolean;
  hasLocalWorkspace: boolean;
  owner: string | null;
}): boolean {
  if (options.user !== null || !options.offlineMode) return false;
  return canContinueOffline(options.hasLocalWorkspace, options.owner);
}

