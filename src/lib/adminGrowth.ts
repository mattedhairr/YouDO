import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';
import type { GrowthDay, GrowthReport } from './adminHub';

/**
 * The Owner tab's Growth and Account cleanup (supabase/admin_hub.sql), and
 * downloads from GitHub Releases. Pure helpers first, then the server calls.
 */

/** This week against last week: "▲ 6", "▼ 2" or "same". */
export function weekChange(now: number, before: number): { label: string; trend: 'up' | 'down' | 'same' } {
  const diff = now - before;
  if (diff > 0) return { label: `▲ ${diff}`, trend: 'up' };
  if (diff < 0) return { label: `▼ ${-diff}`, trend: 'down' };
  return { label: 'same', trend: 'same' };
}

export type DayMetric = 'opened' | 'newAccounts' | 'studied';

export const DAY_METRICS: { id: DayMetric; label: string }[] = [
  { id: 'opened', label: 'Opened' },
  { id: 'newAccounts', label: 'New accounts' },
  { id: 'studied', label: 'Studied' },
];

/** What a tapped day says, in plain words. */
export function dayDetail(day: GrowthDay): string[] {
  const lines = [`${day.opened} opened YouDO`];
  if (day.opened) lines.push(`${day.signedIn} signed in · ${day.withoutAccount} without an account`);
  lines.push(`${day.newAccounts} new ${day.newAccounts === 1 ? 'account' : 'accounts'}${day.newAccounts ? ` (${day.newConfirmed} confirmed)` : ''}`);
  lines.push(`${day.studied} focused on the Board`);
  return lines;
}

export interface FunnelStep { label: string; count: number; percent?: number }

/** Sign-up to habit, deleted accounts included so a cleanup never rewrites it. */
export function growthFunnel(growth: GrowthReport): FunnelStep[] {
  const signedUp = growth.accounts + growth.deleted.count;
  const confirmed = growth.confirmed + growth.deleted.confirmed;
  const started = growth.started + growth.deleted.started;
  const cameBack = growth.cameBack + growth.deleted.cameBack;
  const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : undefined);
  return [
    { label: 'Signed up', count: signedUp },
    { label: 'Confirmed their email', count: confirmed, percent: share(confirmed, signedUp) },
    { label: 'Made a plan or joined the Board', count: started, percent: share(started, confirmed) },
    { label: 'Came back after day one', count: cameBack, percent: share(cameBack, started) },
    { label: 'Active this month', count: growth.active30d },
  ];
}

/** The step that loses the most people, for one plain sentence under the funnel. */
export function biggestDrop(steps: FunnelStep[]): { from: string; to: string; lost: number } | null {
  let best: { from: string; to: string; lost: number } | null = null;
  for (let i = 1; i < 4 && i < steps.length; i += 1) {
    const lost = steps[i - 1].count - steps[i].count;
    if (lost > 0 && (!best || lost > best.lost)) best = { from: steps[i - 1].label, to: steps[i].label, lost };
  }
  return best;
}

// ── Account cleanup ──

export type CleanupKind = 'unconfirmed' | 'empty' | 'both';
export type CleanupSignIn = 'never' | '60' | '180' | 'any';
export interface CleanupFilters { kind: CleanupKind; signedUpDays: number; signIn: CleanupSignIn; search: string }
export const DEFAULT_CLEANUP_FILTERS: CleanupFilters = { kind: 'both', signedUpDays: 7, signIn: 'any', search: '' };

export interface CleanupAccount {
  id: string; email?: string; username?: string; createdAt: string; confirmed: boolean;
  lastSignIn?: string; lastActive?: string; reason: 'unconfirmed' | 'empty';
}
export interface CleanupList { unconfirmed: number; empty: number; matching: number; accounts: CleanupAccount[] }

const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0);

