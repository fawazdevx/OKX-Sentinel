export type ChainId = 1 | 10 | 56 | 137 | 8453 | 42161 | 196;

export type ScanType = "wallet" | "token" | "transaction" | "approval" | "policy";

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export type FindingCategory =
  | "approval"
  | "contract"
  | "token"
  | "transaction"
  | "wallet"
  | "liquidity"
  | "ownership"
  | "proxy"
  | "spam"
  | "data-quality";

export interface RiskFinding {
  id: string;
  title: string;
  severity: FindingSeverity;
  category: FindingCategory;
  description: string;
  evidence?: Record<string, unknown>;
  recommendation?: string;
}

export interface RiskResponse {
  tool: string;
  chainId: ChainId;
  riskScore: number;
  riskLevel: RiskLevel;
  summary: string;
  findings: RiskFinding[];
  recommendedActions: string[];
  confidence: number;
  dataSourcesUsed: string[];
  limitations: string[];
  metadata?: Record<string, unknown>;
}

export interface WalletScanResponse extends RiskResponse {
  tool: "scan_wallet";
  metadata: {
    address: string;
    nativeBalance: string;
    accountType: "eoa" | "contract" | "unknown";
    liveOnchainReads: {
      nativeBalance: boolean;
      accountCode: boolean;
      approvalInventory: boolean;
    };
    suspiciousApprovals: ApprovalFinding[];
    highRiskTokenHoldings: TokenHoldingFinding[];
    recentlyInteractedContracts: ContractInteractionFinding[];
    dustingIndicators: string[];
  };
}

export interface TokenScanResponse extends RiskResponse {
  tool: "scan_token";
  metadata: {
    tokenAddress: string;
    token: TokenMetadata;
    verificationStatus: "verified" | "unverified" | "unknown";
    proxyRisk: "none-detected" | "possible-proxy" | "upgradeable-proxy" | "unknown";
    ownerAdminRisk: "low" | "medium" | "high" | "unknown";
    detectedFunctions: string[];
    adminAddresses: string[];
    implementationAddress?: string;
    liveOnchainReads: {
      metadata: boolean;
      bytecode: boolean;
      proxySlots: boolean;
      adminFunctions: boolean;
    };
    liquidity: PlaceholderMetric;
    holderConcentration: PlaceholderMetric;
  };
}

export interface TransactionExplainResponse extends RiskResponse {
  tool: "explain_transaction";
  metadata: {
    actionType: TransactionActionType;
    assetsAtRisk: string[];
    permissionChanges: string[];
    destination?: string;
    decodedSelector?: string;
    transactionIntent: string;
  };
}

export interface ApprovalAnalyzeResponse extends RiskResponse {
  tool: "analyze_approval";
  metadata: {
    wallet: string;
    tokenAddress: string;
    spender: string;
    spenderReputation: "known" | "unknown" | "suspicious";
    approvalAssessment: "leave-alone" | "reduce" | "revoke";
    liveOnchainReads: {
      allowance: boolean;
    };
    revokePlan: RevokePlan;
  };
}

export interface RevokePlanResponse extends RiskResponse {
  tool: "generate_revoke_plan";
  metadata: {
    wallet: string;
    approvals: RevokePlan[];
  };
}

export type PolicyDecision = "allow" | "review" | "block";

export interface ActionPolicyInput {
  txData: string;
  chainId: ChainId;
  wallet?: string;
  agentId?: string;
  actionValueUsd?: number;
  policy?: {
    maxAllowedRiskScore?: number;
    requireReviewAbove?: number;
    blockUnlimitedApprovals?: boolean;
    spendLimitUsd?: number;
  };
}

export interface ActionPolicyResponse extends RiskResponse {
  tool: "evaluate_action_policy";
  metadata: {
    decision: PolicyDecision;
    signingMode: "external-wallet-required";
    custody: "none";
    automaticSigning: false;
    agentId?: string;
    wallet?: string;
    actionValueUsd?: number;
    policyApplied: {
      maxAllowedRiskScore: number;
      requireReviewAbove: number;
      blockUnlimitedApprovals: boolean;
      spendLimitUsd?: number;
    };
    signingHandoff: {
      status: "ready" | "not-recommended";
      reason: string;
      instructions: string[];
    };
  };
}

export interface ApprovalFinding {
  tokenAddress: string;
  tokenSymbol: string;
  spender: string;
  spenderLabel: string;
  allowance: string;
  risk: RiskLevel;
  reason: string;
}

export interface TokenHoldingFinding {
  tokenAddress: string;
  symbol: string;
  balance: string;
  risk: RiskLevel;
  reason: string;
}

export interface ContractInteractionFinding {
  contractAddress: string;
  label: string;
  lastSeen: string;
  risk: RiskLevel;
  reason: string;
}

export interface TokenMetadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply?: string;
}

export interface PlaceholderMetric {
  status: "live" | "estimated" | "unavailable";
  value?: string;
  note: string;
}

export type TransactionActionType =
  | "approval"
  | "swap"
  | "transfer"
  | "bridge"
  | "mint"
  | "claim"
  | "unknown";

export interface RevokePlan {
  tokenAddress: string;
  spender: string;
  currentAllowance: string;
  recommendedAllowance: "0" | "limited" | "unchanged";
  action: "revoke" | "reduce" | "monitor";
  rationale: string;
  steps: string[];
}

export interface ScanContext {
  chainId: ChainId;
  now: Date;
}

export interface WalletScanInput {
  address: string;
  chainId: ChainId;
}

export interface TokenScanInput {
  tokenAddress: string;
  chainId: ChainId;
}

export interface TransactionExplainInput {
  txData: string;
  chainId: ChainId;
}

export interface ApprovalAnalyzeInput {
  wallet: string;
  tokenAddress: string;
  spender: string;
  chainId: ChainId;
}

export interface RevokePlanInput {
  wallet: string;
  chainId: ChainId;
}
