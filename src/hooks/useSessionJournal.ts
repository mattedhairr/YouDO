import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveSession } from '../types';
import { createSessionJournal } from '../lib/sessionPersistence';
import { STORAGE_KEYS } from '../lib/storageKeys';

const storageFailure = (error: unknown) => error instanceof Error && error.message.includes('YouDO')
  ? error.message : 'Could not save the timer on this device. The last saved state is unchanged. Free some storage and retry; do not clear YouDO data.';

export function useSessionJournal() {
  const [journal] = useState(() => createSessionJournal());
  const [initial] = useState(() => {
    try { return { session: journal.read(), error: '' }; }
    catch (error) { return { session: null, error: storageFailure(error) }; }
  });
  const [activeSession, setValue] = useState<ActiveSession | null>(initial.session);
  const [sessionStorageError, setError] = useState(initial.error);
  const activeSessionRef = useRef(activeSession);
  const setActiveSession = useCallback((next: ActiveSession | null | ((previous: ActiveSession | null) => ActiveSession | null)) => {
    const value = typeof next === 'function' ? next(activeSessionRef.current) : next;
    if (value === activeSessionRef.current) return true;
    try {
      journal.write(value);
      activeSessionRef.current = value;
      setValue(value);
      setError('');
      return true;
    } catch (error) {
      setError(storageFailure(error));
      return false;
    }
  }, [journal]);
  const clearRecordedSession = useCallback(() => {
    // History has already been durably saved. Even if the smaller timer clear
    // fails, the completion ledger suppresses this timer on the next launch.
    setActiveSession(null);
    activeSessionRef.current = null;
    setValue(null);
  }, [setActiveSession]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== STORAGE_KEYS.activeSession && event.key !== STORAGE_KEYS.workspaceOwner) return;
      try {
        const value = journal.read();
        activeSessionRef.current = value;
        setValue(value);
        setError('');
      } catch (error) { setError(storageFailure(error)); }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [journal]);
  return { activeSession, activeSessionRef, setActiveSession, clearRecordedSession, sessionStorageError };
}
