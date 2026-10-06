import type { SparkWallet } from "@buildonspark/spark-sdk";
import { btcToSats } from "./price";

export const MAX_MEMO_LENGTH = 100;

/** 0 means "any amount"; null means the text isn't a valid amount. */
export function parseAmountSats(text: string, btc: boolean): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  if (btc) {
    const sats = btcToSats(trimmed);
    return sats === null ? null : Number(sats);
  }
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

export function invoiceParams(amountSats: number, memoText: string) {
  return { amountSats, memo: memoText.trim() || undefined };
}

export async function createReceiveInvoice(wallet: SparkWallet, amountSats: number, memoText: string): Promise<string> {
  const request = await wallet.createLightningInvoice(invoiceParams(amountSats, memoText));
  return request.invoice.encodedInvoice;
}
