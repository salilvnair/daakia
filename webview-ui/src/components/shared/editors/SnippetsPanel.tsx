import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '../../../icons';
import { TextInputView } from '@salilvnair/dui';
import { TEMPLATE_HELPERS, HELPER_CATEGORY_LABELS } from '@daakia/template-catalog';
import { useDynamicVarsStore } from '../../../store/dynamic-vars-store';
import { HELPER_COLORS, dynamicColor } from '../../../services/template/category-colors';

// ────────── Types ──────────

interface Snippet {
  id: string;
  label: string;
  description: string;
  code: string;
  category: SnippetCategory;
  /**
   * A colour of this entry's own, overriding its category's.
   *
   * The Dynamic values category is a hundred-odd entries — every helper and
   * every `$` value — and one dot colour across all of them gives the eye
   * nothing to steer by. These carry the colour of what they produce (dates
   * green, JSON yellow, and so on), the same map the wiki page uses, so the
   * list groups visually even while it is being filtered.
   */
  tint?: string;
  /** Render the label as a `{{token}}` rather than a sentence. */
  token?: boolean;
}

type SnippetCategory = 'tests' | 'variables' | 'dynamic' | 'workflows' | 'response' | 'request';

const CATEGORY_LABELS: Record<SnippetCategory, string> = {
  tests: 'Tests',
  variables: 'Variables',
  dynamic: 'Dynamic values',
  workflows: 'Workflows',
  response: 'Response',
  request: 'Request',
};

const CATEGORY_COLORS: Record<SnippetCategory, string> = {
  tests: 'var(--color-protocol-rest)',
  variables: 'var(--color-protocol-graphql)',
  dynamic: 'var(--color-accent)',
  workflows: 'var(--color-protocol-websocket)',
  response: 'var(--color-settings)',
  request: 'var(--color-mock-server)',
};

// ────────── Snippets Data ──────────

