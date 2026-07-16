# Monetization Proposal

## Free Basic Scan

Goal: drive adoption and trust.

Includes:

- Wallet, token, transaction, and approval heuristic checks.
- Risk score, findings, recommendations, confidence, and limitations.
- Limited public API usage with real public example inputs.

## Paid Deep Scan

Goal: monetize high-intent users before risky actions.

Includes:

- Explorer verification enrichment.
- Liquidity depth and pool age.
- Holder concentration.
- Proxy admin and owner review.
- Historical transaction and approval timeline.
- Threat-intel matches.
- Downloadable report.

Suggested pricing:

- $2 to $10 per deep scan for retail.
- $25 to $100 for incident-focused wallet reports.

## Paid A2MCP Agent API Calls

Goal: become infrastructure for OKX.AI agents and third-party copilots.

Model:

- Per-call pricing by endpoint.
- Higher cost for deep enrichment endpoints.
- Volume bundles for agent builders.
- x402/OKX Payment SDK settlement before production go-live.
- REST and MCP-style JSON-RPC tool calls.
- Live `/api/traction` metrics for calls, premium calls, payment-proof calls, blocked actions, qualified revenue, projected revenue, and estimated value protected.

Example:

- Policy gate: $0.05 per call.
- Basic API: free or $0.005 to $0.02 per call.
- Deep API: $0.10 to $0.25 per call.
- Enterprise bundle: custom monthly commitments.

Revenue accounting:

- `qualifiedRevenueUsd` counts premium calls that include a payment proof header in the current server process.
- `projectedRevenueUsd` shows the price projection for metered premium calls and is not claimed as settled revenue.
- `demoRevenueUsd` remains as a backward-compatible telemetry alias for `projectedRevenueUsd`.
- `estimatedValueProtectedUsd` comes from blocked policy-gate spend limits and is not custody or execution volume.

## Premium Audit and Research Desk

Goal: capture teams and serious traders.

Includes:

- Custom token risk reports.
- Wallet cluster investigations.
- Approval cleanup plans.
- Agent policy design for automated trading systems.
- Integration support for wallets, bots, and OKX.AI agents.

Suggested pricing:

- $499 to $2,500 for token or wallet research.
- Custom retainers for agent security monitoring.
