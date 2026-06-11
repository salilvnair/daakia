// Stubs injected into every live preview eval scope.
// All values are inert — they let code snippets reference common variables
// without crashing, even though interactions won't persist state.

export const STUBS: Record<string, unknown> = {
  // ── Event handler stubs ──────────────────────────────────────────────────────
  send: () => {}, cancel: () => {}, del: () => {}, remove: () => {},
  rename: () => {}, addReq: () => {}, save: () => {}, saveJson: () => {},
  saveYaml: () => {}, confirm: () => {}, create: () => {}, toggle: () => {},
  generateRequest: () => {}, openRequest: () => {}, handleCopy: () => {},
  handleSave: () => {}, dryRun: () => {}, saveAndSend: () => {},
  closeTab: () => {}, addTab: () => {}, openWsdl: () => {},

  // ── Boolean flags ────────────────────────────────────────────────────────────
  isGenerating: false,
  enabled: true, setEnabled: () => {},
  selected: false, setSelected: () => {},
  open: false, setOpen: () => {},
  dirty: false,

  // ── String/value state ───────────────────────────────────────────────────────
  url: 'https://api.example.com/users', setUrl: () => {},
  method: 'GET', setMethod: () => {},
  body: '{\n  "name": "Alice"\n}', setBody: () => {},
  activeId: 'params', setActiveId: () => {},
  activeTab: 'body', setActiveTab: () => {},
  active: 'body', setActive: () => {},
  q: '', setQ: () => {},
  timeout: 5000, setDuration: () => {},
  version: '1.1', setVersion: () => {},
  selectedTheme: 'dark', setTheme: () => {},
  viewMode: 'edit', setViewMode: () => {},
  search: '', setSearch: () => {},
  promptText: 'You are a helpful assistant.', setPromptText: () => {},
  description: 'Builds structured HTTP requests from natural language.',

  // ── List data ────────────────────────────────────────────────────────────────
  requests: [
    { name: 'List Users',   method: 'GET',    status: '200 OK' },
    { name: 'Create User',  method: 'POST',   status: '201 Created' },
    { name: 'Delete User',  method: 'DELETE', status: '204 No Content' },
  ],
  headers: [
    { key: 'Authorization', value: 'Bearer {{token}}', enabled: true, id: '1' },
    { key: 'Content-Type',  value: 'application/json', enabled: true, id: '2' },
  ],
  setHeaders: () => {},
  tags: ['admin', 'beta', 'v2'], setTags: () => {},
  responseBody: JSON.stringify({ id: 1, name: 'Alice', status: 200 }, null, 2),
  sections: [],

  // ── Theme options (for ThemeCardSelectorView) ────────────────────────────────
  themes: [
    { value: 'dark',    label: 'Dark',    preview: { bg: '#1e1e1e', panel: '#252526', accent: '#0078d4', text: '#d4d4d4' } },
    { value: 'light',   label: 'Light',   preview: { bg: '#f3f3f3', panel: '#ffffff', accent: '#0078d4', text: '#333333' } },
    { value: 'monokai', label: 'Monokai', preview: { bg: '#272822', panel: '#3e3d32', accent: '#a6e22e', text: '#f8f8f2' } },
    { value: 'nord',    label: 'Nord',    preview: { bg: '#2e3440', panel: '#3b4252', accent: '#88c0d0', text: '#eceff4' } },
  ],

  // ── Dropdown options ─────────────────────────────────────────────────────────
  HTTP_METHODS: [
    { value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' },
    { value: 'PUT', label: 'PUT' }, { value: 'DELETE', label: 'DELETE' },
  ],
  SOAP_VERSIONS: [{ value: '1.1', label: 'SOAP 1.1' }, { value: '1.2', label: 'SOAP 1.2' }],
  urlHistory: ['https://api.example.com/users', 'https://jsonplaceholder.typicode.com/posts'],

  // ── Prompt library stubs ─────────────────────────────────────────────────────
  updateFeature: () => {},
  copyPrompt: () => {}, openEditor: () => {}, deletePrompt: () => {},
};
