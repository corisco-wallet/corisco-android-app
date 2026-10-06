import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "../settings-store";

// Cosmetic display preferences (settings-store.ts), persisted on every change.
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const latest = useRef<Settings>(DEFAULT_SETTINGS);
  const loaded = useRef(false);
  const earlyPatch = useRef<Partial<Settings>>({});

  useEffect(() => {
    (async () => {
      const next = { ...(await loadSettings()), ...earlyPatch.current };
      loaded.current = true;
      latest.current = next;
      setSettings(next);
      if (Object.keys(earlyPatch.current).length > 0) void saveSettings(next);
    })();
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    latest.current = { ...latest.current, ...patch };
    setSettings(latest.current);
    if (loaded.current) void saveSettings(latest.current);
    else earlyPatch.current = { ...earlyPatch.current, ...patch };
  }, []);

  return { settings, updateSettings };
}
