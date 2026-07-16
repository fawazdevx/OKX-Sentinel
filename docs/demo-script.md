# 90-Second Demo Script

## 0-15 seconds

Open the dashboard. The real Permit2 approval example is already loaded in the policy gate.

Say: "OKX Sentinel is an A2MCP pre-transaction risk firewall for OKX.AI agents. Before an agent asks for a signature, Sentinel answers: allow, review, or block?"

Point to the block decision, critical findings, and recommended actions.

## 15-35 seconds

Click the scan type selector and choose Transaction.

Say: "Here is an unsigned transaction. Sentinel decodes it as an ERC-20 approval, detects max uint256, and warns that this grants unlimited spending permission."

Point to assets at risk, permission changes, and the JSON viewer.

## 35-55 seconds

Choose Policy Gate.

Say: "The paid policy endpoint returns a deterministic decision. This risky unlimited approval is blocked, and Sentinel refuses to create a signing request. The user or OKX Agentic Wallet always signs externally."

Point to the decision, signing handoff, and JSON.

## 55-75 seconds

Point to Campaign Proof and OKX.AI Review.

Say: "This is the Revenue Rocket proof. The live service records tool calls, MCP calls, paid proof calls, blocked actions, qualified revenue, projected revenue, and estimated value protected. It does not claim projected revenue as settled revenue."

Open `/api/traction` if needed.

## 75-90 seconds

Open `/api/mcp/manifest`, `/api/pricing`, and `/api/asp/readiness`.

Say: "This is built for A2MCP: agents can call REST or MCP JSON-RPC, premium calls are x402-gated, readiness tells us exactly what is done and what remains for listing approval, and custom audit reports are the A2A upsell."
