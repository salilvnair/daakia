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
  return { id, name, description, color: '#6366f1', folderId: SM_REST_SAMPLES_FOLDER_ID, nodes, edges, createdAt: NOW, updatedAt: NOW }
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
const authApi = machine(
  'sm-wf-auth-api', 'Authentication',
  'JWT auth flow — login, active session, refresh, logout',
  [
    n('n1', 'trigger',  'Login',           250, 20),
    n('n2', 'state',    'Authenticated',   250, 160),
    n('n3', 'state',    'Token Refresh',   250, 300),
    n('n4', 'terminal', 'Logged Out',      250, 440),
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
const healthCheck = machine(
  'sm-wf-health-check', 'Health / Status',
  'Health probe — healthy, degraded, down',
  [
    n('n1', 'trigger',  'Check',     250, 20),
    n('n2', 'state',    'Healthy',   250, 160),
    n('n3', 'state',    'Degraded',  250, 300),
    n('n4', 'terminal', 'Down',      250, 440),
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
const cookieTesting = machine(
  'sm-wf-cookie-testing', 'Cookie Testing',
  'Cookie-based session — active, expired, refresh cycle',
  [
    n('n1', 'trigger',  'Request',          250, 20),
    n('n2', 'state',    'Session Active',   250, 160),
    n('n3', 'state',    'Session Expired',  250, 300),
    n('n4', 'terminal', 'Done',             250, 440),
  ],
  [
    e('e1', 'n1', 'n2', 'POST /session'),
    e('e2', 'n2', 'n3', 'EXPIRE'),
    e('e3', 'n3', 'n2', 'RENEW'),
    e('e4', 'n2', 'n4', 'DELETE /session'),
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
}

/**
 * Idempotent install: injects the folder + workflow into useSMWorkspaceStore
 * only if they don't already exist (checked by fixed ID).
 * Also fires consumer.onSaveMachine / onSaveFolder for DB persistence.
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

  // Ensure workflow exists (idempotent — safe to call multiple times)
  if (!ws.machines.find(m => m.id === workflow.id)) {
    useSMWorkspaceStore.setState(s => ({
      machines: [...s.machines, workflow],
    }))
    ws._consumer?.onSaveMachine?.(workflow)
  }

  return workflow
}