const SNIPPETS: Snippet[] = [
  // Tests
  {
    id: 'test-status-200',
    label: 'Status is 200',
    description: 'Assert response status is 200 OK',
    code: `dk.test("Status is 200", () => {\n  dk.expect(dk.response.status).toBe(200);\n});`,
    category: 'tests',
  },
  {
    id: 'test-status-created',
    label: 'Status is 201 Created',
    description: 'Assert response status is 201',
    code: `dk.test("Status is 201 Created", () => {\n  dk.expect(dk.response.status).toBe(201);\n});`,
    category: 'tests',
  },
  {
    id: 'test-response-time',
    label: 'Response time < 500ms',
    description: 'Assert response completes in under 500ms',
    code: `dk.test("Response time is acceptable", () => {\n  dk.expect(dk.response.time).toBeLessThan(500);\n});`,
    category: 'tests',
  },
  {
    id: 'test-json-property',
    label: 'Response has property',
    description: 'Assert JSON response body has a specific property',
    code: `dk.test("Body has id property", () => {\n  const body = dk.response.json();\n  dk.expect(body).toHaveProperty("id");\n});`,
    category: 'tests',
  },
  {
    id: 'test-json-value',
    label: 'Response value equals',
    description: 'Assert a specific value in response JSON',
    code: `dk.test("Name equals expected", () => {\n  const body = dk.response.json();\n  dk.expect(body.name).toBe("expected_value");\n});`,
    category: 'tests',
  },
  {
    id: 'test-array-length',
    label: 'Array has items',
    description: 'Assert response array is not empty',
    code: `dk.test("Response has items", () => {\n  const body = dk.response.json();\n  dk.expect(Array.isArray(body)).toBeTruthy();\n  dk.expect(body.length).toBeGreaterThan(0);\n});`,
    category: 'tests',
  },
  {
    id: 'test-content-type',
    label: 'Content-Type is JSON',
    description: 'Assert response content-type header',
    code: `dk.test("Content-Type is JSON", () => {\n  const ct = dk.response.headers["content-type"] || "";\n  dk.expect(ct).toContain("application/json");\n});`,
    category: 'tests',
  },
  {
    id: 'test-not-empty',
    label: 'Body is not empty',
    description: 'Assert response body is not empty',
    code: `dk.test("Body is not empty", () => {\n  dk.expect(dk.response.body.length).toBeGreaterThan(0);\n});`,
    category: 'tests',
  },

  // Variables
  {
    id: 'var-env-set',
    label: 'Set environment variable',
    description: 'Set a variable in the current environment',
    code: `dk.env.set("variable_name", "value");`,
    category: 'variables',
  },
  {
    id: 'var-env-get',
    label: 'Get environment variable',
    description: 'Read a variable from the current environment',
    code: `const value = dk.env.get("variable_name");\nconsole.log("Value:", value);`,
    category: 'variables',
  },
  {
    id: 'var-globals-set',
    label: 'Set global variable',
    description: 'Set a global variable (persists across environments)',
    code: `dk.globals.set("global_var", "value");`,
    category: 'variables',
  },
  {
    id: 'var-globals-get',
    label: 'Get global variable',
    description: 'Read a global variable',
    code: `const value = dk.globals.get("global_var");\nconsole.log("Global:", value);`,
    category: 'variables',
  },
  {
    id: 'var-collection-set',
    label: 'Set collection variable',
    description: 'Set a variable scoped to the collection',
    code: `dk.collectionVariables.set("col_var", "value");`,
    category: 'variables',
  },
  {
    id: 'var-extract-token',
    label: 'Extract token from response',
    description: 'Extract auth token from response and save to env',
    code: `const body = dk.response.json();\ndk.env.set("auth_token", body.token || body.access_token);`,
    category: 'variables',
  },
  {
    id: 'var-secret-env',
    label: 'Set env secret',
    description: 'Set an environment variable masked in console output',
    code: `dk.env.secret("api_key", "your-secret-value");\n// Value is stored in env vars but masked as *** in console logs\nconsole.log(dk.env.get("api_key")); // outputs: ***`,
    category: 'variables',
  },
  {
    id: 'var-secret-global',
    label: 'Set global secret',
    description: 'Set a global variable masked in console output',
    code: `dk.globals.secret("shared_token", "your-secret-value");\n// Value is stored in globals but masked as *** in console logs\nconsole.log(dk.globals.get("shared_token")); // outputs: ***`,
    category: 'variables',
  },
  {
    id: 'var-secret-auth',
    label: 'Secret auth token flow',
    description: 'Extract token from response and store as masked secret',
    code: `const body = dk.response.json();\ndk.env.secret("auth_token", body.token);\n// Token is usable via dk.env.get("auth_token") but masked in logs`,
    category: 'variables',
  },
  {
    id: 'var-extract-id',
    label: 'Extract ID from response',
    description: 'Extract an ID from response for subsequent requests',
    code: `const body = dk.response.json();\ndk.env.set("resource_id", String(body.id));`,
    category: 'variables',
  },
  {
    id: 'var-dynamic-random',
    label: 'Use dynamic variables',
    description: 'Generate random test data using {{$...}} placeholders',
    code: `// Available dynamic variables:\n// {{$guid}}, {{$timestamp}}, {{$isoTimestamp}}, {{$randomInt}}\n// {{$randomEmail}}, {{$randomFullName}}, {{$randomUUID}}\n// {{$randomCity}}, {{$randomCompanyName}}, {{$randomUrl}}\n\nconst email = dk.interpolate("{{$randomEmail}}");\ndk.env.set("test_email", email);`,
    category: 'variables',
  },

  // Workflows
  {
    id: 'wf-chain-request',
    label: 'Send chained request',
    description: 'Make an HTTP request from script',
    code: `const res = dk.sendRequest({\n  method: "GET",\n  url: "https://api.example.com/users",\n  headers: { "Authorization": "Bearer " + dk.env.get("auth_token") },\n});\nconsole.log("Status:", res.status);\nconst data = res.json();\ndk.env.set("user_id", String(data[0].id));`,
    category: 'workflows',
  },
  {
    id: 'wf-login-flow',
    label: 'Login and save token',
    description: 'Pre-request: login → extract token → set env var',
    code: `const res = dk.sendRequest({\n  method: "POST",\n  url: dk.env.get("base_url") + "/auth/login",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify({\n    email: dk.env.get("email"),\n    password: dk.env.get("password"),\n  }),\n});\n\nif (res.status === 200) {\n  const token = res.json().token;\n  dk.env.set("auth_token", token);\n  console.log("Token acquired");\n} else {\n  console.error("Login failed:", res.status);\n}`,
    category: 'workflows',
  },
  {
    id: 'wf-conditional-skip',
    label: 'Conditional test skip',
    description: 'Skip tests if response is not successful',
    code: `if (dk.response.status === 200) {\n  dk.test("Process response", () => {\n    const body = dk.response.json();\n    dk.expect(body.success).toBeTruthy();\n  });\n} else {\n  console.log("Skipped tests — status:", dk.response.status);\n}`,
    category: 'workflows',
  },
  {
    id: 'wf-timestamp',
    label: 'Set timestamp variable',
    description: 'Generate and set a timestamp for the request',
    code: `dk.env.set("timestamp", String(Date.now()));\ndk.env.set("iso_date", new Date().toISOString());`,
    category: 'workflows',
  },
  {
    id: 'wf-interpolate',
    label: 'Interpolate dynamic variables',
    description: 'Resolve {{$dynamic}} and {{envVar}} placeholders in a string',
    code: `const url = dk.interpolate("{{base_url}}/users/{{$randomUUID}}");\nconsole.log("Resolved URL:", url);`,
    category: 'workflows',
  },
  {
    id: 'wf-crypto-uuid',
    label: 'Generate UUID',
    description: 'Create a random UUID using crypto',
    code: `const id = crypto.randomUUID();\ndk.env.set("request_id", id);\nconsole.log("Generated ID:", id);`,
    category: 'workflows',
  },
  {
    id: 'wf-crypto-hash',
    label: 'Compute SHA-256 hash',
    description: 'Hash a value with SHA-256 using crypto',
    code: `const hash = crypto.createHash("sha256")\n  .update(dk.env.get("secret") || "data")\n  .digest("hex");\ndk.env.set("hash_value", hash);`,
    category: 'workflows',
  },
  {
    id: 'wf-crypto-hmac',
    label: 'Compute HMAC signature',
    description: 'Create an HMAC-SHA256 signature for API auth',
    code: `const secret = dk.env.get("api_secret") || "key";\nconst message = dk.request.method + dk.request.url;\nconst signature = crypto.createHmac("sha256", secret)\n  .update(message)\n  .digest("hex");\ndk.env.set("signature", signature);`,
    category: 'workflows',
  },

  // Response
  {
    id: 'res-log-body',
    label: 'Log response body',
    description: 'Print full response body to console',
    code: `console.log("Status:", dk.response.status, dk.response.statusText);\nconsole.log("Body:", dk.response.body);`,
    category: 'response',
  },
  {
    id: 'res-parse-json',
    label: 'Parse JSON response',
    description: 'Parse response body as JSON',
    code: `const body = dk.response.json();\nconsole.log("Parsed:", JSON.stringify(body, null, 2));`,
    category: 'response',
  },
  {
    id: 'res-check-headers',
    label: 'Log response headers',
    description: 'Print all response headers',
    code: `console.log("Headers:", JSON.stringify(dk.response.headers, null, 2));`,
    category: 'response',
  },
  {
    id: 'res-timing',
    label: 'Log response time',
    description: 'Print response time and size',
    code: `console.log("Time:", dk.response.time + "ms");\nconsole.log("Size:", dk.response.size + " bytes");`,
    category: 'response',
  },

  // Request
  {
    id: 'req-log-details',
    label: 'Log request details',
    description: 'Print request method, URL, headers',
    code: `console.log("Method:", dk.request.method);\nconsole.log("URL:", dk.request.url);\nconsole.log("Headers:", JSON.stringify(dk.request.headers, null, 2));`,
    category: 'request',
  },
  {
    id: 'req-dynamic-header',
    label: 'Set dynamic header value',
    description: 'Compute and set a header via environment variable',
    code: `// Set a dynamic value that can be used as {{request_id}} in headers\ndk.env.set("request_id", crypto.randomUUID());\ndk.env.set("nonce", String(Math.random().toString(36).slice(2)));`,
    category: 'request',
  },
  {
    id: 'req-base64-auth',
    label: 'Compute Base64 auth',
    description: 'Encode credentials as Base64 for manual auth',
    code: `const user = dk.env.get("username");\nconst pass = dk.env.get("password");\ndk.env.set("basic_auth", btoa(user + ":" + pass));`,
    category: 'request',
  },
];

