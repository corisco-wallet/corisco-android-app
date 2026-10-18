import { bech32 } from "@scure/base";

const PREFIX = "lnurl";

/** LUD-01: the URL's UTF-8 bytes in bech32. Lowercase; uppercase it for QR codes (the spec's SHOULD). */
export function lnurlEncode(url: string): string {
  return bech32.encode(PREFIX, bech32.toWords(new TextEncoder().encode(url)), false);
}

/** Returns the URL inside an `lnurl1...` string (either case, not mixed). Throws on anything else. */
export function lnurlDecode(lnurl: string): string {
  const { prefix, words } = bech32.decode(lnurl.trim() as `${string}1${string}`, false);
  if (prefix !== PREFIX) throw new Error("not an lnurl");
  return new TextDecoder().decode(bech32.fromWords(words));
}

/** LUD-16: where a wallet looks up `username@domain`. Plain http is only for a local dev server. */
export function lightningAddressPayUrl(username: string, domain: string): string {
  const scheme = domain.startsWith("localhost") ? "http" : "https";
  return `${scheme}://${domain}/.well-known/lnurlp/${username}`;
}
