import { decode as decodeBolt11 } from "light-bolt11-decoder";
import type { SparkWallet } from "@buildonspark/spark-sdk";
import type { BleHardwareSigner } from "./ble-hardware-signer";
import { btcToSats } from "./price";
import type { SignProgress } from "./ble-hardware-signer";

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

type LeafPrep = { leaf: { directTx: Uint8Array } }[];
type TransferServiceLike = Record<string, ((...args: never[]) => unknown) | undefined>;

/** Per leaf the SDK signs the CPFP and direct-from-CPFP refunds, plus the direct refund when the leaf has a direct tx. */
export function leafSignatureCount(leaves: LeafPrep): number {
  return leaves.reduce((n, { leaf }) => n + (leaf.directTx.length > 0 ? 3 : 2), 0);
}

/** A payment signs in phases (an optional leaf swap with the service provider, a claim of the swapped leaves, then the
 * payment transfer); each phase reports its count when the SDK starts it. Reaches into an SDK-private service, so a
 * method that is missing or renamed is skipped and the total just stays unknown. Returns an undo. */
function announceSignatureCounts(wallet: SparkWallet, signer: BleHardwareSigner): () => void {
  const service = (wallet as unknown as { transferService?: TransferServiceLike }).transferService;
  if (!service) return () => {};
  const undo: Array<() => void> = [];

  const announce = (method: string, count: (args: unknown[]) => number) => {
    const original = service[method] as ((...args: unknown[]) => unknown) | undefined;
    if (typeof original !== "function") return;
    service[method] = ((...args: unknown[]) => {
      signer.expectSignatures(count(args));
      return original.apply(service, args);
    }) as never;
    undo.push(() => {
      service[method] = original as never;
    });
  };

  announce("prepareTransferForLightning", ([leaves]) => leafSignatureCount(leaves as LeafPrep));
  announce("sendSwapTransfer", ([leaves]) => leafSignatureCount(leaves as LeafPrep));
  announce("claimTransferSignRefunds", ([, leafKeys]) => leafSignatureCount(leafKeys as LeafPrep));
  return () => undo.forEach((restore) => restore());
}

/** Every Sign the payment triggers is confirmed on the device, so this must never use withoutSpendConfirmation. */
export async function payInvoice(
  wallet: SparkWallet,
  signer: BleHardwareSigner,
  params: Parameters<typeof buildPayParams>[0],
) {
  const restore = announceSignatureCounts(wallet, signer);
  try {
    return await signer.withSpendContext(
      { amountSats: params.amountSats, destination: shortInvoice(params.invoice) },
      () => wallet.payLightningInvoice(buildPayParams(params)),
    );
  } finally {
    restore();
  }
}

/** "Signature 2 of 4" shows the signature being waited on; before the SDK reports anything it is just "Sending payment...". */
export function progressLabel(progress: SignProgress | null): string {
  if (!progress) return "Sending payment...";
  const current = progress.confirmed + 1;
  return progress.total === null ? `Signature ${current}` : `Signature ${Math.min(current, progress.total)} of ${progress.total}`;
}

/** Never goes backwards: a payment that swaps leaves first learns its later phases' sizes only as it goes, so the
 * ring may pause while the total grows but must not shrink. */
export function nextProgressRatio(previous: number | null, progress: SignProgress | null): number | null {
  if (!progress || progress.total === null || progress.total === 0) return previous;
  return Math.max(previous ?? 0, Math.min(1, progress.confirmed / progress.total));
}