export function parseCleanupList(raw: unknown): CleanupList {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    unconfirmed: count(row.unconfirmed),
    empty: count(row.empty),
    matching: count(row.matching),
    accounts: (Array.isArray(row.accounts) ? row.accounts : []).flatMap((item): CleanupAccount[] => {
      const entry = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const id = str(entry.id);
      if (!id) return [];
      return [{
        id,
        email: str(entry.email),
        username: str(entry.username),
        createdAt: String(entry.created_at ?? ''),
        confirmed: entry.confirmed === true,
        lastSignIn: str(entry.last_sign_in_at),
        lastActive: str(entry.last_active_at),
        reason: entry.reason === 'unconfirmed' ? 'unconfirmed' : 'empty',
      }];
    }),
  };
}

/** One line under the email: "Signed up 12 Sep · never confirmed · never signed in". */
export function cleanupLine(account: CleanupAccount, format: (iso: string) => string): string {
  const parts = [`Signed up ${format(account.createdAt)}`, account.confirmed ? 'confirmed, nothing saved' : 'never confirmed'];
  parts.push(account.lastSignIn ? `last sign-in ${format(account.lastSignIn)}` : 'never signed in');
  return parts.join(' · ');
}

const failure = (message: string | undefined, fallback: string) =>
  message?.includes('Could not find the function') ? 'Account cleanup needs a server update first (admin_hub.sql).' : message || fallback;

export async function fetchCleanupList(filters: CleanupFilters): Promise<CleanupList> {
  const { data, error } = await supabase.rpc('owner_cleanup_list', {
    kind: filters.kind, signed_up_days: filters.signedUpDays, sign_in: filters.signIn, search: filters.search.trim(), page_size: 300,
  });
  if (error) throw new Error(failure(error.message, 'Could not load the cleanup list.'));
  return parseCleanupList(data);
}

/** Deletes the ticked accounts through owner-delete-accounts; the server keeps only those the rules still allow. */
export async function deleteChosenAccounts(ids: string[]): Promise<{ deleted: number; skipped: number }> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('Sign in again first.');
  const response = await fetch(`${supabaseUrl}/functions/v1/owner-delete-accounts`, {
    method: 'POST',
    headers: { apikey: supabaseAnonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'chosen', ids }),
  });
  if (response.status === 404) throw new Error('Deleting needs a server update first (the owner-delete-accounts function).');
  const result = await response.json().catch(() => null) as { ok?: boolean; deleted?: number; skipped?: number; error?: string | null } | null;
  if (!result) throw new Error('The server did not answer. Nothing may have been deleted; open the list again.');
  if (!result.ok && !result.deleted) throw new Error(result.error || 'Nothing was deleted.');
  if (!result.ok) throw new Error(`${result.deleted} deleted, then it stopped: ${result.error}`);
  return { deleted: result.deleted ?? 0, skipped: result.skipped ?? 0 };
}

// ── Downloads (GitHub Releases: the website, in-app updates and Orion Store) ──

export interface ReleaseDownloads { version: string; publishedAt: string; downloads: number }

export function parseReleases(raw: unknown): ReleaseDownloads[] {
  return (Array.isArray(raw) ? raw : []).flatMap((item): ReleaseDownloads[] => {
    const release = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    if (release.draft === true) return [];
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const downloads = assets.reduce((sum: number, asset) => {
      const entry = (asset && typeof asset === 'object' ? asset : {}) as Record<string, unknown>;
      return typeof entry.name === 'string' && entry.name.endsWith('.apk') ? sum + count(entry.download_count) : sum;
    }, 0);
    const version = str(release.tag_name)?.replace(/^v/, '');
    return version ? [{ version, publishedAt: String(release.published_at ?? ''), downloads }] : [];
  });
}

export async function fetchReleaseDownloads(): Promise<ReleaseDownloads[]> {
  const response = await fetch('https://api.github.com/repos/mattedhairr/YouDO/releases?per_page=6', {
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error('GitHub did not answer. Try again later.');
  return parseReleases(await response.json());
}
