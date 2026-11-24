import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

/**
 * The Admin Hub's people, staff, growth and cleanup (supabase/admin_hub.sql).
 * The server decides what each role may see and do; `can` only mirrors it so
 * the app never shows a button that would be refused.
 */
export type AdminRole = 'owner' | 'admin';

export type AdminPower =
  | 'moderate' | 'hashtags' | 'quotes' | 'people'
  | 'emails' | 'staff' | 'broadcast' | 'roomSwitches' | 'money' | 'growth' | 'deleteAccounts';

const ADMIN_POWERS: ReadonlySet<AdminPower> = new Set(['moderate', 'hashtags', 'quotes', 'people']);

export function can(role: AdminRole | null | undefined, power: AdminPower): boolean {
  if (role === 'owner') return true;
  return role === 'admin' && ADMIN_POWERS.has(power);
}

export interface AdminPerson {
  id: string;
  username?: string;
  name?: string;
  joined: string;
  lastActive?: string;
  onBoard: boolean;
  boardWeekMs: number;
  rooms: number;
  messages: number;
  reported: number;
  role?: AdminRole;
  badgeVisible: boolean;
  mutedUntil?: string;
  bannedAt?: string;
  note?: string;
  hashtag?: string;
  // The owner only; absent for admins.
  email?: string;
  confirmed?: boolean;
  lastSignIn?: string;
  backupBytes?: number;
  backupUpdated?: string;
  friends?: number;
  directMessages?: number;
  backer?: boolean;
  junk?: 'unconfirmed' | 'empty';
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0);

export function parseAdminPerson(raw: unknown): AdminPerson | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = text(row.user_id);
  if (!id) return null;
  const role = row.staff_role === 'owner' || row.staff_role === 'admin' ? row.staff_role : undefined;
  const junk = row.junk === 'unconfirmed' || row.junk === 'empty' ? row.junk : undefined;
  return {
    id,
    username: text(row.username),
    name: text(row.display_name),
    joined: text(row.created_at) ?? '',
    lastActive: text(row.last_active_at),
    onBoard: row.on_board === true,
    boardWeekMs: num(row.board_week_ms),
    rooms: num(row.room_count),
    messages: num(row.message_count),
    reported: num(row.reported_count),
    role,
    badgeVisible: row.badge_visible === true,
    mutedUntil: text(row.muted_until),
    bannedAt: text(row.banned_at),
    note: text(row.moderation_note),
    hashtag: text(row.hashtag),
    email: text(row.email),
    confirmed: 'email_confirmed_at' in row ? Boolean(text(row.email_confirmed_at)) : 'email' in row ? false : undefined,
    lastSignIn: text(row.last_sign_in_at),
    backupBytes: 'backup_bytes' in row ? num(row.backup_bytes) : undefined,
    backupUpdated: text(row.backup_updated_at),
    friends: 'friend_count' in row ? num(row.friend_count) : undefined,
    directMessages: 'direct_message_count' in row ? num(row.direct_message_count) : undefined,
    backer: row.is_backer === true ? true : undefined,
    junk,
  };
}

/** The person's name as the hub shows it. */
export function personLabel(person: Pick<AdminPerson, 'name' | 'username'>): string {
  return person.name ?? (person.username ? `@${person.username}` : 'No name yet');
}

export function isMuted(person: Pick<AdminPerson, 'mutedUntil'>, now = Date.now()): boolean {
  return Boolean(person.mutedUntil && Date.parse(person.mutedUntil) > now);
}

/** "active now", "2 h ago", "yesterday", "12 days ago", "never". */
export function activeLabel(iso: string | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (minutes < 10) return 'now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export type PeopleFilter = 'all' | 'staff' | 'muted' | 'banned' | 'never_started' | 'junk';

export interface PeoplePage {
  total: number;
  counts: { all: number; staff: number; muted: number; banned: number };
  people: AdminPerson[];
}

export function parsePeoplePage(raw: unknown): PeoplePage {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const counts = (row.counts && typeof row.counts === 'object' ? row.counts : {}) as Record<string, unknown>;
  return {
    total: num(row.total),
    counts: { all: num(counts.all), staff: num(counts.staff), muted: num(counts.muted), banned: num(counts.banned) },
    people: (Array.isArray(row.people) ? row.people : []).map(parseAdminPerson).filter((person): person is AdminPerson => person !== null),
  };
}

export interface GrowthWeek { week: string; signups: number; confirmed: number; started: number; cameBack: number; active7d: number }
export interface GrowthSplit { signups: number; started: number; cameBack: number }
export interface GrowthReport {
  accounts: number; confirmed: number; started: number; cameBack: number;
  active7d: number; active30d: number; new7d: number; new7dConfirmed: number; studyingNow: number;
  weeks: GrowthWeek[];
  beforeV8: GrowthSplit; sinceV8: GrowthSplit;
  cleanup: { unconfirmed: number; empty: number };
  databaseBytes: number;
  largestTables: { name: string; bytes: number }[];
}

const split = (raw: unknown): GrowthSplit => {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { signups: num(row.signups), started: num(row.started), cameBack: num(row.came_back) };
};

export function parseGrowthReport(raw: unknown): GrowthReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const cleanup = (row.cleanup && typeof row.cleanup === 'object' ? row.cleanup : {}) as Record<string, unknown>;
  return {
    accounts: num(row.accounts), confirmed: num(row.confirmed), started: num(row.started), cameBack: num(row.came_back),
    active7d: num(row.active_7d), active30d: num(row.active_30d), new7d: num(row.new_7d), new7dConfirmed: num(row.new_7d_confirmed),
    studyingNow: num(row.studying_now),
    weeks: (Array.isArray(row.weeks) ? row.weeks : []).map((item) => {
      const week = (item ?? {}) as Record<string, unknown>;
      return { week: String(week.week ?? ''), signups: num(week.signups), confirmed: num(week.confirmed), started: num(week.started), cameBack: num(week.came_back), active7d: num(week.active_7d) };
    }),
    beforeV8: split(row.before_v8), sinceV8: split(row.since_v8),
    cleanup: { unconfirmed: num(cleanup.unconfirmed), empty: num(cleanup.empty) },
    databaseBytes: num(row.database_bytes),
    largestTables: (Array.isArray(row.largest_tables) ? row.largest_tables : []).map((item) => {
      const table = (item ?? {}) as Record<string, unknown>;
      return { name: String(table.name ?? ''), bytes: num(table.bytes) };
    }),
  };
}

