# Daakia Script Runtime Extensions

## Overview

Daakia uses a **provider-based architecture** for its script runtime sandbox (similar to Spring Boot's auto-configuration). The script environment (`dk.*` API) is assembled from individual providers, each contributing specific capabilities.

## How It Works

```
┌─────────────────────────────────────────────────┐
│              Script Sandbox (VM)                  │
│                                                   │
│  dk.env         ← env-provider.ts                 │
│  dk.sendRequest ← request-provider.ts             │
│  dk.test        ← test-provider.ts                │
│  console.*      ← console-provider.ts             │
│  crypto.*       ← crypto-provider.ts              │
│  require()      ← require-provider.ts             │
│  JSON, Math...  ← utils-provider.ts               │
│                                                   │
│  dk.readFile    ← YOUR extension! (optional)      │
│  fetch          ← YOUR extension! (optional)      │
└─────────────────────────────────────────────────┘
```

## Creating an Extension Provider

### Step 1: Create the directory

```
your-workspace/
└── .daakia/
    └── extensions/
        └── my-provider.js    ← Drop your file here
```

### Step 2: Write the provider

Each extension file must export a `provider` object:

```javascript
// .daakia/extensions/fetch-provider.js

const https = require('https');
const http = require('http');

exports.provider = {
  id: 'ext:fetch',
  name: 'Fetch API',
  description: 'Adds a fetch()-like function to the sandbox',
  priority: 50,  // Max 50 for extensions (core uses 80-100)

  activate(ctx) {
    // ctx gives you access to:
    // - ctx.scriptContext (request, response, variables)
    // - ctx.envVars, ctx.colVars, ctx.globalVars (read/write)
    // - ctx.log(level, ...args) — push to console
    // - ctx.addSubRequest(entry) — show in network panel
    // - ctx.addTestResult(result) — add test assertion

    const fetch = (url, opts = {}) => {
      // Your implementation here
      ctx.log('info', `fetch: ${opts.method || 'GET'} ${url}`);
      // ... make HTTP request ...
      return { status: 200, json: () => ({}) };
    };

    return {
      // Add to top-level sandbox (available as `fetch(...)` in scripts)
      globals: { fetch },
      // OR add to dk namespace (available as `dk.fetch(...)`)
      // dk: { fetch },
    };
  },

  // Optional: cleanup after script finishes
  deactivate() {
    // Close connections, flush buffers, etc.
  }
};
```

### Step 3: Use in scripts

```javascript
// Pre-request script
const resp = fetch('https://api.example.com/data');
console.log(resp.status);
```

No configuration needed — Daakia auto-discovers providers on startup.

---

## Provider Interface

```typescript
interface ScriptProvider {
  /** Unique identifier (use 'ext:' prefix for extensions) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Short description */
  description: string;

  /** Priority 1-50 (higher = loads first). Cannot exceed 50 for extensions. */
  priority?: number;

  /** Called per script execution — return what to add to the sandbox */
  activate(ctx: ProviderContext): ProviderContribution;

  /** Optional cleanup */
  deactivate?(): void;
}

interface ProviderContribution {
  /** Merge into dk.* namespace */
  dk?: Record<string, unknown>;

  /** Merge into top-level sandbox globals */
  globals?: Record<string, unknown>;
}

interface ProviderContext {
  scriptContext: {
    request: { method, url, headers, body };
    response?: { status, statusText, headers, body, time, size };
    environmentVariables: Record<string, string>;
    collectionVariables: Record<string, string>;
    globalVariables: Record<string, string>;
  };
  envVars: Record<string, string>;    // Mutable
  colVars: Record<string, string>;    // Mutable
  globalVars: Record<string, string>; // Mutable
  log(level: 'log'|'info'|'warn'|'error'|'debug', ...args: unknown[]): void;
  addSubRequest(entry: SubRequestEntry): void;
  addTestResult(result: { name: string; passed: boolean; error?: string }): void;
}
```

---

## Example Extensions

### `dk.readFile()` — Read workspace files

```javascript
// .daakia/extensions/file-provider.js
const fs = require('fs');
const path = require('path');

exports.provider = {
  id: 'ext:file',
  name: 'File System',
  description: 'dk.readFile(path) — read files from workspace',
  priority: 50,

  activate(ctx) {
    // Restrict to workspace directory for safety
    const workspaceRoot = process.cwd();

    return {
      dk: {
        readFile: (filePath) => {
          const resolved = path.resolve(workspaceRoot, filePath);
          if (!resolved.startsWith(workspaceRoot)) {
            throw new Error('Cannot read files outside workspace');
          }
          return fs.readFileSync(resolved, 'utf-8');
        },
        fileExists: (filePath) => {
          const resolved = path.resolve(workspaceRoot, filePath);
          return resolved.startsWith(workspaceRoot) && fs.existsSync(resolved);
        },
      }
    };
  }
};
```

**Usage:**
```javascript
const config = JSON.parse(dk.readFile('config/test-data.json'));
dk.env.set('api_key', config.apiKey);
```

### `dk.sleep()` — Wait between operations

```javascript
// .daakia/extensions/sleep-provider.js
const { execSync } = require('child_process');

exports.provider = {
  id: 'ext:sleep',
  name: 'Sleep',
  description: 'dk.sleep(ms) — pause execution for N milliseconds',
  priority: 50,

  activate(ctx) {
    return {
      dk: {
        sleep: (ms) => {
          if (ms > 30000) throw new Error('dk.sleep() max is 30 seconds');
          execSync(`node -e "setTimeout(()=>{},${ms})"`, { timeout: ms + 1000 });
          ctx.log('debug', `Slept for ${ms}ms`);
        },
      }
    };
  }
};
```

### `dk.jwt()` — JWT token utilities

```javascript
// .daakia/extensions/jwt-provider.js
exports.provider = {
  id: 'ext:jwt',
  name: 'JWT Utilities',
  description: 'dk.jwt.decode(token), dk.jwt.isExpired(token)',
  priority: 50,

  activate() {
    return {
      dk: {
        jwt: {
          decode: (token) => {
            const parts = token.split('.');
            if (parts.length !== 3) throw new Error('Invalid JWT format');
            return JSON.parse(Buffer.from(parts[1], 'base64').toString());
          },
          isExpired: (token) => {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            return payload.exp ? (payload.exp * 1000) < Date.now() : false;
          },
        }
      }
    };
  }
};
```

---

## Core Providers (built-in, cannot be overridden)

| Provider | ID | Priority | Contributes |
|----------|-----|----------|-------------|
| Environment | `core:env` | 100 | dk.env, dk.environment, dk.globals, dk.collectionVariables |
| Request | `core:request` | 100 | dk.request, dk.response, dk.sendRequest() |
| Console | `core:console` | 100 | console.log/info/warn/error/debug |
| Utils | `core:utils` | 100 | JSON, Math, Date, atob/btoa, dk.interpolate() |
| Test | `core:test` | 90 | dk.test(), dk.expect() |
| Crypto | `core:crypto` | 80 | crypto.randomUUID/createHash/createHmac |
| Require | `core:require` | 80 | require() — whitelisted modules only |

---

## Security

- Extension providers have `priority <= 50` enforced — they cannot override core providers
- Extensions can only access what's passed via `ProviderContext` — no raw VM access
- The sandbox still blocks `eval()`, `Function()`, `process`, `child_process` (unless explicitly exposed by a provider)
- Extensions are loaded from workspace `.salilvnair/daakia-vsce/extensions/` only — not global
- Invalid extensions are silently skipped (won't crash the script runner)

---

## File Structure

```
src/services/script-runtime/
├── types.ts                    ← Interfaces (ScriptProvider, ProviderContext, etc.)
├── sandbox.ts                  ← Assembles providers into VM sandbox
├── runner.ts                   ← Synchronous script execution
├── core/                       ← Built-in providers
│   ├── index.ts                ← Registry of all core providers
│   ├── env-provider.ts         ← dk.env, dk.globals, dk.collectionVariables
│   ├── request-provider.ts     ← dk.request, dk.response, dk.sendRequest()
│   ├── test-provider.ts        ← dk.test(), dk.expect()
│   ├── console-provider.ts     ← console.log/info/warn/error/debug
│   ├── crypto-provider.ts      ← crypto.*
│   ├── utils-provider.ts       ← JSON, Math, Date, atob/btoa, dk.interpolate()
│   └── require-provider.ts     ← sandboxed require()
├── extensions/                 ← User-defined providers (auto-discovered)
│   ├── index.ts                ← Extension loader (scans .daakia/extensions/)
│   └── README.md               ← This documentation
└── debugger/                   ← Debug instrumentation
    ├── debug-session.ts
    ├── script-instrumenter.ts
    └── index.ts
```
