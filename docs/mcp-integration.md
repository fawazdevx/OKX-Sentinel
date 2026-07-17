# MCP Integration

OKX Sentinel exposes stateless MCP JSON-RPC over HTTP.

## Endpoints

- Free MCP: `POST /api/mcp`
- Premium prototype: `POST /api/premium/mcp`
- Manifest: `GET /api/mcp/manifest`
- Readiness: `GET /api/asp/readiness`

The server negotiates stable protocol versions through `2025-11-25`. Tool results use standard text content plus `structuredContent`.

## Initialize

```bash
curl -X POST http://localhost:8787/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"sentinel-demo","version":"1.0.0"}}}'
```

## Initialized Notification

```bash
curl -i -X POST http://localhost:8787/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
```

Expected status: `202`.

## List Tools

```bash
curl -X POST http://localhost:8787/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Each tool declares an input schema, risk-response output schema, and read-only/idempotent annotations.

## Call The Policy Gate

```bash
curl -X POST http://localhost:8787/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"evaluate_action_policy","arguments":{"txData":"0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","chainId":1,"agentId":"okx-agent-risk-gate","actionValueUsd":500,"policy":{"maxAllowedRiskScore":64,"requireReviewAbove":35,"blockUnlimitedApprovals":true,"spendLimitUsd":500}}}}'
```

Expected:

- `result.structuredContent.metadata.decision` is `block`.
- `result.structuredContent.metadata.automaticSigning` is `false`.
- `result.content` contains a standard text item.

Invalid tool arguments return a successful JSON-RPC envelope with `result.isError: true`, which keeps tool execution errors separate from protocol errors.

## Payment Boundary

The free endpoint is the production launch path.

In premium `enforce` mode, a client payment header is insufficient. The request must be marked verified by trusted OKX Payment SDK/x402 middleware. Qualified revenue only increases for verified settlement.
