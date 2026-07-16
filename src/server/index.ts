import cors from "cors";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { defaultChainId, isSupportedChainId, supportedChains } from "../shared/chains";
import { exampleInputs } from "../shared/examples";
import type { ChainId, RiskResponse } from "../shared/types";
import { buildPricing, maybeRequirePayment, paidToolCatalog, type PaidToolName } from "./payments";
import { analyzeApproval, generateRevokePlan } from "./scanners/approvalScanner";
import { evaluateActionPolicy } from "./scanners/policyScanner";
import { explainTransaction } from "./scanners/transactionScanner";
import { scanToken } from "./scanners/tokenScanner";
import { scanWallet } from "./scanners/walletScanner";
import { buildTelemetrySummary, recordToolTelemetry, type TelemetryTrack } from "./telemetry";

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const chainIdSchema = z
  .number()
  .int()
  .refine((chainId): chainId is ChainId => isSupportedChainId(chainId), "Unsupported chainId");

const walletScanSchema = z.object({
  address: z.string().min(1),
  chainId: chainIdSchema.default(defaultChainId)
});

const tokenScanSchema = z.object({
  tokenAddress: z.string().min(1),
  chainId: chainIdSchema.default(defaultChainId)
});

const transactionExplainSchema = z.object({
  txData: z.string().min(1),
  chainId: chainIdSchema.default(defaultChainId)
});

const approvalAnalyzeSchema = z.object({
  wallet: z.string().min(1),
  tokenAddress: z.string().min(1),
  spender: z.string().min(1),
  chainId: chainIdSchema.default(defaultChainId)
});

const revokePlanSchema = z.object({
  wallet: z.string().min(1),
  chainId: chainIdSchema.default(defaultChainId)
});

const actionPolicySchema = z.object({
  txData: z.string().min(1),
  chainId: chainIdSchema.default(defaultChainId),
  wallet: z.string().optional(),
  agentId: z.string().optional(),
  policy: z
    .object({
      maxAllowedRiskScore: z.number().min(0).max(100).optional(),
      requireReviewAbove: z.number().min(0).max(100).optional(),
      blockUnlimitedApprovals: z.boolean().optional(),
      spendLimitUsd: z.number().positive().optional()
    })
    .optional()
});

const mcpRequestSchema = z.object({
  jsonrpc: z.literal("2.0").optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.unknown().optional()
});

const mcpToolCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()).default({})
});

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "OKX Sentinel",
    version: "0.1.0",
    chains: supportedChains
  });
});

app.get("/api/chains", (_request, response) => {
  response.json({
    chains: supportedChains,
    defaultChainId
  });
});

app.get("/api/examples", (_request, response) => {
  response.json({
    mode: "examples",
    tagline: "OKX Sentinel is a pre-transaction risk firewall for wallets, tokens, approvals, and AI agents.",
    inputs: exampleInputs
  });
});

app.get("/api/demo", (_request, response) => {
  response.json({
    mode: "examples",
    tagline: "Compatibility alias for /api/examples. Inputs use real public addresses, not generated wallet inventory.",
    inputs: exampleInputs
  });
});

app.get("/api/manifest", (_request, response) => {
  response.json(buildToolManifest());
});

app.get("/api/mcp/manifest", (_request, response) => {
  response.json(buildToolManifest());
});

app.get("/api/pricing", (_request, response) => {
  response.json(buildPricing());
});

app.get("/api/metrics", (_request, response) => {
  response.json(buildTelemetrySummary());
});

app.get("/api/traction", (_request, response) => {
  response.json(buildTelemetrySummary());
});

app.get("/api/asp/readiness", (_request, response) => {
  response.json(buildAspReadiness());
});

app.get("/.well-known/okx-sentinel.json", (_request, response) => {
  response.json(buildAspReadiness());
});

