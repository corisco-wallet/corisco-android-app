import { describe, expect, it, vi } from "vitest";
import { fetchPayRequest, requestInvoice, satsRange, validateInvoice, type PayRequest } from "../src/lnurl-pay";

// A real regtest invoice minted by the corisco-lnaddress server for 2000 sats against this metadata.
const METADATA = '[["text/plain","Payment to keen-viper-124@corisco.org"],["text/identifier","keen-viper-124@corisco.org"]]';
const INVOICE_2000_SATS =
  "lnbcrt20u1p4df49mpp5998pdgvc00lkwwsnxnlrsp5yn43zvwkeyq3kvg48lh7symga03zqsp5vvswmyvnacj2s3tyjtnwp3ncde2ap84lzpxfl2dyptrprys656pqxqrrssnp4qtlyk6hxw5h4hrdfdkd4nh2rv0mwyyqvdtakr3dv6m4vvsmfshvg6rzjqgp0s738klwqef7yr8yu54vv3wfuk4psv46x5laf6l6v5x4lwwahvqqqqrusum7gtyqqqqqqqqqqqqqq9qcqzpuhp5ww2ycqsgusm65r789dhzjqx0y6xq2j5jj44x3j4tmh83xvrvklnq9qyyssqq0at2x46fng49dhg66krsn0rpxar7fmmnzd2nxhkdfp8du297vuh8y6ht5efh5whufh3yd0hvg83nqjmkz67nhal6d9xlrzqz40f9ngpwfxgu2";

const PAY_URL = "https://corisco.org/.well-known/lnurlp/keen-viper-124";
const CALLBACK = "https://corisco.org/lnurl/callback/keen-viper-124";

const payRequestBody = (overrides: Record<string, unknown> = {}) => ({
  tag: "payRequest",
  callback: CALLBACK,
  minSendable: 1000,
  maxSendable: 1_000_000_000,
  metadata: METADATA,
  ...overrides,
});

