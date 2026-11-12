import { useCallback, useRef, useState } from "react";
import { SparkWallet, type SparkWallet as SparkWalletType } from "@buildonspark/spark-sdk";
import { BleHardwareSigner } from "../ble-hardware-signer";
import { BleSignerConnection } from "../ble-transport";
import { showAlert } from "../components/AppAlert";
import { findDeviceByPubkey, saveDevice, touchLastConnected, type SavedDevice } from "../device-store";
import { bytesToHex } from "../hex";
import { ensureUsername, formatAddress } from "../lightning-address";
import { lightningAddressStore } from "../lightning-address-store";
import { LIGHTNING_ADDRESS, SPARK_NETWORK } from "../network";
import type { PendingNewDevice } from "./use-saved-devices";
import { useWalletMaintenance } from "./use-wallet-maintenance";

type Options = {
  showLastXTransactions: number;
  savedDevices: SavedDevice[];
  reloadSavedDevices: () => Promise<void>;
  forgetDevice: (device: SavedDevice) => Promise<void>;
  setPendingNewDevice: (device: PendingNewDevice) => void;
  setInitError: (error: string | null) => void;
  startPairScan: () => Promise<void>;
  cancelPairScan: () => void;
};

export function useWalletSession({
  showLastXTransactions,
  savedDevices,
  reloadSavedDevices,
  forgetDevice,
  setPendingNewDevice,
  setInitError,
  startPairScan,
  cancelPairScan,
}: Options) {
  const [wallet, setWallet] = useState<SparkWalletType | null>(null);
  const [identityPubkey, setIdentityPubkey] = useState<string | null>(null);
  const [lightningAddress, setLightningAddress] = useState<string | null>(null);
  const [lightningAddressFailed, setLightningAddressFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const signerRef = useRef<BleHardwareSigner | null>(null);
  const connRef = useRef<BleSignerConnection | null>(null);
  const walletRef = useRef<SparkWalletType | null>(null);
  const registeringRef = useRef(false);

  // Never blocks or fails the connection: the wallet works without an address, and the next connect retries.
  const loadLightningAddress = useCallback(async (pubkey: string, signer: BleHardwareSigner) => {
    if (!LIGHTNING_ADDRESS || registeringRef.current) return;
    registeringRef.current = true;
    setLightningAddressFailed(false);
    try {
      const username = await ensureUsername({
        config: LIGHTNING_ADDRESS,
        identityPubkey: pubkey,
        signer,
        store: lightningAddressStore,
      });
      if (signerRef.current === signer) setLightningAddress(formatAddress(username, LIGHTNING_ADDRESS.domain));
    } catch (err) {
      console.warn("lightning address unavailable:", err);
      if (signerRef.current === signer) setLightningAddressFailed(true);
    } finally {
      registeringRef.current = false;
    }
  }, []);

  const retryLightningAddress = useCallback(() => {
    if (identityPubkey && signerRef.current) void loadLightningAddress(identityPubkey, signerRef.current);
  }, [identityPubkey, loadLightningAddress]);

  // `syncing` covers the whole connect: `syncProgress` advances on real stage completions, hitting 100% when data is in hand.
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncLabel, setSyncLabel] = useState("");

  const maintenance = useWalletMaintenance(wallet, signerRef, showLastXTransactions);
  const { claimPending, refreshBalance, refreshTransfers, reset: resetMaintenance } = maintenance;

  // Claiming can take many BLE round-trips, so it runs after Home is shown; Home displays `claiming` meanwhile.
  const claimInBackground = useCallback(
    async (w: SparkWalletType, signer: BleHardwareSigner) => {
      await claimPending(w, signer);
      if (walletRef.current !== w) return;
      await Promise.all([refreshBalance(w), refreshTransfers(w)]).catch((err) =>
        console.warn("refresh after claim failed:", err),
      );
    },
    [claimPending, refreshBalance, refreshTransfers],
  );

  const connectAndInit = useCallback(
    async (targetDeviceId: string, expected?: SavedDevice) => {
      setInitError(null);
      setSyncing(true);
      setSyncProgress(0);
      setSyncLabel("Connecting...");
      const conn = new BleSignerConnection();
      try {
        const { deviceId, deviceName } = await conn.connect(setSyncLabel, targetDeviceId);
        setSyncProgress(15);

        const signer = new BleHardwareSigner(conn);
        if (expected) {
          setSyncLabel("Verifying wallet...");
          const devicePubkey = bytesToHex(await signer.getIdentityPublicKey());
          if (devicePubkey !== expected.identityPubkey) {
            await conn.disconnect().catch(() => {});
            setInitError(`The device does not match the saved wallet "${expected.name}".`);
            showAlert(
              "Wallet mismatch",
              `The device you connected to has a different public key than the saved wallet "${expected.name}". The connection was cancelled.`,
              [
                { text: "Keep wallet", style: "cancel" },
                {
                  text: "Forget wallet",
                  style: "destructive",
                  onPress: () => void forgetDevice(expected).then(startPairScan),
                },
              ],
            );
            return;
          }
        }

        setSyncProgress(25);
        setSyncLabel("Starting wallet...");
        const { wallet: w } = await SparkWallet.initialize({
          signer,
          options: {
            network: SPARK_NETWORK,
            signerWithPreExistingKeys: true,
          },
        });
        setWallet(w);
        walletRef.current = w;
        signerRef.current = signer;
        connRef.current = conn;
        // `selectCandidate` keeps the scan screen to fall back to on failure; clear it now that a wallet exists.
        cancelPairScan();
        setSyncProgress(45);
        setSyncLabel("Preparing wallet...");

        // The SDK's private auto-claim timer can't be marked as not needing spend confirmation,
        // so it's disabled in favor of our own claim.
        const w2 = w as unknown as { claimTransfersInterval: ReturnType<typeof setInterval> | null };
        if (w2.claimTransfersInterval) {
          clearInterval(w2.claimTransfersInterval);
          w2.claimTransfersInterval = null;
        }

        const pubkey = await w.getIdentityPublicKey();
        setIdentityPubkey(pubkey);
        setSyncProgress(60);

        if (savedDevices.some((d) => d.id === deviceId)) {
          await touchLastConnected(deviceId);
        } else {
          // BLE ids rotate; the identity pubkey is what identifies a wallet, so avoid saving it twice.
          const existing = await findDeviceByPubkey(pubkey);
          if (existing) {
            await saveDevice({ ...existing, id: deviceId, lastConnected: Date.now() });
            await reloadSavedDevices();
          } else {
            setPendingNewDevice({ deviceId, defaultName: deviceName ?? "Spark Signer", identityPubkey: pubkey });
          }
        }

        setSyncLabel("Loading balance and activity...");
        await Promise.all([refreshBalance(w), refreshTransfers(w)]);
        // Brief pause so the user registers "100%" before the swap to Home.
        setSyncProgress(100);
        setSyncLabel("Ready");
        await new Promise((resolve) => setTimeout(resolve, 400));
        void claimInBackground(w, signer);
        void loadLightningAddress(pubkey, signer);
      } catch (err) {
        setInitError(String(err));
        // No wallet owns this connection, so don't leave the BLE link open.
        if (connRef.current !== conn) await conn.disconnect().catch(() => {});
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [
      savedDevices,
      reloadSavedDevices,
      forgetDevice,
      setPendingNewDevice,
      setInitError,
      startPairScan,
      cancelPairScan,
      refreshBalance,
      refreshTransfers,
      claimInBackground,
      loadLightningAddress,
    ],
  );

  // Resets all per-wallet state for a clean next connect. The wallet is cleaned up first: its
  // background timers would otherwise keep signing through the closed BLE connection and fail forever.
  const disconnectWallet = useCallback(async () => {
    try {
      await walletRef.current?.cleanupConnections();
    } catch (err) {
      console.warn("wallet cleanup failed:", err);
    }
    walletRef.current = null;
    try {
      await connRef.current?.disconnect();
    } catch (err) {
      console.warn("disconnect failed:", err);
    }
    connRef.current = null;
    signerRef.current = null;
    setWallet(null);
    setIdentityPubkey(null);
    setLightningAddress(null);
    setLightningAddressFailed(false);
    resetMaintenance();
    setLoading(true);
    setSyncing(false);
    setSyncProgress(0);
    cancelPairScan();
  }, [resetMaintenance, cancelPairScan]);

  return {
    wallet,
    signerRef,
    identityPubkey,
    lightningAddress,
    lightningAddressFailed,
    retryLightningAddress,
    loading,
    syncing,
    syncProgress,
    syncLabel,
    maintenance,
    connectAndInit,
    disconnectWallet,
  };
}
