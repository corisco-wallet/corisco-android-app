// Pay a Lightning invoice, either pasted in directly or scanned from a QR
// code.

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { SparkWallet as SparkWalletType } from "@buildonspark/spark-sdk";
import type { BleHardwareSigner, SignProgress } from "../ble-hardware-signer";
import { colors, radii, spacing } from "../theme";
import { formatBtc } from "../price";
import {
  decodeInvoiceAmountSats,
  isInsufficientFunds,
  parseManualAmountSats,
  payInvoice,
} from "../send-payment";
import type { Settings } from "../settings-store";
import { SendingScreen } from "./SendingScreen";
import { SendResultScreen } from "./SendResultScreen";

export function SendScreen({
  wallet,
  signer,
  settings,
  availableSats,
  onBack,
  onPaid,
}: {
  wallet: SparkWalletType;
  signer: BleHardwareSigner;
  settings: Settings;
  availableSats: bigint | null;
  onBack: () => void;
  onPaid: () => void;
}) {
  const btc = settings.balanceUnit === "btc";
  const unitLabel = btc ? "BTC" : "sats";
  const formatAmount = (sats: bigint) => (btc ? formatBtc(sats) : sats.toString());
  const [invoice, setInvoice] = useState("");
  const [invoiceFocused, setInvoiceFocused] = useState(false);
  const [amountText, setAmountText] = useState("");
  // The amount a *fixed-amount* invoice carries, decoded as the invoice
  // text changes -- `null` means either the invoice hasn't been
  // (successfully) decoded yet, or it's a 0-amount/any-amount invoice, in
  // both of which cases the amount field stays user-editable. Once an
  // invoice with its own amount is recognized, the field locks to that
  // value: the SDK's `payLightningInvoice` only accepts an explicit
  // `amountSatsToSend` for a 0-amount invoice (see its own doc comment) --
  // sending one alongside a fixed-amount invoice isn't a real option, so
  // there's nothing meaningful to type there.
  const [invoiceAmountSats, setInvoiceAmountSats] = useState<bigint | null>(null);
  const [invoiceDecoded, setInvoiceDecoded] = useState(false);
  const [maxLoading, setMaxLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [signProgress, setSignProgress] = useState<SignProgress | null>(null);
  const [paying, setPaying] = useState(false);
  // Full-screen result shown once `pay()` finishes, success or failure --
  // distinct from `error` below, which is only ever a pre-flight/form
  // issue (e.g. camera permission for the QR scanner), not a payment
  // outcome.
  const [payOutcome, setPayOutcome] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const handleInvoiceChange = (text: string) => {
    const trimmed = text.trim();
    setInvoice(trimmed);
    setError(null);
    if (!trimmed) {
      setInvoiceAmountSats(null);
      setInvoiceDecoded(false);
      return;
    }
    try {
      const decoded = decodeInvoiceAmountSats(trimmed);
      setInvoiceAmountSats(decoded);
      setInvoiceDecoded(true);
      if (decoded !== null) setAmountText(formatAmount(decoded));
    } catch {
      // Not yet a decodable invoice (still mid-paste, or garbage) --
      // leave whatever's already in the amount field alone.
      setInvoiceAmountSats(null);
      setInvoiceDecoded(false);
    }
  };

  const startScan = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setError("Camera permission is needed to scan a QR code.");
        return;
      }
    }
    setError(null);
    setScanning(true);
  };

  const onBarcodeScanned = ({ data }: { data: string }) => {
    setScanning(false);
    handleInvoiceChange(data.trim());
  };

  // What amount actually gets sent: the invoice's own fixed amount if it
  // has one, otherwise whatever's typed into the amount field (for a
  // 0-amount invoice, where the payer chooses).
  const manualAmountSats = parseManualAmountSats(amountText, btc);
  const effectiveAmountSats = invoiceAmountSats ?? manualAmountSats;

  // Real fee estimate (not a guess) from the SDK, refetched whenever the
  // invoice or amount changes -- debounced since amount typing (for a
  // 0-amount invoice) fires on every keystroke. Failure just hides the
  // fee/total line rather than blocking anything -- it's informational,
  // same "degrade gracefully" treatment as HomeScreen's BTC/fiat rate.
  const [feeEstimateSats, setFeeEstimateSats] = useState<bigint | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = invoice.trim();
    if (!trimmed || effectiveAmountSats === null) {
      setFeeEstimateSats(null);
      setFeeError(null);
      setFeeLoading(false);
      return;
    }
    let cancelled = false;
    setFeeLoading(true);
    const timer = setTimeout(() => {
      wallet
        .getLightningSendFeeEstimate({
          encodedInvoice: trimmed,
          // Same convention as `payLightningInvoice`'s `amountSatsToSend`
          // below -- only meaningful (and only accepted) for a 0-amount
          // invoice.
          ...(invoiceAmountSats === null ? { amountSats: Number(effectiveAmountSats) } : {}),
        })
        .then((fee) => {
          if (cancelled) return;
          setFeeEstimateSats(BigInt(Math.ceil(fee)));
          setFeeError(null);
        })
        .catch(() => {
          if (cancelled) return;
          setFeeEstimateSats(null);
          setFeeError("Fee estimate unavailable");
        })
        .finally(() => {
          if (!cancelled) setFeeLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [invoice, effectiveAmountSats, invoiceAmountSats, wallet]);

  const insufficientFunds = isInsufficientFunds({
    availableSats,
    amountSats: effectiveAmountSats,
    feeSats: feeEstimateSats,
    feeLoading,
  });
  const canPay = invoiceDecoded && effectiveAmountSats !== null && !feeLoading && !insufficientFunds;

  const sendMax = async () => {
    if (availableSats === null) return;
    setMaxLoading(true);
    setError(null);
    try {
      const fee = BigInt(
        Math.ceil(
          await wallet.getLightningSendFeeEstimate({
            encodedInvoice: invoice.trim(),
            amountSats: Number(availableSats),
          }),
        ),
      );
      if (fee >= availableSats) {
        setError("Balance is too low to cover the network fee.");
        return;
      }
      setAmountText(formatAmount(availableSats - fee));
    } catch {
      setError("Couldn't estimate the fee for the max amount.");
    } finally {
      setMaxLoading(false);
    }
  };

  const pay = async () => {
    Keyboard.dismiss();
    const trimmed = invoice.trim();
    if (!trimmed || !canPay || effectiveAmountSats === null) return;
    setPaying(true);
    setError(null);
    signer.onSignProgress = setSignProgress;
    try {
      // Every Sign this triggers requires on-device confirmation -- see
      // `withSpendContext`'s doc comment for why it doesn't try to filter
      // out any of them (a real spend silently went through with none
      // shown at all, when this tried inferring which one to skip).
      await payInvoice(wallet, signer, {
        invoice: trimmed,
        invoiceAmountSats,
        amountSats: effectiveAmountSats,
        feeEstimateSats,
      });
      setPayOutcome({ ok: true, message: `${formatAmount(effectiveAmountSats)} ${unitLabel} sent` });
      onPaid();
    } catch (err) {
      setPayOutcome({ ok: false, message: String(err) });
    } finally {
      signer.onSignProgress = undefined;
      setSignProgress(null);
      setPaying(false);
    }
  };

  const retry = () => setPayOutcome(null);

  const finish = () => {
    setPayOutcome(null);
    onBack();
  };

  // Full-screen, not an inline spinner -- a payment can be waiting on a
  // physical tap on the hardware signer's own confirm screen, which is
  // easy to miss as "still loading" versus "actually stuck" without a
  // more deliberate status screen (same reasoning as SyncingScreen's
  // wallet-load indicator).
  if (paying) {
    const label = signProgress
      ? `Sending payment...\nConfirm on your device: ${signProgress.confirmed} of ${signProgress.total} signatures`
      : "Sending payment...";
    return <SendingScreen label={label} />;
  }

  if (payOutcome) {
    return (
      <SendResultScreen
        ok={payOutcome.ok}
        message={payOutcome.message}
        onDone={finish}
        onRetry={payOutcome.ok ? undefined : retry}
      />
    );
  }

  if (scanning) {
    return (
      <View style={styles.scannerContainer}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={onBarcodeScanned}
        />
        <View style={styles.scannerOverlay}>
          <View style={styles.scannerFrame} />
          <TouchableOpacity style={styles.cancelScanButton} onPress={() => setScanning(false)}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>{"< Back"}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Send</Text>

      <Text style={styles.label}>Lightning invoice</Text>
      {invoiceFocused ? (
        <TextInput
          style={[styles.input, styles.inputExpanded]}
          placeholder="lnbc..."
          placeholderTextColor={colors.textMuted}
          value={invoice}
          onChangeText={handleInvoiceChange}
          onBlur={() => setInvoiceFocused(false)}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
      ) : (
        <TouchableOpacity activeOpacity={0.7} onPress={() => setInvoiceFocused(true)}>
          <Text
            style={[styles.input, !invoice && styles.inputPlaceholder]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {invoice || "lnbc..."}
          </Text>
        </TouchableOpacity>
      )}
      {invoiceDecoded && <Text style={styles.validText}>Valid Lightning invoice</Text>}
      {!invoiceDecoded && invoice !== "" && !invoiceFocused && (
        <Text style={styles.invalidText}>Not a valid Lightning invoice</Text>
      )}

      <TouchableOpacity style={styles.secondaryButtonOutline} onPress={startScan}>
        <Text style={styles.secondaryButtonOutlineText}>Scan QR code</Text>
      </TouchableOpacity>

      {invoiceDecoded && (
        <>
          <View style={styles.amountHeader}>
            <Text style={styles.label}>Amount ({unitLabel})</Text>
            {invoiceAmountSats === null && (
              <TouchableOpacity onPress={sendMax} disabled={maxLoading || availableSats === null}>
                <Text style={styles.maxText}>{maxLoading ? "..." : "Max"}</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={[styles.amountInput, invoiceAmountSats !== null && styles.amountInputLocked]}
            placeholder="Enter amount"
            placeholderTextColor={colors.textMuted}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType={btc ? "decimal-pad" : "number-pad"}
            editable={invoiceAmountSats === null}
          />
          <Text style={styles.hint}>
            {invoiceAmountSats !== null ? "Amount set by the invoice." : "This invoice doesn't set an amount -- enter one."}
          </Text>
          {insufficientFunds && availableSats !== null && (
            <Text style={styles.error}>
              Exceeds your available balance of {formatAmount(availableSats)} {unitLabel} (amount + fee).
            </Text>
          )}
        </>
      )}

      {invoiceDecoded && effectiveAmountSats !== null && (
        <View style={styles.feeBlock}>
          {feeLoading ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : feeEstimateSats !== null ? (
            <>
              <Text style={styles.feeText}>Network fee: ~{formatAmount(feeEstimateSats)} {unitLabel}</Text>
              <Text style={styles.totalText}>Total: {formatAmount(effectiveAmountSats + feeEstimateSats)} {unitLabel}</Text>
            </>
          ) : (
            feeError && <Text style={styles.hint}>{feeError}</Text>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryButton, !canPay && styles.primaryButtonDisabled]}
        onPress={pay}
        disabled={!canPay}
      >
        <Text style={styles.primaryButtonText}>Pay</Text>
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.xl,
  },
  backButton: {
    marginBottom: spacing.lg,
  },
  backText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: spacing.xl,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: "monospace",
    marginBottom: spacing.md,
  },
  validText: {
    color: colors.success,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  invalidText: {
    color: colors.error,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  inputPlaceholder: {
    color: colors.textMuted,
  },
  inputExpanded: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  amountInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
  },
  amountInputLocked: {
    color: colors.textSecondary,
  },
  amountHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  maxText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "700",
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  feeBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  feeText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  totalText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: colors.accentText,
    fontSize: 17,
    fontWeight: "700",
  },
  secondaryButtonOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  secondaryButtonOutlineText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
  },
  error: {
    color: colors.error,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  scannerOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radii.md,
  },
  cancelScanButton: {
    position: "absolute",
    bottom: 60,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
});
