/**
 * Device Back inside the Admin Hub: a Controls page or Backer claims closes first,
 * returning to the Controls list instead of closing the Admin Hub.
 */
let handler: (() => boolean) | null = null;

export function setAdminBackHandler(next: (() => boolean) | null): void {
  handler = next;
}

/** True when the Admin Hub handled Back itself (and must stay open). */
export function adminBackStep(): boolean {
  return handler?.() ?? false;
}
