import { getAddress } from "viem";
import { getKnownEntity, isKnownSafe, isKnownSuspicious } from "../../shared/knownEntities";
import { confidenceFromSources, findingToScore, riskLevelFromScore, strongestFinding, summarizeRisk } from "../../shared/scoring";
import type { ApprovalAnalyzeInput, ApprovalAnalyzeResponse, ChainId, RevokePlan, RevokePlanInput, RevokePlanResponse, RiskFinding } from "../../shared/types";
import { getRpcProvider, shouldAttemptLiveRpc } from "../providers/rpc";
import { buildDataSources, isMaxUint256Like, riskFinding, standardLimitations, validateChainId, validateEvmAddress } from "./common";

const allowanceAbi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

export async function analyzeApproval(input: ApprovalAnalyzeInput): Promise<ApprovalAnalyzeResponse> {
  const chainId = validateChainId(input.chainId);
  const wallet = validateEvmAddress(input.wallet, "wallet");
  const tokenAddress = validateEvmAddress(input.tokenAddress, "tokenAddress");
  const spender = validateEvmAddress(input.spender, "spender");
  const rpc = getRpcProvider(chainId);
  const allowanceRead = await readAllowance(wallet, tokenAddress, spender, chainId);
  const allowance = allowanceRead.value;
  const findings: RiskFinding[] = [];
  const spenderEntity = getKnownEntity(spender, chainId);
  const spenderReputation = isKnownSuspicious(spender, chainId) ? "suspicious" : isKnownSafe(spender, chainId) ? "known" : "unknown";
  const unlimited = allowanceRead.live && isMaxUint256Like(allowance);

  if (!allowanceRead.live) {
    findings.push(
      riskFinding(
        "approval.allowance-unavailable",
        "Approval allowance unavailable",
        "medium",
        "data-quality",
        "The scanner could not confirm the current allowance from RPC, so it will not infer an approval amount.",
        "Configure a reliable RPC endpoint or verify the allowance in a trusted approval manager before deciding whether to revoke.",
        { allowance }
      )
    );
  } else if (unlimited) {
    findings.push(
      riskFinding(
        "approval.unlimited",
        "Unlimited approval detected",
        spenderReputation === "known" ? "high" : "critical",
        "approval",
        "The spender appears able to transfer the full token balance at any point while the approval remains active.",
        "Reduce this approval to a transaction-sized amount or revoke it after use.",
        { allowance }
      )
    );
  } else {
    findings.push(
      riskFinding(
        "approval.finite",
        "Finite approval amount",
        "low",
        "approval",
        "The approval appears bounded rather than unlimited.",
        "Keep finite approvals transaction-sized and revoke stale allowances.",
        { allowance }
      )
    );
  }

  if (spenderReputation === "suspicious") {
    findings.push(
      riskFinding(
        "approval.suspicious-spender",
        "Spender is suspicious",
        "critical",
        "approval",
        `${spenderEntity?.label ?? "The spender"} matches a known risky spender pattern.`,
        "Revoke this approval before sending additional assets to the wallet.",
        { spender }
      )
    );
  } else if (spenderReputation === "unknown") {
    findings.push(
      riskFinding(
        "approval.unknown-spender",
        "Unknown spender",
        unlimited ? "high" : "medium",
        "approval",
        "The spender is not in the local known-safe registry.",
        "Confirm the spender in an explorer and avoid granting broad permissions."
      )
    );
  } else {
    findings.push(
      riskFinding(
        "approval.known-spender",
        "Known spender",
        "info",
        "approval",
        `${spenderEntity?.label ?? "The spender"} is recognized by the local registry.`,
        "Known contracts can still be risky if approvals are larger than necessary."
      )
    );
  }

  const riskScore = findingToScore(findings, spenderReputation === "known" ? 4 : 16);
  const riskLevel = riskLevelFromScore(riskScore);
  const approvalAssessment = !allowanceRead.live ? "leave-alone" : riskScore >= 65 ? "revoke" : riskScore >= 35 ? "reduce" : "leave-alone";
  const revokePlan = buildRevokePlan(tokenAddress, spender, allowance, approvalAssessment);
  const sources = buildDataSources(chainId, [rpc.source, "erc20-allowance-read"]);

  return {
    tool: "analyze_approval",
    chainId,
    riskScore,
    riskLevel,
    summary: summarizeRisk(riskScore, "This approval", strongestFinding(findings)),
    findings,
    recommendedActions: [
      !allowanceRead.live
        ? "Confirm the allowance with a configured RPC endpoint or trusted approval manager before taking revoke action."
        : approvalAssessment === "revoke"
        ? "Revoke this spender allowance before further wallet activity."
        : approvalAssessment === "reduce"
          ? "Replace this approval with a smaller transaction-sized allowance."
          : "No urgent revoke required; continue monitoring the allowance.",
      "Never approve unlimited spending for an unknown claim, airdrop, or support link.",
      "OKX Sentinel only generates a plan; it does not sign or execute revokes."
    ],
    confidence: confidenceFromSources(sources.length, allowanceRead.live, allowanceRead.live ? 0.08 : 0.2),
    dataSourcesUsed: sources,
    limitations: [
      ...standardLimitations,
      "Allowance reads depend on RPC availability and token contract compliance.",
      "No fallback allowance is generated when RPC data is unavailable.",
      "Spender reputation is based on a compact local registry in this MVP."
    ],
    metadata: {
      wallet: getAddress(wallet),
      tokenAddress: getAddress(tokenAddress),
      spender: getAddress(spender),
      spenderReputation,
      approvalAssessment,
      liveOnchainReads: {
        allowance: allowanceRead.live
      },
      revokePlan
    }
  };
}

