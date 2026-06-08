/**
 * Environment handlers — CRUD, import/export (JSON, Postman, Insomnia, Gist).
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  getAllEnvironments, upsertEnvironment, deleteEnvironment as dbDeleteEnvironment,
  setActiveEnvironment as dbSetActiveEnv,
} from '../../../storage/db';

type PostMessage = (msg: unknown) => void;

export function handleGetEnvironments(postMessage: PostMessage) {
  const rows = getAllEnvironments();
  const environments = rows.map(r => ({
    id: r.id,
    name: r.name,
    variables: JSON.parse(r.variables || '[]'),
  }));
  const activeRow = rows.find(r => r.is_active === 1);
  postMessage({ type: 'environmentsData', environments, activeEnvId: activeRow?.id ?? null });
}

export function handleSaveEnvironments(msg: Record<string, unknown>) {
  const environments = msg.environments as { id: string; name: string; variables: unknown[] }[];
  const activeEnvId = msg.activeEnvId as string | null;

  const existingRows = getAllEnvironments();
  const incomingIds = new Set(environments.map(e => e.id));
  for (const row of existingRows) {
    if (!incomingIds.has(row.id)) {
      dbDeleteEnvironment(row.id);
    }
  }
  for (const env of environments) {
    upsertEnvironment({
      id: env.id,
      name: env.name,
      variables: JSON.stringify(env.variables),
      is_active: env.id === activeEnvId ? 1 : 0,
    });
  }
  if (activeEnvId) {
    dbSetActiveEnv(activeEnvId);
  } else {
    dbSetActiveEnv(null);
  }
}

export async function handleExportEnvironmentsJson(msg: Record<string, unknown>, postMessage: PostMessage) {
  const environments = msg.environments as unknown[];
  const activeEnvId = msg.activeEnvId as string | null;
  const uri = await vscode.window.showSaveDialog({
    saveLabel: 'Export environments',
    defaultUri: vscode.Uri.file('environments.json'),
    filters: { 'JSON Files': ['json'] },
  });
  if (!uri) return;

  fs.writeFileSync(uri.fsPath, JSON.stringify({ environments, activeEnvId }, null, 2), 'utf8');
  postMessage({ type: 'environmentExported', message: `Exported to ${path.basename(uri.fsPath)}` });
}

export async function handleImportEnvironmentsJson(postMessage: PostMessage) {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'JSON Files': ['json'] },
    title: 'Import environments JSON',
  });
  if (!uris?.[0]) return;

  const raw = fs.readFileSync(uris[0].fsPath, 'utf8');
  const parsed = JSON.parse(raw) as { environments?: unknown[]; activeEnvId?: string | null };
  postMessage({
    type: 'environmentsImported',
    environments: parsed.environments ?? [],
    activeEnvId: parsed.activeEnvId ?? null,
  });
}

export async function handleImportEnvironmentsPostman(postMessage: PostMessage) {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: true,
    filters: { 'JSON Files': ['json'], 'Postman Files': ['postman_environment'] },
    title: 'Import Postman environment(s)',
  });
  if (!uris?.length) return;

  const environments: { id: string; name: string; variables: { id: string; key: string; initialValue: string; currentValue: string; isSecret: boolean }[] }[] = [];

  for (const uri of uris) {
    try {
      const raw = fs.readFileSync(uri.fsPath, 'utf8');
      const parsed = JSON.parse(raw);

      if (parsed.values && Array.isArray(parsed.values)) {
        environments.push({
          id: parsed.id || crypto.randomUUID(),
          name: parsed.name || path.basename(uri.fsPath, '.json'),
          variables: parsed.values
            .filter((v: any) => v.enabled !== false)
            .map((v: any) => ({
              id: crypto.randomUUID(),
              key: v.key || '',
              initialValue: v.value || '',
              currentValue: v.value || '',
              isSecret: v.type === 'secret',
            })),
        });
      }
    } catch { /* Skip malformed files */ }
  }

  if (environments.length > 0) {
    postMessage({ type: 'environmentsImported', environments, activeEnvId: null, merge: true });
  } else {
    postMessage({ type: 'toast', toastType: 'error', message: 'No valid Postman environments found in selected file(s).' });
  }
}

