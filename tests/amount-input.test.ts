import { describe, expect, it } from "vitest";
import { amountTextToSats, satsToAmountText } from "../src/amount-input";

const PRICE = 100_000;

describe("amountTextToSats", () => {
  it("reads sats and btc in the bitcoin unit", () => {
    expect(amountTextToSats("2100", "bitcoin", false, null)).toBe(2100);
    expect(amountTextToSats("0.0015", "bitcoin", true, null)).toBe(150_000);
    expect(amountTextToSats("0,0015", "bitcoin", true, null)).toBe(150_000);
  });

  it("treats blank as any amount in either unit", () => {
    expect(amountTextToSats("", "bitcoin", false, PRICE)).toBe(0);
    expect(amountTextToSats(" ", "fiat", false, PRICE)).toBe(0);
  });

  it("converts fiat to rounded sats", () => {
    expect(amountTextToSats("1", "fiat", false, PRICE)).toBe(1000);
    expect(amountTextToSats("12.34", "fiat", true, PRICE)).toBe(12_340);
    expect(amountTextToSats("0,5", "fiat", false, PRICE)).toBe(500);
  });

  it("rejects fiat without a price, with too many decimals, or below one sat", () => {
    expect(amountTextToSats("1", "fiat", false, null)).toBeNull();
    expect(amountTextToSats("1.234", "fiat", false, PRICE)).toBeNull();
    expect(amountTextToSats(".", "fiat", false, PRICE)).toBeNull();
    expect(amountTextToSats("0.01", "fiat", false, 10_000_000_000)).toBeNull();
  });
});

describe("satsToAmountText", () => {
  it("formats each unit", () => {
    expect(satsToAmountText(150_000, "bitcoin", false, PRICE)).toBe("150000");
    expect(satsToAmountText(150_000, "bitcoin", true, PRICE)).toBe("0.0015");
    expect(satsToAmountText(200_000_000, "bitcoin", true, PRICE)).toBe("2");
    expect(satsToAmountText(12_340, "fiat", false, PRICE)).toBe("12.34");
  });

  it("leaves any amount blank", () => {
    expect(satsToAmountText(0, "fiat", false, PRICE)).toBe("");
    expect(satsToAmountText(0, "bitcoin", true, PRICE)).toBe("");
  });

  it("round-trips through the bitcoin unit exactly", () => {
    for (const btc of [false, true]) {
      expect(amountTextToSats(satsToAmountText(123_456_789, "bitcoin", btc, PRICE), "bitcoin", btc, PRICE)).toBe(123_456_789);
    }
  });
});
