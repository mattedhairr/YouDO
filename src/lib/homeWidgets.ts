import { Capacitor, registerPlugin } from '@capacitor/core';
import type { GoalNode, Task } from '../types';
import type { FocusState, FocusStatus } from './focusStatus';
import { isTaskComplete, pathTitles, rollupPct } from './goalTree';
import { ACCENT_SWATCHES, resolveAccent } from './accentColors';
import { msUntilEndOfLocalISODate } from './dates';

/*
 * Android home-screen widgets (Up next, Progress, Room). The widgets cannot run
 * this app's code, so the app hands Android a small snapshot whenever something
 * they show changes. Taps on a widget that change app data (moving a card up or
 * down, Stop) are queued natively and applied here when the app is next open.
 * Start, Pause and Resume run natively through the session notification's store.
 */

export interface WidgetTask {
  id: string;
  title: string;
  path: string;
  /** 1-based place in today's open list. */
  rank: number;
  done: number;
  total: number;
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
  initial: string;
  color: string;
  state: FocusState;
  startedAt: number | null;
  pausedMs: number;
  updatedAt: number;
}

export interface WidgetRoom {
  id: string;
  name: string;
  members: WidgetMember[];
}

/** A broken streak that can still be restored, until `endsAt` (epoch ms). */
export interface WidgetStreakSave {
  days: number;
  endsAt: number;
}

export interface WidgetSnapshot {
  v: 1;
  today: WidgetTask[];
  streak: { days: number; save: WidgetStreakSave | null };
  /** The app's accent for light and dark phones. */
  accent: { light: string; dark: string };
  goals: WidgetGoal[];
  /** null while the rooms are not loaded: Android keeps the ones it has. */
  rooms: WidgetRoom[] | null;
}

export type WidgetAction =
  | { type: 'move'; taskId: string; dir: 'up' | 'down' }
  | { type: 'stop'; taskId: string };

const MAX_TASKS = 30;
const MAX_TEXT = 120;
const AVATAR_COLORS = ['#c08a5b', '#5f86c2', '#8a68c8', '#4f9c80', '#c26a6a', '#b59a45'];

const clip = (text: string) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT - 1)}…` : clean;
};

function taskPath(goals: GoalNode[], task: Task): string {
  if (!task.goalNodeId) return 'Quick task';
  for (const root of goals) {
    const titles = pathTitles(root, task.goalNodeId);
    // The card already shows the task itself, so only its parents.
    if (titles.length) return clip(titles.slice(0, -1).join(' › ') || titles[0]);
  }
  return '';
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
      path: taskPath(goals, task),
      rank: index + 1,
      done: Math.min(task.progress, task.steps.length),
      total: task.steps.length,
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

/** The streak shown on Progress, keeping one that can still be restored. */
export function widgetStreak(
  streak: { current: number; revive: { active: boolean; windowEnds: string; previousStreak: number } | null },
  now = Date.now(),
): WidgetSnapshot['streak'] {
  const revive = streak.revive;
  const save = revive?.active && revive.previousStreak > 0 && revive.windowEnds
    ? { days: revive.previousStreak, endsAt: now + msUntilEndOfLocalISODate(revive.windowEnds, now) }
    : null;
  return { days: streak.current, save };
}

export function widgetAccent(accent: string | undefined): WidgetSnapshot['accent'] {
  const swatch = ACCENT_SWATCHES[resolveAccent({ accent })];
  return { light: swatch.light, dark: swatch.dark };
}

export function widgetRooms(
  rooms: { id: string; name: string; members: { id: string; name: string }[] }[],
  statuses: Record<string, FocusStatus>,
  selfId: string | null = null,
): WidgetRoom[] {
  return rooms.map((room) => ({
    id: room.id,
    name: clip(room.name) || 'Room',
    members: room.members.slice(0, 4).map((member) => {
      const status = statuses[member.id];
      const first = member.name.trim().split(/\s+/)[0] ?? '';
      return {
        id: member.id,
        name: member.id === selfId ? 'You' : first.slice(0, 12) || '?',
        initial: (member.name.trim()[0] ?? '?').toUpperCase(),
        color: avatarColor(member.id),
        state: status?.state ?? 'idle',
        startedAt: status?.startedAt ? Date.parse(status.startedAt) : null,
        pausedMs: status?.pausedMs ?? 0,
        updatedAt: status ? Date.parse(status.updatedAt) : 0,
      };
    }),
  }));
}

/**
 * Turns queued widget moves into app reorders. Each move swaps a card with its
 * neighbour among today's open cards; later moves see the earlier swaps, just as
 * the widget showed them. Moves past either end, or of finished cards, are dropped.
 */
export function planWidgetMoves(todayTasks: Task[], moves: { taskId: string; dir: 'up' | 'down' }[]): [string, string][] {
  const ids = todayTasks.filter((task) => !isTaskComplete(task)).sort((a, b) => a.order - b.order).map((task) => task.id);
  const plan: [string, string][] = [];
  for (const move of moves) {
    const from = ids.indexOf(move.taskId);
    const to = move.dir === 'up' ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= ids.length) continue;
    plan.push([move.taskId, ids[to]]);
    [ids[from], ids[to]] = [ids[to], ids[from]];
  }
  return plan;
}

export function parseWidgetActions(raw: unknown): WidgetAction[] {
  if (!Array.isArray(raw)) return [];
  const out: WidgetAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { type, taskId, dir } = item as Record<string, unknown>;
    if (typeof taskId !== 'string' || !taskId) continue;
    if (type === 'move' && (dir === 'up' || dir === 'down')) out.push({ type, taskId, dir });
    else if (type === 'stop') out.push({ type, taskId });
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
export async function syncWidgets(
  todayTasks: Task[],
  goals: GoalNode[],
  streak: Parameters<typeof widgetStreak>[0],
  accent: string | undefined,
  rooms: WidgetRoom[] | null,
): Promise<void> {
  const snapshot: WidgetSnapshot = {
    v: 1,
    today: widgetTodayTasks(todayTasks, goals),
    streak: widgetStreak(streak),
    accent: widgetAccent(accent),
    goals: widgetGoals(goals),
    rooms,
  };
  const json = JSON.stringify(snapshot);
  if (json === lastPublished) return;
  lastPublished = json;
  await publishWidgetSnapshot(snapshot);
}

/** Applies the moves tapped on the widget; returns the card whose Stop was tapped last. */
export async function drainWidgetActions(todayTasks: Task[], reorder: (fromId: string, toId: string) => void): Promise<string | null> {
  const actions = await takeWidgetActions();
  const moves = actions.flatMap((action) => (action.type === 'move' ? [action] : []));
  for (const [from, to] of planWidgetMoves(todayTasks, moves)) reorder(from, to);
  return actions.filter((action) => action.type === 'stop').pop()?.taskId ?? null;
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
  const [{ fetchMyRoomSummaries }, { fetchFocusStatuses }] = await Promise.all([import('./squads'), import('./focusStatus')]);
  const summaries = await fetchMyRoomSummaries(userId);
  const ids = [...new Set(summaries.flatMap((summary) => summary.members.map((member) => member.id)))];
  const statuses = await fetchFocusStatuses(ids);
  return widgetRooms(summaries.map((summary) => ({
    id: summary.squad.id,
    name: summary.squad.name,
    members: summary.members.map((member) => ({ id: member.id, name: member.display_name || member.username || '?' })),
  })), statuses, userId);
}
