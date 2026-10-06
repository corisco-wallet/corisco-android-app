import { useCallback, useRef, useState } from "react";
import { BleSignerConnection, type ScanResult } from "../ble-transport";

// Scans for nearby signers to choose from; the pairing connection itself is made by `connectAndInit`.
export function usePairScan(setInitError: (error: string | null) => void) {
  const [active, setActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<ScanResult[]>([]);
  const connRef = useRef<BleSignerConnection | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const start = useCallback(async () => {
    setInitError(null);
    setCandidates([]);
    setActive(true);
    setScanning(true);
    const conn = new BleSignerConnection();
    connRef.current = conn;
    try {
      await conn.ensurePermissions();
      await new Promise<void>((resolve, reject) => {
        stopRef.current = conn.scanForCandidates(
          (result) => setCandidates((prev) => (prev.some((c) => c.id === result.id) ? prev : [...prev, result])),
          (error) => (error ? reject(error) : resolve()),
        );
      });
    } catch (err) {
      setInitError(String(err));
    } finally {
      setScanning(false);
    }
  }, [setInitError]);

  // Stops scanning but keeps the scan screen up so its connecting UI stays visible.
  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    connRef.current = null;
    setScanning(false);
  }, []);

  const cancel = useCallback(() => {
    stop();
    setActive(false);
  }, [stop]);

  return { active, scanning, candidates, start, stop, cancel };
}
