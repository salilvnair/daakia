/** VS Code webview API wrapper — safe to use in browser dev mode too */

export type VsCodeApi = {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

declare function acquireVsCodeApi(): VsCodeApi;

let _api: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi {
  if (!_api) {
    const w = window as unknown as Record<string, unknown>;
    if (w.__DAAKIA_VSCODE_API__) {
      _api = w.__DAAKIA_VSCODE_API__ as VsCodeApi;
    } else if (typeof acquireVsCodeApi !== 'undefined') {
      _api = acquireVsCodeApi();
    } else {
      _api = {
        postMessage: (msg) => console.log('[vscode mock postMessage]', msg),
        getState: () => ({}),
        setState: () => {},
      };
    }
  }
  return _api;
}

export function postMsg(msg: unknown) {
  getVsCodeApi().postMessage(msg);
}
