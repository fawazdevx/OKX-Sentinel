# OKX Sentinel

OKX Sentinel is a read-only pre-transaction risk firewall for wallets, tokens, approvals, transactions, and AI agents.

Before an agent asks a wallet to sign, Sentinel returns a deterministic `allow`, `review`, or `block` decision with findings, confidence, data sources, limitations, and safe next steps.

The deadline-day launch path is a **free A2MCP service**. Premium x402 pricing is included as a roadmap, but the project does not claim settlement or revenue unless trusted payment middleware verifies it.

## Primary Service

`evaluate_action_policy` is the core marketplace service.

Input:

- Unsigned calldata, transaction JSON, or plain-English intent.
- Chain ID.
- Optional wallet and agent ID.
- Optional caller-declared action value.
- Risk-score, review, unlimited-approval, and spend-limit policy controls.

Output:

- `allow`, `review`, or `block`.
- Risk score and level.
- Human-readable summary and findings.
- Recommended actions.
- External signing handoff.
- Confidence, sources, and limitations.

Sentinel never requests private keys, never signs, never broadcasts, and never executes revokes.

## Features

- Agent Policy Gate: deterministic pre-signing policy decisions.
- Transaction Explainer: common calldata decoding, unlimited approval detection, and plain-English intent parsing.
- Approval Analyzer: live ERC-20 allowance reads when RPC is configured, spender reputation, and revoke/reduce/monitor guidance.
- Token Scanner: metadata, bytecode, EIP-1967 proxy slots, owner/admin probes, and privileged-function indicators.
- Wallet Scanner: native balance and EOA/contract classification when RPC is configured.
- REST and MCP: direct tool endpoints plus stateless MCP JSON-RPC with protocol negotiation through `2025-11-25`.
- Transparent Telemetry: calls, MCP calls, blocked actions, caller-declared blocked value, presented payment headers, verified payment calls, and qualified revenue.
- Production Server: one Express process serves both the built dashboard and API.

Wallet-wide approval inventory, token history, liquidity, holder concentration, and threat intelligence remain unavailable until their required indexers or data providers are connected. Sentinel reports these gaps instead of generating fallback data.

## Supported Chains

- Ethereum `1`
- OKX X Layer `196`
- Base `8453`
- Arbitrum `42161`
- Polygon `137`
- BNB Chain `56`
- Optimism `10`

## Setup

```bash
npm ci
cp .env.example .env
npm run dev
```

Frontend: `http://localhost:5173`

API: `http://localhost:8787`

Verify the release:

```bash
npm run verify
```

Build and run the production server:

```bash
npm run build
npm start
```

The production server serves the dashboard and API from the same port.

## Configuration

Dedicated RPC URLs are recommended for judging and production:

```bash
XLAYER_RPC_URL=
ETHEREUM_RPC_URL=
BASE_RPC_URL=
ARBITRUM_RPC_URL=
POLYGON_RPC_URL=
BNB_RPC_URL=
OPTIMISM_RPC_URL=
```

The app works without RPC keys, but live fields are explicitly marked unavailable.

Public deployment:

```bash
PUBLIC_BASE_URL=https://sentinel.example
CORS_ALLOWED_ORIGINS=https://sentinel.example
```

Launch the OKX.AI service as free. Do not enable premium settlement claims until OKX Payment SDK or trusted x402 middleware is connected:

```bash
OKX_SENTINEL_PAYMENT_MODE=enforce
OKX_SENTINEL_PAYMENT_VERIFICATION=trusted-proxy
OKX_SENTINEL_PAYMENT_RECIPIENT=0xYourXLayerRecipient
```

The trusted proxy must remove any inbound `X-OKX-Payment-Verified` header and set it only after settlement verification. A client-supplied `X-Payment` header is recorded as presented proof, not qualified revenue.

## API Examples

Health:

```bash
curl http://localhost:8787/api/health
```

Primary free policy gate:

```bash
curl -X POST http://localhost:8787/api/tools/evaluate_action_policy \
  -H "Content-Type: application/json" \
  -d '{"txData":"0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","chainId":1,"agentId":"okx-agent-risk-gate","actionValueUsd":500,"policy":{"maxAllowedRiskScore":64,"requireReviewAbove":35,"blockUnlimitedApprovals":true,"spendLimitUsd":500}}'
```

MCP initialize:

```bash
curl -X POST http://localhost:8787/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"sentinel-demo","version":"1.0.0"}}}'
```

MCP tool call:

```bash
curl -X POST http://localhost:8787/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"evaluate_action_policy","arguments":{"txData":"0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","chainId":1,"agentId":"okx-agent-risk-gate","actionValueUsd":500,"policy":{"maxAllowedRiskScore":64,"requireReviewAbove":35,"blockUnlimitedApprovals":true,"spendLimitUsd":500}}}}'
```

Review surfaces:

```bash
curl http://localhost:8787/api/mcp/manifest
curl http://localhost:8787/api/traction
curl http://localhost:8787/api/asp/readiness
```

## OKX.AI Positioning

Recommended type: **Agent-to-MCP**.

Recommended free listing endpoint:

```text
POST {PUBLIC_BASE_URL}/api/tools/evaluate_action_policy
```

Recommended award focus:

- Best Product: complete pre-signing workflow, clear verdicts, transparent evidence, and external signing boundary.
- Finance Copilot: risk guidance before approvals, swaps, bridges, claims, and transfers.
- Software Utility: deterministic REST/MCP contract that other agents can call.

Revenue Rocket should only be pursued after real verified orders, settlement, and reviews exist.

## Scoring Scope

The engine uses transparent heuristics for:

- Unlimited approvals.
- Unknown or recognized destinations.
- Unknown selectors.
- Native value attached to unknown calls.
- Token proxy/admin controls.
- Mint, pause, blacklist, and tax indicators.
- Policy risk thresholds and caller-declared spend limits.

It does not claim perfect scam detection or full EVM simulation. Production deep scans should add explorer verification, liquidity, holder concentration, transaction simulation, wallet history, and threat-intelligence feeds.

## Deployment

The included `Dockerfile` builds the dashboard and starts the combined service on `PORT`.

Required production values:

- `PUBLIC_BASE_URL`
- `CORS_ALLOWED_ORIGINS`
- At least the RPC URL used in the demo

Optional production values:

- `OKX_SENTINEL_TELEMETRY_FILE`
- Payment settings after verified middleware is connected

See:

- [OKX.AI listing copy](docs/okx-ai-listing.md)
- [90-second demo script](docs/demo-script.md)
- [Submission checklist](docs/submission-checklist.md)
- [Production readiness](docs/production-readiness.md)
- [MCP integration](docs/mcp-integration.md)
