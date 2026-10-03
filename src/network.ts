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
