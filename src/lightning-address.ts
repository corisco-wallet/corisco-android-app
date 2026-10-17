import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "./hex";
import type { LightningAddressConfig } from "./network";

const REQUEST_TIMEOUT_MS = 10_000;
const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;

type IdentitySigner = { signMessageWithIdentityKey(message: Uint8Array, compact?: boolean): Promise<Uint8Array> };

export type UsernameStore = {
  get(identityPubkey: string): Promise<string | undefined>;
  set(identityPubkey: string, username: string): Promise<void>;
};

/** Must match the server's `registrationDigest` byte for byte; the signature is over this 32-byte hash. */
export function registrationDigest(nonce: string, domain: string): Uint8Array {
  return sha256(new TextEncoder().encode(`corisco-lnaddr:v1:${nonce}:${domain}`));
}

export function formatAddress(username: string, domain: string): string {
  return `${username}@${domain}`;
}

async function requestJson(fetchFn: typeof fetch, url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { ...init, signal: controller.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = (body as { error?: unknown } | null)?.error;
      throw new Error(typeof reason === "string" ? reason : `server returned ${res.status}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** Asks the server for the wallet's username, creating it on first use. The device signs silently. */
export async function registerAddress({
  config,
  identityPubkey,
  signer,
  fetchFn = fetch,
}: {
  config: LightningAddressConfig;
  identityPubkey: string;
  signer: IdentitySigner;
  fetchFn?: typeof fetch;
}): Promise<string> {
  const challenge = (await requestJson(fetchFn, `${config.apiUrl}/challenge`)) as { nonce?: unknown };
  if (typeof challenge?.nonce !== "string" || challenge.nonce === "") throw new Error("invalid challenge response");

  const signature = bytesToHex(await signer.signMessageWithIdentityKey(registrationDigest(challenge.nonce, config.domain)));
  const created = (await requestJson(fetchFn, `${config.apiUrl}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identityPubkey, nonce: challenge.nonce, signature }),
  })) as { username?: unknown };

  if (typeof created?.username !== "string" || !USERNAME_RE.test(created.username)) {
    throw new Error("invalid registration response");
  }
  return created.username;
}

/** The stored username wins so reconnecting needs no network call and no BLE signature. */
export async function ensureUsername({
  config,
  identityPubkey,
  signer,
  store,
  fetchFn,
}: {
  config: LightningAddressConfig;
  identityPubkey: string;
  signer: IdentitySigner;
  store: UsernameStore;
  fetchFn?: typeof fetch;
}): Promise<string> {
  const stored = await store.get(identityPubkey);
  if (stored) return stored;
  const username = await registerAddress({ config, identityPubkey, signer, fetchFn });
  await store.set(identityPubkey, username);
  return username;
}