const REQUEST: PayRequest = {
  callback: CALLBACK,
  minSendableMsats: 1000n,
  maxSendableMsats: 1_000_000_000n,
  metadata: METADATA,
  description: "Payment to keen-viper-124@corisco.org",
  host: "corisco.org",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchReturning = (...responses: Response[]) =>
  vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next;
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe("fetchPayRequest", () => {
  it("parses a valid pay request", async () => {
    const fetchFn = fetchReturning(json(payRequestBody()));
    expect(await fetchPayRequest(PAY_URL, fetchFn)).toEqual(REQUEST);
    expect(fetchFn).toHaveBeenCalledWith(PAY_URL, expect.anything());
  });

  it("surfaces an LNURL error reason", async () => {
    await expect(fetchPayRequest(PAY_URL, fetchReturning(json({ status: "ERROR", reason: "unknown user" })))).rejects.toThrow("unknown user");
  });

  it("rejects plain http", async () => {
    await expect(fetchPayRequest("http://corisco.org/pay", fetchReturning())).rejects.toThrow("https");
  });

  it.each([
    ["wrong tag", { tag: "withdrawRequest" }],
    ["non-https callback", { callback: "http://evil.example/cb" }],
    ["min below 1", { minSendable: 0 }],
    ["min above max", { minSendable: 5000, maxSendable: 1000 }],
    ["fractional limits", { minSendable: 1.5 }],
    ["missing metadata", { metadata: undefined }],
    ["metadata that is not json", { metadata: "nope" }],
    ["metadata without text/plain", { metadata: '[["text/identifier","a@b.org"]]' }],
    ["two text/plain entries", { metadata: '[["text/plain","a"],["text/plain","b"]]' }],
  ])("rejects %s", async (_name, overrides) => {
    await expect(fetchPayRequest(PAY_URL, fetchReturning(json(payRequestBody(overrides))))).rejects.toThrow();
  });
});

describe("satsRange", () => {
  it("rounds the minimum up and the maximum down to whole sats", () => {
    expect(satsRange({ ...REQUEST, minSendableMsats: 1500n, maxSendableMsats: 9999n })).toEqual({ minSats: 2n, maxSats: 9n });
  });

  it("is null when no whole-sat amount fits", () => {
    expect(satsRange({ ...REQUEST, minSendableMsats: 1200n, maxSendableMsats: 1800n })).toBeNull();
  });
});

describe("validateInvoice", () => {
  it("accepts an invoice for this metadata and amount", () => {
    expect(() => validateInvoice(INVOICE_2000_SATS, METADATA, 2_000_000n)).not.toThrow();
  });

  it("rejects an invoice bound to different metadata", () => {
    expect(() => validateInvoice(INVOICE_2000_SATS, METADATA.replace("keen", "evil"), 2_000_000n)).toThrow("does not match the payment request");
  });

  it("rejects a different amount", () => {
    expect(() => validateInvoice(INVOICE_2000_SATS, METADATA, 3_000_000n)).toThrow("amount");
  });

  it("rejects text that is not an invoice", () => {
    expect(() => validateInvoice("lnbc1garbage", METADATA, 1000n)).toThrow();
  });
});

describe("requestInvoice", () => {
  const ok = (extra: Record<string, unknown> = {}) => json({ pr: INVOICE_2000_SATS, routes: [], ...extra });

  it("calls the callback with the amount in msats and returns the validated invoice", async () => {
    const fetchFn = fetchReturning(ok({ successAction: null }));
    const result = await requestInvoice({ request: REQUEST, amountSats: 2000n, fetchFn });
    expect(result).toEqual({ pr: INVOICE_2000_SATS, successAction: null });
    expect(fetchFn).toHaveBeenCalledWith(`${CALLBACK}?amount=2000000`, expect.anything());
  });

  it("appends to a callback that already has a query", async () => {
    const fetchFn = fetchReturning(ok());
    await requestInvoice({ request: { ...REQUEST, callback: `${CALLBACK}?k=v` }, amountSats: 2000n, fetchFn });
    expect(fetchFn).toHaveBeenCalledWith(`${CALLBACK}?k=v&amount=2000000`, expect.anything());
  });

  it("refuses amounts outside the limits without calling the service", async () => {
    const fetchFn = fetchReturning();
    await expect(requestInvoice({ request: REQUEST, amountSats: 0n, fetchFn })).rejects.toThrow("outside");
    await expect(requestInvoice({ request: REQUEST, amountSats: 1_000_001n, fetchFn })).rejects.toThrow("outside");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses an invoice for the wrong amount", async () => {
    await expect(requestInvoice({ request: REQUEST, amountSats: 5000n, fetchFn: fetchReturning(ok()) })).rejects.toThrow("amount");
  });

  it("surfaces a service error", async () => {
    const fetchFn = fetchReturning(json({ status: "ERROR", reason: "amount too low" }));
    await expect(requestInvoice({ request: REQUEST, amountSats: 2000n, fetchFn })).rejects.toThrow("amount too low");
  });

  it("requires a pr", async () => {
    await expect(requestInvoice({ request: REQUEST, amountSats: 2000n, fetchFn: fetchReturning(json({ routes: [] })) })).rejects.toThrow("invoice");
  });

  describe("successAction", () => {
    const run = async (successAction: unknown) =>
      (await requestInvoice({ request: REQUEST, amountSats: 2000n, fetchFn: fetchReturning(ok({ successAction })) })).successAction;

    it("keeps a message and truncates it to 144 characters", async () => {
      expect(await run({ tag: "message", message: "thanks" })).toEqual({ tag: "message", message: "thanks" });
      expect(await run({ tag: "message", message: "x".repeat(300) })).toEqual({ tag: "message", message: "x".repeat(144) });
    });

    it("keeps a url on the callback's own host", async () => {
      const action = { tag: "url", description: "order", url: "https://corisco.org/order/1" };
      expect(await run(action)).toEqual(action);
    });

    it("ignores a url on another host, plain http, aes and unknown tags, without blocking the payment", async () => {
      expect(await run({ tag: "url", description: "x", url: "https://evil.example/o" })).toBeNull();
      expect(await run({ tag: "url", description: "x", url: "http://corisco.org/o" })).toBeNull();
      expect(await run({ tag: "aes", description: "x", ciphertext: "a", iv: "b" })).toBeNull();
      expect(await run({ tag: "mystery" })).toBeNull();
      expect(await run("nonsense")).toBeNull();
    });
  });
});
