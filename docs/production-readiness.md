# Production Readiness

## Ready Now

- Combined production server for dashboard and API.
- Free REST policy-gate endpoint.
- Stateless MCP JSON-RPC endpoint with protocol negotiation through `2025-11-25`.
- Deterministic allow/review/block decisions.
- Unlimited approval and common calldata detection.
- Configurable risk, review, approval, and spend-limit policies.
- Caller-declared blocked action value telemetry.
- Read-only wallet, token, and allowance RPC calls when configured.
- Explicit confidence, sources, and limitations.
- No keys, custody, signing, broadcast, or automatic revoke execution.
- Docker deployment path.
- Automated build, type checking, and tests.

## Configure Before Public Listing

- HTTPS deployment.
- `PUBLIC_BASE_URL`.
- `CORS_ALLOWED_ORIGINS`.
- Dedicated RPC URL for every network shown in the demo.
- Persistent telemetry path or database if session metrics must survive restarts.
- OKX.AI ASP registration and approved live listing.

## Not Yet Production-Complete

- Verified OKX Payment SDK/x402 middleware.
- API authentication, tenant quotas, and rate limits.
- Persistent metering database.
- Wallet approval/history indexer.
- Explorer verification API.
- Transaction simulation.
- DEX liquidity and holder enrichment.
- External threat-intelligence feed.

These capabilities must not be implied in listing or demo copy until connected.

## Payment Safety

`OKX_SENTINEL_PAYMENT_MODE=enforce` requires:

- `OKX_SENTINEL_PAYMENT_RECIPIENT`
- `OKX_SENTINEL_PAYMENT_VERIFICATION=trusted-proxy`
- Middleware that strips inbound `X-OKX-Payment-Verified`
- Middleware that sets `X-OKX-Payment-Verified: true` only after settlement verification

A client-supplied `X-Payment` or authorization header is recorded as presented proof but never counted as qualified revenue.

## Recommended Marketplace Position

Launch as a free A2MCP Finance Copilot and Software Utility.

The product claim is:

> OKX Sentinel gives agents a deterministic, read-only risk gate before they ask a wallet to sign.

The product does not claim perfect scam detection, custody protection, or complete wallet intelligence.
