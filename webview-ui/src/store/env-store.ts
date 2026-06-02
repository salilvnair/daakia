import { create } from 'zustand';

export const GLOBAL_ENV_ID = 'global';

export interface EnvVariable {
  id: string;
  key: string;
  initialValue: string;
  currentValue: string;
  isSecret: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvVariable[];
  isGlobal?: boolean;
}

interface EnvState {
  environments: Environment[];
  activeEnvId: string | null;
  /** Set externally (e.g. TabBar) to request EnvironmentsPanel open the edit modal */
  pendingEditEnvId: string | null;

  // Actions
  addEnvironment: (name?: string) => string;
  removeEnvironment: (id: string) => void;
  renameEnvironment: (id: string, name: string) => void;
  duplicateEnvironment: (id: string) => string | null;
  setActiveEnvironment: (id: string | null) => void;
  updateVariables: (envId: string, variables: EnvVariable[]) => void;
  addVariable: (envId: string, isSecret?: boolean) => void;
  removeVariable: (envId: string, varId: string) => void;
  updateVariable: (envId: string, varId: string, patch: Partial<EnvVariable>) => void;
  hydrateEnvironments: (environments: Environment[], activeEnvId: string | null) => void;
  requestEditEnv: (envId: string) => void;
  clearPendingEditEnv: () => void;

  // Resolve a variable reference like {{baseUrl}}
  resolveVariable: (input: string) => string;
  resolveWithEnv: (input: string, envId: string | null, extraLayers?: { key: string; value: string }[][]) => string;
}

function createDefaultVariable(isSecret = false): EnvVariable {
  return {
    id: crypto.randomUUID(),
    key: '',
    initialValue: '',
    currentValue: '',
    isSecret,
  };
}

function createGlobalEnvironment(): Environment {
  return {
    id: GLOBAL_ENV_ID,
    name: 'Global',
    isGlobal: true,
    variables: [],
  };
}

function ensureGlobalEnvironment(environments: Environment[]): Environment[] {
  const next = [...environments];
  const globalIndex = next.findIndex(env => env.id === GLOBAL_ENV_ID || env.isGlobal || env.name === 'Global');

  if (globalIndex === -1) {
    return [createGlobalEnvironment(), ...next];
  }

  const globalEnv = {
    ...next[globalIndex],
    id: GLOBAL_ENV_ID,
    name: 'Global',
    isGlobal: true,
  };

  next.splice(globalIndex, 1);
  next.unshift(globalEnv);
  return next;
}

