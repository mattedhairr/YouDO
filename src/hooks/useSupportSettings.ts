import { useEffect, useState } from 'react';
import { SUPPORT_SETTINGS_EVENT, cachedSupportSettings, fetchSupportSettings, type SupportSettings } from '../lib/supportSettings';

/** Support settings: the cached ones at once, then the server's while `active`. */
export function useSupportSettings(active: boolean): SupportSettings {
  const [settings, setSettings] = useState(cachedSupportSettings);

  useEffect(() => {
    const onSaved = (event: Event) => {
      const next = (event as CustomEvent<SupportSettings>).detail;
      if (next) setSettings(next);
    };
    window.addEventListener(SUPPORT_SETTINGS_EVENT, onSaved);
    return () => window.removeEventListener(SUPPORT_SETTINGS_EVENT, onSaved);
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void fetchSupportSettings().then((next) => { if (next && !cancelled) setSettings(next); });
    return () => { cancelled = true; };
  }, [active]);

  return settings;
}
