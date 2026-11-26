import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';
import type { GrowthDay, GrowthReport, GrowthWeek } from './adminHub';

/**
 * The Owner tab's Growth and Account cleanup (supabase/admin_hub.sql), the
 * Admin Hub Home's "Worth a look", and downloads from GitHub Releases.
 * Pure helpers first, then the server calls.
 */

export interface Change { label: string; trend: 'up' | 'down' | 'same' }

/** "▲ 6 more than last week", "▼ 3 fewer than a usual day" or "Same as last week". */
export function changeAgainst(now: number, before: number, what: string): Change {
  const diff = Math.round(now - before);
  if (diff > 0) return { label: `▲ ${diff} more than ${what}`, trend: 'up' };
  if (diff < 0) return { label: `▼ ${-diff} fewer than ${what}`, trend: 'down' };
  return { label: `Same as ${what}`, trend: 'same' };
}

/** Opens are counted from v9 on; earlier days show flat. */
export function isCounted(day: Pick<GrowthDay, 'day'>, opensSince: string | undefined): boolean {
  return Boolean(opensSince) && day.day >= (opensSince ?? '');
}

/** A usual day: the average of the counted days before `before` (today by default, which is still going), or null below 3 days. */
export function usualDay(days: GrowthDay[], opensSince: string | undefined, before = days.length - 1): number | null {
  const counted = days.slice(0, Math.max(0, before)).filter((day) => isCounted(day, opensSince));
  if (counted.length < 3) return null;
  return Math.round(counted.reduce((sum, day) => sum + day.opened, 0) / counted.length);
}

/** A usual week: the average of the weeks shown, or null below 3 weeks. */
export function usualWeek(weeks: GrowthWeek[]): number | null {
  if (weeks.length < 3) return null;
  return Math.round(weeks.reduce((sum, week) => sum + week.signups, 0) / weeks.length);
}

export interface ReadoutFact { value: number; label: string; key?: 'main' | 'rest' }
export interface Readout { when: string; picked: boolean; value: number | null; unit: string; change?: Change; facts: ReadoutFact[]; note?: string }

const peopleUnit = (count: number) => (count === 1 ? 'person opened YouDO' : 'people opened YouDO');

/** People using YouDO: this week until a day is tapped, then that day against a usual one. */
export function peopleReadout(growth: GrowthReport, picked: number | null, dayName: (iso: string) => string): Readout {
  const day = picked === null ? undefined : growth.days[picked];
  if (!day) {
    const { thisWeek, lastWeek } = growth;
    if (!growth.opensSince) return { when: 'This week', picked: false, value: null, unit: 'people opened YouDO', facts: [], note: 'Counting starts once people install v9.' };
    return {
      when: 'This week', picked: false, value: thisWeek.opened, unit: peopleUnit(thisWeek.opened),
      change: changeAgainst(thisWeek.opened, lastWeek.opened, 'last week'),
      facts: [
        { value: thisWeek.opened - thisWeek.withoutAccount, label: 'signed in', key: 'main' },
        { value: thisWeek.withoutAccount, label: 'without an account', key: 'rest' },
        { value: thisWeek.regulars, label: 'regulars, 3+ days' },
      ],
    };
  }
  const isToday = picked === growth.days.length - 1;
  const when = isToday ? 'Today so far' : dayName(day.day);
  if (!isCounted(day, growth.opensSince)) {
    return { when, picked: true, value: null, unit: 'people opened YouDO', facts: [], note: 'Not counted: counting started with v9.' };
  }
  const usual = usualDay(growth.days, growth.opensSince);
  return {
    when, picked: true, value: day.opened, unit: peopleUnit(day.opened),
    change: usual === null || isToday ? undefined : changeAgainst(day.opened, usual, 'a usual day'),
    facts: [
      { value: day.signedIn, label: 'signed in', key: 'main' },
      { value: day.withoutAccount, label: 'without an account', key: 'rest' },
      ...(usual === null ? [] : [{ value: usual, label: 'a usual day' }]),
    ],
  };
}