export async function handleImportEnvironmentsInsomnia(postMessage: PostMessage) {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'JSON/YAML Files': ['json', 'yaml', 'yml'] },
    title: 'Import Insomnia environment(s)',
  });
  if (!uris?.[0]) return;

  try {
    const raw = fs.readFileSync(uris[0].fsPath, 'utf8');
    const parsed = JSON.parse(raw);
    const environments: { id: string; name: string; variables: { id: string; key: string; initialValue: string; currentValue: string; isSecret: boolean }[] }[] = [];

    // Insomnia v4 export: { _type: "export", resources: [...] }
    if (parsed.resources && Array.isArray(parsed.resources)) {
      const envResources = parsed.resources.filter((r: any) => r._type === 'environment' && r.data);
      for (const res of envResources) {
        if (res.name === 'Base Environment' || res.parentId === '__BASE_ENVIRONMENT_ID__') continue;
        const data = res.data as Record<string, string>;
        environments.push({
          id: res._id || crypto.randomUUID(),
          name: res.name || 'Imported',
          variables: Object.entries(data).map(([key, value]) => ({
            id: crypto.randomUUID(),
            key,
            initialValue: String(value),
            currentValue: String(value),
            isSecret: false,
          })),
        });
      }
    }

    // Simple format: { name, data: { key: value } }
    if (!parsed.resources && parsed.data && typeof parsed.data === 'object') {
      environments.push({
        id: parsed._id || crypto.randomUUID(),
        name: parsed.name || 'Imported',
        variables: Object.entries(parsed.data).map(([key, value]) => ({
          id: crypto.randomUUID(),
          key,
          initialValue: String(value as string),
          currentValue: String(value as string),
          isSecret: false,
        })),
      });
    }

    if (environments.length > 0) {
      postMessage({ type: 'environmentsImported', environments, activeEnvId: null, merge: true });
    } else {
      postMessage({ type: 'toast', toastType: 'error', message: 'No valid Insomnia environments found.' });
    }
  } catch {
    postMessage({ type: 'toast', toastType: 'error', message: 'Failed to parse Insomnia export file.' });
  }
}

export async function handleImportEnvironmentsGist(msg: Record<string, unknown>, postMessage: PostMessage) {
  const gistUrl = msg.gistUrl as string | undefined;

  if (gistUrl) {
    try {
      const gistId = gistUrl.split('/').pop()?.split('#')[0] || '';
      const response = await fetch(`https://api.github.com/gists/${gistId}`);
      if (!response.ok) {
        postMessage({ type: 'toast', toastType: 'error', message: `Failed to fetch Gist: ${response.status}` });
        return;
      }
      const gist = await response.json() as { files: Record<string, { content: string }> };
      const file = Object.values(gist.files)[0];
      if (!file) {
        postMessage({ type: 'toast', toastType: 'error', message: 'Gist has no files.' });
        return;
      }
      const parsed = JSON.parse(file.content) as { environments?: unknown[]; activeEnvId?: string | null };
      postMessage({
        type: 'environmentsImported',
        environments: parsed.environments ?? [],
        activeEnvId: parsed.activeEnvId ?? null,
      });
    } catch {
      postMessage({ type: 'toast', toastType: 'error', message: 'Failed to import from Gist. Check the URL and try again.' });
    }
  } else {
    const url = await vscode.window.showInputBox({
      title: 'Import from GitHub Gist',
      prompt: 'Paste a GitHub Gist URL containing environment data',
      placeHolder: 'https://gist.github.com/username/gist_id',
    });
    if (!url) return;
    await handleImportEnvironmentsGist({ gistUrl: url }, postMessage);
  }
}

// ─── Import: .env file ────────────────────────────────────────────────────────

/**
 * 6B.2 — Import .env file (KEY=VALUE pairs).
 * Lines starting with # are comments. Blank lines are skipped.
 * Quoted values (single or double) are stripped.
 */
