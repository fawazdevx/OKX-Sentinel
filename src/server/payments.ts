import type { Request, Response } from "express";
import { isFacilitatorConfigured, verifyAndSettle, type X402Requirements } from "./x402";

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
      network: "X Layer",
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
  response.json({
    error: {
      message: "Payment required for premium OKX Sentinel A2MCP tool call.",
      statusCode: 402
    },
    payment: {
      standard: "x402",
      tool: price.tool,
      priceUsd: price.priceUsd,
      settlementNetwork: "X Layer",
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

function buildX402Requirements(request: Request, price: ToolPrice): X402Requirements {
  // OKX x402 uses CAIP-2 network ids: eip155:196 = X Layer mainnet,
  // eip155:1952 = X Layer testnet.
  const network = process.env.OKX_SENTINEL_PAYMENT_NETWORK ?? "eip155:196";
  const scheme = process.env.OKX_SENTINEL_X402_SCHEME ?? "exact";
  // x402 amounts are in the asset's smallest unit; default USDC has 6 decimals.
  const decimals = Number(process.env.OKX_SENTINEL_PAYMENT_ASSET_DECIMALS ?? 6);
  const maxAmountRequired = toSmallestUnit(price.priceUsd, decimals);
  return {
    scheme,
    network,
    resource: `${request.protocol}://${request.get("host") ?? ""}${request.originalUrl}`,
    description: price.description,
    payTo: process.env.OKX_SENTINEL_PAYMENT_RECIPIENT ?? "",
    asset: process.env.OKX_SENTINEL_PAYMENT_ASSET ?? "",
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
  return Boolean(request.header("x-payment") || request.header("x-okx-payment") || authorization.toLowerCase().startsWith("x402 "));
}

export function getPaymentVerificationMode(): PaymentVerificationMode {
  const value = process.env.OKX_SENTINEL_PAYMENT_VERIFICATION;
  if (value === "trusted-proxy") return "trusted-proxy";
  if (value === "x402-facilitator") return "x402-facilitator";
  return "none";
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