app.post("/api/scan/wallet", asyncHandler(async (request) => callTool("scan_wallet", request.body), { source: "dashboard-rest" }));
app.post("/api/scan/token", asyncHandler(async (request) => callTool("scan_token", request.body), { source: "dashboard-rest" }));
app.post("/api/explain/transaction", asyncHandler(async (request) => callTool("explain_transaction", request.body), { source: "dashboard-rest" }));
app.post("/api/analyze/approval", asyncHandler(async (request) => callTool("analyze_approval", request.body), { source: "dashboard-rest" }));
app.post("/api/revoke-plan", asyncHandler(async (request) => callTool("generate_revoke_plan", request.body), { source: "dashboard-rest" }));
app.post("/api/policy/evaluate", asyncHandler(async (request) => callTool("evaluate_action_policy", request.body), { source: "dashboard-rest" }));

app.post("/api/tools/scan_wallet", asyncHandler(async (request) => callTool("scan_wallet", request.body), { source: "agent-rest" }));
app.post("/api/tools/scan_token", asyncHandler(async (request) => callTool("scan_token", request.body), { source: "agent-rest" }));
app.post("/api/tools/explain_transaction", asyncHandler(async (request) => callTool("explain_transaction", request.body), { source: "agent-rest" }));
app.post("/api/tools/analyze_approval", asyncHandler(async (request) => callTool("analyze_approval", request.body), { source: "agent-rest" }));
app.post("/api/tools/generate_revoke_plan", asyncHandler(async (request) => callTool("generate_revoke_plan", request.body), { source: "agent-rest" }));
app.post("/api/tools/evaluate_action_policy", asyncHandler(async (request) => callTool("evaluate_action_policy", request.body), { source: "agent-rest" }));

app.post("/api/premium/tools/deep_scan_wallet", paidAsyncHandler("deep_scan_wallet", async (request) => callTool("scan_wallet", request.body)));
app.post("/api/premium/tools/deep_scan_token", paidAsyncHandler("deep_scan_token", async (request) => callTool("scan_token", request.body)));
app.post("/api/premium/tools/premium_explain_transaction", paidAsyncHandler("premium_explain_transaction", async (request) => callTool("explain_transaction", request.body)));
app.post("/api/premium/tools/premium_analyze_approval", paidAsyncHandler("premium_analyze_approval", async (request) => callTool("analyze_approval", request.body)));
app.post("/api/premium/tools/premium_generate_revoke_plan", paidAsyncHandler("premium_generate_revoke_plan", async (request) => callTool("generate_revoke_plan", request.body)));
app.post("/api/premium/tools/evaluate_action_policy", paidAsyncHandler("evaluate_action_policy", async (request) => callTool("evaluate_action_policy", request.body)));

app.post("/api/mcp", mcpHandler(false));
app.post("/api/premium/mcp", mcpHandler(true));

app.use((error: unknown, _request: Request, response: Response, _next: unknown) => {
  const statusCode = error instanceof z.ZodError ? 400 : 500;
  const message = error instanceof z.ZodError ? error.errors.map((item) => item.message).join("; ") : error instanceof Error ? error.message : "Unexpected server error";

  response.status(statusCode).json({
    error: {
      message,
      statusCode
    }
  });
});

app.listen(port, () => {
  console.log(`OKX Sentinel API listening on http://localhost:${port}`);
});

