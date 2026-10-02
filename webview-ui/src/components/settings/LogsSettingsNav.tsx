/**
 * Settings → DK8S → Logs, and the pages under it.
 *
 * Everything about how dk8s reads a pod's log lives under one entry in the
 * nav: Logs is a SideNavView branch, and these are the pages that expand
 * under it — General, Downloads, Log Formats, Archive, Fields, Determinants.
 *
 * Each keeps its own section id, so a link straight to Fields (the Logs tab's
 * "Fields settings", a search hit's) still opens Fields.
 */
import { DownloadIcon, LayersIcon, CodeBracketsIcon, FolderIcon, FilterIcon, ChartBarIcon } from '../../icons';

export const LOG_SETTINGS_PAGES = [
  { id: 'dk8s-logs', label: 'General', icon: <LayersIcon size={14} /> },
  { id: 'dk8s-logs-downloads', label: 'Downloads', icon: <DownloadIcon size={14} /> },
  { id: 'dk8s-logs-formats', label: 'Log Formats', icon: <CodeBracketsIcon size={14} /> },
  { id: 'dk8s-logs-archive', label: 'Archive', icon: <FolderIcon size={14} /> },
  { id: 'dk8s-fields', label: 'Fields', icon: <FilterIcon size={14} /> },
  { id: 'dk8s-determinants', label: 'Determinants', icon: <ChartBarIcon size={14} /> },
] as const;

export type LogSettingsPageId = typeof LOG_SETTINGS_PAGES[number]['id'];

export const LOG_SETTINGS_IDS = new Set<string>(LOG_SETTINGS_PAGES.map(p => p.id));
