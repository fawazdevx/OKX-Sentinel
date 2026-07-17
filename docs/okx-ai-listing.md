# OKX.AI Listing Copy

## Name

OKX Sentinel

## Tagline

Pre-transaction risk firewall for wallets and AI agents.

## Short Description

OKX Sentinel checks an unsigned onchain action before wallet signing and returns `allow`, `review`, or `block` with risk evidence, confidence, limitations, and safe next steps.

## Long Description

OKX Sentinel is a free Agent-to-MCP security utility for pre-signing risk checks.

The primary `evaluate_action_policy` service accepts raw calldata, unsigned transaction JSON, or a plain-English action intent. It detects patterns such as unlimited token approvals, unknown selectors, suspicious destinations, risky token controls, and policy-limit violations. It returns a deterministic risk score, findings, recommended actions, and an external signing handoff.

Sentinel also exposes focused wallet, token, transaction, and approval tools. Live chain fields use read-only EVM RPC calls when configured. Missing indexer or data-provider coverage is reported as unavailable rather than replaced with generated data.

Sentinel never requests private keys, never signs, never broadcasts, and never executes revokes. Final confirmation and signing remain in OKX Agentic Wallet or the user's wallet.

## Listing Type

Agent-to-MCP

## Launch Pricing

Free

## Primary Service

- Name: `evaluate_action_policy`
- Method: `POST`
- Path: `/api/tools/evaluate_action_policy`

## Inputs

- `txData`: raw calldata, unsigned transaction JSON, or intent text
- `chainId`: supported EVM chain ID
- `wallet`: optional wallet or smart-account address
- `agentId`: optional calling-agent identifier
- `actionValueUsd`: optional caller-declared action value
- `policy`: risk, review, approval, and spend thresholds

## Output

- `riskScore`
- `riskLevel`
- `summary`
- `findings`
- `recommendedActions`
- `confidence`
- `dataSourcesUsed`
- `limitations`
- `metadata.decision`
- `metadata.signingHandoff`

## Supported Networks

OKX X Layer, Ethereum, Base, Arbitrum, Polygon, BNB Chain, and Optimism.

## Target Users

- OKX.AI agents that need a pre-signing control.
- DeFi users reviewing approvals, swaps, bridges, claims, and transfers.
- Wallet and finance-copilot teams adding an external risk gate.
- Trading and automation agents with configurable action policies.

## Award Fit

- Best Product
- Finance Copilot
- Software Utility

## Safety Boundary

Read-only risk intelligence only. No custody, private keys, automatic signing, transaction broadcast, or automatic revoke execution.
