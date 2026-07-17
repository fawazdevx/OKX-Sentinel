import type { Request, Response } from "express";

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

export function maybeRequirePayment(request: Request, response: Response, tool: PaidToolName): boolean {
  const price = paidToolCatalog.find((item) => item.tool === tool);
  const paymentMode = getPaymentMode();

  if (!price) {
    response.status(500).json({ error: { message: `Payment catalog missing for ${tool}`, statusCode: 500 } });
    return false;
  }

  if (paymentMode !== "enforce" || isPaymentSettlementVerified(request)) {
    response.setHeader("X-OKX-Sentinel-Payment-Mode", paymentMode);
    response.setHeader("X-OKX-Sentinel-Tool-Price-USD", price.priceUsd.toString());
    response.setHeader("X-OKX-Sentinel-Settlement-Verified", String(isPaymentSettlementVerified(request)));
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

export function getPaymentMode(): "demo" | "enforce" {
  return process.env.OKX_SENTINEL_PAYMENT_MODE === "enforce" ? "enforce" : "demo";
}

export function isPaymentProofPresented(request: Request): boolean {
  const authorization = request.header("authorization") ?? "";
  return Boolean(request.header("x-payment") || request.header("x-okx-payment") || authorization.toLowerCase().startsWith("x402 "));
}

export function isPaymentSettlementVerified(request: Request): boolean {
  return (
    process.env.OKX_SENTINEL_PAYMENT_VERIFICATION === "trusted-proxy" &&
    request.header("x-okx-payment-verified")?.toLowerCase() === "true"
  );
}

export function isPaymentIntegrationReady(): boolean {
  return Boolean(
    getPaymentMode() === "enforce" &&
      process.env.OKX_SENTINEL_PAYMENT_RECIPIENT &&
      process.env.OKX_SENTINEL_PAYMENT_VERIFICATION === "trusted-proxy"
  );
}
