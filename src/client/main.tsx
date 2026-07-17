import React from "react";
import ReactDOM from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  Copy,
  FileCode2,
  Fingerprint,
  KeyRound,
  Lock,
  Radar,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  Wallet
} from "lucide-react";
import { supportedChains } from "../shared/chains";
import {
  exampleInputs,
  exampleSpender,
  exampleToken,
  exampleWallet,
  exampleUnlimitedApprovalCalldata,
  exampleTokens,
  exampleWallets
} from "../shared/examples";
import type { ChainId, RiskFinding, RiskLevel, RiskResponse, ScanType } from "../shared/types";
import "./styles.css";

type FormState = {
  scanType: ScanType;
  chainId: ChainId;
  wallet: string;
  tokenAddress: string;
  spender: string;
  txData: string;
  agentId: string;
  actionValueUsd: number;
  maxAllowedRiskScore: number;
  requireReviewAbove: number;
  spendLimitUsd: number;
  blockUnlimitedApprovals: boolean;
};

type ScanState =
  | { status: "empty"; data?: undefined; error?: undefined }
  | { status: "loading"; data?: RiskResponse; error?: undefined }
  | { status: "success"; data: RiskResponse; error?: undefined }
  | { status: "error"; data?: RiskResponse; error: string };

type TractionSummary = {
  totalCalls: number;
  mcpCalls: number;
  premiumCalls: number;
  paymentProofCalls: number;
  verifiedPaymentCalls: number;
  blockedActions: number;
  qualifiedRevenueUsd: number;
  projectedRevenueUsd: number;
  blockedActionValueUsd: number;
};

type ReadinessSummary = {
  recommendedTrack: string;
  publicBaseUrl: string;
  reviewChecklist: Array<{
    item: string;
    status: "ready" | "needs-production-config" | "operator-action-required" | string;
    evidence: string;
  }>;
};

type OpsState = {
  traction?: TractionSummary;
  readiness?: ReadinessSummary;
};

type Tone = "safe" | "caution" | "danger" | "critical" | "neutral";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

const initialForm: FormState = {
  scanType: "policy",
  chainId: exampleInputs.policy.chainId,
  wallet: exampleWallet,
  tokenAddress: exampleToken,
  spender: exampleSpender,
  txData: exampleUnlimitedApprovalCalldata,
  agentId: exampleInputs.policy.agentId ?? "okx-agent-risk-gate",
  actionValueUsd: exampleInputs.policy.actionValueUsd ?? 500,
  maxAllowedRiskScore: exampleInputs.policy.policy?.maxAllowedRiskScore ?? 64,
  requireReviewAbove: exampleInputs.policy.policy?.requireReviewAbove ?? 35,
  spendLimitUsd: exampleInputs.policy.policy?.spendLimitUsd ?? 500,
  blockUnlimitedApprovals: exampleInputs.policy.policy?.blockUnlimitedApprovals ?? true
};

const scanConfig: Record<
  ScanType,
  {
    label: string;
    icon: React.ReactNode;
    path: string;
    description: string;
    action: string;
  }
> = {
  policy: {
    label: "Agent action",
    icon: <Bot size={18} />,
    path: "/api/policy/evaluate",
    description: "Decide allow, review, or block before an agent asks a wallet to sign.",
    action: "Check action"
  },
  transaction: {
    label: "Transaction",
    icon: <FileCode2 size={18} />,
    path: "/api/explain/transaction",
    description: "Plain-English intent, permission changes, and unsafe calldata warnings.",
    action: "Explain transaction"
  },
  approval: {
    label: "Approval",
    icon: <KeyRound size={18} />,
    path: "/api/analyze/approval",
    description: "Spender reputation, excessive allowance detection, and a revoke plan.",
    action: "Analyze approval"
  },
  token: {
    label: "Token",
    icon: <Coins size={18} />,
    path: "/api/scan/token",
    description: "Contract metadata, proxy/admin controls, and bytecode risk indicators.",
    action: "Scan token"
  },
  wallet: {
    label: "Wallet",
    icon: <Wallet size={18} />,
    path: "/api/scan/wallet",
    description: "Native balance and account type when a live RPC is configured.",
    action: "Scan wallet"
  }
};

const scanOrder: ScanType[] = ["policy", "transaction", "approval", "token", "wallet"];

