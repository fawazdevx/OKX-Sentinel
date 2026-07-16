import type { ChainId } from "./types";

export interface ChainConfig {
  id: ChainId;
  name: string;
  shortName: string;
  explorerBaseUrl: string;
  rpcEnvVar: string;
  nativeCurrency: string;
}

export const supportedChains: ChainConfig[] = [
  {
    id: 1,
    name: "Ethereum",
    shortName: "ETH",
    explorerBaseUrl: "https://etherscan.io",
    rpcEnvVar: "ETHEREUM_RPC_URL",
    nativeCurrency: "ETH"
  },
  {
    id: 196,
    name: "OKX X Layer",
    shortName: "X Layer",
    explorerBaseUrl: "https://www.oklink.com/xlayer",
    rpcEnvVar: "XLAYER_RPC_URL",
    nativeCurrency: "OKB"
  },
  {
    id: 8453,
    name: "Base",
    shortName: "BASE",
    explorerBaseUrl: "https://basescan.org",
    rpcEnvVar: "BASE_RPC_URL",
    nativeCurrency: "ETH"
  },
  {
    id: 42161,
    name: "Arbitrum",
    shortName: "ARB",
    explorerBaseUrl: "https://arbiscan.io",
    rpcEnvVar: "ARBITRUM_RPC_URL",
    nativeCurrency: "ETH"
  },
  {
    id: 137,
    name: "Polygon",
    shortName: "POL",
    explorerBaseUrl: "https://polygonscan.com",
    rpcEnvVar: "POLYGON_RPC_URL",
    nativeCurrency: "POL"
  },
  {
    id: 56,
    name: "BNB Chain",
    shortName: "BNB",
    explorerBaseUrl: "https://bscscan.com",
    rpcEnvVar: "BNB_RPC_URL",
    nativeCurrency: "BNB"
  },
  {
    id: 10,
    name: "Optimism",
    shortName: "OP",
    explorerBaseUrl: "https://optimistic.etherscan.io",
    rpcEnvVar: "OPTIMISM_RPC_URL",
    nativeCurrency: "ETH"
  }
];

export const defaultChainId: ChainId = 196;

export function getChainConfig(chainId: ChainId): ChainConfig {
  const chain = supportedChains.find((item) => item.id === chainId);

  if (!chain) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }

  return chain;
}

export function isSupportedChainId(value: number): value is ChainId {
  return supportedChains.some((chain) => chain.id === value);
}
