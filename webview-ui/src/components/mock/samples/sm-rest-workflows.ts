/**
 * Pre-built state machine workflows for each REST mock sample.
 *
 * Fixed UUIDs — every workflow ID is stable across sessions so the
 * connectedWorkflowId mapping never breaks after a reload.
 *
 * One folder ("Daakia Rest Samples") groups all of them in the SM sidebar.
 */
import type { Node, Edge } from '@xyflow/react'
import type { SMachine, SMachineFolder } from '@salilvnair/state-machine'
import { useSMWorkspaceStore } from '@salilvnair/state-machine'

export const SM_REST_SAMPLES_FOLDER_ID = 'sm-folder-daakia-rest-samples'

export const SM_REST_SAMPLES_FOLDER: SMachineFolder = {
  id: SM_REST_SAMPLES_FOLDER_ID,
  name: 'Daakia REST Samples',
  color: '#6366f1',
  parentFolderId: null,
}

// ── node / edge builders ──────────────────────────────────────────────────────

type NodeType = 'trigger' | 'state' | 'condition' | 'function' | 'terminal'

function n(id: string, type: NodeType, label: string, x: number, y: number): Node {
  return { id, type, position: { x, y }, data: { nodeType: type, label } }
}

function e(id: string, source: string, target: string, event: string): Edge {
  return { id, source, target, data: { event } }
}

// ── 12 REST sample workflows ──────────────────────────────────────────────────

const NOW = 1700000000000

function machine(
  id: string,
  name: string,
  description: string,
  nodes: Node[],
  edges: Edge[],
): SMachine {
  return { id, name, description, color: '#6366f1', folderId: SM_REST_SAMPLES_FOLDER_ID, nodes: nodes as SMachine['nodes'], edges, createdAt: NOW, updatedAt: NOW }
}

// Users CRUD
const usersCrud = machine(
  'sm-wf-users-crud', 'Users CRUD',
  'Stateful user management — list, create, delete lifecycle',
  [
    n('n1', 'trigger',  'Start',       250, 20),
    n('n2', 'state',    'List Users',  250, 160),
    n('n3', 'state',    'User Created',250, 300),
    n('n4', 'terminal', 'Done',        250, 440),
  ],
  [
    e('e1', 'n1', 'n2', 'GET /api/users'),
    e('e2', 'n2', 'n3', 'POST /api/users'),
    e('e3', 'n3', 'n4', 'DELETE /api/users/:id'),
  ],
)

// Products API
const productsApi = machine(
  'sm-wf-products-api', 'Products API',
  'Product catalog browse → detail → update lifecycle',
  [
    n('n1', 'trigger',  'Browse',          250, 20),
    n('n2', 'state',    'Product Detail',  250, 160),
    n('n3', 'state',    'Update Product',  250, 300),
    n('n4', 'terminal', 'Done',            250, 440),
  ],
  [
    e('e1', 'n1', 'n2', 'GET /api/products'),
    e('e2', 'n2', 'n3', 'GET /api/products/:id'),
    e('e3', 'n3', 'n4', 'PUT /api/products/:id'),
  ],
)

// Authentication
// n2/n3 sit side-by-side (not stacked) since they have edges in BOTH
// directions (refresh request + REFRESH_OK back) — same x would make the
// two bezier curves overlap into an unreadable "X" crossing.
const authApi = machine(
  'sm-wf-auth-api', 'Authentication',
  'JWT auth flow — login, active session, refresh, logout',
  [
    n('n1', 'trigger',  'Login',           300, 20),
    n('n2', 'state',    'Authenticated',   80, 180),
    n('n3', 'state',    'Token Refresh',   620, 180),
    n('n4', 'terminal', 'Logged Out',      300, 340),
  ],
  [
    e('e1', 'n1', 'n2', 'POST /auth/login'),
    e('e2', 'n2', 'n3', 'POST /auth/refresh'),
    e('e3', 'n3', 'n2', 'REFRESH_OK'),
    e('e4', 'n2', 'n4', 'POST /auth/logout'),
  ],
)

