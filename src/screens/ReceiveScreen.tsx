// Two tabs: the wallet's reusable Lightning address (with an lnurl QR), shown
// by default, and a one-off BOLT11 invoice with an optional amount and note.
// With the address feature off, only the invoice is shown.
//
// BTC L1 receiving (a static deposit address) was tried and deliberately
// removed: generating the address only needs a public key (safe), but
// actually claiming a confirmed deposit into spendable balance requires
// the SDK to call `signer.getStaticDepositSecretKey()`, which hands over
// the *raw private key* -- unlike every other operation this signer
// exposes (signatures, Shamir shares, ECIES ciphertext), never a raw key.
// An address with no way to ever claim what's sent to it would just
// strand real funds, so the whole feature was pulled rather than shipped
// half-working.

import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import Svg, { Path, Polyline, Rect } from "react-native-svg";
import type { SparkWallet as SparkWalletType } from "@buildonspark/spark-sdk";
import { AmountCard } from "../components/AmountCard";
import { KeyboardScroll } from "../components/KeyboardScroll";
import { Tabs } from "../components/Tabs";
import { shortenInvoice } from "../invoice-format";
import { lightningAddressPayUrl, lnurlEncode } from "../lnurl";
import { LIGHTNING_ADDRESS } from "../network";
import { formatBtc } from "../price";
import { MAX_MEMO_LENGTH, createReceiveInvoice, parseAmountSats } from "../receive-invoice";
import type { Settings } from "../settings-store";
import { colors, radii, spacing } from "../theme";

// Quartile error correction leaves room for the centered logo to cover modules without breaking scans.
const QR_LOGO = {
  logo: require("../../assets/icon.png"),
  logoSize: 48,
  logoMargin: 3,
  logoBorderRadius: 10,
  logoBackgroundColor: "#FFFFFF",
  ecl: "Q" as const,
};

// Hand-drawn (Feather-style) icons via react-native-svg -- already a
// dependency for the QR code above -- rather than an emoji glyph, which
// rendered as an odd boxed/monochrome symbol on Android instead of a
// clean picture.
type ReceiveMode = "address" | "invoice";

const RECEIVE_TABS = [
  { key: "address", label: "Lightning address" },
  { key: "invoice", label: "One-time invoice" },
] as const;

function CopyIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Svg>
  );
}

function CheckIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

