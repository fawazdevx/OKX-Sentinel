# OKX Sentinel

OKX Sentinel is a pre-transaction risk firewall for wallets, tokens, approvals, and AI agents.

It is built as a hackathon-ready Agent Service Provider-style MVP for OKX.AI. The app answers one question before a user or crypto agent takes an onchain action:

> Is this wallet, token, contract, approval, or transaction safe?

The product includes a scanner-first dashboard, clean REST endpoints, MCP-style JSON-RPC tool calls, a structured tool manifest, usage/revenue telemetry, real public example inputs, transparent heuristic scoring, tests, and submission-ready business collateral.

## Features

- Wallet Risk Scanner: native balance and account type from RPC, explicit unavailable status for wallet-wide inventory until an indexer is connected, and next actions.
- Token Risk Scanner: metadata, verification posture, proxy risk, owner/admin risk, mint/pause/blacklist/tax indicators, liquidity and holder placeholders, rug-pull warnings.
- Transaction Risk Explainer: plain-English intent, assets at risk, permission changes, action classification, unlimited approval warnings, and safe next steps.
- Approval Risk Analyzer: spender reputation, excessive approval detection, revoke/reduce/monitor assessment, and a non-custodial revoke plan.
- Agent Policy Gate: deterministic `allow`, `review`, or `block` decisions before an OKX.AI agent asks for a signature.
- Agent/API Layer: REST and MCP-style tool endpoints for `scan_wallet`, `scan_token`, `explain_transaction`, `analyze_approval`, `generate_revoke_plan`, and `evaluate_action_policy`.
- A2MCP Revenue Layer: x402-ready premium endpoints with fixed per-call pricing metadata.
- Traction Meter: live `/api/traction` metrics for tool calls, MCP calls, premium calls, payment-proof calls, blocked actions, qualified revenue, projected revenue, and estimated value protected.
- Real Examples: prefilled Ethereum USDC and Permit2 examples that produce high-signal results without generated wallet intelligence.

## Safety Positioning

OKX Sentinel does not handle private keys, does not sign transactions, does not execute revokes, and does not custody funds. This is intentional: the strongest marketplace-safe version is a paid A2MCP risk firewall with external signing handoff to OKX Agentic Wallet or the user's wallet.

Every API response includes:

- `riskScore`
- `riskLevel`
- `summary`
- `findings[]`
- `recommendedActions[]`
- `confidence`
- `dataSourcesUsed`
- `limitations`

## Supported Chains

- Ethereum `1`
- OKX X Layer `196`
- Base `8453`
- Arbitrum `42161`
- Polygon `137`
- BNB Chain `56`
- Optimism `10`

## Stack

- Vite + React + TypeScript dashboard
- Express + TypeScript API
- viem for EVM reads
- Zod request validation
- Vitest scoring tests
- Modular scanner architecture

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Frontend: `http://localhost:5173`

API: `http://localhost:8787`

The app runs without API keys, but live onchain fields stay unavailable until RPC or indexer access is configured. Add RPC URLs in `.env` for real onchain reads:

```bash
XLAYER_RPC_URL=
ETHEREUM_RPC_URL=
BASE_RPC_URL=
ARBITRUM_RPC_URL=
POLYGON_RPC_URL=
BNB_RPC_URL=
OPTIMISM_RPC_URL=
```

For local experimentation, you can allow public RPC reads:

```bash
ENABLE_PUBLIC_RPC_READS=true
```

Production and hackathon judging should use dedicated RPC URLs for reliability.

For A2MCP monetization walkthroughs:

```bash
OKX_SENTINEL_PAYMENT_MODE=demo
OKX_SENTINEL_PAYMENT_RECIPIENT=0xYourXLayerRecipient
PUBLIC_BASE_URL=https://your-deployed-api.example
OKX_SENTINEL_TELEMETRY_FILE=/tmp/okx-sentinel-events.ndjson
```

Set `OKX_SENTINEL_PAYMENT_MODE=enforce` only after OKX Payment SDK/x402 middleware is connected. In enforce mode, premium endpoints return HTTP `402 Payment Required` unless a payment proof header is present.

## API Examples

Health:

```bash
curl http://localhost:8787/api/health
```

Wallet scan:

```bash
curl -X POST http://localhost:8787/api/tools/scan_wallet \
  -H "Content-Type: application/json" \
  -d '{"address":"0xd8da6bf26964af9d7eed9e03e53415d37aa96045","chainId":1}'
```

Token scan:

```bash
curl -X POST http://localhost:8787/api/tools/scan_token \
  -H "Content-Type: application/json" \
  -d '{"tokenAddress":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","chainId":1}'
```

Transaction explanation:

```bash
curl -X POST http://localhost:8787/api/tools/explain_transaction \
  -H "Content-Type: application/json" \
  -d '{"txData":"0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","chainId":1}'
```

Approval analysis:

```bash
curl -X POST http://localhost:8787/api/tools/analyze_approval \
  -H "Content-Type: application/json" \
  -d '{"wallet":"0xd8da6bf26964af9d7eed9e03e53415d37aa96045","tokenAddress":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","spender":"0x000000000022d473030f116ddee9f6b43ac78ba3","chainId":1}'
```

