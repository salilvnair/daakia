export interface ThemeSchemaEntry {
  group: string;
  key: string;
  cssVar: string;
  comment: string;
}

export const SCHEMA: ThemeSchemaEntry[] = [
  // brand
  { group: 'brand', key: 'primary',         cssVar: '--color-primary',         comment: 'Main accent' },
  { group: 'brand', key: 'primary_hover',   cssVar: '--color-primary-hover',   comment: 'Accent hover' },
  { group: 'brand', key: 'primary_light',   cssVar: '--color-primary-light',   comment: 'Accent light' },
  { group: 'brand', key: 'primary_dark',    cssVar: '--color-primary-dark',    comment: 'Accent dark' },
  // surface
  { group: 'surface', key: 'background',    cssVar: '--color-surface',         comment: 'Main surface bg' },
  { group: 'surface', key: 'hover',         cssVar: '--color-surface-hover',   comment: 'Surface hover' },
  { group: 'surface', key: 'active',        cssVar: '--color-surface-active',  comment: 'Surface active' },
  { group: 'surface', key: 'border',        cssVar: '--color-surface-border',  comment: 'Surface border' },
  { group: 'surface', key: 'bg',            cssVar: '--color-surface-bg',      comment: 'Alt surface bg' },
  // panel
  { group: 'panel', key: 'background',      cssVar: '--color-panel',           comment: 'Sidebar / panel bg' },
  { group: 'panel', key: 'border',          cssVar: '--color-panel-border',    comment: 'Panel border' },
  // elevated
  { group: 'elevated', key: 'background',   cssVar: '--color-elevated',        comment: 'Card / modal bg' },
  { group: 'elevated', key: 'border',       cssVar: '--color-elevated-border', comment: 'Card / modal border' },
  // input
  { group: 'input', key: 'background',      cssVar: '--color-input-bg',        comment: 'Input bg' },
  { group: 'input', key: 'border',          cssVar: '--color-input-border',    comment: 'Input border' },
  { group: 'input', key: 'hover',           cssVar: '--color-input-hover',     comment: 'Input hover' },
  { group: 'input', key: 'focus',           cssVar: '--color-input-focus',     comment: 'Input focus bg' },
  // interactive
  { group: 'interactive', key: 'icon_hover_bg', cssVar: '--color-icon-hover-bg', comment: 'Icon hover bg' },
  { group: 'interactive', key: 'item_hover_bg', cssVar: '--color-item-hover-bg', comment: 'List item hover' },
  // text
  { group: 'text', key: 'primary',          cssVar: '--color-text-primary',    comment: 'Primary text' },
  { group: 'text', key: 'secondary',        cssVar: '--color-text-secondary',  comment: 'Secondary text' },
  { group: 'text', key: 'muted',            cssVar: '--color-text-muted',      comment: 'Muted / placeholder' },
  // status
  { group: 'status', key: 'success',        cssVar: '--color-success',         comment: 'Success green' },
  { group: 'status', key: 'warning',        cssVar: '--color-warning',         comment: 'Warning amber' },
  { group: 'status', key: 'error',          cssVar: '--color-error',           comment: 'Error red' },
  { group: 'status', key: 'info',           cssVar: '--color-info',            comment: 'Info blue' },
  // http_methods
  { group: 'http_methods', key: 'get',      cssVar: '--color-method-get',      comment: 'GET' },
  { group: 'http_methods', key: 'post',     cssVar: '--color-method-post',     comment: 'POST' },
  { group: 'http_methods', key: 'put',      cssVar: '--color-method-put',      comment: 'PUT' },
  { group: 'http_methods', key: 'patch',    cssVar: '--color-method-patch',    comment: 'PATCH' },
  { group: 'http_methods', key: 'delete',   cssVar: '--color-method-delete',   comment: 'DELETE' },
  { group: 'http_methods', key: 'head',     cssVar: '--color-method-head',     comment: 'HEAD' },
  { group: 'http_methods', key: 'options',  cssVar: '--color-method-options',  comment: 'OPTIONS' },
  // sidebar
  { group: 'sidebar', key: 'collections',   cssVar: '--color-sidebar-collections',  comment: 'Collections tab' },
  { group: 'sidebar', key: 'history',       cssVar: '--color-sidebar-history',      comment: 'History tab' },
  { group: 'sidebar', key: 'environments',  cssVar: '--color-sidebar-environments', comment: 'Environments tab' },
  // protocols
  { group: 'protocols', key: 'rest',        cssVar: '--color-protocol-rest',      comment: 'REST' },
  { group: 'protocols', key: 'graphql',     cssVar: '--color-protocol-graphql',   comment: 'GraphQL' },
  { group: 'protocols', key: 'websocket',   cssVar: '--color-protocol-websocket', comment: 'WebSocket' },
  { group: 'protocols', key: 'sse',         cssVar: '--color-protocol-sse',       comment: 'SSE' },
  { group: 'protocols', key: 'socketio',    cssVar: '--color-protocol-socketio',  comment: 'Socket.IO' },
  { group: 'protocols', key: 'mqtt',        cssVar: '--color-protocol-mqtt',      comment: 'MQTT' },
  { group: 'protocols', key: 'grpc',        cssVar: '--color-protocol-grpc',      comment: 'gRPC' },
  { group: 'protocols', key: 'soap',        cssVar: '--color-protocol-soap',      comment: 'SOAP' },
  { group: 'protocols', key: 'ai',          cssVar: '--color-protocol-ai',        comment: 'AI' },
  { group: 'protocols', key: 'mcp',         cssVar: '--color-protocol-mcp',       comment: 'MCP' },
  // mock_server
  { group: 'mock_server', key: 'accent',     cssVar: '--color-mock-server',       comment: 'Mock server accent' },
  { group: 'mock_server', key: 'muted',      cssVar: '--color-mock-server-muted', comment: 'Mock server muted' },
  { group: 'mock_server', key: 'try_button', cssVar: '--color-try-button',        comment: 'Try button' },
  // settings
  { group: 'settings', key: 'accent',        cssVar: '--color-settings',          comment: 'Settings accent' },
  // response_time
  { group: 'response_time', key: 'fast',     cssVar: '--color-time-fast',         comment: '< 200 ms' },
  { group: 'response_time', key: 'moderate', cssVar: '--color-time-moderate',     comment: '200–1000 ms' },
  { group: 'response_time', key: 'slow',     cssVar: '--color-time-slow',         comment: '1–3 s' },
  { group: 'response_time', key: 'critical', cssVar: '--color-time-critical',     comment: '> 3 s' },
  // misc
  { group: 'misc', key: 'muted',            cssVar: '--color-muted',             comment: 'General muted' },
  { group: 'misc', key: 'muted_fallback',   cssVar: '--color-muted-fallback',    comment: 'Muted fallback' },
  { group: 'misc', key: 'status_5xx',       cssVar: '--color-status-5xx',        comment: '5xx error' },
  // context_menu
  { group: 'context_menu', key: 'rename',      cssVar: '--color-ctx-rename',       comment: 'Rename action' },
  { group: 'context_menu', key: 'duplicate',   cssVar: '--color-ctx-duplicate',    comment: 'Duplicate action' },
  { group: 'context_menu', key: 'pin',         cssVar: '--color-ctx-pin',          comment: 'Pin action' },
  { group: 'context_menu', key: 'close',       cssVar: '--color-ctx-close',        comment: 'Close action' },
  { group: 'context_menu', key: 'close_batch', cssVar: '--color-ctx-close-batch',  comment: 'Close others' },
  { group: 'context_menu', key: 'close_saved', cssVar: '--color-ctx-close-saved',  comment: 'Close saved' },
  { group: 'context_menu', key: 'close_all',   cssVar: '--color-ctx-close-all',    comment: 'Close all' },
  // component — button
  { group: 'component_button', key: 'primary_bg',       cssVar: '--color-btn-primary-bg',       comment: 'Primary button background' },
  { group: 'component_button', key: 'primary_hover',    cssVar: '--color-btn-primary-hover',    comment: 'Primary button hover background' },
  { group: 'component_button', key: 'secondary_bg',     cssVar: '--color-btn-secondary-bg',     comment: 'Secondary button background' },
  { group: 'component_button', key: 'secondary_hover',  cssVar: '--color-btn-secondary-hover',  comment: 'Secondary button hover background' },
  { group: 'component_button', key: 'secondary_border', cssVar: '--color-btn-secondary-border', comment: 'Secondary button border' },
  { group: 'component_button', key: 'ghost_hover',      cssVar: '--color-btn-ghost-hover',      comment: 'Ghost button hover background' },
  { group: 'component_button', key: 'danger_bg',        cssVar: '--color-btn-danger-bg',        comment: 'Danger button background' },
  // component — sidenav
  { group: 'component_sidenav', key: 'item_hover',      cssVar: '--color-sidenav-item-hover',   comment: 'Nav item hover background' },
  { group: 'component_sidenav', key: 'active_bg',       cssVar: '--color-sidenav-active-bg',    comment: 'Active nav item background' },
  { group: 'component_sidenav', key: 'active_text',     cssVar: '--color-sidenav-active-text',  comment: 'Active nav item text' },
  { group: 'component_sidenav', key: 'hover_bg',        cssVar: '--color-sidenav-hover-bg',     comment: 'Nav item hover background' },
  // component — toggle
  { group: 'component_toggle', key: 'track_on',         cssVar: '--color-toggle-on',            comment: 'Toggle track color when enabled' },
  { group: 'component_toggle', key: 'thumb',            cssVar: '--color-toggle-thumb',         comment: 'Toggle thumb / dot color' },
  // component — prompt card
  { group: 'component_prompt_card', key: 'avatar_bg',    cssVar: '--color-promptcard-avatar-bg',    comment: 'Avatar background color' },
  { group: 'component_prompt_card', key: 'avatar_text',  cssVar: '--color-promptcard-avatar-text',  comment: 'Avatar text / icon color' },
  { group: 'component_prompt_card', key: 'title_text',   cssVar: '--color-promptcard-title',        comment: 'Card title text color' },
  { group: 'component_prompt_card', key: 'body_text',    cssVar: '--color-promptcard-body',         comment: 'Body / description text color' },
  { group: 'component_prompt_card', key: 'chip_color',   cssVar: '--color-promptcard-chip',         comment: 'Protocol chip accent color' },
  { group: 'component_prompt_card', key: 'badge_bg',     cssVar: '--color-promptcard-badge-bg',     comment: 'CUSTOM badge background' },
  { group: 'component_prompt_card', key: 'badge_text',   cssVar: '--color-promptcard-badge-text',   comment: 'CUSTOM badge text color' },
  { group: 'component_prompt_card', key: 'action_icon',  cssVar: '--color-promptcard-action-icon',  comment: 'Use/Copy/Edit icon color' },
  { group: 'component_prompt_card', key: 'delete_icon',  cssVar: '--color-promptcard-delete-icon',  comment: 'Delete icon color' },
  // component — var pill
  { group: 'component_var_pill', key: 'background',      cssVar: '--color-var-pill-bg',             comment: '{{var}} token background' },
  { group: 'component_var_pill', key: 'text',            cssVar: '--color-var-pill-text',           comment: '{{var}} token text color' },
  { group: 'component_var_pill', key: 'border',          cssVar: '--color-var-pill-border',         comment: '{{var}} token border color' },
  // component — tooltip
  { group: 'component_tooltip', key: 'bg',               cssVar: '--color-tooltip-bg',              comment: 'Tooltip background' },
  { group: 'component_tooltip', key: 'text',             cssVar: '--color-tooltip-text',            comment: 'Tooltip text' },
  { group: 'component_tooltip', key: 'border',           cssVar: '--color-tooltip-border',          comment: 'Tooltip border' },
  // component — modal
  { group: 'component_modal', key: 'backdrop',           cssVar: '--color-modal-backdrop',          comment: 'Modal overlay background' },
  { group: 'component_modal', key: 'header_tint',        cssVar: '--color-modal-header-tint',       comment: 'Modal header tint' },
  // component — tag_input
  { group: 'component_tag_input', key: 'tag_bg',         cssVar: '--color-tag-bg',                  comment: 'Tag pill background' },
  { group: 'component_tag_input', key: 'tag_text',       cssVar: '--color-tag-text',                comment: 'Tag pill text' },
  { group: 'component_tag_input', key: 'tag_border',     cssVar: '--color-tag-border',              comment: 'Tag pill border' },
  { group: 'component_tag_input', key: 'remove_hover',   cssVar: '--color-tag-remove-hover',        comment: 'Tag × remove icon hover' },
  // component — pill_tabs
  { group: 'component_pill_tabs', key: 'track_bg',       cssVar: '--color-pilltab-track-bg',        comment: 'PillTabs container background' },
  { group: 'component_pill_tabs', key: 'indicator_bg',   cssVar: '--color-pilltab-indicator-bg',    comment: 'Active tab indicator fill' },
  { group: 'component_pill_tabs', key: 'indicator_border', cssVar: '--color-pilltab-indicator-border', comment: 'Active tab indicator border' },
  { group: 'component_pill_tabs', key: 'text_active',    cssVar: '--color-pilltab-text-active',     comment: 'Active tab text' },
  { group: 'component_pill_tabs', key: 'text_inactive',  cssVar: '--color-pilltab-text-inactive',   comment: 'Inactive tab text' },
  // component — duration_input
  { group: 'component_duration', key: 'segment_bg',      cssVar: '--color-dur-segment-bg',          comment: 'Unit segment background' },
  { group: 'component_duration', key: 'segment_hover',   cssVar: '--color-dur-segment-hover',       comment: 'Unit segment hover' },
  { group: 'component_duration', key: 'segment_selected', cssVar: '--color-dur-segment-selected',   comment: 'Selected unit segment' },
  // component — table
  { group: 'component_table', key: 'stripe',             cssVar: '--color-table-stripe',            comment: 'Alternating row stripe' },
  { group: 'component_table', key: 'header_bg',          cssVar: '--color-table-header-bg',         comment: 'Table header background' },
  { group: 'component_table', key: 'border',             cssVar: '--color-table-border',            comment: 'Table border / divider' },
  // component — code_block
  { group: 'component_code_block', key: 'bg',            cssVar: '--color-codeblock-bg',            comment: 'Code block background' },
  { group: 'component_code_block', key: 'header_bg',     cssVar: '--color-codeblock-header-bg',     comment: 'Code block header bar' },
  { group: 'component_code_block', key: 'border',        cssVar: '--color-codeblock-border',        comment: 'Code block border' },
  // component — resizable_panel
  { group: 'component_resizable', key: 'grip',           cssVar: '--color-resizable-grip',          comment: 'Resize handle color' },
  { group: 'component_resizable', key: 'grip_hover',     cssVar: '--color-resizable-grip-hover',    comment: 'Resize handle hover' },
  // component — stage
  { group: 'component_stage', key: 'check',              cssVar: '--color-stage-check',             comment: 'Completed step color' },
  { group: 'component_stage', key: 'spin',               cssVar: '--color-stage-spin',              comment: 'Active step color' },
  { group: 'component_stage', key: 'pulse',              cssVar: '--color-stage-pulse',             comment: 'Pending step color' },
  { group: 'component_stage', key: 'error',              cssVar: '--color-stage-error',             comment: 'Error step color' },
  // component — loader
  { group: 'component_loader', key: 'accent',            cssVar: '--color-loader-accent',           comment: 'Loader spinner / bar color' },
  { group: 'component_loader', key: 'track',             cssVar: '--color-loader-track',            comment: 'Loader track background' },
  // component — chip
  { group: 'component_chip', key: 'active_text',         cssVar: '--color-chip-active-text',        comment: 'Active (filled) chip text color' },
  // component — icon_button
  { group: 'component_icon_button', key: 'bg_hover',     cssVar: '--color-iconbtn-bg-hover',        comment: 'Icon button hover background' },
  { group: 'component_icon_button', key: 'bg_active',    cssVar: '--color-iconbtn-bg-active',       comment: 'Icon button active/pressed bg' },
  { group: 'component_icon_button', key: 'border',       cssVar: '--color-iconbtn-border',          comment: 'Icon button border (outline variant)' },
  // component — stats_card
  { group: 'component_stats_card', key: 'bg',            cssVar: '--color-statscard-bg',            comment: 'Stats card background' },
  { group: 'component_stats_card', key: 'border',        cssVar: '--color-statscard-border',        comment: 'Stats card border' },
  { group: 'component_stats_card', key: 'trend_up',      cssVar: '--color-statscard-trend-up',      comment: 'Positive trend indicator' },
  { group: 'component_stats_card', key: 'trend_down',    cssVar: '--color-statscard-trend-down',    comment: 'Negative trend indicator' },
  // component — empty_state
  { group: 'component_empty_state', key: 'icon',         cssVar: '--color-emptystate-icon',         comment: 'Empty state icon color' },
  { group: 'component_empty_state', key: 'title',        cssVar: '--color-emptystate-title',        comment: 'Empty state title text' },
  { group: 'component_empty_state', key: 'desc',         cssVar: '--color-emptystate-desc',         comment: 'Empty state description text' },
  // component — ai_button
  { group: 'component_ai_button', key: 'bg',             cssVar: '--color-aibtn-bg',                comment: 'AI button background' },
  { group: 'component_ai_button', key: 'border',         cssVar: '--color-aibtn-border',            comment: 'AI button border' },
  { group: 'component_ai_button', key: 'text',           cssVar: '--color-aibtn-text',              comment: 'AI button text / icon color' },
  { group: 'component_ai_button', key: 'bg_hover',       cssVar: '--color-aibtn-bg-hover',          comment: 'AI button hover background' },
  // component — prompt_library_avatars
  { group: 'component_prompt_avatar', key: 'rest',       cssVar: '--color-prompt-avatar-rest',      comment: 'REST agent avatar' },
  { group: 'component_prompt_avatar', key: 'curl',       cssVar: '--color-prompt-avatar-curl',      comment: 'cURL agent avatar' },
  { group: 'component_prompt_avatar', key: 'mock',       cssVar: '--color-prompt-avatar-mock',      comment: 'Mock agent avatar' },
  { group: 'component_prompt_avatar', key: 'test',       cssVar: '--color-prompt-avatar-test',      comment: 'Test agent avatar' },
  { group: 'component_prompt_avatar', key: 'knowledge',  cssVar: '--color-prompt-avatar-knowledge', comment: 'Knowledge agent avatar' },
  { group: 'component_prompt_avatar', key: 'ask',        cssVar: '--color-prompt-avatar-ask',       comment: 'Ask agent avatar' },
  { group: 'component_prompt_avatar', key: 'explain',    cssVar: '--color-prompt-avatar-explain',   comment: 'Explain agent avatar' },
  { group: 'component_prompt_avatar', key: 'followup',   cssVar: '--color-prompt-avatar-followup',  comment: 'Follow-up agent avatar' },
  { group: 'component_prompt_avatar', key: 'generate',   cssVar: '--color-prompt-avatar-generate',  comment: 'Generate agent avatar' },
  { group: 'component_prompt_avatar', key: 'suggest',    cssVar: '--color-prompt-avatar-suggest',   comment: 'Suggest agent avatar' },
  { group: 'component_prompt_avatar', key: 'headers',    cssVar: '--color-prompt-avatar-headers',   comment: 'Headers agent avatar' },
  { group: 'component_prompt_avatar', key: 'body',       cssVar: '--color-prompt-avatar-body',      comment: 'Body agent avatar' },
];

export const GROUPS = [...new Set(SCHEMA.map(s => s.group))];
