import { isAddress } from "viem";
import { getChainConfig, isSupportedChainId } from "../../shared/chains";
import type { ChainId, RiskFinding } from "../../shared/types";

export const standardLimitations = [
  "OKX Sentinel is a risk assistant, not financial advice.",
  "The MVP does not request private keys, sign transactions, or custody assets.",
  "Heuristic findings can miss newly deployed scams, private mempool activity, or offchain context.",
  "Use a block explorer and revoke tools for final confirmation before acting."
];

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export function validateChainId(chainId: number): ChainId {
  if (!isSupportedChainId(chainId)) {
    throw new RequestValidationError(`Unsupported chainId. Supported chains: 1, 196, 8453, 42161, 137, 56, 10.`);
  }

  return chainId;
}

export function validateEvmAddress(address: string, label = "address"): string {
  const trimmed = address.trim();

  if (!isAddress(trimmed)) {
    throw new RequestValidationError(`Invalid ${label}. Expected a 20-byte EVM address.`);
  }

  return trimmed;
}

export function buildDataSources(chainId: ChainId, extras: string[] = []): string[] {
  const chain = getChainConfig(chainId);
  return [
    `chain:${chain.name}`,
    "local-risk-heuristics",
    "known-entity-registry",
    ...extras
  ];
}

export function riskFinding(
  id: string,
  title: string,
  severity: RiskFinding["severity"],
  category: RiskFinding["category"],
  description: string,
  recommendation?: string,
  evidence?: Record<string, unknown>
): RiskFinding {
  return {
    id,
    title,
    severity,
    category,
    description,
    recommendation,
    evidence
  };
}

export function isMaxUint256Like(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "max" ||
    normalized === "unlimited" ||
    normalized === "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" ||
    normalized === "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" ||
    normalized === "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" ||
    normalized === "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" ||
    normalized === "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" ||
    /^f{64}$/.test(normalized.replace(/^0x/, ""))
  );
}

export function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}
