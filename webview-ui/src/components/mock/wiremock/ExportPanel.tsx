/**
 * ExportPanel — Export mock server as Node.js server, Dockerfile, or WireMock JSON (6A.24-6A.25).
 */
import { useState } from 'react';
import type { MockServer } from '../mock-types';

const MOCK_ACCENT = 'var(--color-mock-server)';

type ExportFormat = 'wiremock' | 'nodejs' | 'docker';

interface Props {
  server: MockServer;
  onExport: (format: ExportFormat) => void;
}

export function ExportPanel({ server, onExport }: Props) {
  const [format, setFormat] = useState<ExportFormat>('nodejs');
  const [preview, setPreview] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = () => {
    let out = '';
    if (format === 'wiremock') out = buildWireMockPreview(server);
    else if (format === 'nodejs') out = buildNodeServerPreview(server);
    else out = buildDockerfilePreview(server);
    setPreview(out);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = preview;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Format tabs */}
      <div className="flex items-center gap-0 border-b border-[rgba(255,255,255,0.08)]">
        {([
          { id: 'nodejs', label: 'Node.js Server' },
          { id: 'docker', label: 'Docker' },
          { id: 'wiremock', label: 'WireMock JSON' },
        ] as { id: ExportFormat; label: string }[]).map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => { setFormat(f.id); setPreview(''); }}
            className="h-[32px] px-3 text-[11px] font-medium cursor-pointer transition-colors"
            style={{
              borderBottom: format === f.id ? `2px solid ${MOCK_ACCENT}` : '2px solid transparent',
              color: format === f.id ? MOCK_ACCENT : 'var(--color-text-muted)',
              marginBottom: '-1px',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Format description */}
      <FormatDescription format={format} server={server} />

      {/* Generate button */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={generate}
          className="h-[30px] px-4 text-[11px] font-medium rounded cursor-pointer"
          style={{ background: `color-mix(in srgb, ${MOCK_ACCENT} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${MOCK_ACCENT} 30%, transparent)`, color: MOCK_ACCENT }}
        >
          Generate Preview
        </button>
        <button
          type="button"
          onClick={() => onExport(format)}
          className="h-[30px] px-4 text-[11px] font-medium rounded cursor-pointer"
          style={{ background: `color-mix(in srgb, ${MOCK_ACCENT} 25%, transparent)`, border: `1px solid color-mix(in srgb, ${MOCK_ACCENT} 40%, transparent)`, color: MOCK_ACCENT }}
        >
          Download
        </button>
      </div>

      {/* Preview */}
      {preview && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Preview</span>
            <button
              type="button"
              onClick={copy}
              className="h-[22px] px-2 text-[10px] rounded cursor-pointer"
              style={{ color: copied ? 'var(--color-success)' : MOCK_ACCENT, background: `color-mix(in srgb, ${MOCK_ACCENT} 10%, transparent)` }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre className="p-3 rounded-lg text-[10px] font-mono text-[var(--color-text-muted)] overflow-auto max-h-[300px] whitespace-pre"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {preview}
          </pre>
        </div>
      )}
    </div>
  );
}

function FormatDescription({ format, server }: { format: ExportFormat; server: MockServer }) {
  const descs: Record<ExportFormat, string> = {
    nodejs: `Generates a standalone Node.js HTTP server (no external dependencies, uses built-in http module) that serves ${server.routes?.length ?? 0} routes. Run with: node mock-server.js`,
    docker: `Generates a Dockerfile that packages the Node.js server for containerized deployment. Build with: docker build -t mock-server . && docker run -p ${server.port ?? 4000}:${server.port ?? 4000} mock-server`,
    wiremock: `Exports all routes in WireMock stub mapping format. Compatible with WireMock standalone server. Place in __files/ and mappings/ directories.`,
  };
  return <p className="text-[10px] text-[var(--color-text-muted)] opacity-70">{descs[format]}</p>;
}

// ─── Preview generators (mirrors mock-exporter.ts logic but simplified) ──────

function buildNodeServerPreview(server: MockServer): string {
  const port = server.port ?? 4000;
  const routes = server.routes ?? [];
  const routesJson = JSON.stringify(routes.map(r => ({ method: r.method, path: r.path, status: r.statusCode, body: r.body, headers: r.headers, delay: r.delay })), null, 2);
  return `/**
 * Mock Server — Generated by Daakia
 * Routes: ${routes.length} | Port: ${port}
 * Run: node mock-server.js
 */
const http = require('http');

const ROUTES = ${routesJson};

function matchRoute(req) {
  return ROUTES.find(r =>
    (r.method === 'ANY' || r.method === req.method) &&
    req.url.startsWith(r.path)
  );
}

const server = http.createServer((req, res) => {
  const route = matchRoute(req);
  if (!route) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }
  const respond = () => {
    const headers = { 'Content-Type': 'application/json', ...route.headers };
    res.writeHead(route.status, headers);
    res.end(route.body);
  };
  route.delay > 0 ? setTimeout(respond, route.delay) : respond();
});

server.listen(${port}, () => console.log(\`Mock server running on http://localhost:${port}\`));
`;
}

function buildDockerfilePreview(server: MockServer): string {
  const port = server.port ?? 4000;
  return `# Daakia Mock Server — Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY mock-server.js .
EXPOSE ${port}
CMD ["node", "mock-server.js"]
`;
}

function buildWireMockPreview(server: MockServer): string {
  const routes = server.routes ?? [];
  const mappings = routes.map(r => ({
    request: { method: r.method === 'ANY' ? 'ANY' : r.method, url: r.path },
    response: { status: r.statusCode, body: r.body, headers: r.headers, fixedDelayMilliseconds: r.delay || undefined },
  }));
  return JSON.stringify({ mappings }, null, 2);
}
