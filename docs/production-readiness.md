# Production Readiness for OKX.AI

## What Is Real Onchain Now

OKX Sentinel is read-only and can perform live EVM checks when RPC access is configured.

Short answer: yes, the app can do real onchain work. It performs real read-only EVM calls and turns those reads into structured risk decisions for agents. It intentionally does not perform write transactions, because a pre-transaction firewall should not custody funds or sign on the user's behalf.

Current real checks:

- Native balance read for wallet scans.
- Wallet account code check to classify EOA vs contract account.
- ERC-20 `name`, `symbol`, `decimals`, and `totalSupply` reads.
- ERC-20 `allowance(owner, spender)` reads for approval analysis.
- Contract bytecode read for token scans.
- Bytecode selector heuristics for mint, pause, blacklist, tax, owner, admin, and proxy indicators.
- EIP-1967 proxy implementation/admin storage slot reads.
- `owner()`, `getOwner()`, and `admin()` probes.
- Transaction calldata selector decoding for approval, transfer, swap, bridge, mint, claim, and unknown actions.

Current agent and monetization surfaces:

- REST tool endpoints under `/api/tools/*`.
- Premium REST endpoints under `/api/premium/tools/*`.
- MCP-style JSON-RPC at `/api/mcp`.
- Premium MCP-style JSON-RPC at `/api/premium/mcp`.
- x402-style payment proof enforcement in `OKX_SENTINEL_PAYMENT_MODE=enforce`.
- Tool manifest at `/api/mcp/manifest`.
- Pricing metadata at `/api/pricing`.
- Usage, paid-call, revenue, blocked-action, and estimated value protected telemetry at `/api/traction`.
- OKX.AI readiness checklist at `/api/asp/readiness`.

The app remains intentionally non-custodial:

- No private keys.
- No seed phrases.
- No automatic signing.
- No automatic revoke execution.
- No custody.

This is the recommended product position for OKX.AI review. Full custody/signing would add avoidable key-management and user-loss risk. Sentinel should be the paid pre-signing risk firewall, then hand off approved actions to OKX Agentic Wallet or the user's wallet.

## How To Enable Real Reads

For reliable judging and production usage, set dedicated RPC URLs:

```bash
XLAYER_RPC_URL=
ETHEREUM_RPC_URL=
BASE_RPC_URL=
ARBITRUM_RPC_URL=
POLYGON_RPC_URL=
BNB_RPC_URL=
OPTIMISM_RPC_URL=
```

For local experimentation only, public RPC reads can be enabled:

```bash
ENABLE_PUBLIC_RPC_READS=true
```

Public RPCs can be slow or rate-limited, so production deployments should use dedicated RPC providers.

## What Still Needs Integration Before Marketplace Go-Live

- OKX Payment SDK / x402 pay-per-call middleware for Agent-to-MCP monetization.
- Hosted HTTPS deployment URL.
- Persistent production usage metering database.
- API authentication and rate limits.
- Explorer/indexer enrichment for full wallet approval inventory and transaction history.
- Threat-intel feed or curated reputation dataset beyond the local registry.
- Optional OKLink/DEX enrichment for holder concentration, liquidity depth, pool age, and exchange listings.

## Why This Still Works As A Hackathon ASP

The strongest submission story is not "perfect scam detection." It is:

> OKX Sentinel gives OKX.AI agents a read-only pre-action risk firewall. Before an agent signs, suggests, swaps, bridges, claims, or approves, it calls Sentinel and gets a structured risk report with confidence, limitations, and safe next steps.

This directly matches Agent-to-MCP usage because the service takes parameters and returns a deterministic result that other agents can consume. The primary paid call is `evaluate_action_policy`, which returns `allow`, `review`, or `block`.

## Suggested Live Demo Flow

1. Show a real token scan on a known token address with RPC enabled.
2. Show the live-read badges in the dashboard.
3. Switch to the risky demo transaction and show the unlimited approval warning.
4. Call the premium MCP policy gate with `X-Payment: demo-proof`.
5. Open `/api/traction` and point to the incremented premium call, payment-proof call, blocked action, revenue, and estimated value protected.
6. Open `/api/mcp/manifest`, `/api/pricing`, and `/api/asp/readiness`.
7. Explain that the paid tier adds indexer, threat-intel, and liquidity enrichment.
