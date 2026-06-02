/**
 * UI State handler — persists panel heights, scroll positions, layout preferences, and workspace snapshot in the KV store.
 */
import { upsert, findById } from '../../../storage/db';

const UI_STATE_COLLECTION = 'ui_state';
const UI_STATE_ID = 'layout';
const WORKSPACE_SNAPSHOT_ID = 'workspace_snapshot';

interface UiStateData {
  panelHeights: Record<string, number>;
  scrollPositions: Record<string, number>;
  prefs?: Record<string, string>;
}

interface WorkspaceSnapshot {
  tabs: unknown[];
  activeTabId: string;
  activeProtocol: string;
  sidebarSection: string;
  sidebarOpen: boolean;
  collectionExpandedIds?: string[];
}

export function handleSaveUiState(msg: { data: UiStateData }): void {
  upsert(UI_STATE_COLLECTION, UI_STATE_ID, msg.data);
}

export function handleGetUiState(post: (msg: unknown) => void): void {
  const data = findById<UiStateData>(UI_STATE_COLLECTION, UI_STATE_ID);
  post({ type: 'uiStateData', data: data ?? { panelHeights: {}, scrollPositions: {}, prefs: {} } });
}

export function handleSaveWorkspaceSnapshot(msg: { data: WorkspaceSnapshot }): void {
  upsert(UI_STATE_COLLECTION, WORKSPACE_SNAPSHOT_ID, msg.data);
}

export function handleGetWorkspaceSnapshot(post: (msg: unknown) => void): void {
  const data = findById<WorkspaceSnapshot>(UI_STATE_COLLECTION, WORKSPACE_SNAPSHOT_ID);
  post({ type: 'workspaceSnapshot', data: data ?? null });
}
