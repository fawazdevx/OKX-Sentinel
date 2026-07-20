import type { Request, Response } from "express";
import { buildPaymentRequiredHeader, isFacilitatorConfigured, verifyAndSettle, type X402Requirements } from "./x402";

// Per-request cache: when the x402 facilitator confirms settlement we stash the
// result on the request object so the synchronous telemetry/billing readers
// (isPaymentSettlementVerified) report the real, facilitator-verified state.
const SETTLEMENT_KEY = "__okxSentinelSettlement";

interface CachedSettlement {
  verified: boolean;
  transaction?: string;
}

export type PaymentVerificationMode = "none" | "trusted-proxy" | "x402-facilitator";

export type PaidToolName =
  | "deep_scan_wallet"
  | "deep_scan_token"
  | "premium_explain_transaction"
  | "premium_analyze_approval"
  | "premium_generate_revoke_plan"
  | "evaluate_action_policy";

export interface ToolPrice {
  tool: PaidToolName;
  endpoint: string;
  priceUsd: number;
  category: "deep-scan" | "agent-policy" | "transaction-intelligence";
  description: string;
}

export const paidToolCatalog: ToolPrice[] = [
  {
    tool: "deep_scan_wallet",
    endpoint: "/api/premium/tools/deep_scan_wallet",
    priceUsd: 0.25,
    category: "deep-scan",
    description: "Wallet risk scan with live-read priority, approval review, and revoke-plan context."
  },
  {
    tool: "deep_scan_token",
    endpoint: "/api/premium/tools/deep_scan_token",
    priceUsd: 0.25,
    category: "deep-scan",
    description: "Token risk scan with metadata, bytecode, proxy, admin, and privilege checks."
  },
  {
    tool: "premium_explain_transaction",
    endpoint: "/api/premium/tools/premium_explain_transaction",
    priceUsd: 0.1,
    category: "transaction-intelligence",
    description: "Pre-signing transaction explanation and risk report for agent workflows."
  },
  {
    tool: "premium_analyze_approval",
    endpoint: "/api/premium/tools/premium_analyze_approval",
    priceUsd: 0.1,
    category: "transaction-intelligence",
    description: "Allowance, spender reputation, and revoke-plan assessment."
  },
  {
    tool: "premium_generate_revoke_plan",
    endpoint: "/api/premium/tools/premium_generate_revoke_plan",
    priceUsd: 0.1,
    category: "transaction-intelligence",
    description: "Non-custodial revoke plan generation for risky wallet allowances."
  },
  {
    tool: "evaluate_action_policy",
    endpoint: "/api/premium/tools/evaluate_action_policy",
    priceUsd: 0.05,
    category: "agent-policy",
    description: "Deterministic allow/review/block decision for OKX.AI agent actions."
  }
];

export function buildPricing() {
  const paymentMode = getPaymentMode();
  const paymentReady = isPaymentIntegrationReady();

  return {
    currency: "USD",
    primaryTrack: "A2MCP",
    launchMode: "free",
    freeServiceEndpoint: "/api/tools/evaluate_action_policy",
    paymentStandard: "x402",
    paymentMode,
    paymentIntegrationReady: paymentReady,
    paymentReadiness:
      paymentReady
        ? "Premium endpoints require settlement verified by the configured trusted OKX Payment SDK/x402 middleware."
        : "Launch with the free A2MCP endpoint. Premium prices are a roadmap until OKX Payment SDK/x402 middleware verifies settlement.",
    settlementTarget: {
      network: getSettlementNetworkLabel(),
      recipient: process.env.OKX_SENTINEL_PAYMENT_RECIPIENT ?? "configure OKX_SENTINEL_PAYMENT_RECIPIENT",
      asset: "USDC or OKX Payment SDK-supported settlement asset"
    },
    paidTools: paidToolCatalog,
    tiers: [
      {
        name: "Free Basic Scan",
        price: 0,
        unit: "scan",
        includes: ["heuristic risk score", "RPC-backed reads when configured", "structured agent JSON", "confidence and limitations"]
      },
      {
        name: "Deep Onchain Scan",
        priceRange: "$0.10-$0.25",
        unit: "scan",
        includes: ["dedicated RPC reads", "proxy/admin inspection", "allowance verification", "revoke-plan context"]
      },
      {
        name: "Agent Policy Gate",
        priceRange: "$0.05",
        unit: "tool call",
        includes: ["allow/review/block decision", "signing handoff plan", "agent-safe limitations", "policy thresholds"]
      },
      {
        name: "Premium Audit Desk",
        priceRange: "$499-$2500",
        unit: "report",
        includes: ["custom token research", "wallet incident report", "agent policy design", "integration support"]
      }
    ]
  };
}

