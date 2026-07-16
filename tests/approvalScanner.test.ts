import { describe, expect, it } from "vitest";
import { exampleInputs } from "../src/shared/examples";
import { analyzeApproval, generateRevokePlan } from "../src/server/scanners/approvalScanner";

describe("approval scanner", () => {
  it("reports unavailable allowance without RPC data", async () => {
    const result = await analyzeApproval(exampleInputs.approval);

    expect(result.metadata.liveOnchainReads.allowance).toBe(false);
    expect(result.metadata.approvalAssessment).toBe("leave-alone");
    expect(result.metadata.revokePlan.currentAllowance).toBe("unknown");
    expect(result.findings.some((finding) => finding.id === "approval.allowance-unavailable")).toBe(true);
  });

  it("does not generate wallet-wide revoke inventory without a live indexer", async () => {
    const result = await generateRevokePlan({
      wallet: exampleInputs.wallet.address,
      chainId: exampleInputs.wallet.chainId
    });

    expect(result.tool).toBe("generate_revoke_plan");
    expect(result.metadata.approvals).toEqual([]);
    expect(result.findings.some((finding) => finding.id === "revoke.inventory-unavailable")).toBe(true);
  });
});