// Blog Posts
const blogPosts = machine(
  'sm-wf-blog-posts', 'Blog Posts',
  'CMS lifecycle — list posts, read a post, create new post',
  [
    n('n1', 'trigger',  'Start',       250, 20),
    n('n2', 'state',    'List Posts',  250, 160),
    n('n3', 'state',    'Read Post',   250, 300),
    n('n4', 'state',    'Create Post', 250, 440),
    n('n5', 'terminal', 'Done',        250, 580),
  ],
  [
    e('e1', 'n1', 'n2', 'GET /api/posts'),
    e('e2', 'n2', 'n3', 'GET /api/posts/:slug'),
    e('e3', 'n2', 'n4', 'POST /api/posts'),
    e('e4', 'n3', 'n5', 'DONE'),
    e('e5', 'n4', 'n5', 'DONE'),
  ],
)

// Orders
const ordersApi = machine(
  'sm-wf-orders-api', 'Orders / E-Commerce',
  'Order lifecycle — created → processing → shipped → delivered',
  [
    n('n1', 'trigger',  'Order Created', 250, 20),
    n('n2', 'state',    'Processing',    250, 160),
    n('n3', 'state',    'Shipped',       250, 300),
    n('n4', 'state',    'Delivered',     250, 440),
    n('n5', 'terminal', 'Completed',     250, 580),
  ],
  [
    e('e1', 'n1', 'n2', 'PROCESS'),
    e('e2', 'n2', 'n3', 'SHIP'),
    e('e3', 'n3', 'n4', 'DELIVER'),
    e('e4', 'n4', 'n5', 'CONFIRM'),
  ],
)

// Notifications
const notifications = machine(
  'sm-wf-notifications', 'Notifications',
  'Notification pipeline — event fired, queued, delivered, acknowledged',
  [
    n('n1', 'trigger',  'Event Fired',  250, 20),
    n('n2', 'state',    'Queued',       250, 160),
    n('n3', 'state',    'Delivered',    250, 300),
    n('n4', 'terminal', 'Acknowledged', 250, 440),
  ],
  [
    e('e1', 'n1', 'n2', 'QUEUE'),
    e('e2', 'n2', 'n3', 'DELIVER'),
    e('e3', 'n3', 'n4', 'ACK'),
  ],
)

// File Storage
const fileStorage = machine(
  'sm-wf-file-storage', 'File Storage',
  'Upload lifecycle — uploaded, virus-scanned, stored, ready',
  [
    n('n1', 'trigger',  'Upload',      250, 20),
    n('n2', 'state',    'Processing',  250, 160),
    n('n3', 'state',    'Stored',      250, 300),
    n('n4', 'terminal', 'Ready',       250, 440),
  ],
  [
    e('e1', 'n1', 'n2', 'POST /files'),
    e('e2', 'n2', 'n3', 'SCAN_PASS'),
    e('e3', 'n3', 'n4', 'GET /files/:id'),
  ],
)

// Search Engine
const searchApi = machine(
  'sm-wf-search-api', 'Search Engine',
  'Search lifecycle — query received, indexed, results returned',
  [
    n('n1', 'trigger',  'Query',       250, 20),
    n('n2', 'state',    'Searching',   250, 160),
    n('n3', 'state',    'Results',     250, 300),
    n('n4', 'terminal', 'Done',        250, 440),
  ],
  [
    e('e1', 'n1', 'n2', 'GET /search'),
    e('e2', 'n2', 'n3', 'FOUND'),
    e('e3', 'n3', 'n4', 'GET /search/:id'),
  ],
)

