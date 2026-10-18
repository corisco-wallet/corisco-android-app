import { describe, expect, it } from "vitest";
import { lnurlEncode } from "../src/lnurl";
import { parsePaymentInput } from "../src/payment-input";

const PAY_URL = "https://corisco.org/.well-known/lnurlp/keen-viper-124";

describe("parsePaymentInput", () => {
  it.each([
    ["lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq"],
    ["lnbcrt20u1p4df49mpp5998pdgvc00lkwwsnxnlrsp5yn43zvwkeyq3kvg48lh7symga03z"],
    ["lntb20m1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq"],
    ["LNBC2500U1PVJLUEZPP5QQQSYQCYQ5RQWZQFQQQSYQCYQ5RQWZQFQQQSYQCYQ5RQWZQFQYPQ"],
  ])("classifies a bolt11 invoice: %s", (text) => {
    expect(parsePaymentInput(text)).toEqual({ kind: "bolt11", invoice: text });
  });

  it("strips a lightning: prefix and whitespace", () => {
    expect(parsePaymentInput("  lightning:lnbc2500u1pvjluezpp5qq\n")).toEqual({ kind: "bolt11", invoice: "lnbc2500u1pvjluezpp5qq" });
    expect(parsePaymentInput("LIGHTNING:keen-viper-124@corisco.org")).toMatchObject({ kind: "lightning-address" });
  });

  it("parses a lightning address and builds its pay url", () => {
    expect(parsePaymentInput("Keen-Viper-124@Corisco.org")).toEqual({
      kind: "lightning-address",
      address: "keen-viper-124@corisco.org",
      payUrl: PAY_URL,
    });
  });

  it("accepts a local dev server address over http", () => {
    expect(parsePaymentInput("alice@localhost:3000")).toEqual({
      kind: "lightning-address",
      address: "alice@localhost:3000",
      payUrl: "http://localhost:3000/.well-known/lnurlp/alice",
    });
  });

  it("decodes an lnurl in either case", () => {
    const lnurl = lnurlEncode(PAY_URL);
    expect(parsePaymentInput(lnurl)).toEqual({ kind: "lnurl", payUrl: PAY_URL });
    expect(parsePaymentInput(lnurl.toUpperCase())).toEqual({ kind: "lnurl", payUrl: PAY_URL });
    expect(parsePaymentInput(`lightning:${lnurl.toUpperCase()}`)).toEqual({ kind: "lnurl", payUrl: PAY_URL });
  });

  it("rejects an lnurl that points at plain http or is corrupted", () => {
    expect(parsePaymentInput(lnurlEncode("http://evil.example/pay"))).toBeNull();
    expect(parsePaymentInput(lnurlEncode(PAY_URL).slice(0, -1) + "q")).toBeNull();
  });

  it.each([[""], ["hello"], ["bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"], ["a@b"], ["@corisco.org"], ["user@corisco.org/x"], ["two@at@corisco.org"]])(
    "returns null for %j",
    (text) => {
      expect(parsePaymentInput(text)).toBeNull();
    },
  );
});
