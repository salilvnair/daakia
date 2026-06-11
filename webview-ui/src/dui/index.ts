// ─── DUI — Daakia UI Component Library ───────────────────────────────────────
// Unified, theme-aware component set for all Daakia screens.
// All components use existing VS Code CSS variables — zero extra config needed.

// ─── Core: size system, context, and category base hooks ─────────────────────
export type { DuiSize, DuiRadius, DuiConfig } from './core/DuiTypes';
export { DUI_HEIGHT, DUI_CHIP_HEIGHT, DUI_TOGGLE, DUI_ICON_SIZE, DUI_FONT_SIZE, DUI_PADDING_X, DUI_GAP, DUI_RADIUS_MAP, DUI_DEFAULT_RADIUS } from './core/DuiTokens';
export { DuiProvider, useDui } from './core/DuiContext';
export type { InputBaseConfig } from './core/InputBase';
export { useInputBase } from './core/InputBase';
export type { ButtonBaseConfig } from './core/ButtonBase';
export { useButtonBase } from './core/ButtonBase';
export type { NavBaseConfig } from './core/NavBase';
export { useNavBase } from './core/NavBase';
export type { ChipBaseConfig } from './core/ChipBase';
export { useChipBase } from './core/ChipBase';
export type { ToggleBaseConfig } from './core/ToggleBase';
export { useToggleBase } from './core/ToggleBase';
export type { MenuBaseConfig } from './core/MenuBase';
export { useMenuBase } from './core/MenuBase';
export type { TabBaseConfig } from './core/TabBase';
export { useTabBase } from './core/TabBase';
export type { TableBaseConfig } from './core/TableBase';
export { useTableBase } from './core/TableBase';
export type { DisplayBaseConfig } from './core/DisplayBase';
export { useDisplayBase } from './core/DisplayBase';
export type { OverlayBaseConfig } from './core/OverlayBase';
export { useOverlayBase } from './core/OverlayBase';
export type { CardBaseConfig } from './core/CardBase';
export { useCardBase } from './core/CardBase';

export { ChipView } from './components/chips/ChipView';
export type { ChipViewProps, ChipViewSize } from './components/chips/ChipView';

export { ButtonView } from './components/button/ButtonView';
export type { ButtonViewProps, ButtonVariant, ButtonSize } from './components/button/ButtonView';

export { IconButtonView } from './components/button/IconButtonView';
export type { IconButtonViewProps, IconButtonSize, IconButtonVariant } from './components/button/IconButtonView';

export { DropDownButtonView } from './components/button/DropDownButtonView';
export type { DropDownButtonViewProps } from './components/button/DropDownButtonView';

export { TextInputView } from './components/input/TextInputView';
export type { TextInputViewProps, TextInputSize } from './components/input/TextInputView';

export { SelectInputView } from './components/input/SelectInputView';
export type { SelectInputViewProps, SelectOption, SelectInputSize } from './components/input/SelectInputView';

export { SelectTextInputView } from './components/input/SelectTextInputView';
export type { SelectTextInputViewProps, SelectTextOption, SelectTextInputSize } from './components/input/SelectTextInputView';

export { KeyValueItemView } from './components/input/KeyValueItemView';
export type { KeyValueItemViewProps } from './components/input/KeyValueItemView';

export { HiddenKeyValueItemView } from './components/input/HiddenKeyValueItemView';
export type { HiddenKeyValueItemViewProps } from './components/input/HiddenKeyValueItemView';

export { TabView } from './components/input/TabView';
export type { TabViewProps, TabItem, TabViewVariant } from './components/input/TabView';

export { EditorView } from './components/input/EditorView';
export type { EditorViewProps, EditorLanguage } from './components/input/EditorView';

export { ContextMenuView } from './components/modal/ContextMenuView';
export type { ContextMenuViewProps, ContextMenuItem, ContextMenuWidth } from './components/modal/ContextMenuView';

export { TabBarView } from './components/tabs/TabBarView';
export type { TabBarViewProps, TabBarTab, TabBarProtocol, TabBarTabType, RealtimeProtocol } from './components/tabs/TabBarView';

// ─── D1.21-D1.43 — Extended DUI Library ──────────────────────────────────────

export { ToggleSwitchView } from './components/input/ToggleSwitchView';
export type { ToggleSwitchViewProps } from './components/input/ToggleSwitchView';

export { CheckboxView } from './components/input/CheckboxView';
export type { CheckboxViewProps } from './components/input/CheckboxView';

export { ModalView } from './components/modal/ModalView';
export type { ModalViewProps } from './components/modal/ModalView';

export { LoaderView } from './components/display/LoaderView';
export type { LoaderViewProps, LoaderVariant } from './components/display/LoaderView';

