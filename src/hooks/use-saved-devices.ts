import { useCallback, useEffect, useState } from "react";
import { listSavedDevices, removeDevice, saveDevice, type SavedDevice } from "../device-store";

export type PendingNewDevice = {
  deviceId: string;
  defaultName: string;
  identityPubkey: string;
};

// `pendingNewDevice` gates the one-time "name this signer" screen after a first-ever pairing.
export function useSavedDevices() {
  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);
  const [loadingSavedDevices, setLoadingSavedDevices] = useState(true);
  const [pendingNewDevice, setPendingNewDevice] = useState<PendingNewDevice | null>(null);

  const reloadSavedDevices = useCallback(async () => {
    setSavedDevices(await listSavedDevices());
  }, []);

  useEffect(() => {
    (async () => {
      await reloadSavedDevices();
      setLoadingSavedDevices(false);
    })();
  }, [reloadSavedDevices]);

  const forgetDevice = useCallback(
    async (device: SavedDevice) => {
      await removeDevice(device.id);
      await reloadSavedDevices();
    },
    [reloadSavedDevices],
  );

  const finishNaming = useCallback(
    async (name: string) => {
      if (!pendingNewDevice) return;
      await saveDevice({
        id: pendingNewDevice.deviceId,
        name,
        identityPubkey: pendingNewDevice.identityPubkey,
        lastConnected: Date.now(),
      });
      setPendingNewDevice(null);
      await reloadSavedDevices();
    },
    [pendingNewDevice, reloadSavedDevices],
  );

  return {
    savedDevices,
    loadingSavedDevices,
    pendingNewDevice,
    setPendingNewDevice,
    reloadSavedDevices,
    forgetDevice,
    finishNaming,
  };
}
