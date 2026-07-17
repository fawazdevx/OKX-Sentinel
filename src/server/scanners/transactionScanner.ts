import { isAddress } from "viem";
import { getEntityLabel, isKnownSafe, isKnownSuspicious } from "../../shared/knownEntities";
import { confidenceFromSources, findingToScore, riskLevelFromScore, strongestFinding, summarizeRisk } from "../../shared/scoring";
import type { RiskFinding, TransactionExplainInput, TransactionExplainResponse } from "../../shared/types";
import { buildDataSources, RequestValidationError, riskFinding, standardLimitations, validateChainId } from "./common";
import { decodeCalldata } from "./calldata";

interface ParsedTxInput {
  txData: string;
  to?: string;
  value?: string;
  intent: string;
}

export async function explainTransaction(input: TransactionExplainInput): Promise<TransactionExplainResponse> {
  const chainId = validateChainId(input.chainId);
  const parsed = parseTxInput(input.txData);
  const decoded = decodeCalldata(parsed.txData);
  const destination = parsed.to ?? decoded.destination;
  const findings: RiskFinding[] = [];

  if (decoded.actionType === "unknown") {
    findings.push(
      riskFinding(
        "tx.unknown-selector",
        "Unknown transaction selector",
        "medium",
        "transaction",
        "The calldata selector is not recognized by the MVP decoder.",
        "Ask the requesting app or agent for a human-readable simulation before signing.",
        { selector: decoded.selector }
      )
    );
  }

  if (decoded.isUnlimitedApproval) {
    findings.push(
      riskFinding(
        "tx.unlimited-approval",
        "Transaction grants unlimited approval",
        "critical",
        "approval",
        "The transaction appears to set an ERC-20 allowance to the maximum uint256 value.",
        "Reject unless you independently trust the spender and need a persistent allowance.",
        { spender: decoded.destination, amount: decoded.amount }
      )
    );
  } else if (decoded.actionType === "approval") {
    findings.push(
      riskFinding(
        "tx.approval-change",
        "Transaction changes token permissions",
        "high",
        "approval",
        "The transaction appears to modify ERC-20 spending permissions.",
        "Prefer a limited allowance and revoke it after the intended action."
      )
    );
  }

  if (destination && isAddress(destination)) {
    const label = getEntityLabel(destination, chainId);

    if (isKnownSuspicious(destination, chainId)) {
      findings.push(
        riskFinding(
          "tx.suspicious-destination",
          "Destination is suspicious",
          "critical",
          "contract",
          `Destination ${label} is present in the local risk registry.`,
          "Reject this transaction and inspect the requesting site or agent.",
          { destination }
        )
      );
    } else if (isKnownSafe(destination, chainId)) {
      findings.push(
        riskFinding(
          "tx.known-destination",
          "Destination is recognized",
          "info",
          "contract",
          `Destination appears to be ${label}.`,
          "Still confirm token, amount, chain, and frontend domain before signing.",
          { destination }
        )
      );
    } else {
      findings.push(
        riskFinding(
          "tx.unknown-destination",
          "Destination is unknown",
          decoded.actionType === "approval" ? "high" : "medium",
          "contract",
          "The destination/spender is not in the local known-safe registry.",
          "Verify the contract in an explorer and avoid signing from unsolicited links.",
          { destination }
        )
      );
    }
  }

  if (parsed.value && parsed.value !== "0" && decoded.actionType === "unknown") {
    findings.push(
      riskFinding(
        "tx.value-with-unknown-call",
        "Native asset value attached to unknown call",
        "high",
        "transaction",
        "The transaction includes native token value while the call target is not decoded.",
        "Do not sign until a wallet simulation explains the asset movement.",
        { value: parsed.value }
      )
    );
  }

  if (findings.length === 0) {
    findings.push(
      riskFinding(
        "tx.no-critical-findings",
        "No critical transaction warning",
        "low",
        "transaction",
        "The transaction matches a recognizable pattern with no critical warning in the MVP decoder.",
        "Confirm amounts, recipient, chain, and requesting application before signing."
      )
    );
  }

  const sources = buildDataSources(chainId, ["calldata-selector-decoder", "transaction-intent-parser"]);
  const riskScore = findingToScore(findings, decoded.actionType === "unknown" ? 20 : 8);
  const riskLevel = riskLevelFromScore(riskScore);

  return {
    tool: "explain_transaction",
    chainId,
    riskScore,
    riskLevel,
    summary: buildTransactionSummary(decoded.label, riskScore, decoded.isUnlimitedApproval),
    findings,
    recommendedActions: [
      riskScore >= 65 ? "Do not sign until the spender, destination, and purpose are independently verified." : "Proceed only after confirming recipient, amount, chain, and dapp origin.",
      "Use wallet simulation or block-explorer decoding for high-value transactions.",
      "For approvals, prefer transaction-sized allowances over unlimited approvals."
    ],
    confidence: confidenceFromSources(sources.length, true, 0.08),
    dataSourcesUsed: sources,
    limitations: [
      ...standardLimitations,
      "The MVP decoder recognizes common selectors only and does not fully simulate EVM execution.",
      "A malicious app can bundle actions through multicall patterns that require deeper decoding."
    ],
    metadata: {
      actionType: decoded.actionType,
      assetsAtRisk: decoded.assetsAtRisk,
      permissionChanges: decoded.permissionChanges,
      destination,
      decodedSelector: decoded.selector,
      transactionIntent: parsed.intent
    }
  };
}

function parseTxInput(raw: string): ParsedTxInput {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new RequestValidationError("txData is required.");
  }

  try {
    const parsed = JSON.parse(trimmed) as { data?: string; input?: string; to?: string; value?: string; description?: string; intent?: string };
    return {
      txData: parsed.data ?? parsed.input ?? trimmed,
      to: parsed.to,
      value: parsed.value,
      intent: parsed.intent ?? parsed.description ?? "JSON transaction payload"
    };
  } catch {
    return {
      txData: trimmed,
      intent: trimmed.startsWith("0x") ? "Raw calldata" : trimmed
    };
  }
}

function buildTransactionSummary(label: string, score: number, unlimitedApproval: boolean): string {
  if (unlimitedApproval) {
    return `This transaction appears to be an unlimited approval and is assessed as ${riskLevelFromScore(score).toLowerCase()} risk.`;
  }

  return `${label} is assessed as ${riskLevelFromScore(score).toLowerCase()} risk with a score of ${score}/100.`;
}