export async function generateRevokePlan(input: RevokePlanInput): Promise<RevokePlanResponse> {
  const chainId = validateChainId(input.chainId);
  const wallet = validateEvmAddress(input.wallet, "wallet");
  const plans: RevokePlan[] = [];
  const findings = [
    riskFinding(
      "revoke.inventory-unavailable",
      "Approval inventory unavailable without live indexer",
      "info",
      "data-quality",
      "Wallet-wide revoke plans require a live approval indexer. This endpoint does not generate revoke inventory without real data.",
      "Connect OKLink, an Etherscan-compatible approval indexer, or wallet-provider approval data before generating wallet-wide revoke plans.",
      {
        wallet: getAddress(wallet),
        configured: Boolean(process.env.OKLINK_API_KEY || process.env.OKX_SENTINEL_WALLET_INDEXER_URL)
      }
    )
  ];

  const riskScore = findingToScore(findings, 4);
  const sources = buildDataSources(chainId, ["approval-indexer-unavailable"]);

  return {
    tool: "generate_revoke_plan",
    chainId,
    riskScore,
    riskLevel: riskLevelFromScore(riskScore),
    summary: summarizeRisk(riskScore, "Wallet revoke plan", strongestFinding(findings)),
    findings,
    recommendedActions: [
      "Connect a live approval indexer before generating wallet-wide revoke plans.",
      "Use analyze_approval for specific wallet, token, and spender triples when an indexer is unavailable.",
      "Do not submit revoke transactions from links you did not independently navigate to."
    ],
    confidence: confidenceFromSources(sources.length, false, 0.28),
    dataSourcesUsed: sources,
    limitations: [
      ...standardLimitations,
      "Full revoke inventory requires an approval indexer such as OKLink, Etherscan-compatible APIs, or wallet-provider data.",
      "No fallback revoke inventory is generated when live indexer data is unavailable."
    ],
    metadata: {
      wallet: getAddress(wallet),
      approvals: plans
    }
  };
}

async function readAllowance(
  wallet: string,
  tokenAddress: string,
  spender: string,
  chainId: ChainId
): Promise<{ value: string; live: boolean }> {
  const rpc = getRpcProvider(chainId);

  if (!rpc.client || !shouldAttemptLiveRpc(chainId)) {
    return { value: "unknown", live: false };
  }

  try {
    const allowance = await withTimeout(rpc.client.readContract({
      address: getAddress(tokenAddress),
      abi: allowanceAbi,
      functionName: "allowance",
      args: [getAddress(wallet), getAddress(spender)]
    }), 1500);

    return { value: String(allowance), live: true };
  } catch {
    return { value: "unknown", live: false };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("RPC timeout")), timeoutMs);
    })
  ]);
}

function buildRevokePlan(
  tokenAddress: string,
  spender: string,
  currentAllowance: string,
  assessment: "leave-alone" | "reduce" | "revoke" | "monitor"
): RevokePlan {
  const action = assessment === "revoke" ? "revoke" : assessment === "reduce" ? "reduce" : "monitor";
  const recommendedAllowance = action === "revoke" ? "0" : action === "reduce" ? "limited" : "unchanged";

  return {
    tokenAddress: getAddress(tokenAddress),
    spender: getAddress(spender),
    currentAllowance,
    recommendedAllowance,
    action,
    rationale:
      action === "revoke"
        ? "Approval is broad, stale, unknown, or connected to a suspicious spender."
        : action === "reduce"
          ? "Approval may be larger than needed for the next intended transaction."
          : "No immediate action required in this MVP scan.",
    steps: [
      "Open a trusted approval manager or wallet-native revoke screen.",
      `Select token ${getAddress(tokenAddress)} and spender ${getAddress(spender)}.`,
      action === "revoke" ? "Set allowance to zero." : action === "reduce" ? "Set allowance to the smallest practical amount." : "Leave unchanged and schedule a later review.",
      "Review gas, chain, and contract addresses before signing."
    ]
  };
}
