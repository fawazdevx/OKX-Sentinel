import { getAddress, isAddress } from "viem";
import { getKnownEntity, isKnownSuspicious } from "../../shared/knownEntities";
import { confidenceFromSources, findingToScore, riskLevelFromScore, strongestFinding, summarizeRisk } from "../../shared/scoring";
import type { ChainId, RiskFinding, TokenMetadata, TokenScanInput, TokenScanResponse } from "../../shared/types";
import { getRpcProvider, shouldAttemptLiveRpc } from "../providers/rpc";
import { buildDataSources, riskFinding, standardLimitations, validateChainId, validateEvmAddress } from "./common";

const erc20Abi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }]
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }]
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }]
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  }
] as const;

const ownerAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  }
] as const;

const getOwnerAbi = [
  {
    type: "function",
    name: "getOwner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  }
] as const;

const adminAbi = [
  {
    type: "function",
    name: "admin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  }
] as const;

const eip1967ImplementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const eip1967AdminSlot = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

const signatureIndicators = {
  mint: ["0x40c10f19", "mint(address,uint256)"],
  pause: ["0x8456cb59", "pause()"],
  unpause: ["0x3f4ba83a", "unpause()"],
  blacklist: ["0xf9f92be4", "blacklist(address)"],
  setTax: ["0x6d6fefbd", "setTax(uint256)"],
  owner: ["0x8da5cb5b", "owner()"],
  admin: ["0xf851a440", "admin()"],
  implementation: ["0x5c60da1b", "implementation()"]
};

export async function scanToken(input: TokenScanInput): Promise<TokenScanResponse> {
  const chainId = validateChainId(input.chainId);
  const tokenAddress = validateEvmAddress(input.tokenAddress, "tokenAddress");
  const rpc = getRpcProvider(chainId);
  const sources = buildDataSources(chainId, [rpc.source, "erc20-metadata-read", "bytecode-signature-heuristics"]);
  const findings: RiskFinding[] = [];
  const token = await readTokenMetadata(tokenAddress, chainId);
  const bytecode = await readBytecode(tokenAddress, chainId);
  const controlIntel = await readTokenControlIntel(tokenAddress, chainId);
  const codeKnown = typeof bytecode === "string" && bytecode !== "0x";
  const knownEntity = getKnownEntity(tokenAddress, chainId);
  const detectedFunctions = detectFunctionIndicators(bytecode);

  const verificationStatus = "unknown";

  if (!codeKnown) {
    findings.push(
      riskFinding(
        "token.bytecode-unavailable",
        "Contract bytecode unavailable",
        "medium",
        "data-quality",
        "The scanner could not confirm contract bytecode from the configured RPC. This may be an RPC limitation or an invalid contract address.",
        "Verify the token address in an explorer before interacting."
      )
    );
  }

  const proxyRisk = controlIntel.implementationAddress || detectedFunctions.includes("implementation()") ? "upgradeable-proxy" : "unknown";
  if (proxyRisk === "upgradeable-proxy") {
    findings.push(
      riskFinding(
        "token.proxy-upgradeable",
        "Upgradeable proxy control detected",
        "high",
        "proxy",
        "The token appears to expose implementation/admin style controls or matches a known upgradeable risk pattern.",
        "Treat balances and approvals as mutable-risk until admin controls are reviewed.",
        { detectedFunctions: detectedFunctions.filter((item) => item.includes("implementation") || item.includes("admin")) }
      )
    );
  }

  if (controlIntel.adminAddresses.length > 0) {
    findings.push(
      riskFinding(
        "token.admin-controls",
        "Owner or admin control detected",
        proxyRisk === "upgradeable-proxy" ? "high" : "medium",
        "ownership",
        "The token or proxy exposes owner/admin control addresses from live contract reads.",
        "Review owner/admin reputation, multisig policy, and upgrade history before trusting the token.",
        { adminAddresses: controlIntel.adminAddresses, implementationAddress: controlIntel.implementationAddress }
      )
    );
  }

  const dangerousFunctions = detectedFunctions.filter((item) =>
    ["mint(address,uint256)", "pause()", "blacklist(address)", "setTax(uint256)"].includes(item)
  );

  if (dangerousFunctions.length > 0) {
    findings.push(
      riskFinding(
        "token.privileged-functions",
        "Privileged token controls detected",
        dangerousFunctions.length >= 3 ? "critical" : "high",
        "ownership",
        "The token exposes functions commonly used for supply changes, trading pauses, wallet restrictions, or transfer tax changes.",
        "Review owner/admin addresses and avoid unlimited approval exposure.",
        { dangerousFunctions }
      )
    );
  }

  if (isKnownSuspicious(tokenAddress, chainId)) {
    findings.push(
      riskFinding(
        "token.known-risk",
        "Known risky token pattern",
        "critical",
        "token",
        `${knownEntity?.label ?? "This token"} is present in the local risk registry.`,
        "Do not buy, approve, or route through this token until the risk registry entry is independently reviewed."
      )
    );
  }

  findings.push(
    riskFinding(
      "token.liquidity-placeholder",
      "Liquidity and holder data require deep scan",
      "info",
      "liquidity",
      "Live liquidity depth and holder concentration are exposed as placeholders unless explorer or DEX APIs are configured.",
      "Use the paid deep scan path for pool, top-holder, and exchange-listing enrichment."
    )
  );

  const riskScore = findingToScore(findings, 10);
  const riskLevel = riskLevelFromScore(riskScore);
  const ownerAdminRisk =
    dangerousFunctions.length >= 3 || (proxyRisk === "upgradeable-proxy" && controlIntel.adminAddresses.length > 0)
      ? "high"
      : dangerousFunctions.length > 0 || controlIntel.adminAddresses.length > 0
        ? "medium"
        : "unknown";
  const summary = summarizeRisk(riskScore, `${token.symbol} token`, strongestFinding(findings));

  return {
    tool: "scan_token",
    chainId,
    riskScore,
    riskLevel,
    summary,
    findings,
    recommendedActions: buildTokenActions(riskLevel, dangerousFunctions, proxyRisk),
    confidence: confidenceFromSources(sources.length, Boolean(rpc.usedConfiguredRpc || codeKnown), codeKnown ? 0.08 : 0.18),
    dataSourcesUsed: sources,
    limitations: [
      ...standardLimitations,
      "Verification status is heuristic unless explorer API keys are configured.",
      "Liquidity and holder concentration are intentionally conservative placeholders in the MVP."
    ],
    metadata: {
      tokenAddress: getAddress(tokenAddress),
      token,
      verificationStatus,
      proxyRisk,
      ownerAdminRisk,
      detectedFunctions,
      adminAddresses: controlIntel.adminAddresses,
      implementationAddress: controlIntel.implementationAddress,
      liveOnchainReads: {
        metadata: token.symbol !== "UNKNOWN",
        bytecode: codeKnown,
        proxySlots: controlIntel.proxySlotsRead,
        adminFunctions: controlIntel.adminFunctionsRead
      },
      liquidity: {
        status: "unavailable",
        note: "DEX liquidity enrichment is available in the paid deep scan tier."
      },
      holderConcentration: {
        status: "unavailable",
        note: "Top-holder concentration requires explorer or indexer API configuration."
      }
    }
  };
}

interface TokenControlIntel {
  adminAddresses: string[];
  implementationAddress?: string;
  proxySlotsRead: boolean;
  adminFunctionsRead: boolean;
}

async function readTokenControlIntel(tokenAddress: string, chainId: ChainId): Promise<TokenControlIntel> {
  const rpc = getRpcProvider(chainId);

  if (!rpc.client || !shouldAttemptLiveRpc(chainId) || !isAddress(tokenAddress)) {
    return {
      adminAddresses: [],
      proxySlotsRead: false,
      adminFunctionsRead: false
    };
  }

  const adminAddresses = new Set<string>();
  let implementationAddress: string | undefined;
  let proxySlotsRead = false;
  let adminFunctionsRead = false;

  try {
    const [implementationSlotValue, adminSlotValue] = await withTimeout(Promise.all([
      rpc.client.getStorageAt({ address: getAddress(tokenAddress), slot: eip1967ImplementationSlot }),
      rpc.client.getStorageAt({ address: getAddress(tokenAddress), slot: eip1967AdminSlot })
    ]), 1800);

    proxySlotsRead = true;
    implementationAddress = slotToAddress(implementationSlotValue);
    const proxyAdmin = slotToAddress(adminSlotValue);
    if (proxyAdmin) adminAddresses.add(proxyAdmin);
  } catch {
    proxySlotsRead = false;
  }

  const adminFunctionResults = await Promise.all([
    readAddressFunction(tokenAddress, chainId, ownerAbi, "owner"),
    readAddressFunction(tokenAddress, chainId, getOwnerAbi, "getOwner"),
    readAddressFunction(tokenAddress, chainId, adminAbi, "admin")
  ]);

  for (const result of adminFunctionResults) {
    if (result.succeeded) {
      adminFunctionsRead = true;
      if (result.address) adminAddresses.add(result.address);
    }
  }

  return {
    adminAddresses: [...adminAddresses],
    implementationAddress,
    proxySlotsRead,
    adminFunctionsRead
  };
}

async function readAddressFunction(
  tokenAddress: string,
  chainId: ChainId,
  abi: unknown,
  functionName: string
): Promise<{ succeeded: boolean; address?: string }> {
  const rpc = getRpcProvider(chainId);

  if (!rpc.client || !shouldAttemptLiveRpc(chainId)) {
    return { succeeded: false };
  }

  try {
    const result = await withTimeout(rpc.client.readContract({
      address: getAddress(tokenAddress),
      abi,
      functionName
    }), 1200);

    return {
      succeeded: true,
      address: typeof result === "string" && isAddress(result) && !isZeroAddress(result) ? getAddress(result) : undefined
    };
  } catch {
    return { succeeded: false };
  }
}

async function readTokenMetadata(tokenAddress: string, chainId: ChainId): Promise<TokenMetadata> {
  const rpc = getRpcProvider(chainId);

  if (!rpc.client || !shouldAttemptLiveRpc(chainId) || !isAddress(tokenAddress)) {
    return fallbackMetadata(tokenAddress);
  }

  const [name, symbol, decimals, totalSupply] = await Promise.all([
    readContractField(rpc.client.readContract({ address: getAddress(tokenAddress), abi: erc20Abi, functionName: "name" }), 1400),
    readContractField(rpc.client.readContract({ address: getAddress(tokenAddress), abi: erc20Abi, functionName: "symbol" }), 1400),
    readContractField(rpc.client.readContract({ address: getAddress(tokenAddress), abi: erc20Abi, functionName: "decimals" }), 1400),
    readContractField(rpc.client.readContract({ address: getAddress(tokenAddress), abi: erc20Abi, functionName: "totalSupply" }), 1400)
  ]);

  return {
    address: getAddress(tokenAddress),
    name: typeof name === "string" ? name : "Unknown Token",
    symbol: typeof symbol === "string" ? symbol : "UNKNOWN",
    decimals: typeof decimals === "bigint" || typeof decimals === "number" ? Number(decimals) : 18,
    totalSupply: typeof totalSupply === "bigint" || typeof totalSupply === "number" || typeof totalSupply === "string" ? String(totalSupply) : undefined
  };
}

async function readBytecode(tokenAddress: string, chainId: ChainId): Promise<string | null> {
  const rpc = getRpcProvider(chainId);

  if (!rpc.client || !shouldAttemptLiveRpc(chainId) || !isAddress(tokenAddress)) {
    return null;
  }

  try {
    return (await withTimeout(rpc.client.getCode({ address: getAddress(tokenAddress) }), 1800)) ?? null;
  } catch {
    return null;
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

async function readContractField<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  try {
    return await withTimeout(promise, timeoutMs);
  } catch {
    return undefined;
  }
}

function fallbackMetadata(tokenAddress: string): TokenMetadata {
  return {
    address: getAddress(tokenAddress),
    name: "Unknown Token",
    symbol: "UNKNOWN",
    decimals: 18
  };
}

function detectFunctionIndicators(bytecode: string | null): string[] {
  const detected = new Set<string>();
  const normalizedCode = bytecode?.toLowerCase() ?? "";

  for (const [_, [selector, label]] of Object.entries(signatureIndicators)) {
    if (normalizedCode.includes(selector.replace(/^0x/, ""))) {
      detected.add(label);
    }
  }

  return [...detected];
}

function slotToAddress(value: string | null | undefined): string | undefined {
  if (!value || value === "0x" || /^0x0+$/.test(value)) {
    return undefined;
  }

  const address = `0x${value.replace(/^0x/, "").padStart(64, "0").slice(-40)}`;
  return isAddress(address) && !isZeroAddress(address) ? getAddress(address) : undefined;
}

function isZeroAddress(address: string): boolean {
  return /^0x0{40}$/i.test(address);
}

function buildTokenActions(riskLevel: string, dangerousFunctions: string[], proxyRisk: string): string[] {
  const actions = [
    "Do not treat this output as financial advice; confirm contract details before signing.",
    "Prefer limited approvals and revoke unused allowances after interaction."
  ];

  if (riskLevel === "High" || riskLevel === "Critical") {
    actions.unshift("Avoid buying or approving this token until ownership, source, and liquidity are reviewed.");
  }

  if (dangerousFunctions.length > 0) {
    actions.push("Review mint, pause, blacklist, and tax permissions before routing trades through the token.");
  }

  if (proxyRisk === "upgradeable-proxy") {
    actions.push("Check proxy admin and upgrade history before assuming contract behavior is stable.");
  }

  return actions;
}
