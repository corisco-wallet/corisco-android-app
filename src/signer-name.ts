// Free of native-module imports so tests can load it under plain Node.
export const SIGNER_NAME_PREFIX = "Corisco-";

/** The firmware advertises `Corisco-<last 3 BT MAC bytes, hex>` (ble.rs's `device_name`). */
export function isSignerName(name: string | null | undefined): name is string {
  return typeof name === "string" && /^Corisco-[0-9A-F]{6}$/.test(name);
}
