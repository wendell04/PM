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

// FIX #1: Import BOTH namespace (*) and default export for each module.
// Using only `import * as` returns the ESM namespace object which does NOT
// expose CJS-style properties like stream.Readable, stream.Writable, etc.
// Merging namespace + default ensures both named exports and CJS properties work.
const bannerImports = cfAvailableModules
  .map((m) => {
    const key = m.replace(/[^a-z]/g, "_");
    return [
      `import * as __shim_ns_${key} from "node:${m}";`,
      `import __shim_def_${key} from "node:${m}";`,
    ].join("\n");
  })
  .join("\n");

const shimEntries = cfAvailableModules
  .map((m) => {
    const key = m.replace(/[^a-z]/g, "_");
    // Merge: default export first (CJS properties like .Readable),
    // then namespace on top (named ESM exports). Object.create(null) avoids
    // prototype pollution issues in the Workers runtime.
    return `"${m}": Object.assign(Object.create(null), __shim_ns_${key}, __shim_def_${key} || {})`;
  })
  .join(", ");

// FIX #2: Expanded fs stub — added readdirSync, statSync, mkdirSync, and
// promises.readdir which Next.js server internals call. Missing these causes
// secondary crashes after the stream.Readable fix.
const FS_STUB =
  `{existsSync:()=>false,` +
  `readFileSync:(p)=>{const e=new Error("ENOENT: no such file or directory, open '"+p+"'");e.code="ENOENT";throw e;},` +
  `readdirSync:(p)=>{const e=new Error("ENOENT: no such file or directory, scandir '"+p+"'");e.code="ENOENT";throw e;},` +
  `statSync:(p)=>{const e=new Error("ENOENT: no such file or directory, stat '"+p+"'");e.code="ENOENT";throw e;},` +
  `mkdirSync:()=>{},` +
  `promises:{` +
    `readFile:async(p)=>{const e=new Error("ENOENT:"+p);e.code="ENOENT";throw e;},` +
    `writeFile:async()=>{},` +
    `mkdir:async()=>{},` +
    `stat:async(p)=>{const e=new Error("ENOENT:"+p);e.code="ENOENT";throw e;},` +
    `readdir:async(p)=>{const e=new Error("ENOENT:"+p);e.code="ENOENT";throw e;}` +
  `},` +
  `writeFile:(p,d,o,cb)=>{(typeof o==="function"?o:cb)(null);},` +
  `mkdir:(p,o,cb)=>{(typeof o==="function"?o:cb)(null);},` +
  `stat:(p,cb)=>cb(Object.assign(new Error("ENOENT"),{code:"ENOENT"}))}`;

// FIX #3: globalThis.require now unwraps `.default` when present.
// Previously if shim had a `default` key (from ESM default import),
// CJS consumers doing require("stream").Readable got undefined because
// they were accessing the namespace wrapper instead of the actual module.
const banner = `${bannerImports}
globalThis.__cfNodeShims = { ${shimEntries} };
globalThis.__cfFsStub = ${FS_STUB};
globalThis.require = (id) => {
  const k = id.startsWith("node:") ? id.slice(5) : id;
  if (k === "fs") return globalThis.__cfFsStub;
  const shim = globalThis.__cfNodeShims?.[k];
  if (shim && typeof shim === "object" && "default" in shim) {
    return Object.assign(Object.create(null), shim, shim.default || {});
  }
  return shim ?? void 0;
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

// Post-process handler.mjs
const handlerPath = resolve(openNextDir, "server-functions/default/handler.mjs");
let handler = readFileSync(handlerPath, "utf-8");

// Step 1: replace require("fs") / require("node:fs") with our fs stub
let patchCount = 0;
for (const pat of ['require("fs")', "require('fs')", 'require("node:fs")', "require('node:fs')"]) {
  const parts = handler.split(pat);
  if (parts.length > 1) {
    patchCount += parts.length - 1;
    handler = parts.join("globalThis.__cfFsStub");
  }
}
if (patchCount > 0) {
  console.log(`[build-worker] Replaced ${patchCount} require("fs") call(s) with globalThis.__cfFsStub`);
} else {
  console.warn("[build-worker] No require(fs) calls found in handler.mjs");
}

// Step 2: inject `var require = globalThis.require;` so all remaining require()
// calls in the bundle route through our polyfill at runtime.
// OpenNext 1.19.11 fully pre-bundles handler.mjs — no top-level import statements
// remain — so we inject at the very top of the file instead.
const lastImport = handler.lastIndexOf("\nimport ");
if (lastImport !== -1) {
  // Legacy path: file still has import statements — inject after the last one
  const lineEnd = handler.indexOf("\n", lastImport + 1) + 1;
  handler = handler.slice(0, lineEnd) + "var require = globalThis.require;\n" + handler.slice(lineEnd);
  console.log("[build-worker] Injected var require = globalThis.require after last import");
} else {
  // OpenNext 1.19.11+ path: no imports — inject at the very top of the file
  handler = "var require = globalThis.require;\n" + handler;
  console.log("[build-worker] Injected var require = globalThis.require at top of file (no imports found)");
}

writeFileSync(handlerPath, handler);

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
    // Try CF Pages static asset store for every request before hitting Next.js.
    // The asset store only contains uploaded files, so page routes return 404
    // and fall through to Next.js normally. This serves /_next/static/, public
    // folder images, fonts, etc. with the correct MIME type.
    if (env.ASSETS) {
      try {
        const assetRes = await env.ASSETS.fetch(request.clone());
        if (assetRes.status !== 404) return assetRes;
      } catch (_) {}
    }

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
