import { parseAmountSats } from "./receive-invoice";

const SATS_PER_BTC = 100_000_000;

/** "bitcoin" is sats or BTC, whichever the balance unit setting picks. */
export type AmountUnit = "bitcoin" | "fiat";

/** 0 means "any amount"; null means the text isn't a valid amount (or a fiat amount has no price to convert with). */
export function amountTextToSats(text: string, unit: AmountUnit, btc: boolean, btcPrice: number | null): number | null {
  // Some locales' decimal pads type a comma.
  const normalized = text.trim().replace(",", ".");
  if (unit === "bitcoin") return parseAmountSats(normalized, btc);
  if (normalized === "") return 0;
  if (btcPrice === null || btcPrice <= 0 || normalized === "." || !/^\d*\.?\d{0,2}$/.test(normalized)) return null;
  const fiat = Number(normalized);
  const sats = Math.round((fiat / btcPrice) * SATS_PER_BTC);
  // A non-zero fiat amount too small to be a single sat would silently become "any amount".
  return fiat > 0 && sats === 0 ? null : sats;
}

/** Inverse of `amountTextToSats`, for prefilling the field after a unit swap. */
export function satsToAmountText(sats: number, unit: AmountUnit, btc: boolean, btcPrice: number | null): string {
  if (sats === 0) return "";
  if (unit === "fiat") return btcPrice === null ? "" : ((sats / SATS_PER_BTC) * btcPrice).toFixed(2);
  if (!btc) return String(sats);
  const whole = Math.floor(sats / SATS_PER_BTC);
  const frac = String(sats % SATS_PER_BTC).padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}
