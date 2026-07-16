import { describe, expect, it } from "vitest";
import { exampleUnlimitedApprovalCalldata } from "../src/shared/examples";
import { explainTransaction } from "../src/server/scanners/transactionScanner";

describe("transaction scanner", () => {
  it("flags unlimited approvals", async () => {
    const result = await explainTransaction({
      txData: exampleUnlimitedApprovalCalldata,
      chainId: 196
    });

    expect(result.metadata.actionType).toBe("approval");
    expect(result.riskScore).toBeGreaterThanOrEqual(65);
    expect(result.findings.some((finding) => finding.id === "tx.unlimited-approval")).toBe(true);
  });

  it("classifies plain text swap intent", async () => {
    const result = await explainTransaction({
      txData: "swap 100 USDC for ETH through a known router",
      chainId: 8453
    });

    expect(result.metadata.actionType).toBe("swap");
    expect(result.summary).toContain("swap");
  });
});
