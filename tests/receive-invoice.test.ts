import { describe, expect, it, vi } from "vitest";
import type { SparkWallet } from "@buildonspark/spark-sdk";
import { createReceiveInvoice, parseAmountSats } from "../src/receive-invoice";

function fakeWallet() {
  const createLightningInvoice = vi.fn().mockResolvedValue({ invoice: { encodedInvoice: "lnbcrt1test" } });
  return { wallet: { createLightningInvoice } as unknown as SparkWallet, createLightningInvoice };
}

async function generate(amountText: string, memoText: string, btc: boolean) {
  const { wallet, createLightningInvoice } = fakeWallet();
  const amountSats = parseAmountSats(amountText, btc);
  expect(amountSats).not.toBeNull();
  const invoice = await createReceiveInvoice(wallet, amountSats!, memoText);
  return { invoice, params: createLightningInvoice.mock.calls[0][0] };
}

describe("parseAmountSats", () => {
  it("treats blank as any amount", () => {
    expect(parseAmountSats("", false)).toBe(0);
    expect(parseAmountSats("  ", true)).toBe(0);
  });

  it("reads whole sats in sats mode", () => {
    expect(parseAmountSats("2100", false)).toBe(2100);
  });

  it("rejects decimals and junk in sats mode", () => {
    expect(parseAmountSats("1.5", false)).toBeNull();
    expect(parseAmountSats("abc", false)).toBeNull();
  });

  it("converts BTC to sats in btc mode", () => {
    expect(parseAmountSats("0.00002100", true)).toBe(2100);
    expect(parseAmountSats("1", true)).toBe(100_000_000);
    expect(parseAmountSats(".5", true)).toBe(50_000_000);
  });

  it("rejects more than 8 decimals in btc mode", () => {
    expect(parseAmountSats("0.123456789", true)).toBeNull();
  });
});

describe("createReceiveInvoice", () => {
  it("requests the typed sats amount", async () => {
    const { invoice, params } = await generate("2100", "", false);
    expect(invoice).toBe("lnbcrt1test");
    expect(params.amountSats).toBe(2100);
  });

  it("requests the sats equivalent of a BTC amount", async () => {
    const { params } = await generate("0.00002100", "", true);
    expect(params.amountSats).toBe(2100);
  });

  it("requests an any-amount invoice when blank", async () => {
    const { params } = await generate("", "", true);
    expect(params.amountSats).toBe(0);
  });

  it("passes the trimmed note as the memo", async () => {
    const { params } = await generate("500", "  lunch  ", false);
    expect(params.memo).toBe("lunch");
  });

  it("omits the memo when the note is blank", async () => {
    const { params } = await generate("500", "   ", false);
    expect(params.memo).toBeUndefined();
  });
});
