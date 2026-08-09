import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import type { View } from '../types';

const TABS: View[] = ['tasks', 'goals', 'calendar'];

function parseNavigationState(): { initialView: View; initialPathIds: string[] } {
  try {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const pathParam = params.get('path');

    let initialView: View = 'tasks';
    if (viewParam === 'tasks' || viewParam === 'goals' || viewParam === 'calendar') {
      initialView = viewParam as View;
    } else {
      const savedView = localStorage.getItem('todo.view');
      if (savedView) {
        try {
          const parsed = JSON.parse(savedView);
          if (parsed === 'tasks' || parsed === 'goals' || parsed === 'calendar') {
            initialView = parsed as View;
          }
        } catch {
          if (savedView === 'tasks' || savedView === 'goals' || savedView === 'calendar') {
            initialView = savedView as View;
          }
        }
      }
    }

    let initialPathIds: string[] = [];
    if (pathParam) {
      initialPathIds = pathParam.split('/').filter(Boolean);
    } else {
      const savedPath = localStorage.getItem('todo.goalPathIds');
      if (savedPath) {
        try {
          initialPathIds = JSON.parse(savedPath);
        } catch {
          /* ignore */
        }
      }
    }

    return { initialView, initialPathIds };
  } catch {
    return { initialView: 'tasks', initialPathIds: [] };
  }
}

