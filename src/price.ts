// BTC/fiat conversion for the Home screen's "below the balance" line --
// display-only, fetched from a public API with no key required. This is
// purely informational (the wallet itself, and the regtest network it
// talks to, don't need or use a fiat rate for anything) -- a failed fetch
// just means the conversion line doesn't show, not a broken wallet.

const API_URL = "https://api.coingecko.com/api/v3/simple/price";

/** Fetches the current price of 1 BTC in `currency` (e.g. "usd"). Returns
 * `null` on any failure (offline, rate-limited, unexpected response
 * shape) rather than throwing -- callers treat that as "no conversion
 * available right now," not an error to surface to the user. */
export async function fetchBtcPrice(currency: string): Promise<number | null> {
  try {
    const res = await fetch(`${API_URL}?ids=bitcoin&vs_currencies=${encodeURIComponent(currency)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { bitcoin?: Record<string, number> };
    const price = json.bitcoin?.[currency];
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

const SATS_PER_BTC = 100_000_000;

export function satsToBtc(sats: bigint): number {
  return Number(sats) / SATS_PER_BTC;
}

export function satsToFiat(sats: bigint, btcPrice: number): number {
  return satsToBtc(sats) * btcPrice;
}

/** `Intl.NumberFormat`'s `currency` option wants an uppercase ISO code. */
export function formatFiat(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

// The balance text only fits this many digits (plus the "."), so large
// amounts drop decimals instead of overflowing: 9.99999999, 10.0000000, ...
const MAX_BTC_DIGITS = 9;

export function formatBtc(sats: bigint): string {
  const whole = sats / BigInt(SATS_PER_BTC);
  const decimals = Math.max(0, Math.min(8, MAX_BTC_DIGITS - whole.toString().length));
  const frac = (sats % BigInt(SATS_PER_BTC)).toString().padStart(8, "0").slice(0, decimals);
  // Truncated, not rounded, so the display never overstates the balance.
  return decimals > 0 ? `${whole}.${frac}` : whole.toString();
}

export function btcToSats(text: string): bigint | null {
  const match = /^(\d*)\.?(\d{0,8})$/.exec(text.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  return BigInt(match[1] || "0") * BigInt(SATS_PER_BTC) + BigInt(match[2].padEnd(8, "0"));
}