/** Of the people who started, the share who came back after their first day (0–100), or null with too few to say. */
export function returnRate(split: GrowthSplit, minimum = 5): number | null {
  if (split.started < minimum) return null;
  return Math.round((split.cameBack / split.started) * 100);
}

export interface CleanupPreview {
  unconfirmed: number;
  empty: number;
  sample: { reason: 'unconfirmed' | 'empty'; createdAt: string; confirmed: boolean; lastActive?: string }[];
}

export function parseCleanupPreview(raw: unknown): CleanupPreview {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    unconfirmed: num(row.unconfirmed),
    empty: num(row.empty),
    sample: (Array.isArray(row.sample) ? row.sample : []).map((item) => {
      const entry = (item ?? {}) as Record<string, unknown>;
      return {
        reason: entry.reason === 'unconfirmed' ? 'unconfirmed' as const : 'empty' as const,
        createdAt: String(entry.created_at ?? ''),
        confirmed: entry.confirmed === true,
        lastActive: text(entry.last_active_at),
      };
    }),
  };
}

const failure = (error: { message?: string } | null | undefined, fallback: string) =>
  error?.message?.includes('Could not find the function') ? 'The Admin Hub needs a server update first (admin_hub.sql).' : error?.message || fallback;

export async function fetchAdminRole(): Promise<AdminRole | null> {
  const { data, error } = await supabase.rpc('admin_hub_role');
  if (error) return null;
  return data === 'owner' || data === 'admin' ? data : null;
}

export async function fetchPeople(search: string, filter: PeopleFilter, offset = 0, pageSize = 40): Promise<PeoplePage> {
  const { data, error } = await supabase.rpc('admin_people', { search: search.trim(), people_filter: filter, page_size: pageSize, page_offset: offset });
  if (error) throw new Error(failure(error, 'Could not load people.'));
  return parsePeoplePage(data);
}

export async function fetchPerson(id: string): Promise<AdminPerson> {
  const { data, error } = await supabase.rpc('admin_person', { target: id });
  const person = parseAdminPerson(data);
  if (error || !person) throw new Error(failure(error, 'Could not open this person.'));
  return person;
}

export type StaffAction = 'promote' | 'demote' | 'show_badge' | 'hide_badge';

export async function setStaff(id: string, action: StaffAction): Promise<AdminPerson> {
  const { data, error } = await supabase.rpc('owner_set_staff', { target: id, staff_action: action });
  const person = parseAdminPerson(data);
  if (error || !person) throw new Error(failure(error, 'Could not change the role.'));
  return person;
}

export async function fetchGrowth(): Promise<GrowthReport> {
  const { data, error } = await supabase.rpc('owner_growth_report', { weeks: 12 });
  const report = parseGrowthReport(data);
  if (error || !report) throw new Error(failure(error, 'Could not load the numbers.'));
  return report;
}

export async function fetchCleanupPreview(): Promise<CleanupPreview> {
  const { data, error } = await supabase.rpc('owner_cleanup_preview', { page_size: 50 });
  if (error) throw new Error(failure(error, 'Could not load the cleanup list.'));
  return parseCleanupPreview(data);
}

export type DeleteRequest = { mode: 'all'; expectedCount: number } | { mode: 'one'; target: string; typed: string };

/** Deletes through the owner-delete-accounts edge function; returns how many went. */
export async function deleteAccounts(request: DeleteRequest): Promise<number> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('Sign in again first.');
  const response = await fetch(`${supabaseUrl}/functions/v1/owner-delete-accounts`, {
    method: 'POST',
    headers: { apikey: supabaseAnonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (response.status === 404) throw new Error('Deleting needs a server update first (the owner-delete-accounts function).');
  const result = await response.json().catch(() => null) as { ok?: boolean; deleted?: number; error?: string | null } | null;
  if (!result) throw new Error('The server did not answer. Nothing may have been deleted; open the list again.');
  if (!result.ok && !result.deleted) throw new Error(result.error || 'Nothing was deleted.');
  if (!result.ok) throw new Error(`${result.deleted} deleted, then it stopped: ${result.error}`);
  return result.deleted ?? 0;
}

/** Names for the people behind reports, appeals and requests: their Private Hub name, else their community name. */
export async function fetchNames(ids: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter(Boolean))];
  const names = new Map<string, string>();
  if (!wanted.length) return names;
  const [profiles, members] = await Promise.all([
    supabase.from('profiles').select('id, username, display_name').in('id', wanted),
    supabase.from('community_members').select('user_id, display_name').in('user_id', wanted),
  ]);
  for (const row of (members.data ?? []) as { user_id: string; display_name: string | null }[]) {
    if (row.display_name?.trim()) names.set(row.user_id, row.display_name.trim());
  }
  for (const row of (profiles.data ?? []) as { id: string; username: string | null; display_name: string | null }[]) {
    const label = row.display_name?.trim() || (row.username ? `@${row.username}` : '');
    if (label) names.set(row.id, label);
  }
  return names;
}
