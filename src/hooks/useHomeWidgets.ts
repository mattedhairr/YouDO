import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { GoalNode, Task } from '../types';
import type { WidgetRoom, WidgetTarget, widgetStreak } from '../lib/homeWidgets';

/** Rooms change rarely; refetching on every app switch would waste requests. */
const ROOM_REFRESH_MS = 60_000;

const widgets = () => import('../lib/homeWidgets');

interface Options {
  todayTasks: Task[];
  backlogTasks: Task[];
  goals: GoalNode[];
  streak: Parameters<typeof widgetStreak>[0];
  userId: string | null;
  /** False while sign-in is still being restored, so a key is not forgotten by mistake. */
  authReady: boolean;
  activeTaskId: string | null;
  /** Stop on the widget: open the stop sheet for this card's session. */
  onStopRequested: (taskId: string) => void;
  /** A widget was tapped: show that task, goal or room. */
  onOpenRequested: (target: WidgetTarget) => void;
}

/**
 * Rendered by App through React.lazy, so none of the widget code is in the
 * first load (its JS budget is tight).
 */
export default function HomeWidgets(options: Options) {
  useHomeWidgets(options);
  return null;
}

/** The accent Settings puts on the page; App's own copy only updates when the app reloads. */
function usePageAccent(): string | undefined {
  const [accent, setAccent] = useState(() => document.documentElement.dataset.accent);
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setAccent(root.dataset.accent));
    observer.observe(root, { attributes: true, attributeFilter: ['data-accent'] });
    return () => observer.disconnect();
  }, []);
  return accent;
}

/** Keeps the Android home-screen widgets in step with the app (see lib/homeWidgets). */
export function useHomeWidgets({
  todayTasks, backlogTasks, goals, streak, userId, authReady, activeTaskId, onStopRequested, onOpenRequested,
}: Options) {
  const supported = Capacitor.getPlatform() === 'android';
  const accent = usePageAccent();
  const openRef = useRef(onOpenRequested);
  openRef.current = onOpenRequested;
  const [rooms, setRooms] = useState<WidgetRoom[] | null>(null);
  const [pendingStop, setPendingStop] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    const timer = setTimeout(() => {
      void widgets().then((w) => w.syncWidgets(todayTasks, backlogTasks, goals, streak, accent, rooms));
    }, 400);
    return () => clearTimeout(timer);
  }, [supported, todayTasks, backlogTasks, goals, streak, accent, rooms]);

  // A Stop tapped on the widget while the app was closed or in the background.
  useEffect(() => {
    if (!supported) return;
    let busy = false;
    const drain = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const { stop, open } = await (await widgets()).drainWidgetActions();
        if (open) openRef.current(open);
        if (stop) setPendingStop(stop);
      } finally {
        busy = false;
      }
    };
    void drain();
    document.addEventListener('visibilitychange', drain);
    return () => document.removeEventListener('visibilitychange', drain);
  }, [supported]);

  // A widget Stop can arrive before the app has picked up the running session.
  const stopRef = useRef(onStopRequested);
  stopRef.current = onStopRequested;
  useEffect(() => {
    if (!pendingStop || activeTaskId !== pendingStop) return;
    setPendingStop(null);
    stopRef.current(pendingStop);
  }, [pendingStop, activeTaskId]);

  // The widget key for this account, then room members and who is focusing
  // (only while a Room widget is placed).
  useEffect(() => {
    if (!supported || !authReady) return;
    void widgets().then((w) => w.syncWidgetKey(userId));
    if (!userId) return;
    let cancelled = false;
    let last = 0;
    const load = async () => {
      if (Date.now() - last < ROOM_REFRESH_MS) return;
      const next = await (await widgets()).loadWidgetRooms(userId);
      // Only a real fetch waits: a Room widget added a moment ago loads on return.
      if (!next) return;
      last = Date.now();
      if (!cancelled) setRooms(next);
    };
    void load();
    // Leaving the app is when the home screen, and so the widget, comes back.
    document.addEventListener('visibilitychange', load);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', load);
    };
  }, [supported, authReady, userId]);
}
