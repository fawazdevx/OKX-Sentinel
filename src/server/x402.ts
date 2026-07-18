// Minimal x402 facilitator client.
//
// Implements the resource-server side of the x402 payment flow: decode the
// caller's `X-PAYMENT` header, ask a trusted facilitator to VERIFY the payment
// payload, and then SETTLE it on-chain. Only a facilitator-confirmed settlement
// counts as revenue — a client-presented header alone never does.
//
// This is intentionally SDK-agnostic: it speaks the public x402 facilitator
// HTTP contract (`POST /verify`, `POST /settle`). Point
// OKX_SENTINEL_X402_FACILITATOR_URL at the OKX Payment SDK facilitator (or any
// x402-compatible facilitator) to activate it. Everything is gated behind
// OKX_SENTINEL_PAYMENT_VERIFICATION=x402-facilitator so the default deploy is
// unaffected.

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

interface X402ClientConfig {
  facilitatorUrl: string;
  apiKey?: string;
  timeoutMs: number;
}

function readConfig(): X402ClientConfig | null {
  const facilitatorUrl = process.env.OKX_SENTINEL_X402_FACILITATOR_URL?.replace(/\/+$/, "");
  if (!facilitatorUrl) return null;
  return {
    facilitatorUrl,
    apiKey: process.env.OKX_SENTINEL_X402_FACILITATOR_API_KEY || undefined,
    timeoutMs: Number(process.env.OKX_SENTINEL_X402_TIMEOUT_MS ?? 8000)
  };
}

// Decode the base64url/base64 JSON payload carried in the X-PAYMENT header.
export function decodePaymentPayload(headerValue: string | undefined): unknown | null {
  if (!headerValue) return null;
  const raw = headerValue.trim();
  // Some clients send `x402 <base64>`; strip a leading scheme token if present.
  const token = raw.toLowerCase().startsWith("x402 ") ? raw.slice(5).trim() : raw;
  // Try base64 → JSON first, then raw JSON.
  for (const candidate of [tryBase64Decode(token), token]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
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

async function postJson(url: string, body: unknown, config: X402ClientConfig): Promise<{ ok: boolean; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
  } catch (error) {
    return { ok: false, data: { error: error instanceof Error ? error.message : String(error) } };
  } finally {
    clearTimeout(timer);
  }
}

// Verify then settle a payment against the facilitator. Returns a settled:true
// result only when the facilitator confirms BOTH verification and settlement.
export async function verifyAndSettle(
  paymentHeader: string | undefined,
  requirements: X402Requirements
): Promise<X402SettlementResult> {
  const config = readConfig();
  if (!config) {
    return { verified: false, settled: false, reason: "x402 facilitator URL not configured" };
  }

  const paymentPayload = decodePaymentPayload(paymentHeader);
  if (!paymentPayload) {
    return { verified: false, settled: false, reason: "missing or unparseable X-PAYMENT payload" };
  }

  const verifyResult = await postJson(
    `${config.facilitatorUrl}/verify`,
    { paymentPayload, paymentRequirements: requirements },
    config
  );

  const isValid = Boolean(verifyResult.ok && (verifyResult.data?.isValid ?? verifyResult.data?.valid));
  if (!isValid) {
    return {
      verified: false,
      settled: false,
      reason: verifyResult.data?.invalidReason ?? verifyResult.data?.error ?? "facilitator rejected verification"
    };
  }

  const settleResult = await postJson(
    `${config.facilitatorUrl}/settle`,
    { paymentPayload, paymentRequirements: requirements },
    config
  );

  const settled = Boolean(settleResult.ok && (settleResult.data?.success ?? settleResult.data?.settled));
  return {
    verified: true,
    settled,
    reason: settled ? undefined : settleResult.data?.errorReason ?? settleResult.data?.error ?? "facilitator settlement failed",
    transaction: settleResult.data?.transaction ?? settleResult.data?.txHash,
    network: settleResult.data?.network ?? requirements.network,
    payer: settleResult.data?.payer
  };
}

export function isFacilitatorConfigured(): boolean {
  return Boolean(process.env.OKX_SENTINEL_X402_FACILITATOR_URL);
}
