const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Copy sql.js WASM binary into dist/ so it ships with the extension.
 * No native compilation needed — pure WASM.
 */
function copyWasmFile() {
  const src = path.join('node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const dst = path.join('dist', 'sql-wasm.wasm');
  if (!fs.existsSync(src)) {
    console.warn('[wasm] sql-wasm.wasm not found in node_modules/sql.js/dist — skip');
    return;
  }
  fs.mkdirSync('dist', { recursive: true });
  try {
    fs.copyFileSync(src, dst);
    console.log('[wasm] copied sql-wasm.wasm → dist/sql-wasm.wasm');
  } catch (e) {
    if (e.code === 'EPIPE' || e.code === 'EBUSY') {
      console.warn(`[wasm] sql-wasm.wasm locked (${e.code}) — using existing copy`);
    } else {
      throw e;
    }
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
      copyWasmFile();
    });
  },
};

async function main() {
  // ── Extension bundle ──────────────────────────────────────────────────────
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  });

  // ── Daakia MCP Server bundle (standalone STDIO process) ───────────────────
  // External AI clients (Claude Desktop, Cursor) spawn this as a subprocess.
  // 'vscode' is NOT bundled — this runs outside VS Code.
  const mcpCtx = await esbuild.context({
    entryPoints: ['src/mcp/daakia-mcp-server.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/daakia-mcp-server.js',
    // No external: ['vscode'] — this doesn't use VS Code APIs
    logLevel: 'silent',
  });

  if (watch) {
    await ctx.watch();
    await mcpCtx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    await mcpCtx.rebuild();
    await mcpCtx.dispose();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
