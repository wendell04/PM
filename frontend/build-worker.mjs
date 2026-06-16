import { build } from "esbuild";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { writeFileSync, unlinkSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const openNextDir = resolve(__dirname, ".open-next");

const nodeModules = [
  "assert", "async_hooks", "buffer", "child_process", "cluster",
  "console", "constants", "crypto", "dgram", "diagnostics_channel",
  "dns", "domain", "events", "fs", "http", "http2", "https",
  "inspector", "module", "net", "os", "path", "perf_hooks", "process",
  "punycode", "querystring", "readline", "repl", "stream",
  "string_decoder", "timers", "tls", "trace_events", "tty", "url",
  "util", "v8", "vm", "wasi", "worker_threads", "zlib",
];

// Modules available in CF Workers with nodejs_compat
const cfAvailableModules = [
  "assert", "async_hooks", "buffer", "crypto", "events", "fs",
  "http", "https", "module", "net", "os", "path", "process",
  "querystring", "stream", "string_decoder", "timers", "tls",
  "url", "util", "zlib",
];

// Banner: injects a require() polyfill so OpenNext's internal __require helper
// (which checks `typeof require !== "undefined"`) can load node: modules at runtime.
const bannerImports = cfAvailableModules
  .map((m) => `import * as __shim_${m.replace(/[^a-z]/g, "_")} from "node:${m}";`)
  .join("\n");

const bannerCases = cfAvailableModules
  .map((m) => `case "${m}": case "node:${m}": return __shim_${m.replace(/[^a-z]/g, "_")};`)
  .join("\n  ");

const banner = `${bannerImports}
globalThis.require = (id) => { switch(id) { ${bannerCases} default: return undefined; } };`;

// Plugin handles esbuild-level CJS require() resolutions (build-time)
const cjsNodeShimPlugin = {
  name: "cjs-node-shim",
  setup(build) {
    const nodePattern = new RegExp(`^(node:)?(${nodeModules.join("|")})$`);
    build.onResolve({ filter: nodePattern }, (args) => {
      if (args.kind !== "require-call" && args.kind !== "dynamic-import") return;
      const mod = args.path.startsWith("node:") ? args.path : `node:${args.path}`;
      return { path: mod, namespace: "cjs-node-shim" };
    });
    build.onLoad({ filter: /.*/, namespace: "cjs-node-shim" }, (args) => ({
      contents: `export * from "${args.path}";`,
      loader: "js",
    }));
  },
};

const wrapperPath = resolve(openNextDir, "_debug_entry.mjs");
writeFileSync(wrapperPath, `
export { DOQueueHandler } from "./.build/durable-objects/queue.js";
export { DOShardedTagCache } from "./.build/durable-objects/sharded-tag-cache.js";
export { BucketCachePurge } from "./.build/durable-objects/bucket-cache-purge.js";

let _worker;
let _initError;

try {
  const mod = await import("./worker.js");
  _worker = mod.default;
} catch (e) {
  _initError = e;
}

export default {
  async fetch(request, env, ctx) {
    if (_initError) {
      return new Response(
        "[INIT ERROR]\\n" + (_initError?.stack || String(_initError)),
        { status: 500, headers: { "content-type": "text/plain" } }
      );
    }
    try {
      return await _worker.fetch(request, env, ctx);
    } catch (e) {
      return new Response(
        "[FETCH ERROR]\\n" + (e?.stack || String(e)),
        { status: 500, headers: { "content-type": "text/plain" } }
      );
    }
  }
};
`);

await build({
  entryPoints: [wrapperPath],
  bundle: true,
  outfile: resolve(__dirname, ".open-next/assets/_worker.js"),
  format: "esm",
  platform: "neutral",
  conditions: ["workerd", "worker", "browser"],
  mainFields: ["worker", "browser", "module", "main"],
  alias: Object.fromEntries(nodeModules.map((m) => [m, `node:${m}`])),
  external: [...nodeModules.map((m) => `node:${m}`), "cloudflare:*"],
  plugins: [cjsNodeShimPlugin],
  banner: { js: banner },
  logLevel: "info",
});

unlinkSync(wrapperPath);
