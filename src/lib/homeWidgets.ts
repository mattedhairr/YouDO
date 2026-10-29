import { Capacitor, registerPlugin } from '@capacitor/core';
import type { GoalNode, Task } from '../types';
import type { FocusState, FocusStatus } from './focusStatus';
import { isTaskComplete, pathTitles, rollupPct } from './goalTree';
import { ACCENT_SWATCHES, resolveAccent } from './accentColors';
import { msUntilEndOfLocalISODate, shiftLocalISO, todayISO } from './dates';
import { daysUntil } from './goalPace';

/*
 * Android home-screen widgets (Up next, Progress, Room). The widgets cannot run
 * this app's code, so the app hands Android a small snapshot whenever something
 * they show changes. Stop on the widget is queued natively and handled here when
 * the app is next open.
 * Start, Pause and Resume run natively through the session notification's store.
 */

export interface WidgetTask {
  id: string;
  title: string;
  /**
   * Where the card lives, as Today's cards show it: the first two goal levels
   * (the eyebrow) and the rest of the path (under the title). origin is null
   * for a quick task.
   */
  origin: string | null;
  context: string;
  /** The goal the card belongs to (the goal chip follows it), or null. */
  goal: string | null;
  /** 1-based place in its list. */
  rank: number;
  done: number;
  total: number;
  /** The next step to do, or null when there are none left. */
  next: string | null;
  /** Backlog only: the local yyyy-mm-dd it was due. */
  due: string | null;
}

export interface WidgetGoal {
  id: string;
  title: string;
  pct: number;
  /** Local yyyy-mm-dd; Android counts the days left itself so it stays right overnight. */
  deadline: string | null;
  stepsDone: number;
  stepsTotal: number;
}

export interface WidgetMember {
  id: string;
  /** First name, or "You" for the signed-in member. */
  name: string;
  /** Their avatar emoji, or the first letter of their name (photo avatars too). */
  initial: string;
  color: string;
  state: FocusState;
  startedAt: number | null;
  pausedMs: number;
  updatedAt: number;
  /** Their focus today, as the room shows it. */
  todayMs: number;
}

export interface WidgetRoom {
  id: string;
  name: string;
  /** The room's emoji, as on its tile in the app. */
  icon: string;
  /** The room's daily focus bar, in hours. */
  barHours: number;
  members: WidgetMember[];
}

/** A broken streak that can still be restored, until `endsAt` (epoch ms). */
export interface WidgetStreakSave {
  days: number;
  endsAt: number;
  /** What restoring it still takes, e.g. "finish 3 tasks and hit your focus bar". */
  hint: string;
}

export interface WidgetSnapshot {
  v: 1;
  today: WidgetTask[];
  /** Open overdue tasks, oldest first, as the Backlog tab lists them. */
  backlog: WidgetTask[];
  /** Today's scheduled cards already finished (the arc's lit segments). */
  todayDone: number;
  /** Focus today, and the daily average over the last 30 days. */
  focus: { todayMs: number; avgMs: number };
  streak: { days: number; save: WidgetStreakSave | null };
  /** The app's accent for light and dark phones. */
  accent: { light: string; dark: string };
  goals: WidgetGoal[];
  /** null while the rooms are not loaded: Android keeps the ones it has. */
  rooms: WidgetRoom[] | null;
}

/** Where a widget tap should land in the app. */
export type WidgetTarget = { kind: 'task' | 'goal' | 'room'; id: string };

export type WidgetAction =
  | { type: 'stop'; taskId: string }
  | ({ type: 'open' } & WidgetTarget);

const MAX_TASKS = 30;
const MAX_TEXT = 120;
const AVATAR_COLORS = ['#c08a5b', '#5f86c2', '#8a68c8', '#4f9c80', '#c26a6a', '#b59a45'];

