/** Readiness belongs to an account, never to the AuthGate component itself. */
export function canOpenAccountWorkspace(userId: string | null, inspectedUserId: string | null, owner: string | null): boolean {
  return userId !== null && userId === inspectedUserId && userId === owner;
}
