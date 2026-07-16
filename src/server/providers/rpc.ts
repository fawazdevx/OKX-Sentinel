import { createPublicClient, fallback, http } from "viem";
import { arbitrum, base, bsc, mainnet, optimism, polygon, xLayer } from "viem/chains";
import { getChainConfig } from "../../shared/chains";
import type { ChainId } from "../../shared/types";

const viemChains = {
  1: mainnet,
  10: optimism,
  56: bsc,
  137: polygon,
  196: xLayer,
  8453: base,
  42161: arbitrum
} as const;

export interface RpcProviderResult {
  client: MinimalPublicClient | null;
  source: string;
  usedConfiguredRpc: boolean;
}

interface MinimalPublicClient {
  readContract: (args: unknown) => Promise<unknown>;
  getCode: (args: { address: `0x${string}` }) => Promise<`0x${string}` | undefined | null>;
  getBalance: (args: { address: `0x${string}` }) => Promise<bigint>;
  getStorageAt: (args: { address: `0x${string}`; slot: `0x${string}` }) => Promise<`0x${string}` | undefined | null>;
}

export function shouldAttemptLiveRpc(chainId: ChainId): boolean {
  const config = getChainConfig(chainId);
  return Boolean(process.env[config.rpcEnvVar] || process.env.ENABLE_PUBLIC_RPC_READS === "true");
}

export function getRpcProvider(chainId: ChainId): RpcProviderResult {
  const config = getChainConfig(chainId);
  const configuredUrl = process.env[config.rpcEnvVar];
  const chain = viemChains[chainId];

  if (!chain) {
    return {
      client: null,
      source: "no-rpc-client",
      usedConfiguredRpc: false
    };
  }

  try {
    const transport = configuredUrl ? http(configuredUrl) : fallback([http()]);
    const client = createPublicClient({
      chain,
      transport
    });

    return {
      client: client as unknown as MinimalPublicClient,
      source: configuredUrl ? `${config.rpcEnvVar}` : "public-rpc-fallback",
      usedConfiguredRpc: Boolean(configuredUrl)
    };
  } catch {
    return {
      client: null,
      source: "rpc-client-unavailable",
      usedConfiguredRpc: false
    };
  }
}
