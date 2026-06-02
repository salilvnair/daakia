/**
 * Script Resolver — Converts foreign scripting APIs to Daakia's dk.* API.
 *
 * Supports:
 *   - Postman (pm.*)
 *   - Bruno (bru.*, req.*, res.*)
 *   - Insomnia (insomnia.*)
 *
 * Called during import to translate scripts so they work with dk scripting runtime.
 */

// ────────── Types ──────────

export type ScriptSource = 'postman' | 'bruno' | 'insomnia';

// ────────── Main Entry ──────────

/**
 * Resolve/convert a script from a foreign API to Daakia's dk.* API.
 * Detects the source automatically if not specified.
 */
export function resolveScript(script: string, source?: ScriptSource): string {
  if (!script || !script.trim()) return '';

  const detected = source ?? detectSource(script);
  switch (detected) {
    case 'postman': return resolvePostmanScript(script);
    case 'bruno': return resolveBrunoScript(script);
    case 'insomnia': return resolveInsomniaScript(script);
    default: return script;
  }
}

/**
 * Auto-detect the scripting API source based on code patterns.
 */
export function detectSource(script: string): ScriptSource | null {
  if (/\bpm\.(environment|globals|variables|sendRequest|test|expect|response|request|collectionVariables)\b/.test(script)) {
    return 'postman';
  }
  if (/\bbru\.(getEnvVar|setEnvVar|getVar|setVar|getGlobalEnvVar|setGlobalEnvVar|getCollectionVar)\b/.test(script)) {
    return 'bruno';
  }
  if (/\binsomnia\.(request|response|environment)\b/.test(script)) {
    return 'insomnia';
  }
  // Secondary checks
  if (/\bpm\./.test(script)) return 'postman';
  if (/\bbru\./.test(script)) return 'bruno';
  return null;
}

// ────────── Postman → Daakia ──────────

function resolvePostmanScript(script: string): string {
  let result = script;

  // ── pm.sendRequest → dk.sendRequest ──
  // Postman's pm.sendRequest is callback-based. We convert to synchronous dk.sendRequest.
  // Pattern: pm.sendRequest({...}, function(err, res) { ... })
  result = resolvePostmanSendRequest(result);

  // ── pm.test → dk.test ──
  result = result.replace(/\bpm\.test\b/g, 'dk.test');

  // ── pm.expect → dk.expect ──
  result = result.replace(/\bpm\.expect\b/g, 'dk.expect');

  // ── pm.response → dk.response ──
  result = result.replace(/\bpm\.response\.code\b/g, 'dk.response.status');
  result = result.replace(/\bpm\.response\.status\b/g, 'dk.response.statusText');
  result = result.replace(/\bpm\.response\.responseTime\b/g, 'dk.response.time');
  result = result.replace(/\bpm\.response\.responseSize\b/g, 'dk.response.size');
  result = result.replace(/\bpm\.response\.json\(\)/g, 'dk.response.json()');
  result = result.replace(/\bpm\.response\.text\(\)/g, 'dk.response.body');
  result = result.replace(/\bpm\.response\.headers\.get\(([^)]+)\)/g, 'dk.response.headers[$1]');
  result = result.replace(/\bpm\.response\b/g, 'dk.response');

  // ── pm.request → dk.request ──
  result = result.replace(/\bpm\.request\.url\.toString\(\)/g, 'dk.request.url');
  result = result.replace(/\bpm\.request\.url\b/g, 'dk.request.url');
  result = result.replace(/\bpm\.request\.method\b/g, 'dk.request.method');
  result = result.replace(/\bpm\.request\.headers\b/g, 'dk.request.headers');
  result = result.replace(/\bpm\.request\.body\b/g, 'dk.request.body');
  result = result.replace(/\bpm\.request\b/g, 'dk.request');

  // ── pm.environment → dk.env ──
  result = result.replace(/\bpm\.environment\.set\b/g, 'dk.env.set');
  result = result.replace(/\bpm\.environment\.get\b/g, 'dk.env.get');
  result = result.replace(/\bpm\.environment\.unset\(([^)]+)\)/g, 'dk.env.set($1, "")');
  result = result.replace(/\bpm\.environment\.has\(([^)]+)\)/g, '(dk.env.get($1) !== undefined)');

  // ── pm.globals → dk.globals ──
  result = result.replace(/\bpm\.globals\.set\b/g, 'dk.globals.set');
  result = result.replace(/\bpm\.globals\.get\b/g, 'dk.globals.get');
  result = result.replace(/\bpm\.globals\.unset\(([^)]+)\)/g, 'dk.globals.set($1, "")');
  result = result.replace(/\bpm\.globals\.has\(([^)]+)\)/g, '(dk.globals.get($1) !== undefined)');

  // ── pm.collectionVariables → dk.collectionVariables ──
  result = result.replace(/\bpm\.collectionVariables\.set\b/g, 'dk.collectionVariables.set');
  result = result.replace(/\bpm\.collectionVariables\.get\b/g, 'dk.collectionVariables.get');
  result = result.replace(/\bpm\.collectionVariables\.unset\(([^)]+)\)/g, 'dk.collectionVariables.set($1, "")');
  result = result.replace(/\bpm\.collectionVariables\.has\(([^)]+)\)/g, '(dk.collectionVariables.get($1) !== undefined)');

  // ── pm.variables (combined scope — Daakia maps to env) ──
  result = result.replace(/\bpm\.variables\.get\b/g, 'dk.env.get');
  result = result.replace(/\bpm\.variables\.set\b/g, 'dk.env.set');

  // ── pm.info ──
  result = result.replace(/\bpm\.info\.requestName\b/g, '"request"');
  result = result.replace(/\bpm\.info\.iteration\b/g, '0');
  result = result.replace(/\bpm\.info\.iterationCount\b/g, '1');

  // ── Chai-style assertions → dk.expect matchers ──
  result = resolveChaiAssertions(result);

  // ── Add header comment noting conversion ──
  if (result !== script) {
    result = '// [Converted from Postman pm.* → dk.*]\n' + result;
  }

  return result;
}