function asyncHandler(handler: (request: Request) => Promise<RiskResponse>, options: { source: string; track?: TelemetryTrack } = { source: "rest" }) {
  return async (request: Request, response: Response, next: (error: unknown) => void) => {
    try {
      const result = await handler(request);
      recordToolTelemetry({
        request,
        result,
        track: options.track ?? "free-rest",
        source: options.source
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  };
}

function paidAsyncHandler(tool: PaidToolName, handler: (request: Request) => Promise<RiskResponse>) {
  return async (request: Request, response: Response, next: (error: unknown) => void) => {
    try {
      if (!maybeRequirePayment(request, response, tool)) {
        return;
      }

      const result = await handler(request);
      recordToolTelemetry({
        request,
        result,
        track: "premium-rest",
        source: "premium-rest",
        paidTool: tool
      });
      response.json({
        ...result,
        billing: {
          track: "A2MCP",
          paymentStandard: "x402",
          tool,
          mode: process.env.OKX_SENTINEL_PAYMENT_MODE ?? "demo"
        }
      });
    } catch (error) {
      next(error);
    }
  };
}

function mcpHandler(premium: boolean) {
  return async (request: Request, response: Response, next: (error: unknown) => void) => {
    try {
      const parsed = mcpRequestSchema.parse(request.body);
      const id = parsed.id ?? null;

      if (parsed.method === "initialize") {
        response.json(mcpSuccess(id, {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "OKX Sentinel",
            version: "0.1.0"
          },
          capabilities: {
            tools: {},
            resources: {}
          }
        }));
        return;
      }

      if (parsed.method === "ping") {
        response.json(mcpSuccess(id, { status: "ok" }));
        return;
      }

      if (parsed.method === "tools/list") {
        response.json(mcpSuccess(id, { tools: buildMcpTools() }));
        return;
      }

      if (parsed.method === "sentinel/metrics") {
        response.json(mcpSuccess(id, buildTelemetrySummary()));
        return;
      }

      if (parsed.method !== "tools/call") {
        response.json(mcpError(id, -32601, `Unsupported MCP method: ${parsed.method}`));
        return;
      }

      const toolCall = mcpToolCallSchema.parse(parsed.params);
      const paidTool = paidToolForMcpTool(toolCall.name);

      if (premium) {
        if (!paidTool) {
          response.json(mcpError(id, -32602, `Tool ${toolCall.name} is not configured for premium MCP billing.`));
          return;
        }

        if (!maybeRequirePayment(request, response, paidTool)) {
          return;
        }
      }

      const result = await callTool(toolCall.name, toolCall.arguments);
      recordToolTelemetry({
        request,
        result,
        track: premium ? "premium-mcp" : "mcp",
        source: premium ? "premium-mcp-json-rpc" : "mcp-json-rpc",
        paidTool: premium ? paidTool : undefined
      });

      response.json(mcpSuccess(id, {
        content: [
          {
            type: "text",
            text: result.summary
          },
          {
            type: "json",
            json: result
          }
        ],
        structuredContent: premium
          ? {
              ...result,
              billing: {
                track: "A2MCP",
                paymentStandard: "x402",
                tool: paidTool,
                mode: process.env.OKX_SENTINEL_PAYMENT_MODE ?? "demo"
              }
            }
          : result
      }));
    } catch (error) {
      next(error);
    }
  };
}

async function callTool(name: string, args: unknown): Promise<RiskResponse> {
  switch (name) {
    case "scan_wallet":
      return scanWallet(walletScanSchema.parse(args));
    case "scan_token":
      return scanToken(tokenScanSchema.parse(args));
    case "explain_transaction":
      return explainTransaction(transactionExplainSchema.parse(args));
    case "analyze_approval":
      return analyzeApproval(approvalAnalyzeSchema.parse(args));
    case "generate_revoke_plan":
      return generateRevokePlan(revokePlanSchema.parse(args));
    case "evaluate_action_policy":
      return evaluateActionPolicy(actionPolicySchema.parse(args));
    default:
      throw new Error(`Unknown OKX Sentinel tool: ${name}`);
  }
}

function paidToolForMcpTool(name: string): PaidToolName | undefined {
  const mapping: Record<string, PaidToolName> = {
    scan_wallet: "deep_scan_wallet",
    scan_token: "deep_scan_token",
    explain_transaction: "premium_explain_transaction",
    analyze_approval: "premium_analyze_approval",
    generate_revoke_plan: "premium_generate_revoke_plan",
    evaluate_action_policy: "evaluate_action_policy"
  };

  return mapping[name];
}

function mcpSuccess(id: string | number | null, result: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function mcpError(id: string | number | null, code: number, message: string) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  };
}

function buildMcpTools() {
  return buildToolDefinitions().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));
}

