import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export function useNavigationSync() {
  const initialNav = useMemo(() => parseNavigationState(), []);
  const [view, setView] = useState<View>(initialNav.initialView);
  const [goalPathIds, setGoalPathIdsState] = useState<string[]>(initialNav.initialPathIds);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | 'fade'>('fade');
  const isNavigatingHistory = useRef(false);

  const viewRef = useRef(view);
  viewRef.current = view;
  const pathIdsRef = useRef(goalPathIds);
  pathIdsRef.current = goalPathIds;

  // Sync initial URL and local storage on mount
  useEffect(() => {
    syncUrlAndStorage(view, goalPathIds, false);
  }, []);

  // Sync back-button (popstate) with views and deep goal tree navigation
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      isNavigatingHistory.current = true;
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

  // Tab navigation handler with URL push
  const handleNavigateTab = useCallback((targetView: View) => {
    const currentView = viewRef.current;
    if (targetView === currentView) return;
    const currentIdx = TABS.indexOf(currentView);
    const targetIdx = TABS.indexOf(targetView);
    const direction = targetIdx > currentIdx ? 'right' : 'left';
    setSlideDirection(direction);
    setView(targetView);
    if (!isNavigatingHistory.current) {
      syncUrlAndStorage(targetView, pathIdsRef.current, true);
    }
  }, []);

  // Goal path update with URL push
  const handleUpdateGoalPath = useCallback((newPath: string[]) => {
    setGoalPathIdsState(newPath);
    if (!isNavigatingHistory.current) {
      syncUrlAndStorage('goals', newPath, true);
    }
  }, []);

  return {
    view,
    goalPathIds,
    slideDirection,
    setGoalPathIds: handleUpdateGoalPath,
    handleNavigateTab,
  };
}