function syncUrlAndStorage(targetView: View, targetPathIds: string[], pushHistory: boolean) {
  try {
    localStorage.setItem('todo.view', JSON.stringify(targetView));
    localStorage.setItem('todo.goalPathIds', JSON.stringify(targetPathIds));

    const params = new URLSearchParams();
    params.set('view', targetView);
    if (targetView === 'goals' && targetPathIds.length > 0) {
      params.set('path', targetPathIds.join('/'));
    } else {
      // Explicitly clear path param when not on Goals tab to avoid stale URL state
      params.delete('path');
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    const stateObj = { view: targetView, goalPathIds: targetPathIds };

    if (pushHistory) {
      window.history.pushState(stateObj, '', newUrl);
    } else {
      window.history.replaceState(stateObj, '', newUrl);
    }
  } catch (err) {
    console.error('Failed to sync navigation URL:', err);
  }
}

export function useNavigationSync(onPopState?: () => boolean) {
  const initialNav = useMemo(() => parseNavigationState(), []);
  const [view, setView] = useState<View>(initialNav.initialView);
  const [goalPathIds, setGoalPathIdsState] = useState<string[]>(initialNav.initialPathIds);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | 'fade'>('fade');
  const isNavigatingHistory = useRef(false);

  // Remembers origin location when jumping directly from Today / Calendar / Pinned cards
  const jumpOriginRef = useRef<{ view: View; goalPathIds: string[] } | null>(null);

  const viewRef = useRef(view);
  viewRef.current = view;
  const pathIdsRef = useRef(goalPathIds);
  pathIdsRef.current = goalPathIds;

  const onPopStateRef = useRef(onPopState);
  onPopStateRef.current = onPopState;

  // Sync initial URL and local storage on mount
  useEffect(() => {
    syncUrlAndStorage(view, goalPathIds, false);
  }, []);

  // Sync back-button (popstate) with views and deep goal tree navigation
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // High-priority modal interceptor: if a modal popup was open, close it and abort view navigation
      if (onPopStateRef.current && onPopStateRef.current()) {
        return;
      }

      isNavigatingHistory.current = true;

      // Smart Jump Return: If this was a direct jump from another tab/location, return to jump origin in 1 step
      if (jumpOriginRef.current) {
        const origin = jumpOriginRef.current;
        jumpOriginRef.current = null;
        const currentIdx = TABS.indexOf(viewRef.current);
        const targetIdx = TABS.indexOf(origin.view);
        setSlideDirection(targetIdx > currentIdx ? 'right' : 'left');
        setView(origin.view);
        setGoalPathIdsState(origin.goalPathIds);
        syncUrlAndStorage(origin.view, origin.goalPathIds, false);
        setTimeout(() => { isNavigatingHistory.current = false; }, 50);
        return;
      }

      let targetView: View = viewRef.current;
      let targetPathIds: string[] = [];

      const state = e.state;
      if (state) {
        if (state.view && TABS.includes(state.view)) {
          targetView = state.view;
        }
        if (Array.isArray(state.goalPathIds)) {
          targetPathIds = state.goalPathIds;
        }
      } else {
        const parsed = parseNavigationState();
        targetView = parsed.initialView;
        targetPathIds = parsed.initialPathIds;
      }

      const currentIdx = TABS.indexOf(viewRef.current);
      const targetIdx = TABS.indexOf(targetView);
      setSlideDirection(targetIdx > currentIdx ? 'right' : 'left');
      setView(targetView);
      setGoalPathIdsState(targetPathIds);

      syncUrlAndStorage(targetView, targetPathIds, false);

      setTimeout(() => {
        isNavigatingHistory.current = false;
      }, 50);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Native Capacitor Android hardware & gesture back button listener
  useEffect(() => {
    let backListenerHandle: any = null;
    const registerCapacitorBack = async () => {
      try {
        backListenerHandle = await CapApp.addListener('backButton', () => {
          // 1. High-priority modal interceptor: if any modal/sheet is open, close it
          if (onPopStateRef.current && onPopStateRef.current()) {
            return;
          }

          // 2. Smart Jump Return: If user jumped directly to a deep task, 1 back returns to origin tab/location
          if (jumpOriginRef.current) {
            const origin = jumpOriginRef.current;
            jumpOriginRef.current = null;
            const currentIdx = TABS.indexOf(viewRef.current);
            const targetIdx = TABS.indexOf(origin.view);
            setSlideDirection(targetIdx > currentIdx ? 'right' : 'left');
            setView(origin.view);
            setGoalPathIdsState(origin.goalPathIds);
            syncUrlAndStorage(origin.view, origin.goalPathIds, true);
            return;
          }

          // 3. Deep Goal tree navigation: if user manually drilled into Goals, navigate up 1 level
          if (viewRef.current === 'goals' && pathIdsRef.current.length > 0) {
            const parentPath = pathIdsRef.current.slice(0, -1);
            setSlideDirection('left');
            setGoalPathIdsState(parentPath);
            syncUrlAndStorage('goals', parentPath, true);
            return;
          }

          // 4. View navigation: if in Goals or Calendar view, navigate back to Today (tasks) tab
          if (viewRef.current !== 'tasks') {
            setSlideDirection('left');
            setView('tasks');
            setGoalPathIdsState([]);
            syncUrlAndStorage('tasks', [], true);
            return;
          }

          // 5. Root level in Today tab: exit/minimize app
          CapApp.exitApp();
        });
      } catch {
        /* Non-capacitor browser environment */
      }
    };

    registerCapacitorBack();
    return () => {
      if (backListenerHandle && backListenerHandle.remove) {
        backListenerHandle.remove();
      }
    };
  }, []);

  // Tab navigation handler with URL push
  const handleNavigateTab = useCallback((targetView: View) => {
    const currentView = viewRef.current;
    if (targetView === currentView) return;
    jumpOriginRef.current = null; // Clear jump origin on manual tab switch
    const currentIdx = TABS.indexOf(currentView);
    const targetIdx = TABS.indexOf(targetView);
    const direction = targetIdx > currentIdx ? 'right' : 'left';
    setSlideDirection(direction);
    setView(targetView);
    // Reset goal path breadcrumbs to root level when navigating between top-level tabs
    setGoalPathIdsState([]);
    if (!isNavigatingHistory.current) {
      syncUrlAndStorage(targetView, [], true);
    }
  }, []);

  // Goal path update with URL push (manual tree drilling)
  const handleUpdateGoalPath = useCallback((newPath: string[]) => {
    jumpOriginRef.current = null; // Clear jump origin when user manually drills deeper
    setGoalPathIdsState(newPath);
    if (!isNavigatingHistory.current) {
      syncUrlAndStorage('goals', newPath, true);
    }
  }, []);

  // Direct navigation to a specific deep goal path
  const navigateToGoalPath = useCallback((targetPathIds: string[]) => {
    const currentView = viewRef.current;
    const currentPathIds = [...pathIdsRef.current];

    // Record jump origin so 1 back returns directly to where the jump occurred
    jumpOriginRef.current = {
      view: currentView,
      goalPathIds: currentPathIds,
    };

    const currentIdx = TABS.indexOf(currentView);
    const targetIdx = TABS.indexOf('goals');
    const direction = targetIdx > currentIdx ? 'right' : 'left';
    setSlideDirection(direction);
    setView('goals');
    setGoalPathIdsState(targetPathIds);
    if (!isNavigatingHistory.current) {
      syncUrlAndStorage('goals', targetPathIds, true);
    }
  }, []);

  return {
    view,
    goalPathIds,
    slideDirection,
    setGoalPathIds: handleUpdateGoalPath,
    handleNavigateTab,
    navigateToGoalPath,
  };
}

