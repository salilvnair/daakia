/**
 * Bundles local-server/server.ts (+ everything it pulls in from src/) into a
 * single runnable Node script. Only special thing here vs. the real
 * esbuild.js: `from 'vscode'` resolves to vscode-shim.ts instead of being
 * left external, since there's no real VS Code host to provide that module.
 */
const esbuild = require('esbuild');
const path = require('path');

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').Plugin} */
const vscodeAliasPlugin = {
  name: 'vscode-shim-alias',
  setup(build) {
    build.onResolve({ filter: /^vscode$/ }, () => ({
      path: path.resolve(__dirname, 'vscode-shim.ts'),
    }));
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: [path.join(__dirname, 'server.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    outfile: path.join(__dirname, 'dist', 'server.js'),
    plugins: [vscodeAliasPlugin],
    logLevel: 'info',
  });

  if (watch) {
    await ctx.watch();
    console.log('[local-server] watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
