import { beforeEach, describe, expect, it, vi } from "vitest";
import { bytesToHex } from "../src/hex";
import { ensureUsername, formatAddress, registerAddress, registrationDigest, type UsernameStore } from "../src/lightning-address";
import { resolveLightningAddressConfig } from "../src/network";

const CONFIG = { domain: "corisco.org", apiUrl: "https://api.corisco.org" };
const PUBKEY = "02" + "ab".repeat(32);

// Same vector as the corisco-lnaddress server's registrationDigest; the two must never drift.
const DIGEST_VECTOR = {
  nonce: "00112233445566778899aabbccddeeff",
  domain: "corisco.org",
  digest: "3205236eefcb7be3bea15a8ce8d02651bbd31b247acf356705c26636f42efdb7",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function setup(responses: Response[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next;
  }) as unknown as typeof fetch;
  const signed: Uint8Array[] = [];
  const signer = {
    signMessageWithIdentityKey: vi.fn(async (message: Uint8Array) => {
      signed.push(message);
      return new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    }),
  };
  return { calls, fetchFn, signer, signed };
}

describe("registrationDigest", () => {
  it("matches the server's golden vector", () => {
    expect(bytesToHex(registrationDigest(DIGEST_VECTOR.nonce, DIGEST_VECTOR.domain))).toBe(DIGEST_VECTOR.digest);
  });

  it("binds the domain", () => {
    expect(bytesToHex(registrationDigest("n", "a.org"))).not.toBe(bytesToHex(registrationDigest("n", "b.org")));
  });
});

describe("registerAddress", () => {
  it("fetches a challenge, signs its digest and returns the username", async () => {
    const { calls, fetchFn, signer, signed } = setup([json({ nonce: "abc" }), json({ username: "keen-viper-124", address: "x@y" })]);
    const username = await registerAddress({ config: CONFIG, identityPubkey: PUBKEY, signer, fetchFn });
    expect(username).toBe("keen-viper-124");
    expect(calls[0].url).toBe("https://api.corisco.org/challenge");
    expect(calls[1].url).toBe("https://api.corisco.org/users");
    expect(bytesToHex(signed[0])).toBe(bytesToHex(registrationDigest("abc", "corisco.org")));
    expect(JSON.parse(calls[1].init?.body as string)).toEqual({ identityPubkey: PUBKEY, nonce: "abc", signature: "deadbeef" });
  });

  it("surfaces the server's error message", async () => {
    const { fetchFn, signer } = setup([json({ nonce: "abc" }), json({ error: "invalid signature" }, 401)]);
    await expect(registerAddress({ config: CONFIG, identityPubkey: PUBKEY, signer, fetchFn })).rejects.toThrow("invalid signature");
  });

  it("rejects a malformed challenge", async () => {
    const { fetchFn, signer } = setup([json({ nope: 1 })]);
    await expect(registerAddress({ config: CONFIG, identityPubkey: PUBKEY, signer, fetchFn })).rejects.toThrow("invalid challenge");
  });

  it.each([["a/b"], ["UPPER"], ["ab"], [""], [42]])("rejects the unsafe username %j", async (username) => {
    const { fetchFn, signer } = setup([json({ nonce: "abc" }), json({ username })]);
    await expect(registerAddress({ config: CONFIG, identityPubkey: PUBKEY, signer, fetchFn })).rejects.toThrow("invalid registration");
  });
});

describe("ensureUsername", () => {
  let data: Record<string, string>;
  let store: UsernameStore;
  beforeEach(() => {
    data = {};
    store = {
      get: async (pubkey) => data[pubkey],
      set: async (pubkey, username) => {
        data[pubkey] = username;
      },
    };
  });

  it("registers once, stores the result and reuses it without any network or signing", async () => {
    const first = setup([json({ nonce: "abc" }), json({ username: "keen-viper-124" })]);
    expect(await ensureUsername({ config: CONFIG, identityPubkey: PUBKEY, signer: first.signer, store, fetchFn: first.fetchFn })).toBe("keen-viper-124");
    expect(data[PUBKEY]).toBe("keen-viper-124");

    const second = setup([]);
    expect(await ensureUsername({ config: CONFIG, identityPubkey: PUBKEY, signer: second.signer, store, fetchFn: second.fetchFn })).toBe("keen-viper-124");
    expect(second.calls).toHaveLength(0);
    expect(second.signer.signMessageWithIdentityKey).not.toHaveBeenCalled();
  });

  it("stores nothing when registration fails", async () => {
    const { fetchFn, signer } = setup([json({ error: "boom" }, 500)]);
    await expect(ensureUsername({ config: CONFIG, identityPubkey: PUBKEY, signer, store, fetchFn })).rejects.toThrow("boom");
    expect(data).toEqual({});
  });
});

describe("formatAddress", () => {
  it("joins username and domain", () => {
    expect(formatAddress("keen-viper-124", "corisco.org")).toBe("keen-viper-124@corisco.org");
  });
});

describe("resolveLightningAddressConfig", () => {
  it("is off when both are unset or empty", () => {
    expect(resolveLightningAddressConfig(undefined, undefined, "REGTEST")).toBeNull();
    expect(resolveLightningAddressConfig("", "", "MAINNET")).toBeNull();
  });

  it("normalizes case and trailing slashes", () => {
    expect(resolveLightningAddressConfig("Corisco.org", "https://api.corisco.org/", "MAINNET")).toEqual(CONFIG);
  });

  it("throws when only one is set", () => {
    expect(() => resolveLightningAddressConfig("corisco.org", undefined, "REGTEST")).toThrow("together");
    expect(() => resolveLightningAddressConfig(undefined, "https://api.corisco.org", "REGTEST")).toThrow("together");
  });

  it.each([["https://corisco.org"], ["corisco.org/"], ["cor isco.org"], ["-bad.org"]])("rejects the domain %j", (domain) => {
    expect(() => resolveLightningAddressConfig(domain, "https://api.corisco.org", "REGTEST")).toThrow("bare host");
  });

  it("allows http only off mainnet", () => {
    expect(resolveLightningAddressConfig("localhost:3000", "http://localhost:3000", "REGTEST")).toEqual({
      domain: "localhost:3000",
      apiUrl: "http://localhost:3000",
    });
    expect(() => resolveLightningAddressConfig("corisco.org", "http://api.corisco.org", "MAINNET")).toThrow("https://");
  });
});
