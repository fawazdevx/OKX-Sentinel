import { getAddress, isAddress } from "viem";
import { confidenceFromSources, findingToScore, riskLevelFromScore, strongestFinding, summarizeRisk } from "../../shared/scoring";
import type { ActionPolicyInput, ActionPolicyResponse, ChainId, PolicyDecision, RiskFinding } from "../../shared/types";
import { buildDataSources, riskFinding, standardLimitations, validateChainId } from "./common";
import { explainTransaction } from "./transactionScanner";

const defaultPolicy = {
  maxAllowedRiskScore: 64,
  requireReviewAbove: 35,
  blockUnlimitedApprovals: true
};

export async function evaluateActionPolicy(input: ActionPolicyInput): Promise<ActionPolicyResponse> {
  const chainId = validateChainId(input.chainId);
  const policy = {
    ...defaultPolicy,
    ...input.policy
  };
  const transactionRisk = await explainTransaction({
    txData: input.txData,
    chainId
  });
  const findings: RiskFinding[] = [...transactionRisk.findings];
  const hasUnlimitedApproval = transactionRisk.findings.some((finding) => finding.id === "tx.unlimited-approval");
  const hasCriticalFinding = transactionRisk.findings.some((finding) => finding.severity === "critical");
  const hasHighFinding = transactionRisk.findings.some((finding) => finding.severity === "high");
  const normalizedWallet = input.wallet && isAddress(input.wallet) ? getAddress(input.wallet) : undefined;

  let decision: PolicyDecision = "allow";
  const decisionReasons: string[] = [];

  if (policy.blockUnlimitedApprovals && hasUnlimitedApproval) {
    decision = "block";
    decisionReasons.push("Policy blocks unlimited approvals.");
  }

  if (transactionRisk.riskScore > policy.maxAllowedRiskScore) {
    decision = "block";
    decisionReasons.push(`Risk score ${transactionRisk.riskScore} exceeds max allowed score ${policy.maxAllowedRiskScore}.`);
  }

  if (decision !== "block" && transactionRisk.riskScore >= policy.requireReviewAbove) {
    decision = "review";
    decisionReasons.push(`Risk score ${transactionRisk.riskScore} requires user review at threshold ${policy.requireReviewAbove}.`);
  }

  if (decision !== "block" && hasHighFinding) {
    decision = "review";
    decisionReasons.push("High-severity finding requires explicit user confirmation.");
  }

  if (hasCriticalFinding && decision !== "block") {
    decision = "review";
    decisionReasons.push("Critical finding requires manual review even if policy threshold allows the action.");
  }

  findings.push(
    riskFinding(
      "policy.signing-boundary",
      "External signing required",
      "info",
      "transaction",
      "OKX Sentinel does not custody keys or sign transactions. It returns a policy decision for an OKX.AI agent or user wallet to enforce.",
      "Route approved actions to OKX Agentic Wallet or the user's wallet for final review and signature.",
      { decision }
    )
  );

  findings.push(
    riskFinding(
      `policy.${decision}`,
      `Policy decision: ${decision.toUpperCase()}`,
      decision === "block" ? "critical" : decision === "review" ? "medium" : "low",
      "transaction",
      decisionReasons.length > 0 ? decisionReasons.join(" ") : "The action is below the configured risk thresholds.",
      decision === "allow"
        ? "Proceed to external wallet signing only after the user confirms chain, target, and amount."
        : decision === "review"
          ? "Ask the user for explicit approval before creating a signing request."
          : "Do not create a signing request for this action."
    )
  );

  const riskScore = findingToScore(findings, transactionRisk.riskScore);
  const sources = buildDataSources(chainId, ["transaction-risk-engine", "sentinel-policy-gate"]);

  return {
    tool: "evaluate_action_policy",
    chainId,
    riskScore,
    riskLevel: riskLevelFromScore(riskScore),
    summary: summarizeRisk(riskScore, `Policy decision ${decision.toUpperCase()}`, strongestFinding(findings)),
    findings,
    recommendedActions: [
      decision === "block"
        ? "Block the agent action and do not request a signature."
        : decision === "review"
          ? "Pause automation and ask the user to approve or reject the action."
          : "Send the action to external wallet signing only after final user confirmation.",
      "Never pass private keys, seed phrases, or signing authority to OKX Sentinel.",
      "Use the paid A2MCP endpoint for production agent calls and revenue tracking."
    ],
    confidence: Math.min(0.94, Number((transactionRisk.confidence + 0.04).toFixed(2))),
    dataSourcesUsed: sources,
    limitations: [
      ...standardLimitations,
      "Policy decisions are deterministic risk controls, not legal, investment, or custody advice.",
      "The signing handoff is a plan for external wallets; this service intentionally does not broadcast transactions."
    ],
    metadata: {
      decision,
      signingMode: "external-wallet-required",
      custody: "none",
      automaticSigning: false,
      agentId: input.agentId,
      wallet: normalizedWallet,
      policyApplied: policy,
      signingHandoff: {
        status: decision === "block" ? "not-recommended" : "ready",
        reason: decisionReasons.length > 0 ? decisionReasons.join(" ") : "Risk is within policy thresholds.",
        instructions:
          decision === "block"
            ? ["Do not open a signing request.", "Show the user the blocking findings.", "Suggest a safer route, limited approval, or revoke plan."]
            : ["Open the request in OKX Agentic Wallet or the user's wallet.", "Show Sentinel findings before the signature screen.", "Require the user to confirm chain, destination, assets, and allowance."]
      }
    }
  };
}