/**
 * Convert Postman's callback-based pm.sendRequest to synchronous dk.sendRequest.
 *
 * Postman pattern:
 *   pm.sendRequest({ url, method, header, body: { mode: 'urlencoded', urlencoded: [...] } }, function(err, res) { ... })
 *
 * Daakia pattern:
 *   const __res = dk.sendRequest({ url, method, headers, body });
 *   // ... inline callback body with res → __res
 */
function resolvePostmanSendRequest(script: string): string {
  // Match pm.sendRequest({...}, function(err, res) { ... })
  // This is complex — handle it with a stateful approach
  const sendRequestRegex = /pm\.sendRequest\s*\(\s*\{/g;
  let match: RegExpExecArray | null;
  const positions: number[] = [];

  while ((match = sendRequestRegex.exec(script)) !== null) {
    positions.push(match.index);
  }

  if (positions.length === 0) return script;

  // Process each pm.sendRequest occurrence from last to first (to preserve indices)
  let result = script;
  for (let i = positions.length - 1; i >= 0; i--) {
    result = convertSingleSendRequest(result, positions[i]);
  }
  return result;
}

function convertSingleSendRequest(script: string, startIdx: number): string {
  // Find the matching closing of pm.sendRequest(...)
  const openParen = script.indexOf('(', startIdx);
  if (openParen === -1) return script;

  let depth = 1;
  let pos = openParen + 1;
  while (pos < script.length && depth > 0) {
    if (script[pos] === '(') depth++;
    else if (script[pos] === ')') depth--;
    pos++;
  }
  const endParen = pos; // position after closing )
  // include trailing semicolons/newlines
  let endPos = endParen;
  while (endPos < script.length && (script[endPos] === ';' || script[endPos] === '\n' || script[endPos] === '\r')) {
    endPos++;
  }

  const fullCall = script.substring(startIdx, endParen);

  // Extract request config object and callback
  // Pattern: pm.sendRequest({...config...}, function(err, resVarName) {...callback body...})
  const configAndCallback = fullCall.substring(fullCall.indexOf('(') + 1);

  // Find the callback function
  const callbackMatch = configAndCallback.match(/,\s*function\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*\{/);
  if (!callbackMatch) {
    // Arrow function: , (err, res) => {
    const arrowMatch = configAndCallback.match(/,\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*=>\s*\{/);
    if (!arrowMatch) {
      // Can't parse — just replace pm.sendRequest with dk.sendRequest and leave as-is
      return script.substring(0, startIdx) + script.substring(startIdx).replace('pm.sendRequest', 'dk.sendRequest');
    }
  }

  const errVar = callbackMatch ? callbackMatch[1] : 'err';
  const resVar = callbackMatch ? callbackMatch[2] : 'res';

  // Find where the callback body starts
  const callbackStart = callbackMatch
    ? configAndCallback.indexOf(callbackMatch[0]) + callbackMatch[0].length
    : 0;

  // Extract the request config portion (between first { and the comma before the callback)
  const configStr = extractRequestConfig(configAndCallback);

  // Convert Postman config to dk.sendRequest format
  const dkConfig = convertPostmanConfigToDk(configStr);

  // Extract callback body (everything between the { after function and matching })
  const callbackBody = extractCallbackBody(configAndCallback, callbackStart);

  // Replace resVar.json() and resVar references in the callback body
  let convertedBody = callbackBody;
  convertedBody = convertedBody.replace(new RegExp(`\\b${resVar}\\.json\\(\\)`, 'g'), '__sendRes.json()');
  convertedBody = convertedBody.replace(new RegExp(`\\b${resVar}\\.code\\b`, 'g'), '__sendRes.status');
  convertedBody = convertedBody.replace(new RegExp(`\\b${resVar}\\.status\\b`, 'g'), '__sendRes.statusText');
  convertedBody = convertedBody.replace(new RegExp(`\\b${resVar}\\b`, 'g'), '__sendRes');
  // Replace error var
  convertedBody = convertedBody.replace(new RegExp(`\\b${errVar}\\b`, 'g'), 'null /* no err in sync mode */');

  // Build the replacement
  const replacement = `const __sendRes = dk.sendRequest(${dkConfig});\n${convertedBody}`;

  return script.substring(0, startIdx) + replacement + script.substring(endPos);
}

function extractRequestConfig(configAndCallback: string): string {
  // Find the first { and balance braces until we hit the separating comma
  let depth = 0;
  let start = -1;
  for (let i = 0; i < configAndCallback.length; i++) {
    if (configAndCallback[i] === '{' && start === -1) {
      start = i;
      depth = 1;
      continue;
    }
    if (start !== -1) {
      if (configAndCallback[i] === '{') depth++;
      else if (configAndCallback[i] === '}') {
        depth--;
        if (depth === 0) {
          return configAndCallback.substring(start, i + 1);
        }
      }
    }
  }
  return '{}';
}

function extractCallbackBody(text: string, startOffset: number): string {
  // From startOffset, count braces to find the body
  let depth = 1;
  let i = startOffset;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    if (depth === 0) break;
    i++;
  }
  return text.substring(startOffset, i).trim();
}

function convertPostmanConfigToDk(configStr: string): string {
  let result = configStr;

  // header: → headers:
  result = result.replace(/\bheader\s*:/g, 'headers:');

  // body: { mode: 'urlencoded', urlencoded: [...] } → body: buildUrlEncoded(...)
  // Simplify: convert urlencoded array to a string representation
  const urlencodedMatch = result.match(/body\s*:\s*\{[^}]*mode\s*:\s*['"]urlencoded['"][^}]*urlencoded\s*:\s*\[/);
  if (urlencodedMatch) {
    // Replace the entire body property with a simpler form
    result = result.replace(
      /body\s*:\s*\{[^]*?urlencoded\s*:\s*\[([\s\S]*?)\]\s*\}/,
      (_, urlencodedContent) => {
        // Parse key-value pairs from the urlencoded array
        const pairs: string[] = [];
        const kvRegex = /\{\s*key\s*:\s*['"]([^'"]+)['"]\s*,\s*value\s*:\s*([^}]+)\}/g;
        let kvMatch;
        while ((kvMatch = kvRegex.exec(urlencodedContent)) !== null) {
          const key = kvMatch[1];
          let value = kvMatch[2].trim();
          // Remove trailing comma/whitespace
          value = value.replace(/,?\s*$/, '');
          pairs.push(`encodeURIComponent("${key}") + "=" + encodeURIComponent(${value})`);
        }
        if (pairs.length > 0) {
          return `body: ${pairs.join(' + "&" + ')}`;
        }
        return 'body: ""';
      }
    );
  }

  // body: { mode: 'raw', raw: '...' } → body: '...'
  result = result.replace(/body\s*:\s*\{\s*mode\s*:\s*['"]raw['"]\s*,\s*raw\s*:\s*([\s\S]*?)\s*\}/,
    (_, rawContent) => `body: ${rawContent.trim()}`);

  return result;
}

/**
 * Convert Chai-style assertions (used by Postman) to dk.expect matchers.
 *
 * Postman uses Chai: pm.expect(x).to.equal(y), .to.be.true, .to.have.property(...)
 * Daakia uses: dk.expect(x).toBe(y), .toBeTruthy(), .toHaveProperty(...)
 */
function resolveChaiAssertions(script: string): string {
  let result = script;

  // .to.equal(x) / .to.eql(x) / .to.deep.equal(x) → .toEqual(x)
  result = result.replace(/\.to\.deep\.equal\(/g, '.toEqual(');
  result = result.replace(/\.to\.eql\(/g, '.toEqual(');
  result = result.replace(/\.to\.equal\(/g, '.toBe(');

  // .to.be.true → .toBeTruthy()  (no args)
  result = result.replace(/\.to\.be\.true\b/g, '.toBeTruthy()');
  result = result.replace(/\.to\.be\.false\b/g, '.toBeFalsy()');

  // .to.be.above(x) → .toBeGreaterThan(x)
  result = result.replace(/\.to\.be\.above\(/g, '.toBeGreaterThan(');
  result = result.replace(/\.to\.be\.greaterThan\(/g, '.toBeGreaterThan(');
  result = result.replace(/\.to\.be\.below\(/g, '.toBeLessThan(');
  result = result.replace(/\.to\.be\.lessThan\(/g, '.toBeLessThan(');

  // .to.have.property(x) → .toHaveProperty(x)
  result = result.replace(/\.to\.have\.property\(/g, '.toHaveProperty(');

  // .to.include(x) / .to.contain(x) → .toContain(x)
  result = result.replace(/\.to\.include\(/g, '.toContain(');
  result = result.replace(/\.to\.contain\(/g, '.toContain(');

  // .to.have.status(x) → .toHaveStatus(x)
  result = result.replace(/\.to\.have\.status\(/g, '.toHaveStatus(');

  // .to.have.lengthOf(x) — no direct match, leave a comment
  // .to.be.a('string') — no direct match, leave as-is

  // .to.be.oneOf([...]) — no direct match in dk, keep but note
  // .to.not.* — negate (limited support)
  result = result.replace(/\.to\.not\.equal\(/g, '.toBe(/* NOT */ ');

  return result;
}

// ────────── Bruno → Daakia ──────────

function resolveBrunoScript(script: string): string {
  let result = script;

  // ── bru.getEnvVar → dk.env.get ──
  result = result.replace(/\bbru\.getEnvVar\b/g, 'dk.env.get');
  result = result.replace(/\bbru\.setEnvVar\b/g, 'dk.env.set');
  result = result.replace(/\bbru\.hasEnvVar\(([^)]+)\)/g, '(dk.env.get($1) !== undefined)');
  result = result.replace(/\bbru\.getEnvName\(\)/g, '"environment"');
  result = result.replace(/\bbru\.deleteEnvVar\(([^)]+)\)/g, 'dk.env.set($1, "")');
  result = result.replace(/\bbru\.getAllEnvVars\(\)/g, '({})');

  // ── bru.getGlobalEnvVar → dk.globals.get ──
  result = result.replace(/\bbru\.getGlobalEnvVar\b/g, 'dk.globals.get');
  result = result.replace(/\bbru\.setGlobalEnvVar\b/g, 'dk.globals.set');
  result = result.replace(/\bbru\.getAllGlobalEnvVars\(\)/g, '({})');

  // ── bru.getVar / bru.setVar → dk.env (runtime vars mapped to env scope) ──
  result = result.replace(/\bbru\.getVar\b/g, 'dk.env.get');
  result = result.replace(/\bbru\.setVar\b/g, 'dk.env.set');
  result = result.replace(/\bbru\.hasVar\(([^)]+)\)/g, '(dk.env.get($1) !== undefined)');
  result = result.replace(/\bbru\.deleteVar\(([^)]+)\)/g, 'dk.env.set($1, "")');
  result = result.replace(/\bbru\.getAllVars\(\)/g, '({})');
  result = result.replace(/\bbru\.deleteAllVars\(\)/g, '/* bru.deleteAllVars() — not supported */');

  // ── bru.getCollectionVar → dk.collectionVariables.get ──
  result = result.replace(/\bbru\.getCollectionVar\b/g, 'dk.collectionVariables.get');
  result = result.replace(/\bbru\.hasCollectionVar\(([^)]+)\)/g, '(dk.collectionVariables.get($1) !== undefined)');
  result = result.replace(/\bbru\.getCollectionName\(\)/g, '"collection"');
  result = result.replace(/\bbru\.getFolderVar\b/g, 'dk.collectionVariables.get');
  result = result.replace(/\bbru\.getRequestVar\b/g, 'dk.env.get');

  // ── bru.getProcessEnv → not supported (security) ──
  result = result.replace(/\bbru\.getProcessEnv\(([^)]+)\)/g, '(undefined /* process env not available */)');

  // ── bru.interpolate → dk.interpolate ──
  result = result.replace(/\bbru\.interpolate\(/g, 'dk.interpolate(');

  // ── bru.sendRequest → dk.sendRequest (Bruno uses callback style with await) ──
  // Pattern: await bru.sendRequest({...}, function(err, res) {...})
  // Convert similar to Postman's pm.sendRequest
  result = result.replace(/\bawait\s+bru\.sendRequest\b/g, 'await dk.sendRequest');
  result = result.replace(/\bbru\.sendRequest\b/g, 'dk.sendRequest');

  // ── bru.runRequest → dk.sendRequest (collection request execution) ──
  // bru.runRequest("path/to/request") — we convert to a comment + placeholder
  result = result.replace(/\bawait\s+bru\.runRequest\(([^)]+)\)/g,
    '/* bru.runRequest($1) — collection request execution not yet supported */ dk.sendRequest({ method: "GET", url: $1 })');

  // ── bru.runner.* — not supported ──
  result = result.replace(/\bbru\.runner\.skipRequest\(\)/g, '/* bru.runner.skipRequest() — not supported */');

  // ── req.* → dk.request.* (Bruno's request object) ──
  result = result.replace(/\breq\.getUrl\(\)/g, 'dk.request.url');
  result = result.replace(/\breq\.getMethod\(\)/g, 'dk.request.method');
  result = result.replace(/\breq\.getHeaders\(\)/g, 'dk.request.headers');
  result = result.replace(/\breq\.getHeader\(([^)]+)\)/g, 'dk.request.headers[$1]');
  result = result.replace(/\breq\.getBody\([^)]*\)/g, 'dk.request.body');
  result = result.replace(/\breq\.setUrl\(([^)]+)\)/g, '/* req.setUrl($1) — modify URL before send not supported */');
  result = result.replace(/\breq\.setMethod\(([^)]+)\)/g, '/* req.setMethod($1) — modify method before send not supported */');
  result = result.replace(/\breq\.setHeader\(([^,]+),\s*([^)]+)\)/g, '/* req.setHeader($1, $2) — modify headers before send not supported */');
  result = result.replace(/\breq\.setBody\(([^)]+)\)/g, '/* req.setBody($1) — modify body before send not supported */');
  result = result.replace(/\breq\.setTimeout\(([^)]+)\)/g, '/* req.setTimeout($1) — not supported */');

  // ── res.* → dk.response.* (Bruno's response object) ──
  result = result.replace(/\bres\.status\b/g, 'dk.response.status');
  result = result.replace(/\bres\.statusText\b/g, 'dk.response.statusText');
  result = result.replace(/\bres\.headers\b/g, 'dk.response.headers');
  result = result.replace(/\bres\.body\b/g, 'dk.response.json()');
  result = result.replace(/\bres\.responseTime\b/g, 'dk.response.time');
  result = result.replace(/\bres\.getStatus\(\)/g, 'dk.response.status');
  result = result.replace(/\bres\.getStatusText\(\)/g, 'dk.response.statusText');
  result = result.replace(/\bres\.getHeaders\(\)/g, 'dk.response.headers');
  result = result.replace(/\bres\.getHeader\(([^)]+)\)/g, 'dk.response.headers[$1]');
  result = result.replace(/\bres\.getBody\(\)/g, 'dk.response.json()');
  result = result.replace(/\bres\.getResponseTime\(\)/g, 'dk.response.time');
  result = result.replace(/\bres\.getUrl\(\)/g, '"response_url"');
  result = result.replace(/\bres\.getSize\(\)/g, '({ body: dk.response.size, headers: 0, total: dk.response.size })');

  // ── Bruno test/expect (uses Chai under the hood) ──
  result = result.replace(/\btest\s*\(/g, 'dk.test(');
  result = result.replace(/\bexpect\s*\(/g, 'dk.expect(');
  result = resolveChaiAssertions(result);

  // ── Add header comment noting conversion ──
  if (result !== script) {
    result = '// [Converted from Bruno bru.*/req.*/res.* → dk.*]\n' + result;
  }

  return result;
}

// ────────── Insomnia → Daakia ──────────

function resolveInsomniaScript(script: string): string {
  let result = script;

  // Insomnia scripting is limited but has some patterns:
  // insomnia.environment.get(key) / insomnia.environment.set(key, value)
  // insomnia.request.getUrl() / insomnia.request.getMethod() / etc.
  // insomnia.response.getBody() / insomnia.response.getStatusCode()

  // ── insomnia.environment → dk.env ──
  result = result.replace(/\binsomnia\.environment\.get\b/g, 'dk.env.get');
  result = result.replace(/\binsomnia\.environment\.set\b/g, 'dk.env.set');

  // ── insomnia.globals → dk.globals ──
  result = result.replace(/\binsomnia\.globals\.get\b/g, 'dk.globals.get');
  result = result.replace(/\binsomnia\.globals\.set\b/g, 'dk.globals.set');

  // ── insomnia.request → dk.request ──
  result = result.replace(/\binsomnia\.request\.getUrl\(\)/g, 'dk.request.url');
  result = result.replace(/\binsomnia\.request\.getMethod\(\)/g, 'dk.request.method');
  result = result.replace(/\binsomnia\.request\.getHeaders\(\)/g, 'dk.request.headers');
  result = result.replace(/\binsomnia\.request\.getHeader\(([^)]+)\)/g, 'dk.request.headers[$1]');
  result = result.replace(/\binsomnia\.request\.getBody\(\)/g, 'dk.request.body');
  result = result.replace(/\binsomnia\.request\.getBodyText\(\)/g, 'dk.request.body');
  result = result.replace(/\binsomnia\.request\.setUrl\(([^)]+)\)/g, '/* setUrl not supported: $1 */');
  result = result.replace(/\binsomnia\.request\.setHeader\(([^,]+),\s*([^)]+)\)/g, '/* setHeader not supported: $1, $2 */');
  result = result.replace(/\binsomnia\.request\.setBody\(([^)]+)\)/g, '/* setBody not supported: $1 */');

  // ── insomnia.response → dk.response ──
  result = result.replace(/\binsomnia\.response\.getStatusCode\(\)/g, 'dk.response.status');
  result = result.replace(/\binsomnia\.response\.getStatusMessage\(\)/g, 'dk.response.statusText');
  result = result.replace(/\binsomnia\.response\.getBody\(\)/g, 'dk.response.body');
  result = result.replace(/\binsomnia\.response\.getJsonBody\(\)/g, 'dk.response.json()');
  result = result.replace(/\binsomnia\.response\.getHeaders\(\)/g, 'dk.response.headers');
  result = result.replace(/\binsomnia\.response\.getHeader\(([^)]+)\)/g, 'dk.response.headers[$1]');
  result = result.replace(/\binsomnia\.response\.getTime\(\)/g, 'dk.response.time');
  result = result.replace(/\binsomnia\.response\.getSize\(\)/g, 'dk.response.size');

  // ── Insomnia test/expect (uses Chai) ──
  result = result.replace(/\btest\s*\(/g, 'dk.test(');
  result = result.replace(/\bexpect\s*\(/g, 'dk.expect(');
  result = resolveChaiAssertions(result);

  // ── Add header comment noting conversion ──
  if (result !== script) {
    result = '// [Converted from Insomnia → dk.*]\n' + result;
  }

  return result;
}
