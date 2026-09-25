import type { StreakMeta } from './focusTrends';
import type { PacePrefs } from './paceBoard';
import { deletePaceRow, reconcileBoardEvidence, upsertPaceRow } from './paceCloud';

export async function syncPublicPaceRow(input: {
  userId: string;
  prefs: PacePrefs;
  streakMeta: StreakMeta;
}): Promise<{ ok: boolean; missingTable?: boolean; skipped?: boolean; status?: string; rejected?: number }> {
  if (!input.prefs.optedIn) return { ok: true, skipped: true };
  const displayName = input.prefs.displayName.trim();
  if (!displayName) return { ok: true, skipped: true };
  const profile = await upsertPaceRow({
    userId: input.userId,
    displayName,
    examLabel: input.prefs.examLabel.trim(),
    barHours: input.streakMeta.barHours,
  });
  if (!profile.ok) return profile;
  const evidence = await reconcileBoardEvidence();
  return { ok: evidence.ok && evidence.status === 'current', status: evidence.status, rejected: evidence.rejected };
}

export async function withdrawPublicPace(userId: string) {
  return deletePaceRow(userId);
}