export async function handleImportEnvironmentsDotEnv(postMessage: PostMessage) {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: true,
    filters: { 'Env Files': ['env'], 'All Files': ['*'] },
    title: 'Import .env file(s) as environment(s)',
  });
  if (!uris?.length) return;

  const environments: { id: string; name: string; variables: { id: string; key: string; initialValue: string; currentValue: string; isSecret: boolean }[] }[] = [];

  for (const uri of uris) {
    try {
      const raw = fs.readFileSync(uri.fsPath, 'utf8');
      const vars: { id: string; key: string; initialValue: string; currentValue: string; isSecret: boolean }[] = [];
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key) {
          vars.push({ id: crypto.randomUUID(), key, initialValue: value, currentValue: value, isSecret: false });
        }
      }
      if (vars.length > 0) {
        const name = path.basename(uri.fsPath).replace(/^\./, '').replace(/\.env$/, '') || 'Imported';
        environments.push({ id: crypto.randomUUID(), name, variables: vars });
      }
    } catch { /* skip malformed */ }
  }

  if (environments.length > 0) {
    postMessage({ type: 'environmentsImported', environments, activeEnvId: null, merge: true });
  } else {
    postMessage({ type: 'toast', toastType: 'error', message: 'No valid KEY=VALUE pairs found in selected file(s).' });
  }
}

// ─── Export: Postman Environment ──────────────────────────────────────────────

/**
 * 5.4.13 — Export environment(s) as Postman environment JSON.
 * Format: { id, name, values: [{key, value, enabled, type}], _postman_variable_scope }
 */
export async function handleExportEnvironmentsPostman(msg: Record<string, unknown>, postMessage: PostMessage) {
  const environments = msg.environments as { id: string; name: string; variables: { key: string; initialValue: string; isSecret?: boolean }[] }[];
  if (!environments?.length) return;

  const isSingle = environments.length === 1;
  const defaultName = isSingle ? `${environments[0].name}.postman_environment.json` : 'daakia-environments.postman_environment.json';

  const uri = await vscode.window.showSaveDialog({
    saveLabel: 'Export as Postman environment',
    defaultUri: vscode.Uri.file(defaultName),
    filters: { 'JSON Files': ['json'] },
  });
  if (!uri) return;

  const toPostman = (env: typeof environments[0]) => ({
    id: env.id,
    name: env.name,
    values: env.variables.map(v => ({
      key: v.key,
      value: v.initialValue,
      enabled: true,
      type: v.isSecret ? 'secret' : 'default',
    })),
    _postman_variable_scope: 'environment',
    _postman_exported_at: new Date().toISOString(),
    _postman_exported_using: 'Daakia/1.0',
  });

  const content = isSingle
    ? JSON.stringify(toPostman(environments[0]), null, 2)
    : JSON.stringify(environments.map(toPostman), null, 2);

  fs.writeFileSync(uri.fsPath, content, 'utf8');
  postMessage({ type: 'environmentExported', message: `Exported as Postman environment to ${path.basename(uri.fsPath)}` });
}

// ─── Export: Bruno Environment ────────────────────────────────────────────────

/**
 * 5.4.14 — Export environment(s) as Bruno .env files (dotenv-style).
 * Variables marked as secret get a # secret annotation.
 */
export async function handleExportEnvironmentsBruno(msg: Record<string, unknown>, postMessage: PostMessage) {
  const environments = msg.environments as { id: string; name: string; variables: { key: string; initialValue: string; isSecret?: boolean }[] }[];
  if (!environments?.length) return;

  const isSingle = environments.length === 1;
  const defaultName = isSingle ? `${environments[0].name}.env` : 'daakia-environments.env';

  const uri = await vscode.window.showSaveDialog({
    saveLabel: 'Export as Bruno .env',
    defaultUri: vscode.Uri.file(defaultName),
    filters: { 'Env Files': ['env'], 'Text Files': ['txt'] },
  });
  if (!uri) return;

  const toBruno = (env: typeof environments[0]) => {
    const lines = [`# Bruno Environment: ${env.name}`, ''];
    for (const v of env.variables) {
      if (v.isSecret) lines.push(`# secret`);
      lines.push(`${v.key}=${v.initialValue}`);
    }
    return lines.join('\n');
  };

  const content = environments.map(toBruno).join('\n\n# ---\n\n');
  fs.writeFileSync(uri.fsPath, content, 'utf8');
  postMessage({ type: 'environmentExported', message: `Exported as Bruno .env to ${path.basename(uri.fsPath)}` });
}

// ─── Export: Insomnia Environment ─────────────────────────────────────────────

/**
 * 5.4.15 — Export environment(s) as Insomnia environment JSON sub-documents.
 */