// ────────── Dynamic values ──────────

/**
 * The patterns, rather than the values.
 *
 * `dk.interpolate` runs the same engine a header field does, so anything you
 * can write in a value you can compute in a script — and these three are the
 * shapes people actually want: a value reused across fields, a signature over
 * something the request already holds, and a window of time.
 */
export const DYNAMIC_EXAMPLES: Snippet[] = [
  {
    id: 'dyn-reuse',
    label: 'One random value, used twice',
    description: 'Generate once in a script so the header and the body agree',
    code: 'const id = dk.interpolate("{{$randomUUID}}");\ndk.env.set("request-id", id);\n// Now {{request-id}} is the same value everywhere in this request.',
    category: 'dynamic',
  },
  {
    id: 'dyn-sign-body',
    label: 'Sign the request body',
    description: 'Hash what is about to be sent and put it in a header',
    code: 'const signature = dk.interpolate("{{sha256 request.body}}");\ndk.request.headers.set("X-Signature", signature);',
    category: 'dynamic',
  },
  {
    id: 'dyn-window',
    label: 'A date inside a window',
    description: 'Somewhere in the last 30 days, formatted how you need it',
    code: 'const placedAt = dk.interpolate("{{randomDate \'-30d\' \'now\' format=\'yyyy-MM-dd\'}}");\nconsole.log("placedAt", placedAt);',
    category: 'dynamic',
  },
];

