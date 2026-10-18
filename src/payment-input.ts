import { lightningAddressPayUrl, lnurlDecode } from "./lnurl";

export type PaymentInput =
  | { kind: "bolt11"; invoice: string }
  | { kind: "lightning-address"; address: string; payUrl: string }
  | { kind: "lnurl"; payUrl: string };

const BOLT11_RE = /^ln(bcrt|bc|tbs|tb)[0-9a-z]+$/i;
const LNURL_RE = /^lnurl1[0-9a-z]+$/i;
const ADDRESS_RE = /^([a-z0-9._+-]+)@((?:[a-z0-9-]+\.)+[a-z]{2,}|localhost)(:\d{1,5})?$/i;

/** Only https is fetched, except plain http to a local dev server. */
export function isAllowedUrl(url: URL): boolean {
  return url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost");
}

/**
 * Classifies pasted or scanned text. A bolt11 match is only a prefix check: whether it decodes is
 * left to the caller, as before.
 */
export function parsePaymentInput(text: string): PaymentInput | null {
  const cleaned = text.trim().replace(/^lightning:/i, "");

  if (BOLT11_RE.test(cleaned)) return { kind: "bolt11", invoice: cleaned };

  if (LNURL_RE.test(cleaned)) {
    try {
      const payUrl = lnurlDecode(cleaned);
      return isAllowedUrl(new URL(payUrl)) ? { kind: "lnurl", payUrl } : null;
    } catch {
      return null;
    }
  }

  const match = ADDRESS_RE.exec(cleaned);
  if (match) {
    const username = match[1].toLowerCase();
    const domain = `${match[2].toLowerCase()}${match[3] ?? ""}`;
    return { kind: "lightning-address", address: `${username}@${domain}`, payUrl: lightningAddressPayUrl(username, domain) };
  }

  return null;
}
