/**
 * Debug Store — Zustand store for script debugger state.
 *
 * Manages breakpoints, current debug state, paused line, variables, and console logs.
 */
import { create } from 'zustand';

export interface DebugVariable {
  name: string;
  value: unknown;
  type: string;
}

export interface DebugLogEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: unknown[];
  timestamp: number;
}

export interface DebugSubRequest {
  method: string;
  url: string;
  status: number;
  statusText: string;
  duration: number;
  timestamp: number;
  phase: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
}

export interface DebugCallFrame {
  fn: string;
  file: string;
  line: number;
  col: number;
  isUser: boolean;
}

export type DebugStatus = 'idle' | 'running' | 'paused';

interface DebugState {
  /** Whether a debug session is active */
  active: boolean;
  /** Current debug status */
  status: DebugStatus;
  /** Which script phase is being debugged */
  phase: 'pre-request' | 'post-response' | null;
  /** Tab ID being debugged */
  tabId: string | null;
  /** Current paused line (1-based) */
  pausedLine: number | null;
  /** Variables at the current pause point */
  variables: DebugVariable[];
  /** Console output from script execution */
  logs: DebugLogEntry[];
  /** Sub-requests made via dk.sendRequest during debug */
  subRequests: DebugSubRequest[];
  /** Call stack frames from runtime */
  callStack: DebugCallFrame[];
  /** Breakpoints per tab key ("tabId:phase" → line numbers) */
  breakpoints: Record<string, number[]>;
  /** Disabled breakpoints per tab key */
  disabledBreakpoints: Record<string, number[]>;
  /** Conditional breakpoint expressions per tab key → line → condition */
  conditions: Record<string, Record<number, string>>;
  /** When true, all breakpoints are effectively disabled (execution won't pause) */
  breakpointsMuted: boolean;
  /** Line number to scroll to in the active editor (consumed after scrolling) */
  navigateLine: number | null;

  // Actions
  startDebug: (tabId: string, phase: 'pre-request' | 'post-response') => void;
  setPaused: (line: number, variables: DebugVariable[], callStack?: DebugCallFrame[]) => void;
  setResumed: () => void;
  setCompleted: () => void;
  setError: (message: string) => void;
  addLog: (entry: DebugLogEntry) => void;
  addSubRequest: (entry: DebugSubRequest) => void;
  stopDebug: () => void;

  // Breakpoint management
  toggleBreakpoint: (tabId: string, phase: string, line: number) => void;
  addConditionalBreakpoint: (tabId: string, phase: string, line: number, condition: string) => void;
  toggleDisableBreakpoint: (tabId: string, phase: string, line: number) => void;
  removeBreakpoint: (tabId: string, phase: string, line: number) => void;
  setBreakpoints: (tabId: string, phase: string, lines: number[]) => void;
  getBreakpoints: (tabId: string, phase: string) => number[];
  clearBreakpoints: (tabId: string, phase: string) => void;
  clearAllBreakpoints: () => void;
  pruneBreakpoints: (tabId: string, phase: string, maxLine: number) => void;
  toggleMuteBreakpoints: () => void;
  setNavigateLine: (line: number | null) => void;
}

