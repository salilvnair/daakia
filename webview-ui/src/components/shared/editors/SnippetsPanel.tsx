import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { SearchIcon, ChevronLeftIcon, ChevronRightIcon } from '../../../icons';

// ────────── Types ──────────

interface Snippet {
  id: string;
  label: string;
  description: string;
  code: string;
  category: SnippetCategory;
}

type SnippetCategory = 'tests' | 'variables' | 'workflows' | 'response' | 'request';

const CATEGORY_LABELS: Record<SnippetCategory, string> = {
  tests: 'Tests',
  variables: 'Variables',
  workflows: 'Workflows',
  response: 'Response',
  request: 'Request',
};

const CATEGORY_COLORS: Record<SnippetCategory, string> = {
  tests: 'var(--color-protocol-rest)',
  variables: 'var(--color-protocol-graphql)',
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

  const filtered = useMemo(() => {
    let items = SNIPPETS;
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
  }, [search, activeCategory]);

  const categories: (SnippetCategory | 'all')[] = ['all', 'tests', 'variables', 'workflows', 'response', 'request'];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)]">
        <SearchIcon size={14} className="text-[var(--color-text-muted)] flex-shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search snippets..."
          className="flex-1 h-[26px] bg-transparent text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
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
              <ChevronLeftIcon size={9} className="text-white" />
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
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.05)]'
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
              <ChevronRightIcon size={9} className="text-white" />
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
                className="flex flex-col gap-0.5 px-2.5 py-2 rounded-md text-left cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.04)] group"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[snippet.category] }}
                  />
                  <span className="text-[11px] font-medium text-[var(--color-text-primary)] transition-colors" style={{ ['--snippet-hover' as any]: accentColor || 'var(--color-primary)' }}>
                    {snippet.label}
                  </span>
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
