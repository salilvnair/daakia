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
