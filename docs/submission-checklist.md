# Hackathon Submission Checklist

Use this as the final operator checklist before submitting OKX Sentinel.

## Required Before Final Submission

- Deploy the dashboard and API over HTTPS.
- Set `PUBLIC_BASE_URL` to the deployed base URL.
- Set dedicated RPC URLs for the chains you will demo.
- Set `OKX_SENTINEL_PAYMENT_MODE=enforce` after payment middleware is connected.
- Set `OKX_SENTINEL_PAYMENT_RECIPIENT` to the X Layer settlement recipient.
- Register/list the ASP through OKX.AI and wait for review approval.
- Record a 90-second demo using the flow in `docs/demo-script.md`.
- Post the demo on X with the required hackathon hashtag and tag the project account.

## Judge Demo Proof

Run these in order during prep:

```bash
curl http://localhost:8787/api/health
curl http://localhost:8787/api/mcp/manifest
curl http://localhost:8787/api/pricing
curl http://localhost:8787/api/asp/readiness
curl http://localhost:8787/api/traction
```

Then call the risky policy gate:

```bash
curl -X POST http://localhost:8787/api/premium/tools/evaluate_action_policy \
  -H "Content-Type: application/json" \
  -H "X-Payment: demo-proof" \
  -d '{"txData":"0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","chainId":1,"agentId":"okx-agent-risk-gate","policy":{"maxAllowedRiskScore":64,"requireReviewAbove":35,"blockUnlimitedApprovals":true,"spendLimitUsd":500}}'
```

Expected proof points:

- `metadata.decision` is `block`.
- `billing.paymentStandard` is `x402`.
- `/api/traction` increments `premiumCalls`, `paymentProofCalls`, `blockedActions`, `qualifiedRevenueUsd`, and `estimatedValueProtectedUsd`.

## What To Say If Judges Ask About Custody

Sentinel intentionally does not custody keys or sign transactions. It is the paid pre-signing control plane for OKX.AI agents. Agents call Sentinel before asking a wallet to sign; Sentinel returns `allow`, `review`, or `block` plus an external signing handoff.

That is safer and easier to approve than a custody product, and it fits A2MCP because the service is deterministic, callable, metered, and payment-gated.

## Remaining Production Integrations

- OKX Payment SDK/x402 middleware wiring.
- Persistent production database for telemetry and accounts.
- Auth, rate limits, and tenant keys.
- OKLink/explorer enrichment for full wallet history and holder concentration.
- DEX liquidity and pool-age enrichment.
- Threat-intel partner feed.
- Transaction simulation or full DeFi calldata decoding.
