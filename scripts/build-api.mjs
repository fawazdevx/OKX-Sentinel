// Bundles the Express server (src/server/index.ts and its entire src/ import
// graph + node_modules deps) into a single self-contained ESM file at
// api/app.mjs. The Vercel serverless function (api/index.ts) imports this
// bundle, so the deployed function never depends on Vercel tracing loose
// TypeScript files out of src/ — which is what produced ERR_MODULE_NOT_FOUND.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, "..");

await build({
  entryPoints: [path.join(projectRoot, "src/server/index.ts")],
  outfile: path.join(projectRoot, "api/app.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // express/cors are CommonJS; esbuild needs this shim so their internal
  // require() calls resolve inside the ESM output.
  banner: {
    js: "import { createRequire as __createRequire } from 'module';\nconst require = __createRequire(import.meta.url);"
  },
  logLevel: "info"
});

console.log("Built api/app.mjs");
