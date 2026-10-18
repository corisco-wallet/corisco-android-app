// Caches the server-assigned username per wallet identity pubkey. The server stays the source of truth
// (registering again returns the same name), so losing this cache only costs one silent re-registration.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UsernameStore } from "./lightning-address";

const STORAGE_KEY = "corisco.lightningAddresses";

async function readAll(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export const lightningAddressStore: UsernameStore = {
  async get(identityPubkey) {
    const username = (await readAll())[identityPubkey];
    return typeof username === "string" ? username : undefined;
  },
  async set(identityPubkey, username) {
    const all = await readAll();
    all[identityPubkey] = username;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  },
};