interface DynamicVarInfo { name: string; description: string; category: string }

/** One snippet per helper and per `$` variable, built from the shared lists. */
export function generatedDynamicSnippets(dynamicVars: DynamicVarInfo[]): Snippet[] {
  const helpers = TEMPLATE_HELPERS.map(h => ({
    id: `dyn-helper-${h.name}`,
    label: h.example,
    description: `${HELPER_CATEGORY_LABELS[h.category]} — ${h.summary}`,
    code: `dk.interpolate("${h.example.replace(/"/g, '\\"')}")`,
    category: 'dynamic' as const,
    tint: HELPER_COLORS[h.category],
    token: true,
  }));

  const dynamic = dynamicVars.map(v => ({
    id: `dyn-var-${v.name}`,
    label: `{{$${v.name}}}`,
    description: v.description,
    code: `dk.interpolate("{{$${v.name}}}")`,
    category: 'dynamic' as const,
    tint: dynamicColor(v.category),
    token: true,
  }));

  return [...helpers, ...dynamic];
}

// ────────── Component ──────────

interface SnippetsPanelProps {
  onInsert: (code: string) => void;
  accentColor?: string;
}

export function SnippetsPanel({ onInsert, accentColor }: SnippetsPanelProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<SnippetCategory | 'all'>('all');
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const pillsRef = useRef<HTMLDivElement>(null);

  const checkPillsOverflow = useCallback(() => {
    const el = pillsRef.current;
    if (!el) return;
    setShowLeftArrow(el.scrollLeft > 4);
    setShowRightArrow(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    checkPillsOverflow();
    const el = pillsRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkPillsOverflow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [checkPillsOverflow]);

  const scrollPills = (dir: 'left' | 'right') => {
    const el = pillsRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -60 : 60, behavior: 'smooth' });
  };

  const dynamicVars = useDynamicVarsStore(s => s.variables);

  /*
    The dynamic-value snippets are generated, not written out.

    There are about a hundred of them between the helper catalogue and the
    registry, and a hand-copied list would describe whichever set existed on
    the day somebody last updated it — the exact drift the shared catalogue
    was created to stop. The three worked examples below are written by hand
    because they show a pattern rather than a single value.
  */
  const allSnippets = useMemo(
    () => [...SNIPPETS, ...DYNAMIC_EXAMPLES, ...generatedDynamicSnippets(dynamicVars)],
    [dynamicVars],
  );

  const filtered = useMemo(() => {
    let items = allSnippets;
    if (activeCategory !== 'all') {
      items = items.filter(s => s.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(s =>
        s.label.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q)
      );
    }
    return items;
  }, [search, activeCategory, allSnippets]);

  const categories: (SnippetCategory | 'all')[] = ['all', 'tests', 'variables', 'dynamic', 'workflows', 'response', 'request'];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search */}
      <div className="px-2 py-2 border-b border-[var(--color-surface-border)]">
        <TextInputView
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search snippets..."
          size="sm"
          width="fw"
          iconLeft={<SearchIcon size={11} />}
        />
      </div>

      {/* Category pills with scroll arrows */}
      <div className="relative flex items-center border-b border-[var(--color-surface-border)] group/pills">
        {showLeftArrow && (
          <button
            type="button"
            onClick={() => scrollPills('left')}
            className="absolute left-0 z-10 flex items-center justify-center w-5 h-full cursor-pointer opacity-0 group-hover/pills:opacity-100 transition-opacity"
          >
            <span className="flex items-center justify-center w-4 h-4 rounded shadow-sm" style={{ backgroundColor: accentColor || 'var(--color-primary)' }}>
              <ChevronLeftIcon size={9} className="text-[var(--color-btn-primary-text)]" />
            </span>
          </button>
        )}
        <div
          ref={pillsRef}
          onScroll={checkPillsOverflow}
          className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto scrollbar-none scroll-smooth"
        >
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-full cursor-pointer transition-colors whitespace-nowrap ${
                activeCategory === cat
                  ? 'text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)]'
              }`}
              style={activeCategory === cat ? { backgroundColor: `color-mix(in srgb, ${accentColor || 'var(--color-primary)'} 15%, transparent)`, color: accentColor || 'var(--color-primary)' } : undefined}
            >
              {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        {showRightArrow && (
          <button
            type="button"
            onClick={() => scrollPills('right')}
            className="absolute right-0 z-10 flex items-center justify-center w-5 h-full cursor-pointer opacity-0 group-hover/pills:opacity-100 transition-opacity"
          >
            <span className="flex items-center justify-center w-4 h-4 rounded shadow-sm" style={{ backgroundColor: accentColor || 'var(--color-primary)' }}>
              <ChevronRightIcon size={9} className="text-[var(--color-btn-primary-text)]" />
            </span>
          </button>
        )}
      </div>

      {/* Snippets list */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-2 py-1.5">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-[11px] text-[var(--color-text-muted)]">
            No snippets found
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map(snippet => (
              <button
                key={snippet.id}
                type="button"
                onClick={() => onInsert(snippet.code)}
                className="flex flex-col gap-0.5 px-2.5 py-2 rounded-md text-left cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)] group"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: snippet.tint ?? CATEGORY_COLORS[snippet.category] }}
                  />
                  {snippet.token ? (
                    /* A template reads as one thing, not a sentence — so it is
                       drawn as the token it will insert, in the colour of what
                       it produces. */
                    <span
                      className="text-[11px] font-semibold rounded px-1 py-px"
                      style={{
                        fontFamily: 'var(--vscode-editor-font-family, monospace)',
                        color: snippet.tint ?? CATEGORY_COLORS[snippet.category],
                        background: `color-mix(in srgb, ${snippet.tint ?? CATEGORY_COLORS[snippet.category]} 13%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${snippet.tint ?? CATEGORY_COLORS[snippet.category]} 28%, transparent)`,
                      }}
                    >
                      {snippet.label}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-[var(--color-text-primary)] transition-colors" style={{ ['--snippet-hover' as any]: accentColor || 'var(--color-primary)' }}>
                      {snippet.label}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[var(--color-text-muted)] pl-3.5 leading-tight">
                  {snippet.description}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
