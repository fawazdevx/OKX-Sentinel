import { getAddress } from "viem";
import { confidenceFromSources, findingToScore, riskLevelFromScore, strongestFinding, summarizeRisk } from "../../shared/scoring";
import type { ApprovalFinding, ContractInteractionFinding, RiskFinding, TokenHoldingFinding, WalletScanInput, WalletScanResponse } from "../../shared/types";
import { getRpcProvider, shouldAttemptLiveRpc } from "../providers/rpc";
import { buildDataSources, riskFinding, standardLimitations, validateChainId, validateEvmAddress } from "./common";

export async function scanWallet(input: WalletScanInput): Promise<WalletScanResponse> {
  const chainId = validateChainId(input.chainId);
  const address = validateEvmAddress(input.address, "address");
  const rpc = getRpcProvider(chainId);
  const liveRpcAttempted = shouldAttemptLiveRpc(chainId);
  const [nativeBalance, accountType] = await Promise.all([
    readNativeBalance(address, chainId),
    readAccountType(address, chainId)
  ]);
  const suspiciousApprovals: ApprovalFinding[] = [];
  const highRiskTokenHoldings: TokenHoldingFinding[] = [];
  const recentlyInteractedContracts: ContractInteractionFinding[] = [];
  const dustingIndicators: string[] = [];
  const findings: RiskFinding[] = [];

  if (nativeBalance === "unknown") {
    findings.push(
      riskFinding(
        "wallet.balance-unavailable",
        "Native balance unavailable",
        "info",
        "data-quality",
        "RPC balance read was unavailable, so the scan cannot confirm this wallet's native balance.",
        "Configure a dedicated RPC endpoint or enable public RPC reads before relying on wallet balance context."
      )
    );
  }

  if (accountType === "unknown") {
    findings.push(
      riskFinding(
        "wallet.account-code-unavailable",
        "Account code unavailable",
        "info",
        "data-quality",
        "RPC bytecode read was unavailable, so the scan cannot confirm whether this address is an EOA or contract account.",
        "Configure a dedicated RPC endpoint for account-type checks."
      )
    );
  }

  if (accountType === "contract") {
    findings.push(
      riskFinding(
        "wallet.contract-account",
        "Wallet address is a contract account",
        "info",
        "wallet",
        "The scanned address has deployed bytecode. This may be a smart account, vault, multisig, or contract-controlled wallet.",
        "Confirm signer policy and module permissions before letting an AI agent automate actions from this account."
      )
    );
  }

  findings.push(
    riskFinding(
      "wallet.inventory-unavailable",
      "Wallet inventory unavailable without live indexer",
      "info",
      "data-quality",
      "Wallet-wide approvals, token holdings, recent interactions, and spam-token indicators require a live indexer. This build does not generate those fields without real data.",
      "Connect OKLink, an Etherscan-compatible approval indexer, or wallet-provider history before making wallet-wide inventory claims.",
      {
        requiredCapabilities: ["approval inventory", "token balances", "transaction history", "spam-token detection"],
        configured: hasWalletIndexerEnv()
      }
    )
  );

  const sources = buildDataSources(chainId, [liveRpcAttempted ? rpc.source : "rpc-not-configured", "wallet-indexer-unavailable"]);
  const riskScore = findingToScore(findings, 4);

  return {
    tool: "scan_wallet",
    chainId,
    riskScore,
    riskLevel: riskLevelFromScore(riskScore),
    summary: summarizeRisk(riskScore, "Wallet", strongestFinding(findings)),
    findings,
    recommendedActions: buildWalletActions(nativeBalance !== "unknown" || accountType !== "unknown"),
    confidence: confidenceFromSources(sources.length, nativeBalance !== "unknown" || accountType !== "unknown", 0.28),
    dataSourcesUsed: sources,
    limitations: [
      ...standardLimitations,
      "Wallet-wide approvals, token balances, transaction history, and spam-token detection require a live indexer integration.",
      "This scan does not generate fallback wallet inventory when live indexer data is unavailable."
    ],
    metadata: {
      address: getAddress(address),
      nativeBalance,
      accountType,
      liveOnchainReads: {
        nativeBalance: nativeBalance !== "unknown",
        accountCode: accountType !== "unknown",
        approvalInventory: false
      },
      suspiciousApprovals,
      highRiskTokenHoldings,
      recentlyInteractedContracts,
      dustingIndicators
    }
  };
}

function hasWalletIndexerEnv(): boolean {
  return Boolean(process.env.OKLINK_API_KEY || process.env.OKX_SENTINEL_WALLET_INDEXER_URL);
}

async function readNativeBalance(address: string, chainId: number): Promise<string> {
  const rpc = getRpcProvider(chainId as never);

  if (!rpc.client || !shouldAttemptLiveRpc(chainId as never)) {
    return "unknown";
  }

  try {
    const balance = await withTimeout(rpc.client.getBalance({ address: getAddress(address) }), 1500);
    return balance.toString();
  } catch {
    return "unknown";
  }
}

async function readAccountType(address: string, chainId: number): Promise<"eoa" | "contract" | "unknown"> {
  const rpc = getRpcProvider(chainId as never);

  if (!rpc.client || !shouldAttemptLiveRpc(chainId as never)) {
    return "unknown";
  }

  try {
    const code = await withTimeout(rpc.client.getCode({ address: getAddress(address) }), 1500);
    return code && code !== "0x" ? "contract" : "eoa";
  } catch {
    return "unknown";
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      windowlessTimeout(() => reject(new Error("RPC timeout")), timeoutMs);
    })
  ]);
}

function windowlessTimeout(callback: () => void, timeoutMs: number): ReturnType<typeof setTimeout> {
  return setTimeout(callback, timeoutMs);
}

function buildWalletActions(hasLiveRpcReads: boolean): string[] {
  return [
    hasLiveRpcReads
      ? "Use the live RPC account context as a baseline, then connect an approval indexer for full wallet coverage."
      : "Configure a dedicated RPC endpoint before relying on wallet account context.",
    "Connect a live approval and history indexer before making wallet-wide revoke, holding, or spam-token decisions.",
    "Run focused approval analysis on known token and spender pairs when wallet-wide inventory is unavailable."
  ];
}
