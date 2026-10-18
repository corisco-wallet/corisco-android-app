// Which Spark network the wallet talks to. Set EXPO_PUBLIC_SPARK_NETWORK
// (inlined into the JS bundle at build time) to MAINNET for real funds;
// unset means REGTEST, so a plain local `npm run android` can never touch
// mainnet. An unrecognised value throws instead of falling back, so a typo
// in a release build fails loudly rather than silently running on regtest.
export type SparkNetwork = "MAINNET" | "REGTEST";

function resolveNetwork(value: string | undefined): SparkNetwork {
  if (value === undefined || value === "") return "REGTEST";
  const upper = value.toUpperCase();
  if (upper === "MAINNET" || upper === "REGTEST") return upper;
  throw new Error(`EXPO_PUBLIC_SPARK_NETWORK must be MAINNET or REGTEST, got "${value}"`);
}

export const SPARK_NETWORK: SparkNetwork = resolveNetwork(process.env.EXPO_PUBLIC_SPARK_NETWORK);

// Lightning address server. Both unset means the feature is off; one without the other, or a malformed
// value, throws so a typo in a release build fails loudly instead of silently disabling addresses.
export type LightningAddressConfig = { domain: string; apiUrl: string };

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*(:\d{1,5})?$/;

export function resolveLightningAddressConfig(
  domainValue: string | undefined,
  apiUrlValue: string | undefined,
  network: SparkNetwork,
): LightningAddressConfig | null {
  const domain = domainValue?.trim().toLowerCase() ?? "";
  const apiUrl = apiUrlValue?.trim().replace(/\/+$/, "") ?? "";
  if (!domain && !apiUrl) return null;
  if (!domain || !apiUrl) {
    throw new Error("EXPO_PUBLIC_LNADDRESS_DOMAIN and EXPO_PUBLIC_LNADDRESS_API_URL must be set together");
  }
  if (!DOMAIN_RE.test(domain)) {
    throw new Error(`EXPO_PUBLIC_LNADDRESS_DOMAIN must be a bare host like "example.com", got "${domainValue}"`);
  }
  const allowedScheme = network === "MAINNET" ? /^https:\/\// : /^https?:\/\//;
  if (!allowedScheme.test(apiUrl)) {
    throw new Error(`EXPO_PUBLIC_LNADDRESS_API_URL must start with ${network === "MAINNET" ? "https://" : "http(s)://"}, got "${apiUrlValue}"`);
  }
  return { domain, apiUrl };
}

export const LIGHTNING_ADDRESS: LightningAddressConfig | null = resolveLightningAddressConfig(
  process.env.EXPO_PUBLIC_LNADDRESS_DOMAIN,
  process.env.EXPO_PUBLIC_LNADDRESS_API_URL,
  SPARK_NETWORK,
);
