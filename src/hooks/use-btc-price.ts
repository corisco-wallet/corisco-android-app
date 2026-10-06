import { useEffect, useState } from "react";
import { fetchBtcPrice } from "../price";
import type { Settings } from "../settings-store";

// Display-only: a failed fetch just hides the fiat conversion line.
export function useBtcPrice(enabled: boolean, currency: Settings["currency"]) {
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const refresh = async () => {
      const price = await fetchBtcPrice(currency);
      if (!cancelled) setBtcPrice(price);
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, currency]);
  return btcPrice;
}