/** New people arriving: this week against last until a week is tapped, then that week against a usual one. */
export function arrivalsReadout(growth: GrowthReport, picked: number | null, dayName: (iso: string) => string): Readout {
  const weeks = growth.weeks;
  const last = weeks.length - 1;
  const week = picked === null ? weeks[last] : weeks[picked];
  if (!week) return { when: 'This week', picked: false, value: null, unit: 'new accounts', facts: [] };
  const unit = week.signups === 1 ? 'new account' : 'new accounts';
  if (week === weeks[last]) {
    const before = weeks[last - 1];
    return {
      when: 'This week', picked: picked !== null, value: week.signups, unit,
      change: before ? changeAgainst(week.signups, before.signups, 'last week') : undefined,
      facts: [
        { value: week.confirmed, label: 'confirmed', key: 'main' },
        { value: week.signups - week.confirmed, label: 'not yet', key: 'rest' },
        { value: week.started, label: 'made a plan or joined the Board' },
      ],
    };
  }
  const usual = usualWeek(weeks);
  return {
    when: `Week of ${dayName(week.week)}`, picked: true, value: week.signups, unit,
    change: usual === null ? undefined : changeAgainst(week.signups, usual, 'a usual week'),
    facts: [
      { value: week.confirmed, label: 'confirmed', key: 'main' },
      { value: week.started, label: 'made a plan or joined the Board' },
      { value: week.cameBack, label: 'came back after day one' },
    ],
    note: week.deleted ? `Includes ${week.deleted} since deleted.` : undefined,
  };
}

/** Today's opens against the same weekday last week, or null when that day wasn't counted. */
export function sameDayLastWeek(growth: GrowthReport, dayName: (iso: string) => string): Change | null {
  const today = growth.days[growth.days.length - 1];
  const before = growth.days[growth.days.length - 8];
  if (!today || !before || !isCounted(before, growth.opensSince)) return null;
  return changeAgainst(today.opened, before.opened, `last ${dayName(before.day)}`);
}

/** How many accounts YouDO has right now, after any cleanup (unlike Growth and the funnel, deleted ones are not in these). */
export function accountTotals(growth: Pick<GrowthReport, 'accounts' | 'confirmed' | 'active30d'>): {
  tiles: { value: number; label: string }[];
} {
  return {
    tiles: [
      { value: growth.accounts, label: 'Accounts' },
      { value: growth.confirmed, label: 'Confirmed' },
      { value: Math.max(0, growth.accounts - growth.confirmed), label: 'Not yet' },
      { value: growth.active30d, label: 'Active 30d' },
    ],
  };
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

// ── Worth a look (Admin Hub Home): only what is unusual, each opening its screen ──

/** Supabase's free plan. */
export const FREE_DATABASE_BYTES = 500 * 1024 * 1024;
const CLEANUP_WORTH_A_LOOK = 10;
const DATABASE_WORTH_A_LOOK = 0.8;
const RELEASE_WORTH_A_LOOK_DAYS = 14;

export type LookId = 'fewer' | 'cleanup' | 'database' | 'downloads';
export interface LookItem { id: LookId; title: string; text: string }

export function worthALook(growth: GrowthReport, latest: ReleaseDownloads | null, now = Date.now()): LookItem[] {
  const items: LookItem[] = [];
  const yesterdayIndex = growth.days.length - 2;
  const yesterday = growth.days[yesterdayIndex];
  const counted = growth.days.slice(0, Math.max(0, yesterdayIndex)).filter((day) => isCounted(day, growth.opensSince)).length;
  const usual = usualDay(growth.days, growth.opensSince, yesterdayIndex);
  if (yesterday && usual !== null && counted >= 7 && isCounted(yesterday, growth.opensSince)
    && yesterday.opened < usual * 0.75 && usual - yesterday.opened >= 3) {
    items.push({ id: 'fewer', title: 'Fewer people than usual', text: `Yesterday ${yesterday.opened}, a usual day is ${usual}.` });
  }
  const cleanup = growth.cleanup.unconfirmed + growth.cleanup.empty;
  if (cleanup >= CLEANUP_WORTH_A_LOOK) items.push({ id: 'cleanup', title: `${cleanup} accounts to clean up`, text: 'Never confirmed or nothing saved.' });
  const used = growth.databaseBytes / FREE_DATABASE_BYTES;
  if (used >= DATABASE_WORTH_A_LOOK) {
    const largest = growth.largestTables[0];
    items.push({ id: 'database', title: `Database ${Math.round(used * 100)}% full`, text: `Of the free 500 MB.${largest ? ` Largest: ${largest.name.replace(/_/g, ' ')}.` : ''}` });
  }
  const published = latest ? Date.parse(latest.publishedAt) : NaN;
  const age = Math.floor((now - published) / 86_400_000);
  if (latest && Number.isFinite(published) && age >= 0 && age < RELEASE_WORTH_A_LOOK_DAYS) {
    const since = age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`;
    items.push({ id: 'downloads', title: `v${latest.version}: ${latest.downloads} ${latest.downloads === 1 ? 'download' : 'downloads'}`, text: `Since it came out ${since}.` });
  }
  return items;
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
