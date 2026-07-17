// Vercel serverless entry point.
//
// The Express app is imported lazily inside the handler so that ANY error —
// including a module-load / import-time crash in the app or its dependencies —
// is caught and surfaced in the HTTP response instead of producing an opaque
// FUNCTION_INVOCATION_FAILED (500) with no diagnostics. Once the deploy is
// confirmed healthy this can be simplified back to a direct `export default app`.
import type { IncomingMessage, ServerResponse } from "node:http";

type ExpressApp = (req: IncomingMessage, res: ServerResponse) => void;

let cachedApp: ExpressApp | undefined;

async function loadApp(): Promise<ExpressApp> {
  if (cachedApp) return cachedApp;
  const mod = await import("../src/server/index");
  cachedApp = (mod.default ?? mod) as ExpressApp;
  return cachedApp;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const app = await loadApp();
    app(req, res);
  } catch (error) {
    const detail = error instanceof Error ? `${error.stack ?? error.message}` : String(error);
    // eslint-disable-next-line no-console
    console.error("OKX Sentinel serverless init/handler error:", detail);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
    }
    res.end(
      JSON.stringify({
        error: {
          message: "Serverless handler failed to initialize.",
          statusCode: 500,
          detail
        }
      })
    );
  }
}
