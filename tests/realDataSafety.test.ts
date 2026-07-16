import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";
import { analyzeApproval, generateRevokePlan } from "../src/server/scanners/approvalScanner";
import { decodeCalldata } from "../src/server/scanners/calldata";
import { scanToken } from "../src/server/scanners/tokenScanner";
import { scanWallet } from "../src/server/scanners/walletScanner";
import { exampleInputs, exampleSpender, exampleToken, exampleUnlimitedApprovalCalldata } from "../src/shared/examples";

const liveEnvKeys = [
  "ENABLE_PUBLIC_RPC_READS",
  "XLAYER_RPC_URL",
  "ETHEREUM_RPC_URL",
  "BASE_RPC_URL",
  "ARBITRUM_RPC_URL",
  "POLYGON_RPC_URL",
  "BNB_RPC_URL",
  "OPTIMISM_RPC_URL",
  "OKLINK_API_KEY",
  "OKX_SENTINEL_WALLET_INDEXER_URL"
] as const;

async function withoutLiveDataEnv<T>(callback: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();

  for (const key of liveEnvKeys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe("real-data safety", () => {
  it("uses canonical ERC-20 approve calldata for the risky example", () => {
    const decoded = decodeCalldata(exampleUnlimitedApprovalCalldata);

    expect(exampleUnlimitedApprovalCalldata).toHaveLength(138);
    expect(decoded.selector).toBe("0x095ea7b3");
    expect(decoded.destination?.toLowerCase()).toBe(exampleSpender.toLowerCase());
    expect(decoded.amount).toBe(`0x${maxUint256.toString(16)}`);
    expect(decoded.isUnlimitedApproval).toBe(true);
  });

  it("does not generate wallet inventory when no live indexer is configured", async () => {
    const result = await withoutLiveDataEnv(() => scanWallet(exampleInputs.wallet));

    expect(result.metadata.suspiciousApprovals).toEqual([]);
    expect(result.metadata.highRiskTokenHoldings).toEqual([]);
    expect(result.metadata.recentlyInteractedContracts).toEqual([]);
    expect(result.metadata.dustingIndicators).toEqual([]);
    expect(result.metadata.liveOnchainReads.approvalInventory).toBe(false);
    expect(result.dataSourcesUsed).not.toContain("fallback-approval-inventory");
    expect(result.dataSourcesUsed).not.toContain("fallback-token-inventory");
    expect(result.findings.some((finding) => finding.id === "wallet.inventory-unavailable")).toBe(true);
  });

  it("does not invent approval allowance when RPC is unavailable", async () => {
    const result = await withoutLiveDataEnv(() => analyzeApproval(exampleInputs.approval));

    expect(result.metadata.liveOnchainReads.allowance).toBe(false);
    expect(result.metadata.revokePlan.currentAllowance).toBe("unknown");
    expect(result.findings.some((finding) => finding.id === "approval.allowance-unavailable")).toBe(true);
    expect(result.findings.some((finding) => finding.id === "approval.unlimited")).toBe(false);
  });

  it("does not generate a revoke inventory without a live indexer", async () => {
    const result = await withoutLiveDataEnv(() =>
      generateRevokePlan({
        wallet: exampleInputs.wallet.address,
        chainId: exampleInputs.wallet.chainId
      })
    );

    expect(result.metadata.approvals).toEqual([]);
    expect(result.dataSourcesUsed).not.toContain("fallback-approval-inventory");
    expect(result.findings.some((finding) => finding.id === "revoke.inventory-unavailable")).toBe(true);
  });

  it("does not invent token metadata or admin controls when RPC is unavailable", async () => {
    const result = await withoutLiveDataEnv(() =>
      scanToken({
        tokenAddress: exampleToken,
        chainId: 196
      })
    );

    expect(result.metadata.token.symbol).toBe("UNKNOWN");
    expect(result.metadata.adminAddresses).toEqual([]);
    expect(result.metadata.implementationAddress).toBeUndefined();
    expect(result.metadata.detectedFunctions).toEqual([]);
    expect(result.metadata.liveOnchainReads.metadata).toBe(false);
    expect(result.findings.some((finding) => finding.id === "token.known-risk")).toBe(false);
  });
});