export async function handleExportEnvironmentsInsomnia(msg: Record<string, unknown>, postMessage: PostMessage) {
  const environments = msg.environments as { id: string; name: string; variables: { key: string; initialValue: string; isSecret?: boolean }[] }[];
  if (!environments?.length) return;

  const uri = await vscode.window.showSaveDialog({
    saveLabel: 'Export as Insomnia environment',
    defaultUri: vscode.Uri.file('daakia-environments.json'),
    filters: { 'JSON Files': ['json'] },
  });
  if (!uri) return;

  const toInsomnia = (env: typeof environments[0]) => ({
    _id: env.id,
    _type: 'environment',
    parentId: '__BASE_ENVIRONMENT_ID__',
    name: env.name,
    data: Object.fromEntries(env.variables.map(v => [v.key, v.initialValue])),
    dataPropertyOrder: null,
    color: null,
    isPrivate: env.variables.some(v => v.isSecret),
    metaSortKey: Date.now(),
  });

  const doc = {
    _type: 'export',
    __export_format: 4,
    __export_date: new Date().toISOString(),
    __export_source: 'daakia',
    resources: environments.map(toInsomnia),
  };

  fs.writeFileSync(uri.fsPath, JSON.stringify(doc, null, 2), 'utf8');
  postMessage({ type: 'environmentExported', message: `Exported as Insomnia environment to ${path.basename(uri.fsPath)}` });
}

// ─── Export: HTTPie Environment ───────────────────────────────────────────────

/**
 * 5.4.16 — Export environment(s) as HTTPie session JSON.
 * Variables map to custom headers (X-Env-*) and meta.
 */
export async function handleExportEnvironmentsHttpie(msg: Record<string, unknown>, postMessage: PostMessage) {
  const environments = msg.environments as { id: string; name: string; variables: { key: string; initialValue: string; isSecret?: boolean }[] }[];
  if (!environments?.length) return;

  const isSingle = environments.length === 1;
  const defaultName = isSingle ? `${environments[0].name}.json` : 'daakia-environments.json';

  const uri = await vscode.window.showSaveDialog({
    saveLabel: 'Export as HTTPie session',
    defaultUri: vscode.Uri.file(defaultName),
    filters: { 'JSON Files': ['json'] },
  });
  if (!uri) return;

  // HTTPie named session format — variables stored as meta/env section
  const toHttpie = (env: typeof environments[0]) => ({
    __version__: '2',
    __meta__: {
      about: `HTTPie session exported from Daakia — ${env.name}`,
      help: 'https://httpie.io/docs/desktop/sessions',
    },
    auth: { type: null, username: null, password: null },
    cookies: {},
    headers: {},
    env: Object.fromEntries(env.variables.map(v => [v.key, v.initialValue])),
  });

  const content = isSingle
    ? JSON.stringify(toHttpie(environments[0]), null, 2)
    : JSON.stringify(Object.fromEntries(environments.map(e => [e.name, toHttpie(e)])), null, 2);

  fs.writeFileSync(uri.fsPath, content, 'utf8');
  postMessage({ type: 'environmentExported', message: `Exported as HTTPie session to ${path.basename(uri.fsPath)}` });
}

// ─── Gist (existing) ──────────────────────────────────────────────────────────

export async function handleExportEnvironmentsGist(msg: Record<string, unknown>, postMessage: PostMessage) {
  const environments = msg.environments as unknown[];
  const activeEnvId = msg.activeEnvId as string | null;
  const isSecret = msg.isSecret as boolean ?? true;

  const token = await vscode.window.showInputBox({
    title: 'GitHub Personal Access Token',
    prompt: 'Enter a GitHub PAT with "gist" scope to create the Gist',
    password: true,
    placeHolder: 'ghp_...',
  });
  if (!token) return;

  try {
    const payload = {
      description: 'Daakia Environments Export',
      public: !isSecret,
      files: {
        'daakia-environments.json': {
          content: JSON.stringify({ environments, activeEnvId }, null, 2),
        },
      },
    };

    const response = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      postMessage({ type: 'toast', toastType: 'error', message: `Failed to create Gist: ${response.status}` });
      return;
    }

    const result = await response.json() as { html_url: string };
    await vscode.env.clipboard.writeText(result.html_url);
    postMessage({ type: 'toast', toastType: 'success', message: `Gist created! URL copied to clipboard.` });
  } catch {
    postMessage({ type: 'toast', toastType: 'error', message: 'Failed to create Gist.' });
  }
}
