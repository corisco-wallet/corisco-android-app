import { describe, expect, it, vi } from "vitest";
import { bech32 } from "@scure/base";
import type { SparkWallet } from "@buildonspark/spark-sdk";
import type { BleHardwareSigner } from "../src/ble-hardware-signer";
import {
  buildPayParams,
  decodeInvoiceAmountSats,
  isInsufficientFunds,
  parseManualAmountSats,
  payInvoice,
  shortInvoice,
} from "../src/send-payment";

// BOLT 11 spec example: 2500u (= 250,000 sats).
const INVOICE_250K_SATS =
  "lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh";

// Same invoice re-encoded without its amount (the decoder doesn't check the signature).
const INVOICE_NO_AMOUNT = (() => {
  const { words } = bech32.decode(INVOICE_250K_SATS as `${string}1${string}`, 2000);
  return bech32.encode("lnbc", words, 2000);
})();

describe("decodeInvoiceAmountSats", () => {
  it("reads the fixed amount in sats", () => {
    expect(decodeInvoiceAmountSats(INVOICE_250K_SATS)).toBe(250_000n);
  });

  it("returns null for an any-amount invoice", () => {
    expect(decodeInvoiceAmountSats(INVOICE_NO_AMOUNT)).toBeNull();
  });

  it("throws on text that isn't an invoice", () => {
    expect(() => decodeInvoiceAmountSats("not an invoice")).toThrow();
  });
});

describe("parseManualAmountSats", () => {
  it("accepts whole sats", () => {
    expect(parseManualAmountSats(" 2100 ", false)).toBe(2100n);
  });

  it("rejects zero, decimals and junk in sats mode", () => {
    expect(parseManualAmountSats("0", false)).toBeNull();
    expect(parseManualAmountSats("1.5", false)).toBeNull();
    expect(parseManualAmountSats("", false)).toBeNull();
    expect(parseManualAmountSats("-5", false)).toBeNull();
  });

  it("converts BTC to sats", () => {
    expect(parseManualAmountSats("0.00002100", true)).toBe(2100n);
    expect(parseManualAmountSats("1", true)).toBe(100_000_000n);
  });

  it("rejects zero and malformed BTC", () => {
    expect(parseManualAmountSats("0", true)).toBeNull();
    expect(parseManualAmountSats("0.000000001", true)).toBeNull();
    expect(parseManualAmountSats("1,5", true)).toBeNull();
  });
});

describe("isInsufficientFunds", () => {
  const base = { availableSats: 1000n, amountSats: 900n, feeSats: 50n, feeLoading: false };

  it("allows amount plus fee within balance", () => {
    expect(isInsufficientFunds(base)).toBe(false);
    expect(isInsufficientFunds({ ...base, feeSats: 100n })).toBe(false);
  });

  it("blocks when amount plus fee exceeds balance", () => {
    expect(isInsufficientFunds({ ...base, feeSats: 101n })).toBe(true);
    expect(isInsufficientFunds({ ...base, amountSats: 1001n, feeSats: null })).toBe(true);
  });

  it("ignores a stale fee while the estimate is reloading", () => {
    expect(isInsufficientFunds({ ...base, feeSats: 500n, feeLoading: true })).toBe(false);
  });

  it("doesn't flag unknown balance or amount", () => {
    expect(isInsufficientFunds({ ...base, availableSats: null })).toBe(false);
    expect(isInsufficientFunds({ ...base, amountSats: null })).toBe(false);
  });
});

describe("shortInvoice", () => {
  it("keeps short strings as they are", () => {
    expect(shortInvoice("lnbc1short")).toBe("lnbc1short");
  });

  it("keeps the head and tail of a long invoice", () => {
    const short = shortInvoice(INVOICE_250K_SATS);
    expect(short).toBe(`${INVOICE_250K_SATS.slice(0, 12)}…${INVOICE_250K_SATS.slice(-8)}`);
  });
});