export const useEnvStore = create<EnvState>((set, get) => ({
  environments: [createGlobalEnvironment()],
  activeEnvId: GLOBAL_ENV_ID,
  pendingEditEnvId: null,

  addEnvironment: (name) => {
    const env: Environment = {
      id: crypto.randomUUID(),
      name: name || 'New Environment',
      variables: [createDefaultVariable()],
    };
    set(s => ({
      environments: ensureGlobalEnvironment([...s.environments, env]),
      activeEnvId: env.id,
    }));
    return env.id;
  },

  removeEnvironment: (id) => {
    if (id === GLOBAL_ENV_ID) return;
    set(s => {
      const envs = ensureGlobalEnvironment(s.environments.filter(e => e.id !== id));
      return {
        environments: envs,
        activeEnvId: s.activeEnvId === id ? GLOBAL_ENV_ID : s.activeEnvId,
      };
    });
  },

  renameEnvironment: (id, name) => {
    if (id === GLOBAL_ENV_ID) return;
    set(s => ({
      environments: ensureGlobalEnvironment(s.environments.map(e => e.id === id ? { ...e, name } : e)),
    }));
  },

  duplicateEnvironment: (id) => {
    const source = get().environments.find(env => env.id === id);
    if (!source) return null;

    const newId = crypto.randomUUID();
    const clone: Environment = {
      id: newId,
      name: source.id === GLOBAL_ENV_ID ? 'Global Copy' : `${source.name} Copy`,
      variables: source.variables.map(variable => ({ ...variable, id: crypto.randomUUID() })),
    };

    set(s => ({
      environments: ensureGlobalEnvironment([...s.environments, clone]),
      activeEnvId: newId,
    }));
    return newId;
  },

  setActiveEnvironment: (id) => set({ activeEnvId: id || GLOBAL_ENV_ID }),

  updateVariables: (envId, variables) => {
    set(s => ({
      environments: ensureGlobalEnvironment(s.environments.map(e => e.id === envId ? { ...e, variables } : e)),
    }));
  },

  addVariable: (envId, isSecret = false) => {
    set(s => ({
      environments: ensureGlobalEnvironment(s.environments.map(e =>
        e.id === envId
          ? { ...e, variables: [...e.variables, createDefaultVariable(isSecret)] }
          : e
      )),
    }));
  },

  removeVariable: (envId, varId) => {
    set(s => ({
      environments: ensureGlobalEnvironment(s.environments.map(e =>
        e.id === envId
          ? { ...e, variables: e.variables.filter(v => v.id !== varId) }
          : e
      )),
    }));
  },

  updateVariable: (envId, varId, patch) => {
    set(s => ({
      environments: ensureGlobalEnvironment(s.environments.map(e =>
        e.id === envId
          ? { ...e, variables: e.variables.map(v => v.id === varId ? { ...v, ...patch } : v) }
          : e
      )),
    }));
  },

  hydrateEnvironments: (environments, activeEnvId) => {
    const next = ensureGlobalEnvironment(environments);
    set({
      environments: next,
      activeEnvId: activeEnvId && next.some(env => env.id === activeEnvId) ? activeEnvId : GLOBAL_ENV_ID,
    });
  },

  requestEditEnv: (envId) => set({ pendingEditEnvId: envId }),
  clearPendingEditEnv: () => set({ pendingEditEnvId: null }),

  resolveVariable: (input) => {
    const { environments, activeEnvId } = get();
    const globalEnv = environments.find(env => env.id === GLOBAL_ENV_ID);
    const activeEnv = environments.find(env => env.id === activeEnvId);

    // First pass: replace escape syntax $daakia_{var}_$ with a placeholder
    let result = input.replace(/\$daakia_\{([\w.\-]+)\}_\$/g, (_m, varName) => `\x00ESC_DBL{${varName}}\x00`);
    result = result.replace(/\$daakia_\$([\w.\-]+)\$_\$/g, (_m, varName) => `\x00ESC_DLR{${varName}}\x00`);

    // Second pass: resolve {{var}} and ${var} patterns (supports hyphens and dots in names)
    result = result.replace(/\{\{([\w.\-]+)\}\}|\$\{([\w.\-]+)\}/g, (match, braceVar, dollarVar) => {
      const varName = braceVar || dollarVar;
      const variable = activeEnv?.variables.find(v => v.key === varName)
        ?? globalEnv?.variables.find(v => v.key === varName);
      if (!variable) return match;
      return variable.currentValue || variable.initialValue || match;
    });

    // Third pass: restore escaped placeholders back to literal syntax
    result = result.replace(/\x00ESC_DBL\{([\w.\-]+)\}\x00/g, (_m, varName) => `{{${varName}}}`);
    result = result.replace(/\x00ESC_DLR\{([\w.\-]+)\}\x00/g, (_m, varName) => `\${${varName}}`);
    return result;
  },

  resolveWithEnv: (input, envId, extraLayers) => {
    const { environments } = get();
    const globalEnv = environments.find(env => env.id === GLOBAL_ENV_ID);
    const activeEnv = envId ? environments.find(env => env.id === envId) : null;

    // First pass: replace escape syntax $daakia_{var}_$ with a placeholder
    let result = input.replace(/\$daakia_\{([\w.\-]+)\}_\$/g, (_m, varName) => `\x00ESC_DBL{${varName}}\x00`);
    result = result.replace(/\$daakia_\$([\w.\-]+)\$_\$/g, (_m, varName) => `\x00ESC_DLR{${varName}}\x00`);

    // Second pass: resolve {{var}} and ${var} patterns (supports hyphens and dots in names)
    result = result.replace(/\{\{([\w.\-]+)\}\}|\$\{([\w.\-]+)\}/g, (match, braceVar, dollarVar) => {
      const varName = braceVar || dollarVar;
      // Priority: extraLayers (first = highest, e.g. request vars, then collection vars) > active env > global
      if (extraLayers) {
        for (const layer of extraLayers) {
          const found = layer.find(v => v.key === varName);
          if (found && found.value) return found.value;
        }
      }
      const variable = activeEnv?.variables.find(v => v.key === varName)
        ?? globalEnv?.variables.find(v => v.key === varName);
      if (!variable) return match;
      return variable.currentValue || variable.initialValue || match;
    });

    // Third pass: restore escaped placeholders back to literal syntax
    result = result.replace(/\x00ESC_DBL\{([\w.\-]+)\}\x00/g, (_m, varName) => `{{${varName}}}`);
    result = result.replace(/\x00ESC_DLR\{([\w.\-]+)\}\x00/g, (_m, varName) => `\${${varName}}`);
    return result;
  },
}));
