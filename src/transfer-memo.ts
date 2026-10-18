import { decode as decodeBolt11 } from "light-bolt11-decoder";
import type { WalletTransfer } from "@buildonspark/spark-sdk/types";

type LightningRequest = { encodedInvoice?: string; invoice?: { encodedInvoice?: string } };

/** The note is the invoice's own description: `invoice.memo` on a receive request is base64, not the text. */
export function transferMemo(transfer: WalletTransfer): string | null {
  const request = transfer.userRequest as LightningRequest | undefined;
  const encoded = request?.invoice?.encodedInvoice ?? request?.encodedInvoice;
  if (typeof encoded !== "string") return null;
  try {
    const description = decodeBolt11(encoded).sections.find((s) => s.name === "description");
    const text = typeof description?.value === "string" ? description.value.trim() : "";
    return text || null;
  } catch {
    return null;
  }
}

export function transferLabel(transfer: WalletTransfer): string {
  return transferMemo(transfer) ?? (transfer.transferDirection === "INCOMING" ? "Payment Received" : "Payment Sent");
}