const clip = (text: string) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT - 1)}…` : clean;
};

/** The step the card's progress has reached, if any is left. */
const nextStep = (task: Task) => (task.progress < task.steps.length ? clip(task.steps[task.progress]) || null : null);

function taskOrigin(goals: GoalNode[], task: Task): Pick<WidgetTask, 'origin' | 'context' | 'goal'> {
  if (!task.goalNodeId) return { origin: null, context: '', goal: null };
  for (const root of goals) {
    // The card already shows the task itself, so only its parents.
    const parents = pathTitles(root, task.goalNodeId).slice(0, -1);
    if (parents.length) return { origin: clip(parents.slice(0, 2).join(' • ')), context: clip(parents.slice(2).join(' / ')), goal: root.id };
  }
  return { origin: '', context: '', goal: null };
}

function stepCounts(node: GoalNode): { done: number; total: number } {
  if (node.children.length > 0) {
    return node.children.reduce((sum, child) => {
      const next = stepCounts(child);
      return { done: sum.done + next.done, total: sum.total + next.total };
    }, { done: 0, total: 0 });
  }
  if (node.steps && node.steps.length > 0) {
    return { done: (node.stepDone ?? []).slice(0, node.steps.length).filter(Boolean).length, total: node.steps.length };
  }
  return { done: node.completed ? 1 : 0, total: 1 };
}

export function avatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Today's open cards in the order the Today list shows them. */
export function widgetTodayTasks(todayTasks: Task[], goals: GoalNode[]): WidgetTask[] {
  return todayTasks
    .filter((task) => !isTaskComplete(task))
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_TASKS)
    .map((task, index) => ({
      id: task.id,
      title: clip(task.title) || 'Untitled',
      ...taskOrigin(goals, task),
      rank: index + 1,
      done: Math.min(task.progress, task.steps.length),
      total: task.steps.length,
      next: nextStep(task),
      due: null,
    }));
}

/** Open backlog cards, oldest due date first, as the Backlog tab shows them. */
export function widgetBacklogTasks(backlogTasks: Task[], goals: GoalNode[]): WidgetTask[] {
  return backlogTasks
    .filter((task) => !isTaskComplete(task) && !!task.targetDate)
    .sort((a, b) => (a.targetDate ?? '').localeCompare(b.targetDate ?? '') || a.order - b.order)
    .slice(0, MAX_TASKS)
    .map((task, index) => ({
      id: task.id,
      title: clip(task.title) || 'Untitled',
      ...taskOrigin(goals, task),
      rank: index + 1,
      done: Math.min(task.progress, task.steps.length),
      total: task.steps.length,
      next: nextStep(task),
      due: (task.targetDate ?? '').slice(0, 10),
    }));
}

export function widgetGoals(goals: GoalNode[]): WidgetGoal[] {
  return goals.map((goal) => {
    const counts = stepCounts(goal);
    return {
      id: goal.id,
      title: clip(goal.title) || 'Untitled goal',
      pct: rollupPct(goal),
      deadline: goal.endDate && /^\d{4}-\d{2}-\d{2}/.test(goal.endDate) ? goal.endDate.slice(0, 10) : null,
      stepsDone: counts.done,
      stepsTotal: counts.total,
    };
  });
}

/** Focus today, and the daily average over the 30 days before it (or since focus began, if later). */
export function widgetFocus(byDate: Map<string, number>, today = todayISO()): WidgetSnapshot['focus'] {
  let total = 0;
  let since: string | null = null;
  for (let back = 30; back >= 1; back--) {
    const day = shiftLocalISO(today, -back);
    const ms = byDate.get(day) ?? 0;
    if (ms > 0 && !since) since = day;
    if (since) total += ms;
  }
  const days = since ? -daysUntil(since, today) : 0;
  return { todayMs: byDate.get(today) ?? 0, avgMs: days ? Math.round(total / days) : 0 };
}

/** The streak shown on Progress, keeping one that can still be restored. */
export function widgetStreak(
  streak: {
    current: number;
    revive: {
      active: boolean;
      windowEnds: string;
      previousStreak: number;
      mode?: 'backlog' | 'challenge';
      remainingTasks?: number;
      remainingScheduled?: number;
      challengeBarHours?: number | null;
    } | null;
  },
  now = Date.now(),
): WidgetSnapshot['streak'] {
  const revive = streak.revive;
  if (!revive?.active || revive.previousStreak <= 0 || !revive.windowEnds) return { days: streak.current, save: null };
  // As focusTrends.ts restores it: a focus challenge, or every saved task done plus a day at the focus bar.
  const left = (revive.remainingTasks ?? 0) + (revive.remainingScheduled ?? 0);
  const hint = revive.mode === 'challenge' && revive.challengeBarHours
    ? `focus ${revive.challengeBarHours}h in a day`
    : left > 0 ? `finish ${left} task${left === 1 ? '' : 's'} and hit your focus bar` : 'hit your focus bar';
  return {
    days: streak.current,
    save: { days: revive.previousStreak, endsAt: now + msUntilEndOfLocalISODate(revive.windowEnds, now), hint },
  };
}

export function widgetAccent(accent: string | undefined): WidgetSnapshot['accent'] {
  const swatch = ACCENT_SWATCHES[resolveAccent({ accent })];
  return { light: swatch.light, dark: swatch.dark };
}

/** An emoji avatar as it is; a photo (URL) cannot be drawn on a widget. */
const avatarGlyph = (avatar?: string | null) => (avatar && !/^https?:\/\//i.test(avatar) ? avatar.trim() || null : null);

export function widgetRooms(
  rooms: {
    id: string;
    name: string;
    icon?: string;
    barHours?: number | null;
    members: { id: string; name: string; avatar?: string | null; todayMs?: number }[];
  }[],
  statuses: Record<string, FocusStatus>,
  selfId: string | null = null,
): WidgetRoom[] {
  return rooms.map((room) => ({
    id: room.id,
    name: clip(room.name) || 'Room',
    icon: room.icon?.trim() || '🔥',
    barHours: room.barHours && room.barHours > 0 ? room.barHours : 4,
    members: room.members.slice(0, 4).map((member) => {
      const status = statuses[member.id];
      const first = member.name.trim().split(/\s+/)[0] ?? '';
      return {
        id: member.id,
        name: member.id === selfId ? 'You' : first.slice(0, 12) || '?',
        initial: avatarGlyph(member.avatar) ?? (member.name.trim()[0] ?? '?').toUpperCase(),
        color: avatarColor(member.id),
        state: status?.state ?? 'idle',
        startedAt: status?.startedAt ? Date.parse(status.startedAt) : null,
        pausedMs: status?.pausedMs ?? 0,
        updatedAt: status ? Date.parse(status.updatedAt) : 0,
        todayMs: Math.max(0, member.todayMs ?? 0),
      };
    }),
  }));
}

export function parseWidgetActions(raw: unknown): WidgetAction[] {
  if (!Array.isArray(raw)) return [];
  const out: WidgetAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { type, taskId, kind, id } = item as Record<string, unknown>;
    if (type === 'stop' && typeof taskId === 'string' && taskId) out.push({ type, taskId });
    else if (type === 'open' && (kind === 'task' || kind === 'goal' || kind === 'room') && typeof id === 'string' && id) out.push({ type, kind, id });
  }
  return out;
}

interface YouDoWidgetsPlugin {
  update(options: { snapshot: string }): Promise<void>;
  takeActions(): Promise<{ actions?: unknown }>;
  status(): Promise<{ roomWidgets?: number }>;
  widgetKey(options: { userId: string | null; url: string; anonKey: string }): Promise<{ key?: string; previousKey?: string }>;
}

const YouDoWidgets = registerPlugin<YouDoWidgetsPlugin>('YouDoWidgets', {
  web: () => ({
    async update() {},
    async takeActions() { return {}; },
    async status() { return {}; },
    async widgetKey() { return {}; },
  }) as YouDoWidgetsPlugin,
});

export const widgetsSupported = () => Capacitor.getPlatform() === 'android';

export async function publishWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  if (!widgetsSupported()) return;
  try { await YouDoWidgets.update({ snapshot: JSON.stringify(snapshot) }); } catch { /* widgets are best effort */ }
}

export async function takeWidgetActions(): Promise<WidgetAction[]> {
  if (!widgetsSupported()) return [];
  try { return parseWidgetActions((await YouDoWidgets.takeActions()).actions); } catch { return []; }
}

/** Room data is fetched only while a Room widget is on the home screen. */
export async function roomWidgetCount(): Promise<number> {
  if (!widgetsSupported()) return 0;
  try { return (await YouDoWidgets.status()).roomWidgets ?? 0; } catch { return 0; }
}

/* ---- Used by useHomeWidgets; kept here so it loads after the first screen. ---- */

let lastPublished = '';

/** Sends the widgets a new snapshot when what they show has changed. */
export interface WidgetSources {
  todayTasks: Task[];
  backlogTasks: Task[];
  goals: GoalNode[];
  streak: Parameters<typeof widgetStreak>[0];
  accent: string | undefined;
  rooms: WidgetRoom[] | null;
  /** Net focus by local day (App's streak input). */
  focusByDate: Map<string, number>;
  userId: string | null;
}

export async function syncWidgets(src: WidgetSources): Promise<void> {
  const focus = widgetFocus(src.focusByDate);
  const snapshot: WidgetSnapshot = {
    v: 1,
    today: widgetTodayTasks(src.todayTasks, src.goals),
    backlog: widgetBacklogTasks(src.backlogTasks, src.goals),
    todayDone: src.todayTasks.filter(isTaskComplete).length,
    focus,
    streak: widgetStreak(src.streak),
    accent: widgetAccent(src.accent),
    goals: widgetGoals(src.goals),
    // Your own focus today is known here before the room's copy syncs.
    rooms: src.rooms && src.rooms.map((room) => ({
      ...room,
      members: room.members.map((member) => (member.id === src.userId ? { ...member, todayMs: Math.max(member.todayMs, focus.todayMs) } : member)),
    })),
  };
  const json = JSON.stringify(snapshot);
  if (json === lastPublished) return;
  lastPublished = json;
  await publishWidgetSnapshot(snapshot);
}

/** The last Stop and the last place to open, tapped on the widgets since the app last looked. */
export async function drainWidgetActions(): Promise<{ stop: string | null; open: WidgetTarget | null }> {
  let stop: string | null = null;
  let open: WidgetTarget | null = null;
  for (const action of await takeWidgetActions()) {
    if (action.type === 'stop') stop = action.taskId;
    else open = { kind: action.kind, id: action.id };
  }
  return { stop, open };
}

/**
 * Gives this phone's widgets a key for the signed-in account (hub_widget_push.sql),
 * so a session started on the widget lights the starter's room dot with YouDO
 * closed. Signing out or switching accounts forgets the old key.
 */
export async function syncWidgetKey(userId: string | null): Promise<void> {
  try {
    const { supabase, supabaseUrl, supabaseAnonKey } = await import('./supabase');
    const { key, previousKey } = await YouDoWidgets.widgetKey({ userId, url: supabaseUrl, anonKey: supabaseAnonKey });
    if (previousKey) await supabase.rpc('forget_widget_key', { widget_key: previousKey });
    if (key) await supabase.rpc('register_widget_key', { widget_key: key });
  } catch { /* without a key the dot waits until the app opens */ }
}

/** The rooms for Room widgets, or null when none is placed. */
export async function loadWidgetRooms(userId: string): Promise<WidgetRoom[] | null> {
  if ((await roomWidgetCount()) === 0) return null;
  const [{ fetchMyRoomSummaries }, { fetchFocusStatuses }, { fetchRoomPaceRows }, { fetchPaceRowsForUserIds }] = await Promise.all([
    import('./squads'), import('./focusStatus'), import('./roomFocus'), import('./paceCloud'),
  ]);
  const summaries = await fetchMyRoomSummaries(userId);
  const ids = [...new Set(summaries.flatMap((summary) => summary.members.map((member) => member.id)))];
  // Each member's focus today, as the room shows it (the Public Board's totals on an older server).
  const [statuses, ...roomRows] = await Promise.all([
    fetchFocusStatuses(ids),
    ...summaries.map((summary) => fetchRoomPaceRows(summary.squad.id)),
  ]);
  const todayMs = new Map<string, number>();
  if (roomRows.some((rows) => rows === null)) {
    for (const row of await fetchPaceRowsForUserIds(ids)) todayMs.set(row.userId, row.todayMs);
  }
  for (const rows of roomRows) for (const row of Object.values(rows ?? {})) todayMs.set(row.userId, row.todayMs);
  return widgetRooms(summaries.map((summary) => ({
    id: summary.squad.id,
    name: summary.squad.name,
    icon: summary.squad.description,
    barHours: summary.squad.bar_hours,
    members: summary.members.map((member) => ({
      id: member.id,
      name: member.display_name || member.username || '?',
      avatar: member.avatar_url,
      todayMs: todayMs.get(member.id) ?? 0,
    })),
  })), statuses, userId);
}
