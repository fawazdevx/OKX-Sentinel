// OKX x402 settlement client.
//
// Implements the resource-server side of the x402 payment flow using the
// official OKX Onchain OS Payment SDK (@okxweb3/x402-core): decode the caller's
// `X-PAYMENT` header, ask the OKX facilitator to VERIFY the payment payload, and
// then SETTLE it on-chain. Only a facilitator-confirmed settlement counts as
// revenue — a client-presented header alone never does.
//
// The OKX facilitator authenticates with OKX API credentials (key/secret/
// passphrase, HMAC-SHA256 signed) and defaults to https://web3.okx.com,
// calling /api/v6/pay/x402/{verify,settle}. There is no separate "facilitator
// URL" to run. Everything is gated behind
// OKX_SENTINEL_PAYMENT_VERIFICATION=x402-facilitator so the default deploy is
// unaffected until OKX credentials are configured.

import { OKXFacilitatorClient, x402Version } from "@okxweb3/x402-core";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader } from "@okxweb3/x402-core/http";
import type { PaymentPayload, PaymentRequirements } from "@okxweb3/x402-core/types";

export interface X402Requirements {
  scheme: string;
  network: string;
  resource: string;
  description: string;
  payTo: string;
  asset: string;
  maxAmountRequired: string;
  maxTimeoutSeconds: number;
}

export interface X402SettlementResult {
  verified: boolean;
  settled: boolean;
  reason?: string;
  transaction?: string;
  network?: string;
  payer?: string;
}

interface OKXCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  baseUrl?: string;
  syncSettle: boolean;
  timeoutMs: number;
}

function readCredentials(): OKXCredentials | null {
  const apiKey = process.env.OKX_SENTINEL_OKX_API_KEY;
  const secretKey = process.env.OKX_SENTINEL_OKX_SECRET_KEY;
  const passphrase = process.env.OKX_SENTINEL_OKX_PASSPHRASE;
  if (!apiKey || !secretKey || !passphrase) return null;

  // syncSettle=true (default) tells the facilitator to wait for on-chain
  // confirmation before responding, so a success means a settled payment.
  const syncSettle = process.env.OKX_SENTINEL_X402_SYNC_SETTLE?.toLowerCase() !== "false";
  return {
    apiKey,
    secretKey,
    passphrase,
    baseUrl: process.env.OKX_SENTINEL_X402_BASE_URL || undefined,
    syncSettle,
    timeoutMs: Number(process.env.OKX_SENTINEL_X402_TIMEOUT_MS ?? 8000)
  };
}

// Decode the base64 JSON payload carried in the X-PAYMENT header into an x402
// PaymentPayload. Prefers the OKX SDK decoder; falls back to a tolerant
// base64/JSON decode (also accepting an `x402 <base64>` scheme prefix) so
// non-canonical clients still parse. Returns null when nothing usable is found.
export function decodePaymentPayload(headerValue: string | undefined): PaymentPayload | null {
  if (!headerValue) return null;
  const raw = headerValue.trim();
  // Some clients send `x402 <base64>`; strip a leading scheme token if present.
  const token = raw.toLowerCase().startsWith("x402 ") ? raw.slice(5).trim() : raw;

  try {
    return decodePaymentSignatureHeader(token);
  } catch {
    // fall back to tolerant decode below
  }

  for (const candidate of [tryBase64Decode(token), token]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as PaymentPayload;
    } catch {
      // fall through to next candidate
    }
  }
  return null;
}

function tryBase64Decode(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return null;
  }
}

// Map our internal requirements onto the SDK's PaymentRequirements shape.
function toSdkRequirements(requirements: X402Requirements): PaymentRequirements {
  return {
    scheme: requirements.scheme,
    network: requirements.network as PaymentRequirements["network"],
    asset: requirements.asset,
    amount: requirements.maxAmountRequired,
    payTo: requirements.payTo,
    maxTimeoutSeconds: requirements.maxTimeoutSeconds,
    extra: { resource: requirements.resource, description: requirements.description }
  };
}

// Build the base64 `PAYMENT-REQUIRED` header value the OKX x402 client SDK
// reads to construct a payment. The SDK's getPaymentRequiredResponse() throws
// when this header is absent, so a 402 must advertise it or a paying caller
// can never build a signed payment.
export function buildPaymentRequiredHeader(requirements: X402Requirements): string {
  return encodePaymentRequiredHeader({
    x402Version,
    resource: {
      url: requirements.resource,
      description: requirements.description,
      mimeType: "application/json"
    },
    accepts: [toSdkRequirements(requirements)]
  });
}

// Guard a facilitator call against a hung serverless request.
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Verify then settle a payment against the OKX facilitator. Returns a
// settled:true result only when the facilitator confirms BOTH verification and
// settlement.
export async function verifyAndSettle(
  paymentHeader: string | undefined,
  requirements: X402Requirements
): Promise<X402SettlementResult> {
  const creds = readCredentials();
  if (!creds) {
    return { verified: false, settled: false, reason: "OKX facilitator credentials not configured" };
  }

  const paymentPayload = decodePaymentPayload(paymentHeader);
  if (!paymentPayload) {
    return { verified: false, settled: false, reason: "missing or unparseable X-PAYMENT payload" };
  }

  const client = new OKXFacilitatorClient({
    apiKey: creds.apiKey,
    secretKey: creds.secretKey,
    passphrase: creds.passphrase,
    ...(creds.baseUrl ? { baseUrl: creds.baseUrl } : {}),
    syncSettle: creds.syncSettle
  });

  const sdkRequirements = toSdkRequirements(requirements);

  let verifyResult;
  try {
    verifyResult = await withTimeout(client.verify(paymentPayload, sdkRequirements), creds.timeoutMs, "OKX verify");
  } catch (error) {
    return { verified: false, settled: false, reason: error instanceof Error ? error.message : String(error) };
  }

  if (!verifyResult.isValid) {
    return {
      verified: false,
      settled: false,
      reason: verifyResult.invalidReason ?? verifyResult.invalidMessage ?? "facilitator rejected verification"
    };
  }

  let settleResult;
  try {
    settleResult = await withTimeout(client.settle(paymentPayload, sdkRequirements), creds.timeoutMs, "OKX settle");
  } catch (error) {
    return { verified: true, settled: false, reason: error instanceof Error ? error.message : String(error) };
  }

  // With syncSettle, a settled payment reports success + status "success".
  // Treat an explicit "pending"/"timeout" status as not-yet-settled so revenue
  // only counts confirmed on-chain settlement.
  const settled = Boolean(settleResult.success) && settleResult.status !== "pending" && settleResult.status !== "timeout";
  return {
    verified: true,
    settled,
    reason: settled ? undefined : settleResult.errorReason ?? settleResult.errorMessage ?? `facilitator settlement not confirmed (status: ${settleResult.status ?? "unknown"})`,
    transaction: settleResult.transaction,
    network: settleResult.network ?? requirements.network,
    payer: settleResult.payer
  };
}

export function isFacilitatorConfigured(): boolean {
  return readCredentials() !== null;
}
