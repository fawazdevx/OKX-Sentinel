import type { ChainId } from "./types";

export interface KnownEntity {
  address: string;
  label: string;
  category: "safe-router" | "bridge" | "risky-spender" | "flagged-contract" | "stablecoin" | "dex" | "nft-market";
  riskAdjustment: number;
}

const entities: KnownEntity[] = [
  {
    address: "0x000000000022d473030f116ddee9f6b43ac78ba3",
    label: "Uniswap Permit2",
    category: "safe-router",
    riskAdjustment: -12
  },
  {
    address: "0x111111125421ca6dc452d289314280a0f8842a65",
    label: "1inch Aggregation Router",
    category: "dex",
    riskAdjustment: -10
  },
  {
    address: "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
    label: "0x Exchange Proxy",
    category: "dex",
    riskAdjustment: -8
  }
];

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function getKnownEntity(address: string, _chainId?: ChainId): KnownEntity | undefined {
  const normalized = normalizeAddress(address);
  return entities.find((entity) => entity.address === normalized);
}

export function getEntityLabel(address: string, chainId?: ChainId): string {
  return getKnownEntity(address, chainId)?.label ?? "Unknown contract";
}

export function isKnownSafe(address: string, chainId?: ChainId): boolean {
  const entity = getKnownEntity(address, chainId);
  return entity?.category === "safe-router" || entity?.category === "dex" || entity?.category === "bridge";
}

export function isKnownSuspicious(address: string, chainId?: ChainId): boolean {
  const entity = getKnownEntity(address, chainId);
  return entity?.category === "risky-spender" || entity?.category === "flagged-contract";
}
