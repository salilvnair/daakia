declare module 'monaco-editor/esm/vs/language/typescript/monaco.contribution' {
  import type * as monaco from 'monaco-editor';

  interface LanguageServiceDefaults {
    setCompilerOptions(options: any): void;
    setDiagnosticsOptions(options: any): void;
    setEagerModelSync(value: boolean): void;
    addExtraLib(content: string, filePath?: string): { dispose(): void };
  }

  export const javascriptDefaults: LanguageServiceDefaults;
  export const typescriptDefaults: LanguageServiceDefaults;
  export const ScriptTarget: {
    ES2020: number;
    ESNext: number;
    Latest: number;
  };
  export const ModuleKind: {
    ESNext: number;
    CommonJS: number;
  };
  export const ModuleResolutionKind: {
    NodeJs: number;
  };
  export const JsxEmit: {
    React: number;
    ReactJSX: number;
  };
  export function getJavaScriptWorker(): Promise<(...uris: any[]) => Promise<any>>;
  export function getTypeScriptWorker(): Promise<(...uris: any[]) => Promise<any>>;
}
