import { build } from "esbuild";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { readFileSync, writeFileSync, unlinkSync } from "fs";

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

const cfAvailableModules = [
  "assert", "async_hooks", "buffer", "crypto", "events", "fs",
  "http", "https", "module", "net", "os", "path", "process",
  "querystring", "stream", "string_decoder", "timers", "tls",
  "url", "util", "zlib",
];

const bannerImports = cfAvailableModules
  .map((m) => `import * as __shim_${m.replace(/[^a-z]/g, "_")} from "node:${m}";`)
  .join("\n");

const shimEntries = cfAvailableModules
  .map((m) => `"${m}": __shim_${m.replace(/[^a-z]/g, "_")}`)
  .join(", ");

const banner = `${bannerImports}
globalThis.__cfNodeShims = { ${shimEntries} };
globalThis.require = (id) => { const k = id.startsWith("node:") ? id.slice(5) : id; return globalThis.__cfNodeShims[k] || void 0; };`;

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

// Post-process handler.mjs: target the SPECIFIC __require("fs") call inside the
// node-fs-methods.js section and replace it with a direct ESM import reference.
// This bypasses __require entirely — esbuild's variable renaming can't break a
// direct import binding.
const handlerPath = resolve(openNextDir, "server-functions/default/handler.mjs");
let handler = readFileSync(handlerPath, "utf-8");

const sectionKey = "node-fs-methods.js";
const sectionIdx = handler.indexOf(sectionKey);

if (sectionIdx !== -1) {
  let patched = false;
  for (const pattern of ['__require("fs")', "__require('fs')"]) {
    const idx = handler.indexOf(pattern, sectionIdx);
    if (idx !== -1 && idx < sectionIdx + 3000) {
      handler =
        'import * as __cfNodeFs from "node:fs";\n' +
        handler.slice(0, idx) +
        "__cfNodeFs" +
        handler.slice(idx + pattern.length);
      writeFileSync(handlerPath, handler);
      console.log("[build-worker] Patched node:fs direct import in node-fs-methods.js");
      patched = true;
      break;
    }
  }
  if (!patched) {
    console.warn("[build-worker] Could not find __require('fs') near node-fs-methods.js section");
  }
} else {
  console.warn("[build-worker] node-fs-methods.js section not found in handler.mjs");
}

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
