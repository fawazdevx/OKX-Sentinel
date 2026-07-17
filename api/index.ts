// Vercel serverless entry point.
//
// Vercel's @vercel/node runtime builds this file and invokes the default export
// as the request handler. An Express app is itself a (req, res) handler, so we
// simply re-export the shared app. All /api/* and /.well-known/* requests are
// routed here by vercel.json; the Vite frontend is served as static assets.
import app from "../src/server/index";

export default app;
