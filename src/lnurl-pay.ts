import { sha256 } from "@noble/hashes/sha256";
import { decode as decodeBolt11 } from "light-bolt11-decoder";
import { bytesToHex } from "./hex";
import { isAllowedUrl } from "./payment-input";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ACTION_TEXT = 144;

export type PayRequest = {
  callback: string;
  minSendableMsats: bigint;
  maxSendableMsats: bigint;
  metadata: string;
  description: string;
  /** Host the pay request came from; the spec requires showing it to the payer. */
  host: string;
};

export type SuccessAction = { tag: "message"; message: string } | { tag: "url"; description: string; url: string };

export type FetchedInvoice = { pr: string; successAction: SuccessAction | null };

async function getJson(fetchFn: typeof fetch, url: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (body?.status === "ERROR") throw new Error(typeof body.reason === "string" ? body.reason : "The service returned an error");
    if (!res.ok) throw new Error(`The service returned ${res.status}`);
    if (!body || typeof body !== "object") throw new Error("The service sent an invalid response");
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function plainTextDescription(metadata: string): string {
  let entries: unknown;
  try {
    entries = JSON.parse(metadata);
  } catch {
    throw new Error("The payment request has invalid metadata");
  }
  const plain = Array.isArray(entries) ? entries.filter((e) => Array.isArray(e) && e[0] === "text/plain") : [];
  if (plain.length !== 1 || typeof plain[0][1] !== "string") throw new Error("The payment request has invalid metadata");
  return plain[0][1];
}

export async function fetchPayRequest(payUrl: string, fetchFn: typeof fetch = fetch): Promise<PayRequest> {
  const url = new URL(payUrl);
  if (!isAllowedUrl(url)) throw new Error("Payment requests must use https");
  const body = await getJson(fetchFn, payUrl);

  if (body.tag !== "payRequest") throw new Error("This is not a Lightning payment request");
  const { callback, minSendable, maxSendable, metadata } = body;
  if (typeof callback !== "string" || !isAllowedUrl(new URL(callback))) throw new Error("The payment request has an invalid callback");
  if (!Number.isSafeInteger(minSendable) || !Number.isSafeInteger(maxSendable)) throw new Error("The payment request has invalid limits");
  const min = BigInt(minSendable as number);
  const max = BigInt(maxSendable as number);
  if (min < 1n || min > max) throw new Error("The payment request has invalid limits");
  if (typeof metadata !== "string") throw new Error("The payment request has invalid metadata");

  return {
    callback,
    minSendableMsats: min,
    maxSendableMsats: max,
    metadata,
    description: plainTextDescription(metadata),
    host: url.host,
  };
}

/** Whole-sat bounds the user can choose from; null when the service allows no whole-sat amount. */
export function satsRange(request: PayRequest): { minSats: bigint; maxSats: bigint } | null {
  const minSats = (request.minSendableMsats + 999n) / 1000n;
  const maxSats = request.maxSendableMsats / 1000n;
  return minSats <= maxSats ? { minSats, maxSats } : null;
}

function descriptionHashOf(invoice: string): string | undefined {
  const sections = decodeBolt11(invoice).sections as { name: string; value?: unknown }[];
  const section = sections.find((s) => s.name === "description_hash");
  return typeof section?.value === "string" ? section.value : undefined;
}

function amountMsatsOf(invoice: string): bigint | null {
  const section = decodeBolt11(invoice).sections.find((s) => s.name === "amount");
  return section ? BigInt(section.value as string) : null;
}

/** Spec steps 6 and 7: the invoice must commit to this request's metadata and to the chosen amount. */
export function validateInvoice(invoice: string, metadata: string, amountMsats: bigint): void {
  const hash = descriptionHashOf(invoice);
  if (hash !== bytesToHex(sha256(new TextEncoder().encode(metadata)))) {
    throw new Error("The invoice does not match the payment request");
  }
  const amount = amountMsatsOf(invoice);
  if (amount === null || amount !== amountMsats) throw new Error("The invoice amount does not match the amount you chose");
}

/** Anything unsupported or malformed is ignored rather than blocking a payment. */
function parseSuccessAction(value: unknown, callbackHost: string): SuccessAction | null {
  if (!value || typeof value !== "object") return null;
  const action = value as Record<string, unknown>;
  if (action.tag === "message" && typeof action.message === "string") {
    return { tag: "message", message: action.message.slice(0, MAX_ACTION_TEXT) };
  }
  if (action.tag === "url" && typeof action.description === "string" && typeof action.url === "string") {
    try {
      const url = new URL(action.url);
      if (url.protocol === "https:" && url.host === callbackHost) {
        return { tag: "url", description: action.description.slice(0, MAX_ACTION_TEXT), url: action.url };
      }
    } catch {
      return null;
    }
  }
  return null;
}

export async function requestInvoice({
  request,
  amountSats,
  fetchFn = fetch,
}: {
  request: PayRequest;
  amountSats: bigint;
  fetchFn?: typeof fetch;
}): Promise<FetchedInvoice> {
  const amountMsats = amountSats * 1000n;
  if (amountMsats < request.minSendableMsats || amountMsats > request.maxSendableMsats) {
    throw new Error("The amount is outside what this payment request accepts");
  }
  const callback = new URL(request.callback);
  callback.searchParams.set("amount", amountMsats.toString());

  const body = await getJson(fetchFn, callback.toString());
  if (typeof body.pr !== "string") throw new Error("The service did not return an invoice");
  validateInvoice(body.pr, request.metadata, amountMsats);
  return { pr: body.pr, successAction: parseSuccessAction(body.successAction, callback.host) };
}