export function ReceiveScreen({
  wallet,
  settings,
  btcPrice,
  lightningAddress,
  addressFailed,
  onRetryAddress,
  onBack,
}: {
  wallet: SparkWalletType;
  settings: Settings;
  btcPrice: number | null;
  lightningAddress: string | null;
  addressFailed: boolean;
  onRetryAddress: () => void;
  onBack: () => void;
}) {
  const btc = settings.balanceUnit === "btc";
  const unitLabel = btc ? "BTC" : "sats";
  const formatAmount = (sats: number) => (btc ? formatBtc(BigInt(sats)) : String(sats));
  const [amountText, setAmountText] = useState("");
  const [memoText, setMemoText] = useState("");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  // The amount the *currently displayed* invoice was actually generated
  // for -- kept separate from `amountText` so the on-screen label always
  // reflects what the QR code really encodes, not whatever's mid-typing
  // in the field a moment before the debounced regenerate catches up.
  const [invoiceAmountSats, setInvoiceAmountSats] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<ReceiveMode>(LIGHTNING_ADDRESS ? "address" : "invoice");
  const showAddress = mode === "address";
  const addressLnurl = useMemo(() => {
    if (!lightningAddress || !LIGHTNING_ADDRESS) return null;
    const username = lightningAddress.slice(0, lightningAddress.lastIndexOf("@"));
    return lnurlEncode(lightningAddressPayUrl(username, LIGHTNING_ADDRESS.domain)).toUpperCase();
  }, [lightningAddress]);

  // Generates an invoice for `amountSats` (0 = any amount) and, only if
  // this is still the most recent request in flight, shows it -- guards
  // against an in-flight regenerate for an amount the user has since
  // changed again from clobbering a newer one that resolves first.
  useEffect(() => {
    let cancelled = false;
    // Each invoice stores operator shares, so none is created while the address tab is open.
    if (showAddress) {
      setInvoice(null);
      setInvoiceAmountSats(null);
      setGenerating(false);
      setError(null);
      return;
    }
    const amountSats = parseAmountSats(amountText, btc);
    if (amountSats === null) {
      setError("Enter a valid amount, or leave it blank for any amount");
      return;
    }
    setGenerating(true);
    setError(null);
    createReceiveInvoice(wallet, amountSats, memoText)
      .then((encodedInvoice) => {
        if (cancelled) return;
        setInvoice(encodedInvoice);
        setInvoiceAmountSats(amountSats);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setGenerating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [amountText, memoText, btc, wallet, showAddress]);

  const copy = async (text: string | null) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <KeyboardScroll
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>{"< Back"}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Receive</Text>

      {LIGHTNING_ADDRESS && (
        <View style={styles.tabs}>
          <Tabs tabs={RECEIVE_TABS} value={mode} onChange={setMode} />
        </View>
      )}

      {showAddress && addressLnurl && (
        <View style={styles.invoiceBlock}>
          <View style={styles.qrWrap}>
            <QRCode value={addressLnurl} size={210} backgroundColor="#FFFFFF" color="#000000" {...QR_LOGO} />
          </View>
          <Text style={styles.amountLabel}>Lightning address</Text>
          <Text style={styles.addressText} selectable>
            {lightningAddress}
          </Text>
          <TouchableOpacity style={styles.copyButton} onPress={() => copy(lightningAddress)}>
            {copied ? <CheckIcon color={colors.success} /> : <CopyIcon color={colors.textPrimary} />}
          </TouchableOpacity>
          <Text style={styles.hint}>Reusable, any amount.</Text>
        </View>
      )}
      {showAddress && !lightningAddress && (
        <View style={styles.bannerRow}>
          <Text style={styles.hint}>{addressFailed ? "Lightning address unavailable." : "Loading Lightning address..."}</Text>
          {addressFailed && (
            <TouchableOpacity onPress={onRetryAddress}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {!showAddress && invoice && !error && (
        <View style={styles.invoiceBlock}>
          <View style={styles.qrWrap}>
            <QRCode value={invoice} size={210} backgroundColor="#FFFFFF" color="#000000" {...QR_LOGO} />
          </View>
          <Text style={styles.amountLabel}>
            {invoiceAmountSats && invoiceAmountSats > 0 ? `${formatAmount(invoiceAmountSats)} ${unitLabel}` : "Any amount"}
            {generating && "  (updating...)"}
          </Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => setExpanded((e) => !e)}>
            <Text style={styles.invoiceText} numberOfLines={expanded ? undefined : 1}>
              {expanded ? invoice : shortenInvoice(invoice)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.copyButton} onPress={() => copy(invoice)}>
            {copied ? <CheckIcon color={colors.success} /> : <CopyIcon color={colors.textPrimary} />}
          </TouchableOpacity>
        </View>
      )}
      {!showAddress && !invoice && generating && (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.loadingText}>Generating invoice...</Text>
        </View>
      )}
      {!showAddress && error && <Text style={styles.error}>{error}</Text>}

      {!showAddress && (
        <View style={styles.inputs}>
          <AmountCard
            amountText={amountText}
            onAmountChange={setAmountText}
            settings={settings}
            btcPrice={btcPrice}
            emptyStyle="link"
            note={{ value: memoText, onChange: setMemoText, maxLength: MAX_MEMO_LENGTH }}
          />
        </View>
      )}
    </KeyboardScroll>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingTop: 60,
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
  tabs: {
    marginBottom: spacing.xl,
  },
  copyButton: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  error: {
    color: colors.error,
    marginTop: spacing.md,
    textAlign: "center",
  },
  invoiceBlock: {
    alignItems: "center",
  },
  loadingBlock: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.md,
  },
  qrWrap: {
    backgroundColor: "#FFFFFF",
    padding: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
  },
  amountLabel: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  inputs: {
    marginTop: spacing.xl,
  },
  addressText: {
    color: colors.textPrimary,
    fontSize: 16,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
    marginTop: spacing.md,
  },
  bannerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  retryText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "600",
    marginTop: spacing.md,
  },
  invoiceText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: "monospace",
    textAlign: "center",
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
});