export { EmptyStateView } from './components/display/EmptyStateView';
export type { EmptyStateViewProps } from './components/display/EmptyStateView';

export { StatusIndicatorView } from './components/display/StatusIndicatorView';
export type { StatusIndicatorViewProps, StatusIndicatorState } from './components/display/StatusIndicatorView';

export { InfoPopupView } from './components/modal/InfoPopupView';
export type { InfoPopupViewProps } from './components/modal/InfoPopupView';

export { SplitPanelView } from './components/layout/SplitPanelView';
export type { SplitPanelViewProps, SplitDirection } from './components/layout/SplitPanelView';

export { ResizablePanelView } from './components/layout/ResizablePanelView';
export type { ResizablePanelViewProps } from './components/layout/ResizablePanelView';

export { DottedCardView } from './components/display/DottedCardView';
export type { DottedCardViewProps } from './components/display/DottedCardView';

export { ColoredTextView } from './components/display/ColoredTextView';
export type { ColoredTextViewProps, ColorToken } from './components/display/ColoredTextView';

export { StatsCardView } from './components/display/StatsCardView';
export type { StatsCardViewProps } from './components/display/StatsCardView';

export { DataTableView } from './components/display/DataTableView';
export type { DataTableViewProps, DataTableColumn } from './components/display/DataTableView';

export { CodeBlockView } from './components/display/CodeBlockView';
export type { CodeBlockViewProps } from './components/display/CodeBlockView';

export { AIButtonView } from './components/button/AIButtonView';
export type { AIButtonViewProps, AIButtonAction } from './components/button/AIButtonView';

export { SideNavView, filterItems, countLeaves } from './components/layout/SideNavView';
export type { SideNavViewProps, SideNavItem } from './components/layout/SideNavView';

export { SettingsNavView } from './components/layout/SettingsNavView';
export type { SettingsNavViewProps, SettingsNavGroup, SettingsNavItem } from './components/layout/SettingsNavView';

export { ThemeCardSelectorView } from './components/input/ThemeCardSelectorView';
export type { ThemeCardSelectorViewProps, ThemeOption } from './components/input/ThemeCardSelectorView';

export { FeatureCategoryView } from './components/display/FeatureCategoryView';
export type { FeatureCategoryViewProps, FeatureItem } from './components/display/FeatureCategoryView';

export { TagInputView } from './components/input/TagInputView';
export type { TagInputViewProps } from './components/input/TagInputView';

export { BottomPanelView } from './components/layout/BottomPanelView';
export type { BottomPanelViewProps, BottomPanelTab } from './components/layout/BottomPanelView';

export { ToastView, useToast } from './components/display/ToastView';
export type { ToastViewProps, Toast, ToastVariant } from './components/display/ToastView';

export { PromptCardView } from './components/display/PromptCardView';
export type { PromptCardViewProps } from './components/display/PromptCardView';

export { PromptLibraryListView } from './components/display/PromptLibraryListView';
export type { PromptLibraryListViewProps, PromptLibraryItem, PromptLibraryCategory, PromptLibrarySection } from './components/display/PromptLibraryListView';

export { PromptLibraryEditorView } from './components/display/PromptLibraryEditorView';
export type { PromptLibraryEditorViewProps, PromptLibraryVariable, PromptLibraryEditorTab } from './components/display/PromptLibraryEditorView';

export { StageCheck, StageSpin, StagePulse } from './components/display/StageView';
export type { StageViewBaseProps } from './components/display/StageView';

// ─── E6.176 — Superset DUI components matching shared/controls ───────────────

export { SearchInputView } from './components/input/SearchInputView';
export type { SearchInputViewProps } from './components/input/SearchInputView';

export { DurationInputView } from './components/input/DurationInputView';
export type { DurationInputViewProps, DurationUnit } from './components/input/DurationInputView';

export { PillTabsView } from './components/input/PillTabsView';
export type { PillTabsViewProps, PillTabItem, PillTabsVariant } from './components/input/PillTabsView';

export { SplitButtonView } from './components/button/SplitButtonView';
export type { SplitButtonViewProps, SplitButtonViewItem, SplitButtonViewVariant } from './components/button/SplitButtonView';

export { HighlightedInputView } from './components/input/HighlightedInputView';
export type { HighlightedInputViewProps } from './components/input/HighlightedInputView';

export { KeyValueTableView } from './components/input/KeyValueTableView';
export type { KeyValueTableViewProps, KeyValueTableRow } from './components/input/KeyValueTableView';

export { MergedInputView, MergeDivider } from './components/input/MergedInputView';
export type { MergedInputViewProps, MergedInputSegment, MergedSelectOption, MergedInputSize } from './components/input/MergedInputView';