function buildToolManifest() {
  return {
    name: "OKX Sentinel",
    slug: "okx-sentinel",
    tagline: "Pre-transaction risk firewall for wallets, tokens, approvals, and AI agents.",
    positioning: "Agent Service Provider for OKX.AI users and crypto agents that need structured pre-signing risk checks.",
    recommendedTrack: "A2MCP",
    whyA2MCP:
      "Sentinel risk checks are standardized API calls with deterministic JSON outputs, fixed per-call pricing, and automatic agent usage. A2A remains useful for premium manual audit reports.",
    custody: false,
    privateKeyHandling: false,
    automaticSigning: false,
    signingStrategy:
      "External signing handoff only. Sentinel returns allow/review/block decisions and instructions for OKX Agentic Wallet or the user's wallet; it never stores keys or signs transactions.",
    x402: {
      requiredForProduction: true,
      premiumBasePath: "/api/premium/tools",
      paymentMode: process.env.OKX_SENTINEL_PAYMENT_MODE ?? "demo",
      paymentRecipient: process.env.OKX_SENTINEL_PAYMENT_RECIPIENT ?? "configure OKX_SENTINEL_PAYMENT_RECIPIENT",
      note: "Connect OKX Payment SDK middleware before marketplace go-live; demo mode keeps premium routes callable for local judging walkthroughs."
    },
    realOnchainCapabilities: [
      "ERC-20 metadata reads",
      "ERC-20 allowance reads for wallet-token-spender approval analysis",
      "native wallet balance reads",
      "account bytecode checks for EOA vs contract wallet detection",
      "token bytecode selector inspection",
      "EIP-1967 proxy implementation/admin slot reads",
      "owner/getOwner/admin control probes",
      "calldata selector decoding for unsigned transaction explanation"
    ],
    pricing: buildPricing(),
    paidTools: paidToolCatalog,
    mcp: {
      jsonRpcPath: "/api/mcp",
      premiumJsonRpcPath: "/api/premium/mcp",
      supportedMethods: ["initialize", "ping", "tools/list", "tools/call", "sentinel/metrics"]
    },
    tractionEndpoint: "/api/traction",
    aspReadinessEndpoint: "/api/asp/readiness",
    tools: buildToolDefinitions(),
    outputContract: {
      riskScore: "number 0-100",
      riskLevel: "Low | Medium | High | Critical",
      summary: "string",
      findings: "array",
      recommendedActions: "array",
      confidence: "number 0-1",
      dataSourcesUsed: "array",
      limitations: "array",
      policyMetadata: "evaluate_action_policy returns decision allow | review | block plus external signing handoff instructions"
    }
  };
}

function buildToolDefinitions() {
  return [
    {
      name: "scan_wallet",
      description: "Read EVM wallet balance/account context via RPC and mark wallet-wide approvals, holdings, history, and spam indicators unavailable until a live indexer is connected.",
      method: "POST",
      path: "/api/tools/scan_wallet",
      premiumPath: "/api/premium/tools/deep_scan_wallet",
      inputSchema: {
        type: "object",
        required: ["address", "chainId"],
        properties: {
          address: { type: "string", description: "EVM wallet address" },
          chainId: { type: "number", enum: supportedChains.map((chain) => chain.id) }
        }
      }
    },
    {
      name: "scan_token",
      description: "Scan an EVM token for metadata, proxy risk, owner/admin controls, dangerous functions, and liquidity/holder placeholders.",
      method: "POST",
      path: "/api/tools/scan_token",
      premiumPath: "/api/premium/tools/deep_scan_token",
      inputSchema: {
        type: "object",
        required: ["tokenAddress", "chainId"],
        properties: {
          tokenAddress: { type: "string", description: "EVM token contract address" },
          chainId: { type: "number", enum: supportedChains.map((chain) => chain.id) }
        }
      }
    },
    {
      name: "explain_transaction",
      description: "Explain unsigned calldata or intent, classify the action, flag unlimited approvals, and identify assets at risk.",
      method: "POST",
      path: "/api/tools/explain_transaction",
      premiumPath: "/api/premium/tools/premium_explain_transaction",
      inputSchema: {
        type: "object",
        required: ["txData", "chainId"],
        properties: {
          txData: { type: "string", description: "Raw calldata, unsigned transaction JSON, or transaction intent text" },
          chainId: { type: "number", enum: supportedChains.map((chain) => chain.id) }
        }
      }
    },
    {
      name: "analyze_approval",
      description: "Analyze wallet-token-spender approval risk and produce a revoke/reduce/monitor recommendation.",
      method: "POST",
      path: "/api/tools/analyze_approval",
      premiumPath: "/api/premium/tools/premium_analyze_approval",
      inputSchema: {
        type: "object",
        required: ["wallet", "tokenAddress", "spender", "chainId"],
        properties: {
          wallet: { type: "string" },
          tokenAddress: { type: "string" },
          spender: { type: "string" },
          chainId: { type: "number", enum: supportedChains.map((chain) => chain.id) }
        }
      }
    },
    {
      name: "generate_revoke_plan",
      description: "Generate a non-custodial revoke plan for a wallet without signing or broadcasting transactions.",
      method: "POST",
      path: "/api/tools/generate_revoke_plan",
      premiumPath: "/api/premium/tools/premium_generate_revoke_plan",
      inputSchema: {
        type: "object",
        required: ["wallet", "chainId"],
        properties: {
          wallet: { type: "string" },
          chainId: { type: "number", enum: supportedChains.map((chain) => chain.id) }
        }
      }
    },
    {
      name: "evaluate_action_policy",
      description: "Return a deterministic allow, review, or block decision before an OKX.AI agent asks an external wallet to sign.",
      method: "POST",
      path: "/api/tools/evaluate_action_policy",
      premiumPath: "/api/premium/tools/evaluate_action_policy",
      inputSchema: {
        type: "object",
        required: ["txData", "chainId"],
        properties: {
          txData: { type: "string", description: "Raw calldata, unsigned transaction JSON, or transaction intent text" },
          chainId: { type: "number", enum: supportedChains.map((chain) => chain.id) },
          wallet: { type: "string" },
          agentId: { type: "string" },
          policy: {
            type: "object",
            properties: {
              maxAllowedRiskScore: { type: "number" },
              requireReviewAbove: { type: "number" },
              blockUnlimitedApprovals: { type: "boolean" },
              spendLimitUsd: { type: "number" }
            }
          }
        }
      }
    }
  ];
}

