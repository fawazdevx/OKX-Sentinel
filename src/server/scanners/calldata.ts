import type { TransactionActionType } from "../../shared/types";
import { isMaxUint256Like } from "./common";

export interface DecodedCalldata {
  selector: string;
  actionType: TransactionActionType;
  label: string;
  destination?: string;
  amount?: string;
  isUnlimitedApproval: boolean;
  permissionChanges: string[];
  assetsAtRisk: string[];
}

const knownSelectors: Record<string, { actionType: TransactionActionType; label: string }> = {
  "0x095ea7b3": { actionType: "approval", label: "ERC-20 approve(spender, amount)" },
  "0xa9059cbb": { actionType: "transfer", label: "ERC-20 transfer(to, amount)" },
  "0x23b872dd": { actionType: "transfer", label: "ERC-20 transferFrom(from, to, amount)" },
  "0x38ed1739": { actionType: "swap", label: "UniswapV2 swapExactTokensForTokens" },
  "0x7ff36ab5": { actionType: "swap", label: "UniswapV2 swapExactETHForTokens" },
  "0x12aa3caf": { actionType: "swap", label: "1inch swap" },
  "0x5ae401dc": { actionType: "unknown", label: "Multicall aggregate" },
  "0x9b2c0a37": { actionType: "bridge", label: "Bridge deposit/transfer style call" },
  "0x40c10f19": { actionType: "mint", label: "mint(address,uint256)" },
  "0x4e71d92d": { actionType: "claim", label: "claim()" }
};

export function decodeCalldata(input: string): DecodedCalldata {
  const txData = input.trim();
  const hex = txData.startsWith("0x") ? txData : `0x${Buffer.from(txData).toString("hex")}`;
  const selector = hex.length >= 10 ? hex.slice(0, 10).toLowerCase() : "text-intent";
  const known = knownSelectors[selector];

  if (!known || selector === "text-intent") {
    return decodeTextIntent(input, selector);
  }

  const words = splitWords(hex);
  const destination = selector === "0x095ea7b3" || selector === "0xa9059cbb" ? wordToAddress(words[0]) : undefined;
  const amount = words[1] ? `0x${words[1]}` : undefined;
  const isUnlimitedApproval = selector === "0x095ea7b3" && amount ? isMaxUint256Like(amount) : false;
  const permissionChanges =
    selector === "0x095ea7b3"
      ? [
          isUnlimitedApproval
            ? "Grants unlimited token spending permission to the spender."
            : "Changes ERC-20 spending permission for the spender."
        ]
      : [];
  const assetsAtRisk =
    selector === "0x095ea7b3"
      ? ["The full balance of the approved token may be at risk if the spender is malicious."]
      : selector === "0xa9059cbb" || selector === "0x23b872dd"
        ? ["The transferred token amount is at risk once submitted."]
        : selector === "0x38ed1739" || selector === "0x7ff36ab5" || selector === "0x12aa3caf"
          ? ["Input swap token amount and slippage exposure."]
          : ["Unknown assets; calldata should be inspected before signing."];

  return {
    selector,
    actionType: known.actionType,
    label: known.label,
    destination,
    amount,
    isUnlimitedApproval,
    permissionChanges,
    assetsAtRisk
  };
}

function decodeTextIntent(input: string, selector: string): DecodedCalldata {
  const text = input.toLowerCase();
  const actionType: TransactionActionType = text.includes("approve")
    ? "approval"
    : text.includes("swap")
      ? "swap"
      : text.includes("bridge")
        ? "bridge"
        : text.includes("mint")
          ? "mint"
          : text.includes("claim")
            ? "claim"
            : text.includes("transfer") || text.includes("send")
              ? "transfer"
              : "unknown";
  const isUnlimitedApproval = actionType === "approval" && (text.includes("unlimited") || text.includes("max"));

  return {
    selector,
    actionType,
    label: actionType === "unknown" ? "Unrecognized calldata or text intent" : `Text intent: ${actionType}`,
    isUnlimitedApproval,
    permissionChanges: actionType === "approval" ? ["Text intent requests a token spending approval."] : [],
    assetsAtRisk: [actionType === "unknown" ? "Unknown assets." : "Assets referenced by the transaction intent."]
  };
}

function splitWords(hex: string): string[] {
  const data = hex.replace(/^0x/, "").slice(8);
  const words: string[] = [];

  for (let index = 0; index < data.length; index += 64) {
    words.push(data.slice(index, index + 64));
  }

  return words.filter(Boolean);
}

function wordToAddress(word?: string): string | undefined {
  if (!word || word.length < 40) return undefined;
  return `0x${word.slice(-40)}`;
}
