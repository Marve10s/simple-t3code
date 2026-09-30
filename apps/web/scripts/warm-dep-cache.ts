// @effect-diagnostics nodeBuiltinImport:off - setup-script bootstrap, runs before any Effect runtime exists.
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { optimizeDeps, resolveConfig } from "vite";

const webRoot = NodePath.dirname(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)));

const config = await resolveConfig({ root: webRoot, logLevel: "error" }, "serve");
await optimizeDeps(config);
console.log("[warm-dep-cache] web dependency cache is warm");
