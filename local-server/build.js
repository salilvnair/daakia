/**
 * Bundles local-server/server.ts (+ everything it pulls in from src/) into a
 * single runnable Node script. Only special thing here vs. the real
 * esbuild.js: `from 'vscode'` resolves to vscode-shim.ts instead of being
 * left external, since there's no real VS Code host to provide that module.
 *
 * ── --serve ──
 *
 * `--watch` rebuilds the bundle and nothing else, which is a trap: the server
 * already running is still the *old* bundle, so a change to anything under
 * `src/services/**` or `src/panel/main/handlers/**` — all of which compile
 * INTO this file — appears to have done nothing. That reads as "the fix did
 * not work" rather than "the process is stale", and it costs a debugging
 * session every time.
 *
 * `--serve` closes that: rebuild, then restart the server that serves it. One
 * command, never out of step. Use `npm run local-server:dev`.
 */
const esbuild = require('esbuild');
const path = require('path');
const { spawn } = require('child_process');

const watch = process.argv.includes('--watch');
const serve = process.argv.includes('--serve');

const OUT = path.join(__dirname, 'dist', 'server.js');

/** The server process, when `--serve` is running one. */
let child;

/**
 * Restart the server on the bundle that was just written.
 *
 * Awaits the old process's `exit` before spawning the new one rather than
 * spawning straight away: the port is held until the socket is actually
 * released, and on Windows a same-tick respawn gets EADDRINUSE about half the
 * time — which looks exactly like the port-in-use bug it is not.
 */
function restart() {
  const start = () => {
    child = spawn(process.execPath, [OUT], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
    });
    child.on('exit', code => {
      /* A crash is worth saying out loud. The next rebuild will try again, so
         this is information rather than the end of the run. */
      if (code !== null && code !== 0) console.error(`[local-server] exited with ${code}`);
    });
  };

  if (!child) { start(); return; }
  const old = child;
  child = undefined;
  old.once('exit', start);
  old.kill();
}

/* Ctrl-C should take the server with it, not orphan it holding the port. */
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { child?.kill(); process.exit(0); });
}

/** @type {import('esbuild').Plugin} */
const restartPlugin = {
  name: 'restart-server',
  setup(build) {
    build.onEnd(result => {
      if (result.errors.length > 0) {
        /* Keep the last good build serving. A syntax error mid-edit should not
           also take the server down and leave the webview with no host. */
        console.error('[local-server] build failed — the previous server is still up');
        return;
      }
      restart();
      console.log('[local-server] restarted on the new bundle');
    });
  },
};

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
    outfile: OUT,
    plugins: serve ? [vscodeAliasPlugin, restartPlugin] : [vscodeAliasPlugin],
    logLevel: 'info',
  });

  if (watch || serve) {
    await ctx.watch();
    console.log(serve
      ? '[local-server] watching, and restarting the server on every rebuild'
      : '[local-server] watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