function buildAspReadiness() {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  const paymentRecipient = process.env.OKX_SENTINEL_PAYMENT_RECIPIENT;
  const paymentMode = process.env.OKX_SENTINEL_PAYMENT_MODE ?? "demo";

  return {
    name: "OKX Sentinel",
    recommendedTrack: "A2MCP",
    categoryFit: ["Finance Copilot", "Software Utility", "Business Potential", "Revenue Rocket"],
    publicBaseUrl: publicBaseUrl ?? "configure PUBLIC_BASE_URL before OKX.AI listing",
    callableSurfaces: {
      restTools: "/api/tools/*",
      premiumRestTools: "/api/premium/tools/*",
      mcpJsonRpc: "/api/mcp",
      premiumMcpJsonRpc: "/api/premium/mcp",
      manifest: "/api/mcp/manifest",
      pricing: "/api/pricing",
      traction: "/api/traction"
    },
    reviewChecklist: [
      {
        item: "Clear real-world use case",
        status: "ready",
        evidence: "Pre-signing allow/review/block risk firewall for wallets, tokens, approvals, transactions, and AI agents."
      },
      {
        item: "A2MCP callable API",
        status: "ready",
        evidence: "REST tool endpoints plus MCP-style JSON-RPC tools/list and tools/call."
      },
      {
        item: "x402 payment enforcement",
        status: paymentMode === "enforce" && paymentRecipient ? "ready" : "needs-production-config",
        evidence:
          paymentMode === "enforce"
            ? "Premium endpoints reject unpaid requests unless payment proof headers are present."
            : "Set OKX_SENTINEL_PAYMENT_MODE=enforce and OKX_SENTINEL_PAYMENT_RECIPIENT before marketplace go-live."
      },
      {
        item: "No custody or automatic signing",
        status: "ready",
        evidence: "Sentinel returns external signing handoff instructions and never accepts private keys."
      },
      {
        item: "Revenue and usage proof",
        status: "ready",
        evidence: "The /api/traction endpoint reports calls, paid proof calls, blocked actions, and revenue estimates."
      },
      {
        item: "OKX.AI listing",
        status: "operator-action-required",
        evidence: "Register/list through OKX.AI with the public deployment URL and Agentic Wallet identity."
      },
      {
        item: "Public deployment",
        status: publicBaseUrl ? "ready" : "operator-action-required",
        evidence: publicBaseUrl ?? "Deploy the API and dashboard, then set PUBLIC_BASE_URL."
      }
    ]
  };
}
