import { describe, expect, it } from "vitest";
import { exampleInputs } from "../src/shared/examples";
import { evaluateActionPolicy } from "../src/server/scanners/policyScanner";

describe("policy scanner", () => {
  it("blocks risky unlimited approval actions", async () => {
    const result = await evaluateActionPolicy(exampleInputs.policy);

    expect(result.tool).toBe("evaluate_action_policy");
    expect(result.metadata.decision).toBe("block");
    expect(result.metadata.automaticSigning).toBe(false);
    expect(result.metadata.custody).toBe("none");
    expect(result.metadata.signingHandoff.status).toBe("not-recommended");
    expect(result.findings.some((finding) => finding.id === "tx.unlimited-approval")).toBe(true);
    expect(result.metadata.signingHandoff.reason).toContain("Policy blocks unlimited approvals");
  });

  it("keeps signing external even when policy allows an action", async () => {
    const result = await evaluateActionPolicy({
      txData: "transfer 10 USDC to a known settlement wallet",
      chainId: 8453,
      policy: {
        maxAllowedRiskScore: 90,
        requireReviewAbove: 80,
        blockUnlimitedApprovals: true
      }
    });

    expect(result.metadata.signingMode).toBe("external-wallet-required");
    expect(result.metadata.automaticSigning).toBe(false);
  });

  it("blocks actions above the declared spend limit", async () => {
    const result = await evaluateActionPolicy({
      txData: "transfer 750 USDC to a settlement wallet",
      chainId: 196,
      actionValueUsd: 750,
      policy: {
        maxAllowedRiskScore: 90,
        requireReviewAbove: 80,
        blockUnlimitedApprovals: true,
        spendLimitUsd: 500
      }
    });

    expect(result.metadata.decision).toBe("block");
    expect(result.metadata.actionValueUsd).toBe(750);
    expect(result.metadata.signingHandoff.reason).toContain("exceeds spend limit");
  });

  it("rejects inverted review and block thresholds", async () => {
    await expect(
      evaluateActionPolicy({
        txData: "transfer 10 USDC to a settlement wallet",
        chainId: 196,
        policy: {
          maxAllowedRiskScore: 20,
          requireReviewAbove: 40
        }
      })
    ).rejects.toThrow("requireReviewAbove must be less than or equal");
  });
});
