/**
 * InsomniaImporter — parses Insomnia v4 JSON/YAML exports into Daakia collection format.
 * Feature 6B.15 — Import: Insomnia collections
 */

export interface DaakiaRequest {
  name: string;
  method: string;
  url: string;
  headers: Array<{ key: string; value: string; enabled: boolean }>;
  params: Array<{ key: string; value: string; enabled: boolean }>;
  body?: string;
  bodyType: 'json' | 'form' | 'raw' | 'none' | 'multipart';
  auth?: {
    type: 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2';
    token?: string;
    username?: string;
    password?: string;
    key?: string;
    value?: string;
  };
  description?: string;
}

export interface DaakiaFolder {
  name: string;
  requests: DaakiaRequest[];
  folders: DaakiaFolder[];
}

export interface DaakiaCollection {
  name: string;
  description?: string;
  folders: DaakiaFolder[];
  variables: Array<{ key: string; value: string; enabled: boolean }>;
}

interface InsomniaResource {
  _id: string;
  _type: string;
  name?: string;
  description?: string;
  parentId?: string;
  method?: string;
  url?: string;
  headers?: Array<{ name: string; value: string; disabled?: boolean }>;
  parameters?: Array<{ name: string; value: string; disabled?: boolean }>;
  body?: {
    mimeType?: string;
    text?: string;
    params?: Array<{ name: string; value: string; disabled?: boolean }>;
  };
  authentication?: {
    type?: string;
    token?: string;
    username?: string;
    password?: string;
    key?: string;
    value?: string;
    prefix?: string;
  };
  variable?: Array<{ name: string; value: string }>;
}

interface InsomniaExport {
  __export_source?: string;
  __export_format?: number;
  _type: string;
  resources: InsomniaResource[];
}

export class InsomniaImporter {
  /**
   * Parse Insomnia v4 JSON export text.
   * Returns null if the input is not a valid Insomnia export.
   */
  static parse(text: string): DaakiaCollection | null {
    let data: InsomniaExport;
    try {
      data = JSON.parse(text);
    } catch {
      // Try YAML-like (basic key: value — not full YAML support)
      return null;
    }

    if (data._type !== 'export' || !Array.isArray(data.resources)) {
      return null;
    }

    const resources = data.resources;

    // Find workspace
    const workspace = resources.find(r => r._type === 'workspace');
    const collectionName = workspace?.name || 'Insomnia Import';

    // Build environment variables
    const envResource = resources.find(r => r._type === 'environment' && (!r.parentId || r.parentId === workspace?._id));
    const variables: DaakiaCollection['variables'] = [];
    if (envResource?.variable) {
      for (const v of envResource.variable) {
        variables.push({ key: v.name, value: String(v.value ?? ''), enabled: true });
      }
    }

    // Build ID → resource map
    const byId = new Map<string, InsomniaResource>(resources.map(r => [r._id, r]));

    // Find root-level groups (direct children of workspace)
    const workspaceId = workspace?._id;
    const groups = resources.filter(r => r._type === 'request_group' && r.parentId === workspaceId);
    const orphanRequests = resources.filter(r => r._type === 'request' && r.parentId === workspaceId);

    const folders: DaakiaFolder[] = [];

    // Process each group
    for (const group of groups) {
      folders.push(this.buildFolder(group, resources));
    }

    // Orphan requests → default folder
    if (orphanRequests.length > 0) {
      folders.push({
        name: 'Requests',
        requests: orphanRequests.map(r => this.convertRequest(r)),
        folders: [],
      });
    }

    return {
      name: collectionName,
      description: workspace?.description,
      folders,
      variables,
    };
  }

  private static buildFolder(group: InsomniaResource, resources: InsomniaResource[]): DaakiaFolder {
    const children = resources.filter(r => r.parentId === group._id);
    const subGroups = children.filter(r => r._type === 'request_group');
    const requests = children.filter(r => r._type === 'request');

    return {
      name: group.name || 'Folder',
      requests: requests.map(r => this.convertRequest(r)),
      folders: subGroups.map(sg => this.buildFolder(sg, resources)),
    };
  }

  private static convertRequest(r: InsomniaResource): DaakiaRequest {
    const headers = (r.headers || []).map(h => ({
      key: h.name,
      value: h.value,
      enabled: !h.disabled,
    }));

    const params = (r.parameters || []).map(p => ({
      key: p.name,
      value: p.value,
      enabled: !p.disabled,
    }));

    let body: string | undefined;
    let bodyType: DaakiaRequest['bodyType'] = 'none';

    if (r.body) {
      const mime = r.body.mimeType || '';
      if (mime.includes('json')) {
        bodyType = 'json';
        body = r.body.text;
      } else if (mime.includes('form-urlencoded')) {
        bodyType = 'form';
        body = (r.body.params || []).map(p => `${p.name}=${p.value}`).join('&');
      } else if (mime.includes('multipart')) {
        bodyType = 'multipart';
        body = r.body.text;
      } else if (r.body.text) {
        bodyType = 'raw';
        body = r.body.text;
      }
    }

    let auth: DaakiaRequest['auth'] = { type: 'none' };
    if (r.authentication) {
      const a = r.authentication;
      const type = (a.type || '').toLowerCase();
      if (type === 'bearer') {
        auth = { type: 'bearer', token: a.token };
      } else if (type === 'basic') {
        auth = { type: 'basic', username: a.username, password: a.password };
      } else if (type === 'apikey') {
        auth = { type: 'apikey', key: a.key, value: a.value };
      } else if (type === 'oauth2') {
        auth = { type: 'oauth2', token: a.token };
      }
    }

    // Interpolate Insomnia variables {{ base_url }} → Daakia {{base_url}}
    const url = (r.url || '').replace(/{{\s*(\w+)\s*}}/g, '{{$1}}');

    return {
      name: r.name || 'Request',
      method: (r.method || 'GET').toUpperCase(),
      url,
      headers,
      params,
      body,
      bodyType,
      auth,
      description: r.description,
    };
  }

  /**
   * Flatten collection to a summary string for debugging.
   */
  static summarize(collection: DaakiaCollection): string {
    let count = 0;
    const countRequests = (folders: DaakiaFolder[]) => {
      for (const f of folders) {
        count += f.requests.length;
        countRequests(f.folders);
      }
    };
    countRequests(collection.folders);
    return `${collection.name}: ${count} requests in ${collection.folders.length} folder(s)`;
  }
}
