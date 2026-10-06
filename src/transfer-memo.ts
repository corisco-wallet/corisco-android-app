import type { WalletTransfer } from "@buildonspark/spark-sdk/types";

export function transferMemo(transfer: WalletTransfer): string | null {
  const request = transfer.userRequest as { invoice?: { memo?: string } } | undefined;
  const memo = request?.invoice?.memo?.trim();
  return memo ? memo : null;
}
