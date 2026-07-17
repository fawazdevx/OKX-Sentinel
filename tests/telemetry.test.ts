import { beforeEach, describe, expect, it } from "vitest";
import { exampleInputs } from "../src/shared/examples";
import type { RiskResponse } from "../src/shared/types";
import { evaluateActionPolicy } from "../src/server/scanners/policyScanner";
import { buildTelemetrySummary, recordToolTelemetry, resetTelemetryForTests } from "../src/server/telemetry";

describe("telemetry", () => {
  beforeEach(() => {
    resetTelemetryForTests();
  });

  it("does not treat a client-supplied payment header as qualified revenue", async () => {
    const blockedResult = await evaluateActionPolicy(exampleInputs.policy);

    recordToolTelemetry({
      request: fakeRequest({ "x-payment": "demo-proof" }),
      result: blockedResult,
      track: "premium-mcp",
      source: "test",
      paidTool: "evaluate_action_policy"
    });

    const summary = buildTelemetrySummary();

    expect(summary.totalCalls).toBe(1);
    expect(summary.mcpCalls).toBe(1);
    expect(summary.premiumCalls).toBe(1);
    expect(summary.paymentProofCalls).toBe(1);
    expect(summary.verifiedPaymentCalls).toBe(0);
    expect(summary.blockedActions).toBe(1);
    expect(summary.qualifiedRevenueUsd).toBe(0);
    expect(summary.projectedRevenueUsd).toBe(0.05);
    expect(summary.blockedActionValueUsd).toBe(500);
    expect(summary.byTool.evaluate_action_policy).toBe(1);
  });

  it("counts revenue only when trusted middleware marks settlement verified", async () => {
    const previousVerificationMode = process.env.OKX_SENTINEL_PAYMENT_VERIFICATION;
    process.env.OKX_SENTINEL_PAYMENT_VERIFICATION = "trusted-proxy";

    try {
      const result = await evaluateActionPolicy(exampleInputs.policy);
      recordToolTelemetry({
        request: fakeRequest({
          "x-payment": "opaque-proof",
          "x-okx-payment-verified": "true"
        }),
        result,
        track: "premium-mcp",
        source: "test",
        paidTool: "evaluate_action_policy"
      });

      const summary = buildTelemetrySummary();
      expect(summary.paymentProofCalls).toBe(1);
      expect(summary.verifiedPaymentCalls).toBe(1);
      expect(summary.qualifiedRevenueUsd).toBe(0.05);
    } finally {
      if (previousVerificationMode === undefined) {
        delete process.env.OKX_SENTINEL_PAYMENT_VERIFICATION;
      } else {
        process.env.OKX_SENTINEL_PAYMENT_VERIFICATION = previousVerificationMode;
      }
    }
  });

  it("does not claim qualified revenue for unpaid demo premium calls", async () => {
    const result: RiskResponse = {
      tool: "scan_token",
      chainId: 196,
      riskScore: 20,
      riskLevel: "Low",
      summary: "No critical finding.",
      findings: [],
      recommendedActions: [],
      confidence: 0.8,
      dataSourcesUsed: [],
      limitations: []
    };

    recordToolTelemetry({
      request: fakeRequest({}),
      result,
      track: "premium-rest",
      source: "test",
      paidTool: "deep_scan_token"
    });

    const summary = buildTelemetrySummary();

    expect(summary.qualifiedRevenueUsd).toBe(0);
    expect(summary.projectedRevenueUsd).toBe(0.25);
    expect(summary.blockedActions).toBe(0);
    expect(summary.blockedActionValueUsd).toBe(0);
  });
});

function fakeRequest(headers: Record<string, string>) {
  return {
    header(name: string) {
      return headers[name.toLowerCase()];
    }
  } as never;
}
