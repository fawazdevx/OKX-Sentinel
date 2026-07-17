# Hackathon Submission Checklist

## Deadline

The current official OKX page says the Google form closes **Friday, July 17, 2026 at 23:59 UTC**.

In Lagos, that is **Saturday, July 18, 2026 at 00:59 WAT**.

Use **22:30 UTC / 23:30 WAT** as the internal cutoff so upload or form issues do not invalidate the submission.

## Eligibility Blockers

- ASP submitted through OKX.AI.
- ASP approved and live; a pending or rejected listing is not eligible.
- Public dashboard and API available over HTTPS.
- X post includes the demo and `#OKXAI`.
- Demo is no longer than 90 seconds.
- Google form includes the ASP details and X post URL.

## Recommended Listing

- Type: Agent-to-MCP.
- Launch mode: Free.
- Primary service: `evaluate_action_policy`.
- Endpoint: `POST {PUBLIC_BASE_URL}/api/tools/evaluate_action_policy`.
- Award focus: Best Product, Finance Copilot, Software Utility.

Do not select a paid endpoint unless verified OKX Payment SDK/x402 middleware is already live.

## Release Verification

```bash
npm ci
npm run verify
npm start
```

Then:

```bash
curl http://localhost:8787/api/health
curl http://localhost:8787/api/mcp/manifest
curl http://localhost:8787/api/asp/readiness
```

Risky policy call:

```bash
curl -X POST http://localhost:8787/api/tools/evaluate_action_policy \
  -H "Content-Type: application/json" \
  -d '{"txData":"0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","chainId":1,"agentId":"okx-agent-risk-gate","actionValueUsd":500,"policy":{"maxAllowedRiskScore":64,"requireReviewAbove":35,"blockUnlimitedApprovals":true,"spendLimitUsd":500}}'
```

Expected:

- `metadata.decision` is `block`.
- A `tx.unlimited-approval` finding exists.
- `metadata.automaticSigning` is `false`.
- `metadata.signingHandoff.status` is `not-recommended`.

## Public Deployment Check

- `/` loads the dashboard.
- `/api/health` returns JSON.
- `/api/tools/evaluate_action_policy` accepts POST.
- `/api/mcp` handles `initialize`, `tools/list`, and `tools/call`.
- Invalid addresses return HTTP 400.
- Unknown API paths return JSON 404.
- `PUBLIC_BASE_URL` matches the deployed HTTPS origin.
- `CORS_ALLOWED_ORIGINS` includes the dashboard origin.
- The demo RPC endpoint is configured and stable.

## Video Check

- 1920x1080 or 1280x720.
- Browser zoom keeps the verdict, evidence, and signing boundary readable.
- No wallet address, email, API key, or private terminal history is exposed.
- Spoken run time is under 90 seconds.
- Captions are enabled if the editor supports them.
- Final frame shows the product name and `#OKXAI`.

## Final Submission Order

1. Deploy and run the public endpoint checks.
2. Confirm ASP listing status is live.
3. Record and trim the demo.
4. Post on X with `#OKXAI`.
5. Open the X post and confirm the video plays publicly.
6. Submit the Google form with the live ASP and X URLs.
7. Capture confirmation screenshots.

## Honest Judge Answers

Payment:

> "The launch service is free. Premium x402 pricing is the monetization roadmap, and Sentinel only records qualified revenue after trusted middleware verifies settlement."

Custody:

> "Sentinel never receives keys, signs, or broadcasts. It returns a policy decision and external signing handoff."

Coverage:

> "The current release performs deterministic calldata and policy checks plus RPC-backed reads. Indexer, simulation, liquidity, holder, and threat-intelligence enrichment are clearly marked as future production integrations."