export async function maybeRequirePayment(request: Request, response: Response, tool: PaidToolName): Promise<boolean> {
  const price = paidToolCatalog.find((item) => item.tool === tool);
  const paymentMode = getPaymentMode();

  if (!price) {
    response.status(500).json({ error: { message: `Payment catalog missing for ${tool}`, statusCode: 500 } });
    return false;
  }

  // Not enforcing (demo/free launch) → allow through without a payment check.
  if (paymentMode !== "enforce") {
    response.setHeader("X-OKX-Sentinel-Payment-Mode", paymentMode);
    response.setHeader("X-OKX-Sentinel-Tool-Price-USD", price.priceUsd.toString());
    response.setHeader("X-OKX-Sentinel-Settlement-Verified", String(isPaymentSettlementVerified(request)));
    return true;
  }

  // Enforcing: settlement must be verified. Resolve it once (this may perform
  // an async facilitator verify+settle) and cache the outcome on the request.
  const settlement = await resolveSettlement(request, price);

  if (settlement.verified) {
    response.setHeader("X-OKX-Sentinel-Payment-Mode", paymentMode);
    response.setHeader("X-OKX-Sentinel-Tool-Price-USD", price.priceUsd.toString());
    response.setHeader("X-OKX-Sentinel-Settlement-Verified", "true");
    if (settlement.transaction) {
      response.setHeader("X-OKX-Sentinel-Settlement-Tx", settlement.transaction);
    }
    return true;
  }

  response
    .status(402)
    .setHeader("X-OKX-Sentinel-Payment-Mode", paymentMode);
  response.setHeader("X-OKX-Sentinel-Tool-Price-USD", price.priceUsd.toString());
  response.setHeader("X-OKX-Sentinel-Payment-Standard", "x402");
  // Advertise the x402 requirements in the standard PAYMENT-REQUIRED header so an
  // OKX Payment SDK client can construct and sign a payment. Without this header
  // the SDK client throws "Invalid payment required response" and can never pay.
  try {
    response.setHeader("PAYMENT-REQUIRED", buildPaymentRequiredHeader(buildX402Requirements(request, price)));
  } catch {
    // If the header cannot be built (e.g. missing recipient), still return the
    // JSON body below so the caller sees why payment is required.
  }
  response.json({
    error: {
      message: "Payment required for premium OKX Sentinel A2MCP tool call.",
      statusCode: 402
    },
    payment: {
      standard: "x402",
      tool: price.tool,
      priceUsd: price.priceUsd,
      settlementNetwork: getSettlementNetworkLabel(),
      recipient: process.env.OKX_SENTINEL_PAYMENT_RECIPIENT ?? "configure OKX_SENTINEL_PAYMENT_RECIPIENT",
      proofPresented: isPaymentProofPresented(request),
      settlementVerified: false,
      verificationRequired: "OKX Payment SDK or trusted x402 middleware",
      note: "A client-supplied payment header is not settlement proof. The payment middleware must verify payment and mark the request as verified."
    }
  });

  return false;
}

// Resolve whether payment is settled for this request, honoring the configured
// verification mode. Caches the result on the request so later synchronous
// readers (telemetry/billing) see the same, facilitator-truthful value.
async function resolveSettlement(request: Request, price: ToolPrice): Promise<CachedSettlement> {
  const cached = (request as any)[SETTLEMENT_KEY] as CachedSettlement | undefined;
  if (cached) return cached;

  const mode = getPaymentVerificationMode();
  let result: CachedSettlement = { verified: false };

  if (mode === "trusted-proxy") {
    // A trusted middleware/proxy has already verified settlement and set the
    // header; we trust it because the proxy strips any client-supplied value.
    result = { verified: request.header("x-okx-payment-verified")?.toLowerCase() === "true" };
  } else if (mode === "x402-facilitator") {
    const requirements = buildX402Requirements(request, price);
    const settlement = await verifyAndSettle(paymentHeaderValue(request), requirements);
    result = { verified: settlement.verified && settlement.settled, transaction: settlement.transaction };
  }

  (request as any)[SETTLEMENT_KEY] = result;
  return result;
}

// Default settlement stablecoin per CAIP-2 network, mirroring the OKX SDK's
// DEFAULT_STABLECOINS table (@okxweb3/x402-evm). Used when
// OKX_SENTINEL_PAYMENT_ASSET is left blank, so enforce mode works out of the
// box on X Layer without hunting down a token contract address.
const DEFAULT_STABLECOINS: Record<string, { address: string; decimals: number }> = {
  "eip155:196": { address: "0x779ded0c9e1022225f8e0630b35a9b54be713736", decimals: 6 }, // X Layer mainnet USD₮0 (EIP-3009)
  "eip155:1952": { address: "0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c", decimals: 6 } // X Layer testnet USD₮0
};