function App() {
  const [form, setForm] = React.useState<FormState>(initialForm);
  const [scanState, setScanState] = React.useState<ScanState>({ status: "empty" });
  const [opsState, setOpsState] = React.useState<OpsState>({});
  const [apiOnline, setApiOnline] = React.useState<boolean | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    void runScan(initialForm);
    void refreshOps();
  }, []);

  async function runScan(nextForm = form) {
    setScanState((previous) => ({ status: "loading", data: previous.data }));

    try {
      const response = await fetch(`${apiBaseUrl}${scanConfig[nextForm.scanType].path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildPayload(nextForm))
      });

      const payload = (await response.json()) as RiskResponse | { error?: { message?: string } };
      setApiOnline(true);

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error?.message ?? "Scan failed" : "Scan failed");
      }

      setApiOnline(true);
      setScanState({ status: "success", data: payload as RiskResponse });
      void refreshOps();
    } catch (error) {
      setApiOnline(false);
      setScanState({
        status: "error",
        error:
          error instanceof Error && error.message
            ? error.message
            : "Could not reach the Sentinel API. Make sure the server is running."
      });
    }
  }

  async function refreshOps() {
    try {
      const [tractionResponse, readinessResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/api/traction`),
        fetch(`${apiBaseUrl}/api/asp/readiness`)
      ]);

      const [traction, readiness] = await Promise.all([
        tractionResponse.ok ? (tractionResponse.json() as Promise<TractionSummary>) : Promise.resolve(undefined),
        readinessResponse.ok ? (readinessResponse.json() as Promise<ReadinessSummary>) : Promise.resolve(undefined)
      ]);

      setOpsState({ traction, readiness });
    } catch {
      setOpsState({});
    }
  }

  function setScanType(scanType: ScanType) {
    setForm((current) => ({
      ...current,
      scanType,
      ...(scanType === "wallet" ? exampleInputs.wallet : {}),
      ...(scanType === "token" ? exampleInputs.token : {}),
      ...(scanType === "transaction" ? exampleInputs.transaction : {}),
      ...(scanType === "approval" ? exampleInputs.approval : {}),
      ...(scanType === "policy"
        ? {
            txData: exampleInputs.policy.txData,
            wallet: exampleInputs.policy.wallet ?? current.wallet,
            agentId: exampleInputs.policy.agentId ?? current.agentId,
            chainId: exampleInputs.policy.chainId,
            actionValueUsd: exampleInputs.policy.actionValueUsd ?? current.actionValueUsd,
            maxAllowedRiskScore: exampleInputs.policy.policy?.maxAllowedRiskScore ?? current.maxAllowedRiskScore,
            requireReviewAbove: exampleInputs.policy.policy?.requireReviewAbove ?? current.requireReviewAbove,
            spendLimitUsd: exampleInputs.policy.policy?.spendLimitUsd ?? current.spendLimitUsd,
            blockUnlimitedApprovals: exampleInputs.policy.policy?.blockUnlimitedApprovals ?? current.blockUnlimitedApprovals
          }
        : {})
    }));
  }

  function loadBlockedApprovalExample() {
    const nextForm: FormState = {
      ...form,
      scanType: "policy",
      wallet: exampleWallet,
      tokenAddress: exampleToken,
      spender: exampleSpender,
      txData: exampleUnlimitedApprovalCalldata,
      chainId: exampleInputs.policy.chainId,
      agentId: exampleInputs.policy.agentId ?? "okx-agent-risk-gate",
      actionValueUsd: 500,
      maxAllowedRiskScore: 64,
      requireReviewAbove: 35,
      spendLimitUsd: 500,
      blockUnlimitedApprovals: true
    };
    setForm(nextForm);
    void runScan(nextForm);
  }

  function loadSafeTransferExample() {
    const nextForm: FormState = {
      ...form,
      scanType: "policy",
      wallet: exampleWallets[1].value,
      tokenAddress: exampleTokens[1].value,
      spender: "0x000000000022d473030f116ddee9f6b43ac78ba3",
      txData: "transfer 10 USDC to a settlement wallet",
      chainId: 8453 as ChainId,
      agentId: "okx-agent-conservative",
      actionValueUsd: 10,
      maxAllowedRiskScore: 64,
      requireReviewAbove: 35,
      spendLimitUsd: 1000,
      blockUnlimitedApprovals: true
    };
    setForm(nextForm);
    void runScan(nextForm);
  }

  async function copyJson() {
    if (!scanState.data) return;
    await navigator.clipboard.writeText(JSON.stringify(scanState.data, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  const activeResult = scanState.data;
  const isLoading = scanState.status === "loading";

  return (
    <div className="app-shell">
      <div className="ambient" aria-hidden />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Radar size={22} />
          </span>
          <div className="brand-text">
            <h1>OKX Sentinel</h1>
            <p>Free A2MCP pre-transaction risk firewall for wallets, tokens &amp; AI agents</p>
          </div>
        </div>
        <div className="topbar-status">
          <span className={`live-dot ${apiOnline === false ? "offline" : apiOnline ? "online" : "pending"}`} />
          <span className="live-label">
            {apiOnline === false ? "API offline" : apiOnline ? "Live · non-custodial" : "Connecting…"}
          </span>
        </div>
      </header>

      <main className="workspace">
        <aside className="scanner">
          <div className="scanner-head">
            <p className="eyebrow">Check before you sign</p>
            <h2>What do you want to review?</h2>
          </div>

          <div className="scan-types" role="tablist" aria-label="What to scan">
            {scanOrder.map((scanType) => {
              const active = form.scanType === scanType;
              return (
                <button
                  key={scanType}
                  role="tab"
                  aria-selected={active}
                  className={`scan-type ${active ? "active" : ""}`}
                  type="button"
                  onClick={() => setScanType(scanType)}
                >
                  <span className="scan-type-icon">{scanConfig[scanType].icon}</span>
                  <span className="scan-type-label">{scanConfig[scanType].label}</span>
                </button>
              );
            })}
          </div>

          <p className="scan-desc">{scanConfig[form.scanType].description}</p>

          <div className="fields">
            <label className="field">
              <span className="field-label">Network</span>
              <select
                value={form.chainId}
                onChange={(event) => setForm({ ...form, chainId: Number(event.target.value) as ChainId })}
              >
                {supportedChains.map((chain) => (
                  <option value={chain.id} key={chain.id}>
                    {chain.name}
                  </option>
                ))}
              </select>
            </label>

            {form.scanType === "wallet" && (
              <AddressInput
                label="Wallet address"
                value={form.wallet}
                onChange={(wallet) => setForm({ ...form, wallet })}
                helper="Reads live balance and account type. Full approval and holdings history needs a connected indexer."
              />
            )}

            {form.scanType === "token" && (
              <AddressInput
                label="Token contract"
                value={form.tokenAddress}
                onChange={(tokenAddress) => setForm({ ...form, tokenAddress })}
                helper="Checks metadata, proxy setup, admin controls, and privileged-function indicators."
              />
            )}

            {form.scanType === "transaction" && (
              <label className="field">
                <span className="field-label">Transaction data or plain-English intent</span>
                <textarea
                  value={form.txData}
                  onChange={(event) => setForm({ ...form, txData: event.target.value })}
                  spellCheck={false}
                  rows={7}
                  placeholder="Paste raw calldata (0x…) or describe the action"
                />
              </label>
            )}

            {form.scanType === "approval" && (
              <>
                <AddressInput label="Wallet" value={form.wallet} onChange={(wallet) => setForm({ ...form, wallet })} />
                <AddressInput label="Token" value={form.tokenAddress} onChange={(tokenAddress) => setForm({ ...form, tokenAddress })} />
                <AddressInput label="Spender" value={form.spender} onChange={(spender) => setForm({ ...form, spender })} />
              </>
            )}

            {form.scanType === "policy" && (
              <>
                <AddressInput
                  label="Wallet or smart account"
                  value={form.wallet}
                  onChange={(wallet) => setForm({ ...form, wallet })}
                />
                <label className="field">
                  <span className="field-label">Agent ID</span>
                  <input
                    value={form.agentId}
                    onChange={(event) => setForm({ ...form, agentId: event.target.value })}
                    spellCheck={false}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Transaction data or plain-English intent</span>
                  <textarea
                    value={form.txData}
                    onChange={(event) => setForm({ ...form, txData: event.target.value })}
                    spellCheck={false}
                    rows={5}
                    placeholder="Paste raw calldata (0x…) or describe the action"
                  />
                </label>

                <fieldset className="policy-fieldset">
                  <legend>Policy limits</legend>
                  <div className="policy-grid">
                    <label className="field compact">
                      <span className="field-label">Action value (USD)</span>
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={form.actionValueUsd}
                        onChange={(event) => setForm({ ...form, actionValueUsd: Number(event.target.value) })}
                      />
                    </label>
                    <label className="field compact">
                      <span className="field-label">Block above</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={form.maxAllowedRiskScore}
                        onChange={(event) => setForm({ ...form, maxAllowedRiskScore: Number(event.target.value) })}
                      />
                    </label>
                    <label className="field compact">
                      <span className="field-label">Review above</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={form.requireReviewAbove}
                        onChange={(event) => setForm({ ...form, requireReviewAbove: Number(event.target.value) })}
                      />
                    </label>
                    <label className="field compact">
                      <span className="field-label">Spend limit (USD)</span>
                      <input
                        type="number"
                        min={1}
                        value={form.spendLimitUsd}
                        onChange={(event) => setForm({ ...form, spendLimitUsd: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={form.blockUnlimitedApprovals}
                      onChange={(event) => setForm({ ...form, blockUnlimitedApprovals: event.target.checked })}
                    />
                    <span>Block unlimited approvals</span>
                  </label>
                </fieldset>
              </>
            )}
          </div>

          <button className="run-button" type="button" onClick={() => void runScan()} disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="spinner" aria-hidden />
                Scanning…
              </>
            ) : (
              <>
                {scanConfig[form.scanType].action}
                <ArrowRight size={18} />
              </>
            )}
          </button>

          <div className="examples">
            <span className="examples-label">Try an example</span>
            <div className="example-chips">
              <button type="button" className="example-chip" onClick={loadBlockedApprovalExample} disabled={isLoading}>
                <ShieldX size={15} />
                <span>
                  Unlimited approval
                  <small>gets blocked</small>
                </span>
              </button>
              <button type="button" className="example-chip" onClick={loadSafeTransferExample} disabled={isLoading}>
                <ShieldCheck size={15} />
                <span>
                  Low-risk intent
                  <small>allowed by policy</small>
                </span>
              </button>
            </div>
          </div>
        </aside>

        <section className="results">
          {scanState.status === "error" && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={18} />
              <span>{scanState.error}</span>
              <button type="button" onClick={() => void runScan()}>
                Retry
              </button>
            </div>
          )}

          <VerdictHero result={activeResult} loading={isLoading} />

          <div className="results-grid">
            <FindingsPanel findings={activeResult?.findings ?? []} loading={isLoading} />
            <div className="results-side">
              <ActionsPanel result={activeResult} loading={isLoading} />
              <SigningPanel result={activeResult} />
            </div>
          </div>

          <ActivityStrip traction={opsState.traction} />

          <SystemStatus readiness={opsState.readiness} />

          <DeveloperPanel result={activeResult} onCopy={() => void copyJson()} copied={copied} />
        </section>
      </main>
    </div>
  );
}

function AddressInput({
  label,
  value,
  onChange,
  helper
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} placeholder="0x…" />
      {helper && <small className="field-help">{helper}</small>}
    </label>
  );
}

function VerdictHero({ result, loading }: { result?: RiskResponse; loading: boolean }) {
  const verdict = buildVerdict(result);
  const score = result?.riskScore ?? 0;
  const firstResult = loading && !result;

  return (
    <section className={`verdict tone-${verdict.tone}`} aria-live="polite">
      <div className="verdict-gauge">
        <RiskGauge score={score} tone={verdict.tone} loading={firstResult} />
      </div>
      <div className="verdict-body">
        <div className="verdict-badge">
          {verdictIcon(verdict.tone)}
          <span>{firstResult ? "Scanning" : verdict.headline}</span>
        </div>
        <p className="verdict-summary">
          {firstResult
            ? "Reading on-chain data and evaluating risk…"
            : result?.summary ?? verdict.subline}
        </p>
        {result && (
          <div className="verdict-meta">
            <span className="meta-chip">{humanizeTool(result.tool)}</span>
            <span className="meta-chip">{Math.round(result.confidence * 100)}% confidence</span>
            {result.dataSourcesUsed.slice(0, 2).map((source) => (
              <span className="meta-chip subtle" key={source}>
                {source}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function RiskGauge({ score, tone, loading }: { score: number; tone: Tone; loading: boolean }) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className={`gauge tone-${tone} ${loading ? "loading" : ""}`}>
      <svg viewBox="0 0 140 140" className="gauge-svg" role="img" aria-label={`Risk score ${loading ? "pending" : clamped} of 100`}>
        <circle className="gauge-track" cx="70" cy="70" r={radius} />
        <circle
          className="gauge-arc"
          cx="70"
          cy="70"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={loading ? circumference : offset}
          transform="rotate(-90 70 70)"
        />
      </svg>
      <div className="gauge-center">
        <span className="gauge-score">{loading ? "–" : clamped}</span>
        <span className="gauge-unit">/ 100 risk</span>
      </div>
      {loading && <span className="gauge-sweep" aria-hidden />}
    </div>
  );
}

function FindingsPanel({ findings, loading }: { findings: RiskFinding[]; loading: boolean }) {
  return (
    <section className="panel findings">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Evidence</p>
          <h3>Findings</h3>
        </div>
        <span className="count">{loading && findings.length === 0 ? "…" : findings.length}</span>
      </div>

      {findings.length === 0 ? (
        <div className="empty">
          {loading ? (
            <>
              <span className="spinner dark" aria-hidden />
              Collecting evidence…
            </>
          ) : (
            <>
              <ShieldCheck size={18} />
              No risk signals found for this input.
            </>
          )}
        </div>
      ) : (
        <ul className="finding-list">
          {findings.map((finding) => (
            <li className={`finding sev-${finding.severity}`} key={finding.id}>
              <span className="finding-bar" aria-hidden />
              <div className="finding-content">
                <div className="finding-top">
                  <h4>{finding.title}</h4>
                  <span className="finding-cat">{finding.category}</span>
                </div>
                <p>{finding.description}</p>
                {finding.recommendation && (
                  <div className="finding-rec">
                    <ChevronRight size={14} />
                    {finding.recommendation}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActionsPanel({ result, loading }: { result?: RiskResponse; loading: boolean }) {
  const actions = result?.recommendedActions ?? [];
  const limitations = result?.limitations ?? [];

  return (
    <section className="panel actions">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Next steps</p>
          <h3>What to do</h3>
        </div>
      </div>

      {actions.length === 0 ? (
        <div className="empty small">
          {loading ? "Preparing recommendations…" : "Run a scan to get prioritized next steps."}
        </div>
      ) : (
        <ol className="action-list">
          {actions.map((action) => (
            <li key={action}>
              <Check size={15} />
              <span>{action}</span>
            </li>
          ))}
        </ol>
      )}

      {limitations.length > 0 && (
        <div className="limitations">
          <span className="limitations-label">What this scan does not cover</span>
          <ul>
            {limitations.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SigningPanel({ result }: { result?: RiskResponse }) {
  const metadata = result?.metadata as
    | {
        decision?: string;
        signingHandoff?: { status?: string; reason?: string };
      }
    | undefined;
  const decision = metadata?.decision;
  const reason = metadata?.signingHandoff?.reason;

  const tone: Tone = decision === "block" ? "critical" : decision === "review" ? "caution" : "safe";
  const title =
    decision === "block"
      ? "Do not sign"
      : decision === "review"
        ? "Confirm before signing"
        : "You hold the keys";

  return (
    <section className={`panel signing tone-${tone}`}>
      <div className="signing-head">
        <span className="signing-icon">
          <Lock size={16} />
        </span>
        <h3>{title}</h3>
      </div>
      <p>
        Sentinel never holds keys, never signs, and never broadcasts. It returns an allow / review / block decision that
        your own wallet enforces.
      </p>
      {reason && <div className="signing-reason">{reason}</div>}
    </section>
  );
}

function ActivityStrip({ traction }: { traction?: TractionSummary }) {
  const checked = traction?.totalCalls ?? 0;
  const blocked = traction?.blockedActions ?? 0;
  const blockedValueUsd = traction?.blockedActionValueUsd ?? 0;

  return (
    <section className="activity">
      <div className="activity-head">
        <Activity size={16} />
        <span>Protection activity this session</span>
      </div>
      <div className="activity-metrics">
        <div className="activity-metric">
          <strong>{formatNumber(checked)}</strong>
          <span>Actions checked</span>
        </div>
        <div className="activity-metric">
          <strong>{formatNumber(blocked)}</strong>
          <span>Risks blocked</span>
        </div>
        <div className="activity-metric">
          <strong>{blockedValueUsd > 0 ? `$${formatMoney(blockedValueUsd)}` : "—"}</strong>
          <span>Blocked action value</span>
        </div>
      </div>
    </section>
  );
}

function SystemStatus({ readiness }: { readiness?: ReadinessSummary }) {
  const [open, setOpen] = React.useState(false);
  const checklist = readiness?.reviewChecklist ?? [];

  if (checklist.length === 0) {
    return null;
  }

  const ready = checklist.filter((item) => item.status === "ready").length;
  const allReady = ready === checklist.length;

  return (
    <section className="collapsible">
      <button type="button" className="collapsible-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className={`status-dot ${allReady ? "ok" : "warn"}`} />
        <span className="collapsible-title">System status</span>
        <span className="collapsible-meta">
          {ready}/{checklist.length} operational
        </span>
        <ChevronDown size={16} className={`chevron ${open ? "open" : ""}`} />
      </button>
      {open && (
        <ul className="status-list">
          {checklist.map((item) => {
            const ok = item.status === "ready";
            return (
              <li className="status-item" key={item.item}>
                <span className={`status-dot ${ok ? "ok" : "warn"}`} />
                <div>
                  <div className="status-item-top">
                    <strong>{item.item}</strong>
                    <span className={`status-tag ${ok ? "ok" : "warn"}`}>{ok ? "Operational" : "Config needed"}</span>
                  </div>
                  <p>{item.evidence}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function DeveloperPanel({ result, onCopy, copied }: { result?: RiskResponse; onCopy: () => void; copied: boolean }) {
  const [open, setOpen] = React.useState(false);

  return (
    <section className="collapsible">
      <div className="collapsible-head static">
        <Fingerprint size={16} />
        <span className="collapsible-title">Structured API response</span>
        <span className="collapsible-meta">JSON · MCP 2025-11-25</span>
        <div className="collapsible-actions">
          <button type="button" className="mini-button" onClick={onCopy} disabled={!result}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" className="mini-button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            {open ? "Hide" : "View"}
            <ChevronDown size={14} className={`chevron ${open ? "open" : ""}`} />
          </button>
        </div>
      </div>
      {open && (
        <pre className="json-view">
          {result ? JSON.stringify(result, null, 2) : "Run a scan to view the structured response."}
        </pre>
      )}
    </section>
  );
}

function buildVerdict(result?: RiskResponse): { tone: Tone; headline: string; subline: string } {
  const level: RiskLevel = result?.riskLevel ?? "Low";
  const decision = readDecision(result);

  if (decision === "block") {
    return { tone: "critical", headline: "Blocked", subline: "This action is unsafe to sign." };
  }
  if (decision === "review") {
    return { tone: "caution", headline: "Needs review", subline: "Confirm the details before signing." };
  }
  if (decision === "allow") {
    return { tone: "safe", headline: "Allowed by policy", subline: "No configured blocking condition was detected." };
  }

  const sublineByLevel: Record<RiskLevel, string> = {
    Low: "No significant risks detected.",
    Medium: "Some risks worth reviewing.",
    High: "Serious risks detected — proceed carefully.",
    Critical: "Severe risks detected — do not proceed."
  };

  return { tone: toneForLevel(level), headline: `${level} risk`, subline: sublineByLevel[level] };
}

function readDecision(result?: RiskResponse): "allow" | "review" | "block" | undefined {
  const value = (result?.metadata as { decision?: unknown } | undefined)?.decision;
  return value === "allow" || value === "review" || value === "block" ? value : undefined;
}

function toneForLevel(level: RiskLevel): Tone {
  switch (level) {
    case "Low":
      return "safe";
    case "Medium":
      return "caution";
    case "High":
      return "danger";
    case "Critical":
      return "critical";
    default:
      return "neutral";
  }
}

function verdictIcon(tone: Tone) {
  if (tone === "safe") return <ShieldCheck size={18} />;
  if (tone === "caution") return <ShieldQuestion size={18} />;
  if (tone === "critical") return <ShieldX size={18} />;
  return <ShieldAlert size={18} />;
}

function humanizeTool(tool: string): string {
  return tool.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildPayload(form: FormState) {
  if (form.scanType === "wallet") {
    return { address: form.wallet, chainId: form.chainId };
  }

  if (form.scanType === "token") {
    return { tokenAddress: form.tokenAddress, chainId: form.chainId };
  }

  if (form.scanType === "transaction") {
    return { txData: form.txData, chainId: form.chainId };
  }

  if (form.scanType === "policy") {
    return {
      txData: form.txData,
      chainId: form.chainId,
      wallet: form.wallet,
      agentId: form.agentId,
      actionValueUsd: form.actionValueUsd,
      policy: {
        maxAllowedRiskScore: form.maxAllowedRiskScore,
        requireReviewAbove: form.requireReviewAbove,
        blockUnlimitedApprovals: form.blockUnlimitedApprovals,
        spendLimitUsd: form.spendLimitUsd
      }
    };
  }

  return {
    wallet: form.wallet,
    tokenAddress: form.tokenAddress,
    spender: form.spender,
    chainId: form.chainId
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