// Payments
const payments = machine(
  'sm-wf-payments', 'Payments / Stripe-like',
  'Payment flow — initiated, pending, processing, authorized, completed',
  [
    n('n1', 'trigger',  'Initiate',    250, 20),
    n('n2', 'state',    'Pending',     250, 160),
    n('n3', 'state',    'Processing',  250, 300),
    n('n4', 'state',    'Authorized',  250, 440),
    n('n5', 'terminal', 'Completed',   250, 580),
  ],
  [
    e('e1', 'n1', 'n2', 'POST /payments'),
    e('e2', 'n2', 'n3', 'PROCESS'),
    e('e3', 'n3', 'n4', 'AUTHORIZE'),
    e('e4', 'n4', 'n5', 'CAPTURE'),
  ],
)

// Health Check
// n2/n3 side-by-side, not stacked — DEGRADE and RECOVER go opposite
// directions between the same two nodes.
const healthCheck = machine(
  'sm-wf-health-check', 'Health / Status',
  'Health probe — healthy, degraded, down',
  [
    n('n1', 'trigger',  'Check',     300, 20),
    n('n2', 'state',    'Healthy',   80, 180),
    n('n3', 'state',    'Degraded',  620, 180),
    n('n4', 'terminal', 'Down',      300, 340),
  ],
  [
    e('e1', 'n1', 'n2', 'GET /health'),
    e('e2', 'n2', 'n3', 'DEGRADE'),
    e('e3', 'n3', 'n4', 'FAIL'),
    e('e4', 'n3', 'n2', 'RECOVER'),
  ],
)

// OAuth2 Flow
const oauth2Flow = machine(
  'sm-wf-oauth2-flow', 'OAuth2 Flow',
  'OAuth2 authorization code flow — auth request, code exchange, token',
  [
    n('n1', 'trigger',  'Auth Request',    250, 20),
    n('n2', 'state',    'Authorization',   250, 160),
    n('n3', 'state',    'Token Exchange',  250, 300),
    n('n4', 'terminal', 'Authenticated',   250, 440),
  ],
  [
    e('e1', 'n1', 'n2', 'GET /oauth/authorize'),
    e('e2', 'n2', 'n3', 'POST /oauth/token'),
    e('e3', 'n3', 'n4', 'ACCESS_GRANTED'),
  ],
)

// Cookie Testing
// n2/n3 side-by-side, not stacked — EXPIRE and RENEW go opposite directions
// between the same two nodes, which overlap into an "X" when they share an x.
const cookieTesting = machine(
  'sm-wf-cookie-testing', 'Cookie Testing',
  'Cookie-based session — active, expired, refresh cycle',
  [
    n('n1', 'trigger',  'Request',          300, 20),
    n('n2', 'state',    'Session Active',   80, 180),
    n('n3', 'state',    'Session Expired',  620, 180),
    n('n4', 'terminal', 'Done',             300, 340),
  ],
  [
    e('e1', 'n1', 'n2', 'POST /session'),
    e('e2', 'n2', 'n3', 'EXPIRE'),
    e('e3', 'n3', 'n2', 'RENEW'),
    e('e4', 'n2', 'n4', 'DELETE /session'),
  ],
)

// Auth Flow (Real Validation) — event-driven, node ids ARE the real state ids
// (unauthenticated/authorized) so re-clicking "Connect to Mock Server" on
// this canvas reproduces the exact same StateMachineConfig the sample ships
// with (see rest.ts's 'auth-conditional' entry). Diagonal placement (not
// stacked, not purely side-by-side) — there's a forward edge, a backward
// edge, AND a self-loop on each node; a diagonal offset gives the two
// directional edges' bezier curves enough asymmetry to stay visually
// distinct instead of overlapping into an "X".
const authConditional = machine(
  'sm-wf-auth-conditional', 'Auth Flow (Real Validation)',
  'Login only succeeds when the request body has real username + password — checked against the request content, not just "any state matches"',
  [
    n('unauthenticated', 'trigger', 'Unauthenticated', 60, 60),
    n('authorized',      'state',   'Authorized',      640, 320),
  ],
  [
    e('e1', 'unauthenticated', 'authorized', 'LOGIN_SUCCESS'),
    e('e2', 'authorized',      'authorized', 'VIEW_PROFILE'),
    e('e3', 'authorized',      'unauthenticated', 'LOGOUT'),
    e('e4', 'unauthenticated', 'unauthenticated', 'LOGIN_FAILED'),
  ],
)

