# Example JSON Responses

## Wallet Scan Without Indexer

```json
{
  "tool": "scan_wallet",
  "chainId": 1,
  "riskScore": 4,
  "riskLevel": "Low",
  "summary": "Wallet is currently assessed as low risk with a score of 4/100. Main driver: native balance unavailable.",
  "findings": [
    {
      "id": "wallet.balance-unavailable",
      "title": "Native balance unavailable",
      "severity": "info",
      "category": "data-quality",
      "description": "RPC balance read was unavailable, so the scan cannot confirm this wallet's native balance."
    },
    {
      "id": "wallet.inventory-unavailable",
      "title": "Wallet inventory unavailable without live indexer",
      "severity": "info",
      "category": "data-quality",
      "description": "Wallet-wide approvals, token holdings, recent interactions, and spam-token indicators require a live indexer. This build does not generate those fields without real data."
    }
  ],
  "recommendedActions": [
    "Configure a dedicated RPC endpoint before relying on wallet account context.",
    "Connect a live approval and history indexer before making wallet-wide revoke, holding, or spam-token decisions.",
    "Run focused approval analysis on known token and spender pairs when wallet-wide inventory is unavailable."
  ],
  "dataSourcesUsed": [
    "chain:Ethereum",
    "local-risk-heuristics",
    "known-entity-registry",
    "rpc-not-configured",
    "wallet-indexer-unavailable"
  ],
  "metadata": {
    "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "nativeBalance": "unknown",
    "accountType": "unknown",
    "liveOnchainReads": {
      "nativeBalance": false,
      "accountCode": false,
      "approvalInventory": false
    },
    "suspiciousApprovals": [],
    "highRiskTokenHoldings": [],
    "recentlyInteractedContracts": [],
    "dustingIndicators": []
  }
}
```

## Transaction Explainer

```json
{
  "tool": "explain_transaction",
  "chainId": 1,
  "riskScore": 100,
  "riskLevel": "Critical",
  "summary": "This transaction appears to be an unlimited approval and is assessed as critical risk.",
  "findings": [
    {
      "id": "tx.unlimited-approval",
      "title": "Transaction grants unlimited approval",
      "severity": "critical",
      "category": "approval",
      "description": "The transaction appears to set an ERC-20 allowance to the maximum uint256 value.",
      "recommendation": "Reject unless you independently trust the spender and need a persistent allowance."
    }
  ],
  "metadata": {
    "actionType": "approval",
    "destination": "0x000000000022d473030f116ddee9f6b43ac78ba3",
    "decodedSelector": "0x095ea7b3"
  }
}
```

## Token Scan Without RPC

```json
{
  "tool": "scan_token",
  "chainId": 1,
  "riskScore": 38,
  "riskLevel": "Medium",
  "summary": "UNKNOWN token is currently assessed as medium risk with a score of 38/100. Main driver: contract bytecode unavailable.",
  "findings": [
    {
      "id": "token.bytecode-unavailable",
      "title": "Contract bytecode unavailable",
      "severity": "medium",
      "category": "data-quality",
      "description": "The scanner could not confirm contract bytecode from the configured RPC. This may be an RPC limitation or an invalid contract address."
    }
  ],
  "metadata": {
    "tokenAddress": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "token": {
      "symbol": "UNKNOWN"
    },
    "detectedFunctions": [],
    "adminAddresses": [],
    "liveOnchainReads": {
      "metadata": false,
      "bytecode": false,
      "proxySlots": false,
      "adminFunctions": false
    }
  }
}
```

## Approval Analysis Without RPC

```json
{
  "tool": "analyze_approval",
  "chainId": 1,
  "riskScore": 38,
  "riskLevel": "Medium",
  "summary": "This approval is currently assessed as medium risk with a score of 38/100. Main driver: approval allowance unavailable.",
  "findings": [
    {
      "id": "approval.allowance-unavailable",
      "title": "Approval allowance unavailable",
      "severity": "medium",
      "category": "data-quality",
      "description": "The scanner could not confirm the current allowance from RPC, so it will not infer an approval amount."
    }
  ],
  "metadata": {
    "wallet": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "tokenAddress": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "spender": "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    "liveOnchainReads": {
      "allowance": false
    },
    "revokePlan": {
      "currentAllowance": "unknown",
      "action": "monitor"
    }
  }
}
```

## Policy Gate

```json
{
  "tool": "evaluate_action_policy",
  "chainId": 1,
  "riskScore": 100,
  "riskLevel": "Critical",
  "summary": "Policy decision BLOCK is currently assessed as critical risk with a score of 100/100. Main driver: transaction grants unlimited approval.",
  "findings": [
    {
      "id": "tx.unlimited-approval",
      "title": "Transaction grants unlimited approval",
      "severity": "critical",
      "category": "approval",
      "description": "The transaction appears to set an ERC-20 allowance to the maximum uint256 value."
    },
    {
      "id": "policy.block",
      "title": "Policy decision: BLOCK",
      "severity": "critical",
      "category": "transaction",
      "description": "Policy blocks unlimited approvals. Risk score 100 exceeds max allowed score 64."
    }
  ],
  "metadata": {
    "decision": "block",
    "signingMode": "external-wallet-required",
    "custody": "none",
    "automaticSigning": false,
    "agentId": "okx-agent-risk-gate",
    "signingHandoff": {
      "status": "not-recommended",
      "reason": "Policy blocks unlimited approvals. Risk score 100 exceeds max allowed score 64."
    }
  },
  "billing": {
    "track": "A2MCP",
    "paymentStandard": "x402",
    "tool": "evaluate_action_policy"
  }
}
```
