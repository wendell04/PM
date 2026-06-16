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

// Standalone fs stub — used when node:fs shim doesn't provide existsSync.
// _interop_require_default(stub) wraps this as { default: stub },
// so _fs.default.existsSync works correctly.
const FS_STUB =
  `{existsSync:()=>false,` +
  `readFileSync:(p)=>{const e=new Error("ENOENT: no such file or directory, open '"+p+"'");e.code="ENOENT";throw e;},` +
  `promises:{` +
    `readFile:async(p)=>{const e=new Error("ENOENT:"+p);e.code="ENOENT";throw e;},` +
    `writeFile:async()=>{},` +
    `mkdir:async()=>{},` +
    `stat:async(p)=>{const e=new Error("ENOENT:"+p);e.code="ENOENT";throw e;}` +
  `},` +
  `writeFile:(p,d,o,cb)=>{(typeof o==="function"?o:cb)(null);},` +
  `mkdir:(p,o,cb)=>{(typeof o==="function"?o:cb)(null);},` +
  `stat:(p,cb)=>cb(Object.assign(new Error("ENOENT"),{code:"ENOENT"}))}`;

const banner = `${bannerImports}
globalThis.__cfNodeShims = { ${shimEntries} };
globalThis.__cfFsStub = ${FS_STUB};
globalThis.require = (id) => {
  const k = id.startsWith("node:") ? id.slice(5) : id;
  if (k === "fs") return globalThis.__cfFsStub;
  return globalThis.__cfNodeShims ? globalThis.__cfNodeShims[k] || void 0 : void 0;
};`;

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

// Post-process handler.mjs: OpenNext's bundle-server.js replaces all __require( → require(
// so the correct pattern to search is require("fs"), not __require("fs").
// Replace every occurrence with a reference to globalThis.__cfFsStub (set in the banner above).
const handlerPath = resolve(openNextDir, "server-functions/default/handler.mjs");
let handler = readFileSync(handlerPath, "utf-8");

let patchCount = 0;
for (const pat of ['require("fs")', "require('fs')", 'require("node:fs")', "require('node:fs')"]) {
  const parts = handler.split(pat);
  if (parts.length > 1) {
    patchCount += parts.length - 1;
    handler = parts.join("globalThis.__cfFsStub");
  }
}

if (patchCount > 0) {
  writeFileSync(handlerPath, handler);
  console.log(`[build-worker] Replaced ${patchCount} require("fs") call(s) with globalThis.__cfFsStub`);
} else {
  console.warn("[build-worker] No require(fs) calls found in handler.mjs — patch may be needed for a different pattern");
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
