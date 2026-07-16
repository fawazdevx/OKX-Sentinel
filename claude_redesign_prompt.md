# Claude Prompt: Redesign OKX-Sentinel Frontend Dashboard

Copy and paste the prompt below into Claude to initiate the redesign.

---

### Prompt starts here:

```text
You are an expert Frontend Developer and Web3 UI/UX Designer. I want to completely redesign the frontend dashboard of my application, "OKX-Sentinel," to make it look premium, modern, sleek, and high-tech (Web3 dashboard style). 

I will provide the details of my product, the current codebase structure, and the visual/aesthetic guidelines. Please rewrite the React dashboard code (`src/client/main.tsx`) and the corresponding Vanilla CSS stylesheet (`src/client/styles.css`) to match this design.

---

### 1. Product Overview: What is OKX-Sentinel?
OKX-Sentinel is a pre-transaction risk firewall for Web3 wallets, ERC-20 tokens, smart contract approvals, and AI agents. It functions as an Agent Service Provider (ASP) risk gate. Before a user or an OKX.AI agent takes an on-chain action (e.g., signing a transaction, approving a contract, swapping a token), OKX-Sentinel answers the question: "Is this action safe?"

It supports 5 scan modes, each returning a standard risk payload (riskScore 0-100, riskLevel, detailed findings, recommended actions, confidence, and source metadata).

---

### 2. Codebase Structure & Stack
*   **Tech Stack**: Vite + React (v18) + TypeScript + Vanilla CSS + Lucide React (`lucide-react`) for icons.
*   **Routing**: Single-page application. All navigation is state-driven, handled in `src/client/main.tsx`.
*   **Backend Connection**: Feeds from an Express server at `apiBaseUrl` (defaults to the current host, configured via `import.meta.env.VITE_API_BASE_URL`).
*   **Key Files**:
    *   `src/client/main.tsx`: Contains the React component, API callers, form states, and dashboard rendering.
    *   `src/client/styles.css`: Custom vanilla CSS styling.
    *   `src/shared/types.ts`: Contains types like `ScanType`, `RiskLevel`, `RiskFinding`, `RiskResponse`, `TractionSummary`, and `ReadinessSummary`.

---

### 3. Core Functionality to Preserve (Do Not Break API Integrations)
You must keep the existing state management, type contracts, and backend handlers intact:
1.  **Scan Types (`ScanType`)**:
    *   `wallet`: Calls `/api/scan/wallet`
    *   `token`: Calls `/api/scan/token`
    *   `transaction`: Calls `/api/explain/transaction`
    *   `approval`: Calls `/api/analyze/approval`
    *   `policy`: Calls `/api/policy/evaluate`
2.  **API Hooks & Fetch Callers**:
    *   `runScan(nextForm)`: Sends POST request with inputs mapping to JSON bodies matching the respective schemas.
    *   `refreshOps()`: Polls `/api/traction` (TractionSummary) and `/api/asp/readiness` (ReadinessSummary) to update metrics.
3.  **Dynamic Example Fillers**: Keep handlers like `loadBlockedApprovalExample()` or form value resetting when changing scan types.
4.  **No New Dependencies**: Rely only on standard CSS and `lucide-react` icons (do not add Tailwind CSS or external component libraries unless instructed otherwise).

---

### 4. Redesign Vision & Aesthetics (The "Wow" Factor)
Make this dashboard look like a premium, state-of-the-art security command center:
*   **Color Palette (Dark Cyber Theme)**:
    *   Base background: Very dark gray/black (`#05070a` to `#0d1117`).
    *   Cards/Panels: Semi-transparent dark panels with subtle borders (`rgba(255, 255, 255, 0.05)`) and micro-glow effects.
    *   Accent Colors (Status-driven):
        *   Safe / Low Risk: Neon Emerald Green (`#10b981` or `#35d07f`)
        *   Medium Risk: Electric Amber (`#f59e0b` or `#f4bf4f`)
        *   High Risk: Neon Orange-Red (`#f97316` or `#ff5d5d`)
        *   Critical Risk / Blocked: Deep Crimson / Glowing Hot Magenta (`#ef4444` or `#ff3d7f`)
        *   Brand Accent: Glowing Cyan/Sky Blue (`#3b82f6` or `#4fb6ff`)
*   **Typography**: Clean, highly readable geometric font stack (e.g., Inter, Outfit, or Space Grotesk) with clear size hierarchies.
*   **Visual Elements & Micro-animations**:
    *   **Scan Loader**: A glowing radar scan animation, pulse effect, or cybernetic progress ring while `scanState.status === "loading"`.
    *   **Risk Score Gauge**: Instead of just displaying a number, render a gorgeous animated circular progress gauge, a glowing dial, or a dynamic scale indicator color-coded by the severity level.
    *   **Traction Meter**: Layout `/api/traction` metrics (qualified revenue, estimated value protected, total calls) as sleek, neon-bordered KPI grid cards.
    *   **Readiness Checklist**: Render the production readiness items with clean indicator pills (`ready` = green check, `needs-config` = amber warning) rather than a boring checklist.
    *   **Responsive layout**: A two-column grid on desktop (e.g., Interactive Input Form on the left, live Results Panel + Ops Telemetry on the right) collapsing into a single column on mobile.

---

### 5. Task & Deliverables
1.  **Refactor `src/client/styles.css`**: Create CSS custom properties (variables) for the color scheme, layout grid, typography, borders, card styles, and animations. Implement smooth transition effects for hover states and form focus.
2.  **Refactor `src/client/main.tsx`**: Clean up the component layout. Group components logically, improve form control layouts, design a visually striking results header showing the risk level, and display findings and recommendations in clean cards with category icons.
3.  **JSON View Toggle**: Keep a collapsible or tabbed raw JSON response viewer for developers using the API or MCP tools.

Please provide the complete updated code for both `src/client/styles.css` and `src/client/main.tsx` so I can replace my existing files directly.
```

---

### Copy-paste Instructions:
1.  Click **Copy** on the block above.
2.  Paste it directly into Claude.
3.  Claude will generate the fully redesigned React dashboard code and CSS stylesheet for you.
4.  Once Claude gives you the code, copy it back into [main.tsx](file:///home/fawazdev/hack-projects/OKX-Sentinel/src/client/main.tsx) and [styles.css](file:///home/fawazdev/hack-projects/OKX-Sentinel/src/client/styles.css) in your local workspace.