function buildX402Requirements(request: Request, price: ToolPrice): X402Requirements {
  // OKX x402 uses CAIP-2 network ids: eip155:196 = X Layer mainnet,
  // eip155:1952 = X Layer testnet.
  const network = process.env.OKX_SENTINEL_PAYMENT_NETWORK ?? "eip155:196";
  const scheme = process.env.OKX_SENTINEL_X402_SCHEME ?? "exact";
  const defaultAsset = DEFAULT_STABLECOINS[network];
  // Prefer an explicit asset override; otherwise fall back to the network's
  // default stablecoin so a blank OKX_SENTINEL_PAYMENT_ASSET doesn't block
  // enforce mode.
  const asset = process.env.OKX_SENTINEL_PAYMENT_ASSET || defaultAsset?.address || "";
  // x402 amounts are in the asset's smallest unit. Prefer an explicit decimals
  // override, then the default stablecoin's decimals, then 6 (USDC/USD₮0).
  const decimals = process.env.OKX_SENTINEL_PAYMENT_ASSET_DECIMALS
    ? Number(process.env.OKX_SENTINEL_PAYMENT_ASSET_DECIMALS)
    : defaultAsset?.decimals ?? 6;
  const maxAmountRequired = toSmallestUnit(price.priceUsd, decimals);
  return {
    scheme,
    network,
    resource: `${request.protocol}://${request.get("host") ?? ""}${request.originalUrl}`,
    description: price.description,
    payTo: process.env.OKX_SENTINEL_PAYMENT_RECIPIENT ?? "",
    asset,
    maxAmountRequired,
    maxTimeoutSeconds: Number(process.env.OKX_SENTINEL_X402_TIMEOUT_SECONDS ?? 60)
  };
}

function toSmallestUnit(priceUsd: number, decimals: number): string {
  // Avoid float drift: scale via string math on a fixed-decimal representation.
  const fixed = priceUsd.toFixed(decimals);
  const digits = fixed.replace(".", "").replace(/^0+(?=\d)/, "");
  return digits === "" ? "0" : digits;
}

function paymentHeaderValue(request: Request): string | undefined {
  return (
    // PAYMENT-SIGNATURE is the header the official OKX x402 client SDK sends
    // (matches the OKX server middleware, which reads "payment-signature").
    // The x-payment/x-okx-payment/authorization fallbacks stay for
    // hand-rolled or legacy callers.
    request.header("payment-signature") ??
    request.header("x-payment") ??
    request.header("x-okx-payment") ??
    request.header("authorization") ??
    undefined
  );
}

export function getPaymentMode(): "demo" | "enforce" {
  return process.env.OKX_SENTINEL_PAYMENT_MODE === "enforce" ? "enforce" : "demo";
}

export function isPaymentProofPresented(request: Request): boolean {
  const authorization = request.header("authorization") ?? "";
  return Boolean(
    request.header("payment-signature") ||
      request.header("x-payment") ||
      request.header("x-okx-payment") ||
      authorization.toLowerCase().startsWith("x402 ")
  );
}

export function getPaymentVerificationMode(): PaymentVerificationMode {
  const value = process.env.OKX_SENTINEL_PAYMENT_VERIFICATION;
  if (value === "trusted-proxy") return "trusted-proxy";
  if (value === "x402-facilitator") return "x402-facilitator";
  return "none";
}

// Human-readable label for the configured CAIP-2 settlement network, so 402
// responses and pricing report the real chain (mainnet vs testnet) instead of a
// hardcoded string.
export function getSettlementNetworkLabel(): string {
  const network = process.env.OKX_SENTINEL_PAYMENT_NETWORK ?? "eip155:196";
  switch (network) {
    case "eip155:196":
      return "X Layer";
    case "eip155:1952":
      return "X Layer Testnet";
    default:
      return network;
  }
}

export function isPaymentSettlementVerified(request: Request): boolean {
  // Prefer a resolved settlement cached during maybeRequirePayment (the
  // facilitator path writes it here). Fall back to the trusted-proxy header so
  // synchronous callers behave identically to before when that mode is used.
  const cached = (request as any)[SETTLEMENT_KEY] as CachedSettlement | undefined;
  if (cached) return cached.verified;

  return (
    getPaymentVerificationMode() === "trusted-proxy" &&
    request.header("x-okx-payment-verified")?.toLowerCase() === "true"
  );
}

export function isPaymentIntegrationReady(): boolean {
  if (getPaymentMode() !== "enforce" || !process.env.OKX_SENTINEL_PAYMENT_RECIPIENT) {
    return false;
  }
  const mode = getPaymentVerificationMode();
  if (mode === "trusted-proxy") return true;
  if (mode === "x402-facilitator") return isFacilitatorConfigured();
  return false;
}
