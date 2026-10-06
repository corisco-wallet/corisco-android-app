import { decode as decodeBolt11 } from "light-bolt11-decoder";
import type { SparkWallet } from "@buildonspark/spark-sdk";
import type { BleHardwareSigner } from "./ble-hardware-signer";
import { btcToSats } from "./price";

const FEE_MARGIN_SATS = 10;
const FALLBACK_MAX_FEE_SATS = 100;

/** Head+tail truncation for the device's small confirm screen. Uses the invoice, not its bolt11
 * description: that is arbitrary payee-chosen text and could be written to look like something else. */
export function shortInvoice(invoice: string): string {
  return invoice.length <= 22 ? invoice : `${invoice.slice(0, 12)}…${invoice.slice(-8)}`;
}

/** null means a 0-amount/any-amount invoice. Throws if the text isn't a bolt11 invoice. */
export function decodeInvoiceAmountSats(invoice: string): bigint | null {
  const { sections } = decodeBolt11(invoice);
  for (const section of sections) {
    if (section.name === "amount") return BigInt(section.value) / 1000n;
  }
  return null;
}

/** null when the text isn't a valid positive amount in the given unit. */
export function parseManualAmountSats(text: string, btc: boolean): bigint | null {
  const trimmed = text.trim();
  const parsed = btc ? btcToSats(trimmed) : /^\d+$/.test(trimmed) ? BigInt(trimmed) : null;
  return parsed !== null && parsed > 0n ? parsed : null;
}

export function isInsufficientFunds({
  availableSats,
  amountSats,
  feeSats,
  feeLoading,
}: {
  availableSats: bigint | null;
  amountSats: bigint | null;
  feeSats: bigint | null;
  feeLoading: boolean;
}): boolean {
  if (availableSats === null || amountSats === null) return false;
  return amountSats + (feeLoading ? 0n : (feeSats ?? 0n)) > availableSats;
}

/** `amountSatsToSend` is only accepted by the SDK for a 0-amount invoice. */
export function buildPayParams({
  invoice,
  invoiceAmountSats,
  amountSats,
  feeEstimateSats,
}: {
  invoice: string;
  invoiceAmountSats: bigint | null;
  amountSats: bigint;
  feeEstimateSats: bigint | null;
}) {
  return {
    invoice,
    maxFeeSats: feeEstimateSats !== null ? Number(feeEstimateSats) + FEE_MARGIN_SATS : FALLBACK_MAX_FEE_SATS,
    preferSpark: false,
    ...(invoiceAmountSats === null ? { amountSatsToSend: Number(amountSats) } : {}),
  };
}

/** Every Sign the payment triggers is confirmed on the device, so this must never use withoutSpendConfirmation. */
export function payInvoice(
  wallet: SparkWallet,
  signer: BleHardwareSigner,
  params: Parameters<typeof buildPayParams>[0],
) {
  return signer.withSpendContext(
    { amountSats: params.amountSats, destination: shortInvoice(params.invoice) },
    () => wallet.payLightningInvoice(buildPayParams(params)),
  );
}
