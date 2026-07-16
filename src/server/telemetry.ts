import type { Request } from "express";
import { appendFile } from "node:fs/promises";
import { paidToolCatalog, type PaidToolName } from "./payments";
import type { RiskLevel, RiskResponse } from "../shared/types";

export type TelemetryTrack = "free-rest" | "premium-rest" | "mcp" | "premium-mcp";

interface TelemetryEvent {
  id: string;
  timestamp: string;
  track: TelemetryTrack;
  tool: string;
  chainId?: number;
  riskScore?: number;
  riskLevel?: RiskLevel;
  decision?: string;
  blocked: boolean;
  priceUsd: number;
  paymentProofPresent: boolean;
  paymentMode: string;
  qualifiedRevenueUsd: number;
  demoRevenueUsd: number;
  projectedRevenueUsd: number;
  estimatedValueProtectedUsd: number;
  source: string;
}

const events: TelemetryEvent[] = [];
const maxEvents = 500;

export function recordToolTelemetry({
  request,
  result,
  track,
  source,
  paidTool
}: {
  request: Request;
  result: RiskResponse;
  track: TelemetryTrack;
  source: string;
  paidTool?: PaidToolName;
}) {
  const price = paidTool ? paidToolCatalog.find((item) => item.tool === paidTool)?.priceUsd ?? 0 : 0;
  const paymentProofPresent = hasPaymentProof(request);
  const paymentMode = process.env.OKX_SENTINEL_PAYMENT_MODE ?? "demo";
  const decision = readDecision(result);
  const blocked = decision === "block" || result.findings.some((finding) => finding.severity === "critical");
  const estimatedValueProtectedUsd = blocked ? readSpendLimitUsd(result) : 0;
  const qualifiedRevenueUsd = paymentProofPresent && price > 0 ? price : 0;
  const projectedRevenueUsd = price > 0 ? price : 0;
  const demoRevenueUsd = projectedRevenueUsd;
  const event: TelemetryEvent = {
    id: `${Date.now()}-${events.length + 1}`,
    timestamp: new Date().toISOString(),
    track,
    tool: result.tool,
    chainId: result.chainId,
    riskScore: result.riskScore,
    riskLevel: result.riskLevel,
    decision,
    blocked,
    priceUsd: price,
    paymentProofPresent,
    paymentMode,
    qualifiedRevenueUsd,
    demoRevenueUsd,
    projectedRevenueUsd,
    estimatedValueProtectedUsd,
    source
  };

  events.unshift(event);
  if (events.length > maxEvents) {
    events.length = maxEvents;
  }

  void persistEvent(event);
}

export function buildTelemetrySummary() {
  const totals = events.reduce(
    (accumulator, event) => {
      accumulator.totalCalls += 1;
      if (event.track === "mcp" || event.track === "premium-mcp") accumulator.mcpCalls += 1;
      if (event.track === "premium-rest" || event.track === "premium-mcp") accumulator.premiumCalls += 1;
      if (event.paymentProofPresent) accumulator.paymentProofCalls += 1;
      if (event.blocked) accumulator.blockedActions += 1;
      accumulator.qualifiedRevenueUsd += event.qualifiedRevenueUsd;
      accumulator.demoRevenueUsd += event.demoRevenueUsd;
      accumulator.projectedRevenueUsd += event.projectedRevenueUsd;
      accumulator.estimatedValueProtectedUsd += event.estimatedValueProtectedUsd;
      return accumulator;
    },
    {
      totalCalls: 0,
      mcpCalls: 0,
      premiumCalls: 0,
      paymentProofCalls: 0,
      blockedActions: 0,
      qualifiedRevenueUsd: 0,
      demoRevenueUsd: 0,
      projectedRevenueUsd: 0,
      estimatedValueProtectedUsd: 0
    }
  );

  const byTool = events.reduce<Record<string, number>>((accumulator, event) => {
    accumulator[event.tool] = (accumulator[event.tool] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    service: "OKX Sentinel",
    campaignUseCase: "Pre-signing risk firewall for OKX.AI agents",
    revenueModel: "A2MCP pay-per-call with A2A audit upsell",
    ...roundMoney(totals),
    byTool,
    latestEvents: events.slice(0, 20),
    caveats: [
      "qualifiedRevenueUsd only counts premium calls with a payment proof header in this server process.",
      "projectedRevenueUsd is the price projection for metered premium calls and is not claimed as settled revenue.",
      "demoRevenueUsd is retained as a backward-compatible alias for projectedRevenueUsd.",
      "estimatedValueProtectedUsd is derived from blocked policy spend limits, not custody or transaction execution."
    ]
  };
}

export function resetTelemetryForTests() {
  if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    throw new Error("resetTelemetryForTests can only run in tests.");
  }

  events.length = 0;
}

function readDecision(result: RiskResponse): string | undefined {
  const value = result.metadata?.decision;
  return typeof value === "string" ? value : undefined;
}

function readSpendLimitUsd(result: RiskResponse): number {
  const policyApplied = result.metadata?.policyApplied;
  if (!policyApplied || typeof policyApplied !== "object" || Array.isArray(policyApplied)) return 0;
  const spendLimitUsd = (policyApplied as { spendLimitUsd?: unknown }).spendLimitUsd;
  return typeof spendLimitUsd === "number" && Number.isFinite(spendLimitUsd) ? spendLimitUsd : 0;
}

function hasPaymentProof(request: Request): boolean {
  const authorization = request.header("authorization") ?? "";
  return Boolean(request.header("x-payment") || request.header("x-okx-payment") || authorization.toLowerCase().startsWith("x402 "));
}

function roundMoney<T extends Record<string, unknown>>(totals: T): T {
  return {
    ...totals,
    qualifiedRevenueUsd: Number((totals.qualifiedRevenueUsd as number).toFixed(2)),
    demoRevenueUsd: Number((totals.demoRevenueUsd as number).toFixed(2)),
    projectedRevenueUsd: Number((totals.projectedRevenueUsd as number).toFixed(2)),
    estimatedValueProtectedUsd: Number((totals.estimatedValueProtectedUsd as number).toFixed(2))
  };
}

async function persistEvent(event: TelemetryEvent) {
  const path = process.env.OKX_SENTINEL_TELEMETRY_FILE;
  if (!path) return;

  try {
    await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
  } catch {
    // Telemetry persistence must never block risk checks.
  }
}
