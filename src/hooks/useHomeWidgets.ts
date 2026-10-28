import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { GoalNode, Task } from '../types';
import type { WidgetRoom } from '../lib/homeWidgets';

/** Rooms change rarely; refetching on every app switch would waste requests. */
const ROOM_REFRESH_MS = 60_000;

// Loaded after the first screen: the widget code is not needed to show the app.
const widgets = () => import('../lib/homeWidgets');

interface Options {
  todayTasks: Task[];
  goals: GoalNode[];
  streakDays: number;
  userId: string | null;
  /** False while sign-in is still being restored, so a key is not forgotten by mistake. */
  authReady: boolean;
  activeTaskId: string | null;
  reorder: (fromId: string, toId: string) => void;
  /** Stop on the widget: open the stop sheet for this card's session. */
  onStopRequested: (taskId: string) => void;
}

/** Keeps the Android home-screen widgets in step with the app (see lib/homeWidgets). */
export function useHomeWidgets({
  todayTasks, goals, streakDays, userId, authReady, activeTaskId, reorder, onStopRequested,
}: Options) {
  const supported = Capacitor.getPlatform() === 'android';
  const [rooms, setRooms] = useState<WidgetRoom[] | null>(null);
  const [pendingStop, setPendingStop] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    const timer = setTimeout(() => {
      void widgets().then((w) => w.syncWidgets(todayTasks, goals, streakDays, rooms));
    }, 400);
    return () => clearTimeout(timer);
  }, [supported, todayTasks, goals, streakDays, rooms]);

  // Taps made on the widget while the app was closed or in the background.
  const latest = useRef({ todayTasks, reorder });
  latest.current = { todayTasks, reorder };
  useEffect(() => {
    if (!supported) return;
    let busy = false;
    const drain = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const stop = await (await widgets()).drainWidgetActions(latest.current.todayTasks, latest.current.reorder);
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
      last = Date.now();
      const next = await (await widgets()).loadWidgetRooms(userId);
      if (next && !cancelled) setRooms(next);
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