export const useDebugStore = create<DebugState>((set, get) => ({
  active: false,
  status: 'idle',
  phase: null,
  tabId: null,
  pausedLine: null,
  variables: [],
  logs: [],
  subRequests: [],
  callStack: [],
  breakpoints: {},
  disabledBreakpoints: {},
  conditions: {},
  breakpointsMuted: false,
  navigateLine: null,

  startDebug: (tabId, phase) => set({
    active: true,
    status: 'running',
    phase,
    tabId,
    pausedLine: null,
    variables: [],
    logs: [],
    subRequests: [],
    callStack: [],
  }),

  setPaused: (line, variables, callStack) => set(state => {
    // Accumulate variables (IntelliJ-style): merge new values with existing,
    // update values for same names, add new ones, never remove during session
    const merged = [...state.variables];
    for (const v of variables) {
      const idx = merged.findIndex(m => m.name === v.name);
      if (idx >= 0) {
        merged[idx] = v; // update value
      } else {
        merged.push(v);
      }
    }
    return {
      status: 'paused' as const,
      pausedLine: line,
      variables: merged,
      callStack: callStack || [],
    };
  }),

  setResumed: () => set({
    status: 'running',
    pausedLine: null,
    callStack: [],
    // Keep variables visible while running (IntelliJ-style persistence)
  }),

  setCompleted: () => set({
    active: false,
    status: 'idle',
    pausedLine: null,
    phase: null,
    tabId: null,
  }),

  setError: (message) => {
    const { logs } = get();
    set({
      active: false,
      status: 'idle',
      pausedLine: null,
      phase: null,
      tabId: null,
      logs: [...logs, { level: 'error', args: [message], timestamp: Date.now() }],
    });
  },

  addLog: (entry) => set(state => ({
    logs: [...state.logs, entry],
  })),

  addSubRequest: (entry) => set(state => ({
    subRequests: [...state.subRequests, entry],
  })),

  stopDebug: () => set({
    active: false,
    status: 'idle',
    pausedLine: null,
    phase: null,
    tabId: null,
    variables: [],
    logs: [],
    subRequests: [],
  }),

  toggleBreakpoint: (tabId, phase, line) => {
    const key = `${tabId}:${phase}`;
    const { breakpoints } = get();
    const current = breakpoints[key] || [];
    const idx = current.indexOf(line);
    const updated = idx >= 0
      ? current.filter(l => l !== line)
      : [...current, line].sort((a, b) => a - b);
    set({ breakpoints: { ...breakpoints, [key]: updated } });
  },

  addConditionalBreakpoint: (tabId, phase, line, condition) => {
    const key = `${tabId}:${phase}`;
    const { breakpoints, conditions } = get();
    const current = breakpoints[key] || [];
    // Add to breakpoints if not already there
    const updated = current.includes(line) ? current : [...current, line].sort((a, b) => a - b);
    const lineConditions = { ...(conditions[key] || {}), [line]: condition };
    set({
      breakpoints: { ...breakpoints, [key]: updated },
      conditions: { ...conditions, [key]: lineConditions },
    });
  },

  toggleDisableBreakpoint: (tabId, phase, line) => {
    const key = `${tabId}:${phase}`;
    const { disabledBreakpoints } = get();
    const current = disabledBreakpoints[key] || [];
    const idx = current.indexOf(line);
    const updated = idx >= 0
      ? current.filter(l => l !== line)
      : [...current, line];
    set({ disabledBreakpoints: { ...disabledBreakpoints, [key]: updated } });
  },

  removeBreakpoint: (tabId, phase, line) => {
    const key = `${tabId}:${phase}`;
    const { breakpoints, conditions, disabledBreakpoints } = get();
    const updatedBp = (breakpoints[key] || []).filter(l => l !== line);
    const updatedCond = { ...(conditions[key] || {}) };
    delete updatedCond[line];
    const updatedDisabled = (disabledBreakpoints[key] || []).filter(l => l !== line);
    set({
      breakpoints: { ...breakpoints, [key]: updatedBp },
      conditions: { ...conditions, [key]: updatedCond },
      disabledBreakpoints: { ...disabledBreakpoints, [key]: updatedDisabled },
    });
  },

  setBreakpoints: (tabId, phase, lines) => {
    const key = `${tabId}:${phase}`;
    const { breakpoints } = get();
    set({ breakpoints: { ...breakpoints, [key]: lines.sort((a, b) => a - b) } });
  },

  getBreakpoints: (tabId, phase) => {
    const key = `${tabId}:${phase}`;
    return get().breakpoints[key] || [];
  },

  clearBreakpoints: (tabId, phase) => {
    const key = `${tabId}:${phase}`;
    const { breakpoints, conditions, disabledBreakpoints } = get();
    const updatedBp = { ...breakpoints };
    delete updatedBp[key];
    const updatedCond = { ...conditions };
    delete updatedCond[key];
    const updatedDisabled = { ...disabledBreakpoints };
    delete updatedDisabled[key];
    set({ breakpoints: updatedBp, conditions: updatedCond, disabledBreakpoints: updatedDisabled });
  },

  clearAllBreakpoints: () => {
    set({ breakpoints: {}, conditions: {}, disabledBreakpoints: {} });
  },

  pruneBreakpoints: (tabId, phase, maxLine) => {
    const key = `${tabId}:${phase}`;
    const { breakpoints, conditions, disabledBreakpoints } = get();
    const current = breakpoints[key] || [];
    const pruned = current.filter(l => l <= maxLine);
    if (pruned.length === current.length) return; // nothing to prune
    const updatedBp = { ...breakpoints, [key]: pruned };
    const updatedDisabled = { ...disabledBreakpoints, [key]: (disabledBreakpoints[key] || []).filter(l => l <= maxLine) };
    const updatedCond = { ...(conditions[key] || {}) };
    for (const lineStr of Object.keys(updatedCond)) {
      if (Number(lineStr) > maxLine) delete updatedCond[Number(lineStr)];
    }
    set({
      breakpoints: updatedBp,
      disabledBreakpoints: updatedDisabled,
      conditions: { ...conditions, [key]: updatedCond },
    });
  },

  toggleMuteBreakpoints: () => set(state => ({ breakpointsMuted: !state.breakpointsMuted })),
  setNavigateLine: (line) => set({ navigateLine: line }),
}));
