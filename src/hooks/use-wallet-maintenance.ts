import { useCallback, useEffect, useState, type RefObject } from "react";
import { SparkWalletEvent, type SparkWallet as SparkWalletType } from "@buildonspark/spark-sdk";
import type { WalletTransfer } from "@buildonspark/spark-sdk/types";
import type { BleHardwareSigner } from "../ble-hardware-signer";
import { showAlert } from "../components/AppAlert";

export function useWalletMaintenance(
  wallet: SparkWalletType | null,
  signerRef: RefObject<BleHardwareSigner | null>,
  showLastXTransactions: number,
) {
  const [availableSats, setAvailableSats] = useState<bigint | null>(null);
  // `incoming`: known to the server but not yet claimed; `claiming`: a claim pass is in flight.
  const [incomingSats, setIncomingSats] = useState<bigint | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [transfers, setTransfers] = useState<WalletTransfer[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Claims pending transfers without a device confirmation tap (see `withoutSpendConfirmation`),
  // replacing the SDK's uncontrollable auto-claim. Loops because transfers can become claimable mid-pass.
  const claimPending = useCallback(async (w: SparkWalletType, signer: BleHardwareSigner) => {
    setClaiming(true);
    try {
      while (true) {
        const claimed = await signer.withoutSpendConfirmation(() =>
          (w as unknown as { claimTransfers(): Promise<string[]> }).claimTransfers(),
        );
        if (claimed.length === 0) break;
      }
    } catch (claimErr) {
      console.warn("claimTransfers failed:", claimErr);
      showAlert("Claim failed", String(claimErr));
    } finally {
      setClaiming(false);
    }
  }, []);

  // Consolidates leaves so payments need fewer BLE signing round-trips. Called ourselves because the
  // SDK's built-in auto-optimize can't be routed through `withoutSpendConfirmation`.
  const optimizePending = useCallback(async (w: SparkWalletType, signer: BleHardwareSigner) => {
    try {
      await signer.withoutSpendConfirmation(async () => {
        for await (const _step of w.optimizeLeaves()) {
        }
      });
    } catch (optimizeErr) {
      // Best-effort housekeeping, so not surfaced like a failed claim.
      console.warn("optimizeLeaves failed:", optimizeErr);
    }
  }, []);

  const refreshBalance = useCallback(async (w: SparkWalletType) => {
    const balance = await w.getBalance();
    setAvailableSats(balance.satsBalance.available);
    setIncomingSats(balance.satsBalance.incoming);
  }, []);

  const refreshTransfers = useCallback(
    async (w: SparkWalletType) => {
      setTransfersLoading(true);
      try {
        const { transfers: recent } = await w.getTransfers(showLastXTransactions, 0);
        setTransfers(recent);
      } finally {
        setTransfersLoading(false);
      }
    },
    [showLastXTransactions],
  );

  // The app's one refresh action (pull-to-refresh and the Home button); deliberately not polled.
  const onRefresh = useCallback(async () => {
    if (!wallet || !signerRef.current) return;
    setRefreshing(true);
    try {
      await claimPending(wallet, signerRef.current);
      await Promise.all([refreshBalance(wallet), refreshTransfers(wallet)]);
    } finally {
      setRefreshing(false);
    }
  }, [wallet, signerRef, claimPending, refreshBalance, refreshTransfers]);

  // The SDK's event stream pushes balance changes; a claimed transfer just triggers a re-fetch.
  useEffect(() => {
    if (!wallet) return;
    const onBalanceUpdate = (balance: { available: bigint; incoming: bigint }) => {
      setAvailableSats(balance.available);
      setIncomingSats(balance.incoming);
    };
    const onTransferClaimed = () => {
      void refreshTransfers(wallet);
    };
    wallet.on(SparkWalletEvent.BalanceUpdate, onBalanceUpdate);
    wallet.on(SparkWalletEvent.TransferClaimed, onTransferClaimed);
    return () => {
      wallet.off(SparkWalletEvent.BalanceUpdate, onBalanceUpdate);
      wallet.off(SparkWalletEvent.TransferClaimed, onTransferClaimed);
    };
  }, [wallet, refreshTransfers]);

  // Slower than claiming: consolidation costs real BLE signing round-trips.
  useEffect(() => {
    if (!wallet || !signerRef.current) return;
    const signer = signerRef.current;
    const interval = setInterval(() => {
      void optimizePending(wallet, signer);
    }, 60_000);
    return () => clearInterval(interval);
  }, [wallet, signerRef, optimizePending]);

  const reset = useCallback(() => {
    setAvailableSats(null);
    setIncomingSats(null);
    setTransfers([]);
    setTransfersLoading(true);
  }, []);

  return {
    availableSats,
    incomingSats,
    claiming,
    transfers,
    transfersLoading,
    refreshing,
    claimPending,
    optimizePending,
    refreshBalance,
    refreshTransfers,
    onRefresh,
    reset,
  };
}