describe("buildPayParams", () => {
  const common = { invoice: "lnbcrt1x", amountSats: 500n };

  it("sends no explicit amount for a fixed-amount invoice", () => {
    const params = buildPayParams({ ...common, invoiceAmountSats: 500n, feeEstimateSats: 7n });
    expect(params).not.toHaveProperty("amountSatsToSend");
    expect(params.invoice).toBe("lnbcrt1x");
    expect(params.preferSpark).toBe(false);
  });

  it("sends the typed amount for an any-amount invoice", () => {
    const params = buildPayParams({ ...common, invoiceAmountSats: null, feeEstimateSats: 7n });
    expect(params.amountSatsToSend).toBe(500);
  });

  it("caps the fee at the estimate plus a margin", () => {
    expect(buildPayParams({ ...common, invoiceAmountSats: null, feeEstimateSats: 7n }).maxFeeSats).toBe(17);
  });

  it("falls back to a flat cap without an estimate", () => {
    expect(buildPayParams({ ...common, invoiceAmountSats: null, feeEstimateSats: null }).maxFeeSats).toBe(100);
  });
});

describe("payInvoice", () => {
  it("pays inside the spend context with the amount and shortened destination", async () => {
    const events: string[] = [];
    const withSpendContext = vi.fn(async (ctx: unknown, fn: () => Promise<unknown>) => {
      events.push("enter");
      const result = await fn();
      events.push("exit");
      return result;
    });
    const payLightningInvoice = vi.fn(async () => {
      events.push("pay");
      return { id: "payment" };
    });
    const signer = { withSpendContext } as unknown as BleHardwareSigner;
    const wallet = { payLightningInvoice } as unknown as SparkWallet;

    await payInvoice(wallet, signer, {
      invoice: INVOICE_250K_SATS,
      invoiceAmountSats: 250_000n,
      amountSats: 250_000n,
      feeEstimateSats: 3n,
    });

    expect(events).toEqual(["enter", "pay", "exit"]);
    expect(withSpendContext.mock.calls[0][0]).toEqual({
      amountSats: 250_000n,
      destination: shortInvoice(INVOICE_250K_SATS),
    });
    expect(payLightningInvoice).toHaveBeenCalledWith({ invoice: INVOICE_250K_SATS, maxFeeSats: 13, preferSpark: false });
  });

  it("never uses the confirmation-free wrapper", async () => {
    const withoutSpendConfirmation = vi.fn();
    const signer = {
      withSpendContext: (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
      withoutSpendConfirmation,
    } as unknown as BleHardwareSigner;
    const wallet = { payLightningInvoice: vi.fn(async () => ({})) } as unknown as SparkWallet;

    await payInvoice(wallet, signer, {
      invoice: "lnbcrt1x",
      invoiceAmountSats: null,
      amountSats: 10n,
      feeEstimateSats: null,
    });

    expect(withoutSpendConfirmation).not.toHaveBeenCalled();
  });

  it("propagates a payment failure", async () => {
    const signer = { withSpendContext: (_ctx: unknown, fn: () => Promise<unknown>) => fn() } as unknown as BleHardwareSigner;
    const wallet = { payLightningInvoice: vi.fn().mockRejectedValue(new Error("no route")) } as unknown as SparkWallet;

    await expect(
      payInvoice(wallet, signer, { invoice: "lnbcrt1x", invoiceAmountSats: null, amountSats: 10n, feeEstimateSats: null }),
    ).rejects.toThrow("no route");
  });
});

describe("payInvoice signature announcement", () => {
  it("announces 3 signatures for a leaf with a direct tx and 2 without, and restores the SDK method", async () => {
    const original = vi.fn(async (_leaves: unknown) => "prepared");
    const transferService = { prepareTransferForLightning: original };
    const wallet = {
      transferService,
      payLightningInvoice: vi.fn(async () => {
        await transferService.prepareTransferForLightning([
          { leaf: { directTx: new Uint8Array(5) } },
          { leaf: { directTx: new Uint8Array(0) } },
        ]);
        return "paid";
      }),
    };
    const expectSignatures = vi.fn();
    const signer = {
      expectSignatures,
      withSpendContext: (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
    };

    await payInvoice(wallet as unknown as SparkWallet, signer as unknown as BleHardwareSigner, {
      invoice: INVOICE_250K_SATS,
      invoiceAmountSats: 250_000n,
      amountSats: 250_000n,
      feeEstimateSats: null,
    });

    expect(expectSignatures).toHaveBeenCalledWith(5);
    expect(original).toHaveBeenCalledTimes(1);
    expect(transferService.prepareTransferForLightning).toBe(original);
  });
});