// Auth Flow — Partner Login (second workflow, for the multi-workflow-per-server
// demo). Deliberately a completely separate state graph — its own states,
// its own event names — connected to the SAME 'auth-conditional' server
// alongside `authConditional` above. A route reaches this one only when it
// explicitly sets `connectedWorkflowId: 'sm-wf-auth-conditional-partner'`
// (see rest.ts's 'auth-conditional' sample, the header-gated
// POST /api/auth/login variant), proving the State Machine dropdown really
// scopes a route to one specific connected workflow, not a merged pool.
const authConditionalPartner = machine(
  'sm-wf-auth-conditional-partner', 'Auth Flow — Partner Login',
  'A second, independent workflow connected to the same server — reached only by the route gated on the X-Partner-Id header (Matching tab), never by the regular username/password route.',
  [
    n('partner_unauthenticated', 'trigger', 'Partner Unauthenticated', 60, 60),
    n('partner_authorized',      'state',   'Partner Authorized',      640, 320),
  ],
  [
    e('pe1', 'partner_unauthenticated', 'partner_authorized',      'PARTNER_LOGIN_SUCCESS'),
    e('pe2', 'partner_authorized',      'partner_unauthenticated', 'PARTNER_LOGOUT'),
  ],
)

// ── lookup map by REST sample id ──────────────────────────────────────────────

export const SM_REST_WORKFLOW_MAP: Record<string, SMachine> = {
  'users-crud':    usersCrud,
  'products-api':  productsApi,
  'auth-api':      authApi,
  'blog-posts':    blogPosts,
  'orders-api':    ordersApi,
  'notifications': notifications,
  'file-storage':  fileStorage,
  'search-api':    searchApi,
  'payments':      payments,
  'health-check':  healthCheck,
  'oauth2-flow':   oauth2Flow,
  'cookie-testing':cookieTesting,
  'auth-conditional': authConditional,
  // Lookup-only key (not a real sample id) — installed alongside
  // 'auth-conditional' via RestSample.additionalWorkflows.
  'auth-conditional-partner': authConditionalPartner,
}

/**
 * Install (or re-sync) a built-in sample workflow into useSMWorkspaceStore.
 * Always overwrites nodes/edges/name/description to match the current code
 * definition — these are Daakia's own bundled samples, not user-authored
 * canvases, so a shipped fix (e.g. a new event/edge) must actually reach
 * anyone who already loaded this sample once before, not get silently
 * skipped because a machine with this id already exists from an earlier
 * load. The folder is still install-once (nothing to resync there).
 * Fires consumer.onSaveMachine / onSaveFolder for DB persistence every call.
 */
export function installSMRestWorkflow(sampleId: string): SMachine | null {
  const workflow = SM_REST_WORKFLOW_MAP[sampleId]
  if (!workflow) return null

  const ws = useSMWorkspaceStore.getState()

  // Ensure folder exists
  if (!ws.machineFolders.find(f => f.id === SM_REST_SAMPLES_FOLDER_ID)) {
    useSMWorkspaceStore.setState(s => ({
      machineFolders: [...s.machineFolders, SM_REST_SAMPLES_FOLDER],
    }))
    ws._consumer?.onSaveFolder?.(SM_REST_SAMPLES_FOLDER)
  }

  // Upsert the workflow — preserve createdAt if it already existed, refresh
  // updatedAt, but always take the current code's nodes/edges/name/description.
  const existing = ws.machines.find(m => m.id === workflow.id)
  const synced: SMachine = { ...workflow, createdAt: existing?.createdAt ?? workflow.createdAt, updatedAt: Date.now() }
  useSMWorkspaceStore.setState(s => ({
    machines: existing
      ? s.machines.map(m => m.id === workflow.id ? synced : m)
      : [...s.machines, synced],
  }))
  ws._consumer?.onSaveMachine?.(synced)

  return synced
}