Policy gate:

```bash
curl -X POST http://localhost:8787/api/tools/evaluate_action_policy \
  -H "Content-Type: application/json" \
  -d '{"txData":"0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","chainId":1,"agentId":"okx-agent-risk-gate","policy":{"maxAllowedRiskScore":64,"requireReviewAbove":35,"blockUnlimitedApprovals":true}}'
```

Premium x402-ready policy gate:

```bash
curl -X POST http://localhost:8787/api/premium/tools/evaluate_action_policy \
  -H "Content-Type: application/json" \
  -H "X-Payment: demo-proof" \
  -d '{"txData":"transfer 10 USDC to a known settlement wallet","chainId":8453}'
```

MCP-style tool call:

```bash
curl -X POST http://localhost:8787/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"evaluate_action_policy","arguments":{"txData":"0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","chainId":1,"agentId":"okx-agent-risk-gate","policy":{"maxAllowedRiskScore":64,"requireReviewAbove":35,"blockUnlimitedApprovals":true,"spendLimitUsd":500}}}}'
```

Premium MCP-style tool call:

```bash
curl -X POST http://localhost:8787/api/premium/mcp \
  -H "Content-Type: application/json" \
  -H "X-Payment: demo-proof" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"evaluate_action_policy","arguments":{"txData":"transfer 10 USDC to a known settlement wallet","chainId":8453,"policy":{"maxAllowedRiskScore":64,"requireReviewAbove":35,"blockUnlimitedApprovals":true,"spendLimitUsd":1000}}}}'
```

Tool manifest:

```bash
curl http://localhost:8787/api/manifest
```

MCP-style manifest alias:

```bash
curl http://localhost:8787/api/mcp/manifest
```

Pricing:

```bash
curl http://localhost:8787/api/pricing
```

Traction and readiness:

```bash
curl http://localhost:8787/api/traction
curl http://localhost:8787/api/asp/readiness
```

## OKX.AI ASP Positioning

Recommended track: **A2MCP**.

Why: Sentinel is a standardized API service with deterministic JSON outputs, fixed per-call pricing, and automatic agent usage. A2A is better reserved as an upsell for manual audit/research reports.

OKX Sentinel can be listed as an Agent Service Provider that gives OKX.AI users and crypto agents a structured pre-signing risk check. It is especially useful before:

- Allowing an AI agent to submit a transaction.
- Approving a new token spender.
- Interacting with an unknown token or claim contract.
- Bridging or swapping through a new route.
- Reviewing a wallet after suspicious activity.
- Letting an agent decide whether to allow, review, or block an action.

The API contract is intentionally agent-friendly: deterministic JSON, explicit confidence, source attribution, limitations, and clear recommended actions.

## Real Onchain Capabilities

When RPC is configured, Sentinel performs read-only EVM checks:

- Native wallet balance.
- EOA vs contract account code check.
- ERC-20 metadata reads.
- ERC-20 allowance reads.
- Token bytecode reads.
- EIP-1967 proxy implementation/admin slot reads.
- `owner()`, `getOwner()`, and `admin()` probes.
- Calldata selector decoding.

This is the correct security posture for the hackathon use case: Sentinel can inspect live chain state and produce risk decisions, but it never takes custody, never signs, and never executes transactions for the user.

## Why Not Full Custody/Signing

A custody/signing app would create private-key, compliance, and user-loss risk that is unnecessary for this ASP. The winning product wedge is safer and clearer: Sentinel is the paid pre-signing control plane. It tells OKX.AI agents whether an action should be allowed, reviewed, or blocked, then hands approved actions to external wallet signing.

See [docs/production-readiness.md](docs/production-readiness.md) for the go-live checklist.

## Scoring Heuristics

Examples:

- Unlimited approval to unknown spender: high or critical risk.
- Unlimited approval to suspicious spender: critical risk.
- Unverified token contract: high risk.
- Upgradeable proxy with admin-like controls: high risk.
- Mint, pause, blacklist, or tax functions: high to critical risk.
- Unknown calldata selector: medium risk.
- Native value attached to unknown call: high risk.
- Known safe contracts reduce severity in explanation and approval analysis.

The engine is intentionally transparent. Production deep scans should add explorer verification, liquidity depth, top-holder concentration, DEX route analysis, historical transaction indexing, and threat-intel feeds.

## Tests

```bash
npm test
npm run typecheck
```

## Monetization

- Free basic scan: immediate heuristic wallet, token, approval, transaction, and policy checks.
- Paid A2MCP policy gate: `$0.05` per allow/review/block decision.
- Paid deep scan: `$0.10-$0.25` for richer onchain risk tools.
- Paid API calls for agents: fixed per-call pricing for OKX.AI agents, wallets, trading bots, and portfolio copilots.
- Premium audit/research service: custom token, contract, wallet cluster, and incident-response reports for teams.

## Demo Script

See [docs/demo-script.md](docs/demo-script.md).

## Example Responses

See [docs/example-responses.md](docs/example-responses.md).

## MCP Integration

See [docs/mcp-integration.md](docs/mcp-integration.md).

## Submission Checklist

See [docs/submission-checklist.md](docs/submission-checklist.md).
