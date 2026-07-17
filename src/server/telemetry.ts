import type { Request } from "express";
import { appendFile } from "node:fs/promises";
import {
  getPaymentMode,
  isPaymentProofPresented,
  isPaymentSettlementVerified,
  paidToolCatalog,
  type PaidToolName
} from "./payments";
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
  paymentProofPresented: boolean;
  paymentSettlementVerified: boolean;
  paymentMode: string;
  qualifiedRevenueUsd: number;
  projectedRevenueUsd: number;
  blockedActionValueUsd: number;
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
  const paymentProofPresented = isPaymentProofPresented(request);
  const paymentSettlementVerified = isPaymentSettlementVerified(request);
  const paymentMode = getPaymentMode();
  const decision = readDecision(result);
  const blocked = decision === "block" || result.findings.some((finding) => finding.severity === "critical");
  const blockedActionValueUsd = blocked ? readActionValueUsd(result) : 0;
  const qualifiedRevenueUsd = paymentSettlementVerified && price > 0 ? price : 0;
  const projectedRevenueUsd = price > 0 ? price : 0;
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
    paymentProofPresented,
    paymentSettlementVerified,
    paymentMode,
    qualifiedRevenueUsd,
    projectedRevenueUsd,
    blockedActionValueUsd,
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
      if (event.paymentProofPresented) accumulator.paymentProofCalls += 1;
      if (event.paymentSettlementVerified) accumulator.verifiedPaymentCalls += 1;
      if (event.blocked) accumulator.blockedActions += 1;
      accumulator.qualifiedRevenueUsd += event.qualifiedRevenueUsd;
      accumulator.projectedRevenueUsd += event.projectedRevenueUsd;
      accumulator.blockedActionValueUsd += event.blockedActionValueUsd;
      return accumulator;
    },
    {
      totalCalls: 0,
      mcpCalls: 0,
      premiumCalls: 0,
      paymentProofCalls: 0,
      verifiedPaymentCalls: 0,
      blockedActions: 0,
      qualifiedRevenueUsd: 0,
      projectedRevenueUsd: 0,
      blockedActionValueUsd: 0
    }
  );

  const byTool = events.reduce<Record<string, number>>((accumulator, event) => {
    accumulator[event.tool] = (accumulator[event.tool] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    service: "OKX Sentinel",
    campaignUseCase: "Pre-signing risk firewall for OKX.AI agents",
    revenueModel: "Free A2MCP launch with verified x402 pay-per-call planned",
    ...roundMoney(totals),
    byTool,
    latestEvents: events.slice(0, 20),
    caveats: [
      "paymentProofCalls counts requests that presented a payment header; it does not prove settlement.",
      "verifiedPaymentCalls and qualifiedRevenueUsd only increase when trusted payment middleware marks settlement as verified.",
      "projectedRevenueUsd is the price projection for metered premium calls and is not claimed as settled revenue.",
      "blockedActionValueUsd sums caller-declared action values for blocked policy checks; it is not custody or execution volume."
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

function readActionValueUsd(result: RiskResponse): number {
  const actionValueUsd = result.metadata?.actionValueUsd;
  return typeof actionValueUsd === "number" && Number.isFinite(actionValueUsd) ? actionValueUsd : 0;
}

function roundMoney<T extends Record<string, unknown>>(totals: T): T {
  return {
    ...totals,
    qualifiedRevenueUsd: Number((totals.qualifiedRevenueUsd as number).toFixed(2)),
    projectedRevenueUsd: Number((totals.projectedRevenueUsd as number).toFixed(2)),
    blockedActionValueUsd: Number((totals.blockedActionValueUsd as number).toFixed(2))
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
