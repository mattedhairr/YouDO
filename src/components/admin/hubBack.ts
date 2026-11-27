import { createContext, useContext, useEffect, useRef } from 'react';

/** Where the Admin Hub's one back button goes, and what it says. */
export interface HubBack { label: string; back: () => void }

/** Given by the Admin Hub: adds a back step and returns a way to take it off again. */
export const HubBackContext = createContext<((entry: HubBack) => () => void) | null>(null);

/**
 * A screen inside a hub page (a send's details, Templates, a template being
 * edited) takes over the hub's one back button while it shows (v9.1): the
 * button says where it goes ("‹ Email") and goes one level up, and Android's
 * Back follows it. The latest screen shown wins; `label` null steps aside.
 */
export function useHubBack(label: string | null, back: () => void) {
  const register = useContext(HubBackContext);
  const latest = useRef(back);
  useEffect(() => { latest.current = back; });
  useEffect(() => {
    if (!register || !label) return undefined;
    return register({ label, back: () => latest.current() });
  }, [register, label]);
}
