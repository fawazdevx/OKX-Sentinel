# OKX.AI Listing Description

## Name

OKX Sentinel

## Tagline

Pre-transaction risk firewall for wallets, tokens, approvals, and AI agents.

## Short Description

OKX Sentinel helps OKX.AI users and crypto agents answer one question before taking onchain action: is this wallet, token, contract, approval, or transaction safe?

## Long Description

OKX Sentinel is an A2MCP Agent Service Provider security utility for pre-signing risk checks. It exposes structured REST and MCP-style JSON-RPC tools for wallet scanning, token scanning, transaction explanation, approval analysis, revoke-plan generation, and policy gating.

The service returns an agent-friendly JSON report with risk score, risk level, summary, findings, recommended actions, confidence, data sources used, and limitations. It is designed for crypto agents, finance copilots, wallets, trading bots, portfolio dashboards, and users who need fast risk triage before approvals, swaps, bridges, mints, claims, or transfers.

Sentinel does not custody funds, does not request private keys, does not sign transactions, and does not execute revokes. It provides transparent risk intelligence and safe next-step recommendations.

Recommended listing type: Agent-to-MCP.

Reason: risk checks are standardized API calls with deterministic JSON and fixed per-call pricing. Premium REST and MCP endpoints are x402-ready for OKX Payment SDK integration.

## Tool Endpoints

- `scan_wallet(address, chainId)`
- `scan_token(tokenAddress, chainId)`
- `explain_transaction(txData, chainId)`
- `analyze_approval(wallet, tokenAddress, spender, chainId)`
- `generate_revoke_plan(wallet, chainId)`
- `evaluate_action_policy(txData, chainId, wallet?, agentId?, policy?)`

## Integration URLs

- REST tools: `/api/tools/*`
- Premium REST tools: `/api/premium/tools/*`
- MCP JSON-RPC: `/api/mcp`
- Premium MCP JSON-RPC: `/api/premium/mcp`
- Manifest: `/api/mcp/manifest`
- Pricing: `/api/pricing`
- Traction metrics: `/api/traction`
- Review readiness: `/api/asp/readiness`

## Target Users

- OKX.AI users checking transactions before signing.
- AI crypto agents that need pre-action risk checks.
- Wallets and portfolio apps adding security copilot features.
- DeFi users reviewing approvals and token risk.
- Teams that need premium token or wallet research reports.

## Prize Fit

- Best Product: usable dashboard plus agent API.
- Finance Copilot: pre-action risk guidance for DeFi and trading flows.
- Software Utility: clean API endpoints and tool manifest.
- Revenue Rocket: usage-based scans and paid agent API calls.
- Business Potential: security layer for agentic crypto workflows.

## Safety Boundary

Sentinel never stores keys, never signs, never broadcasts transactions, and never executes revokes. It returns risk intelligence and external signing handoff instructions for OKX Agentic Wallet or the user's wallet.
