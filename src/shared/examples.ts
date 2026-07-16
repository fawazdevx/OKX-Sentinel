import type { ActionPolicyInput, ApprovalAnalyzeInput, ChainId, TokenScanInput, TransactionExplainInput, WalletScanInput } from "./types";

export const exampleWallet = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
export const exampleToken = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
export const exampleSpender = "0x000000000022d473030f116ddee9f6b43ac78ba3";

function encodeUnlimitedApprovalCalldata(spender: string): `0x${string}` {
  const spenderWord = spender.replace(/^0x/i, "").padStart(64, "0");
  const maxUint256Word = "f".repeat(64);

  return `0x095ea7b3${spenderWord}${maxUint256Word}`;
}

export const exampleUnlimitedApprovalCalldata = encodeUnlimitedApprovalCalldata(exampleSpender);

export const exampleInputs = {
  wallet: {
    address: exampleWallet,
    chainId: 1 as ChainId
  } satisfies WalletScanInput,
  token: {
    tokenAddress: exampleToken,
    chainId: 1 as ChainId
  } satisfies TokenScanInput,
  transaction: {
    txData: exampleUnlimitedApprovalCalldata,
    chainId: 1 as ChainId
  } satisfies TransactionExplainInput,
  approval: {
    wallet: exampleWallet,
    tokenAddress: exampleToken,
    spender: exampleSpender,
    chainId: 1 as ChainId
  } satisfies ApprovalAnalyzeInput,
  policy: {
    txData: exampleUnlimitedApprovalCalldata,
    wallet: exampleWallet,
    agentId: "okx-agent-risk-gate",
    chainId: 1 as ChainId,
    policy: {
      maxAllowedRiskScore: 64,
      requireReviewAbove: 35,
      blockUnlimitedApprovals: true,
      spendLimitUsd: 500
    }
  } satisfies ActionPolicyInput
};

export const exampleWallets = [
  {
    label: "Public EOA",
    value: exampleWallet,
    description: "Public Ethereum EOA used only as a real address for read-only wallet context."
  },
  {
    label: "Zero-activity baseline",
    value: "0x1111111111111111111111111111111111111111",
    description: "Valid EVM address for testing unavailable wallet inventory behavior."
  }
];

export const exampleTokens = [
  {
    label: "Ethereum USDC",
    value: exampleToken,
    description: "Real Ethereum mainnet USDC contract for live RPC metadata reads."
  },
  {
    label: "Address-only baseline",
    value: "0x2222222222222222222222222222222222222222",
    description: "Valid EVM address for unavailable bytecode behavior when RPC cannot confirm a token."
  }
];
