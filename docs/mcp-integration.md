# MCP Integration

OKX Sentinel exposes both REST tool endpoints and MCP-style JSON-RPC endpoints.

## Endpoints

- Free MCP JSON-RPC: `POST /api/mcp`
- Premium MCP JSON-RPC: `POST /api/premium/mcp`
- Manifest: `GET /api/mcp/manifest`
- Pricing: `GET /api/pricing`
- Traction metrics: `GET /api/traction`
- Review readiness: `GET /api/asp/readiness`

## List Tools

```bash
curl -X POST http://localhost:8787/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Call The Policy Gate

```bash
curl -X POST http://localhost:8787/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"evaluate_action_policy","arguments":{"txData":"0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","chainId":1,"agentId":"okx-agent-risk-gate","policy":{"maxAllowedRiskScore":64,"requireReviewAbove":35,"blockUnlimitedApprovals":true,"spendLimitUsd":500}}}}'
```

Expected result: `structuredContent.metadata.decision` is `block`, `automaticSigning` is `false`, and `signingMode` is `external-wallet-required`.

## Premium MCP With Payment Proof

```bash
curl -X POST http://localhost:8787/api/premium/mcp \
  -H "Content-Type: application/json" \
  -H "X-Payment: demo-proof" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"evaluate_action_policy","arguments":{"txData":"transfer 10 USDC to a known settlement wallet","chainId":8453,"policy":{"maxAllowedRiskScore":64,"requireReviewAbove":35,"blockUnlimitedApprovals":true,"spendLimitUsd":1000}}}}'
```

In `OKX_SENTINEL_PAYMENT_MODE=enforce`, the same premium call returns HTTP `402` without `X-Payment`, `X-OKX-Payment`, or `Authorization: X402 <proof>`.

## Metrics Call

```bash
curl -X POST http://localhost:8787/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"sentinel/metrics"}'
```

This returns call counts, MCP calls, premium calls, payment-proof calls, blocked actions, projected revenue, qualified revenue, and estimated value protected for the current server process.
