// Corisco -- a self-custodial Lightning wallet where the private keys never
// touch this app: every signing operation routes through the real ESP32
// hardware signer over BLE (`BleHardwareSigner`/`BleSignerConnection`).
// See `docs/architecture.md` for the full request/response flow.

import { useCallback, useState } from "react";
import { StatusBar } from "expo-status-bar";
import type { ScanResult } from "./src/ble-transport";
import { useBtcPrice } from "./src/hooks/use-btc-price";
import { usePairScan } from "./src/hooks/use-pair-scan";
import { useSavedDevices } from "./src/hooks/use-saved-devices";
import { useSettings } from "./src/hooks/use-settings";
import { useWalletSession } from "./src/hooks/use-wallet-session";
import { ConnectScreen } from "./src/screens/ConnectScreen";
import { NameSignerScreen } from "./src/screens/NameSignerScreen";
import { PairScanScreen } from "./src/screens/PairScanScreen";
import { SignerListScreen } from "./src/screens/SignerListScreen";
import { SyncingScreen } from "./src/screens/SyncingScreen";
import { WalletNavigator } from "./src/screens/WalletNavigator";

export default function App() {
  const [initError, setInitError] = useState<string | null>(null);
  const { settings, updateSettings } = useSettings();
  const devices = useSavedDevices();
  const pairScan = usePairScan(setInitError);
  const session = useWalletSession({
    showLastXTransactions: settings.showLastXTransactions,
    savedDevices: devices.savedDevices,
    reloadSavedDevices: devices.reloadSavedDevices,
    forgetDevice: devices.forgetDevice,
    setPendingNewDevice: devices.setPendingNewDevice,
    setInitError,
    startPairScan: pairScan.start,
    cancelPairScan: pairScan.cancel,
  });
  const { wallet, maintenance } = session;
  const btcPrice = useBtcPrice(wallet !== null, settings.currency);

  // Deliberately leaves the scan screen up so its connecting progress shows; `connectAndInit` clears it.
  const { stop: stopPairScan } = pairScan;
  const { connectAndInit } = session;
  const selectCandidate = useCallback(
    (candidate: ScanResult) => {
      stopPairScan();
      void connectAndInit(candidate.id);
    },
    [stopPairScan, connectAndInit],
  );

  if (!wallet) {
    if (pairScan.active) {
      return (
        <>
          <PairScanScreen
            scanning={pairScan.scanning}
            candidates={pairScan.candidates}
            connecting={session.connecting}
            connectingId={session.connectingId}
            connectStatus={session.connectStatus}
            error={initError}
            onSelect={selectCandidate}
            onRescan={() => void pairScan.start()}
            onCancel={pairScan.cancel}
          />
          <StatusBar style="light" />
        </>
      );
    }
    if (!devices.loadingSavedDevices && devices.savedDevices.length > 0) {
      return (
        <>
          <SignerListScreen
            devices={devices.savedDevices}
            connecting={session.connecting}
            connectingId={session.connectingId}
            connectStatus={session.connectStatus}
            initError={initError}
            onSelect={(device) => void connectAndInit(device.id, device)}
            onForget={(device) => void devices.forgetDevice(device)}
            onPairNew={() => void pairScan.start()}
          />
          <StatusBar style="light" />
        </>
      );
    }
    return <ConnectScreen initError={initError} onConnect={() => void pairScan.start()} />;
  }

  if (devices.pendingNewDevice) {
    return (
      <NameSignerScreen
        defaultName={devices.pendingNewDevice.defaultName}
        identityPubkey={devices.pendingNewDevice.identityPubkey}
        onSave={(name) => void devices.finishNaming(name)}
      />
    );
  }

  if (session.syncing) {
    return <SyncingScreen progress={session.syncProgress} label={session.syncLabel} />;
  }

  return (
    <WalletNavigator
      wallet={wallet}
      // Non-null: set together with `wallet` in connectAndInit.
      signer={session.signerRef.current!}
      identityPubkey={session.identityPubkey}
      availableSats={maintenance.availableSats}
      incomingSats={maintenance.incomingSats}
      claiming={maintenance.claiming}
      loading={session.loading}
      refreshing={maintenance.refreshing}
      transfers={maintenance.transfers}
      transfersLoading={maintenance.transfersLoading}
      settings={settings}
      btcPrice={btcPrice}
      onRefresh={maintenance.onRefresh}
      onSettingsChange={updateSettings}
      onDisconnect={() => void session.disconnectWallet()}
    />
  );
}
