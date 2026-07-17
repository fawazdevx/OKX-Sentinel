// Vercel serverless entry point.
//
// It imports the pre-bundled Express app from api/app.mjs (produced by
// scripts/build-api.mjs during `npm run build`). Bundling means the deployed
// function is fully self-contained and does not rely on Vercel tracing the
// src/ TypeScript tree — which previously failed with ERR_MODULE_NOT_FOUND.
//
// The app is imported lazily inside the handler so any load-time error is
// surfaced in the HTTP response instead of an opaque FUNCTION_INVOCATION_FAILED.
import type { IncomingMessage, ServerResponse } from "node:http";

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;

let cachedApp: NodeHandler | undefined;

async function loadApp(): Promise<NodeHandler> {
  if (cachedApp) return cachedApp;
  // @ts-expect-error - app.mjs is generated at build time and has no type decls.
  const mod = await import("./app.mjs");
  cachedApp = (mod.default ?? mod) as NodeHandler;
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
