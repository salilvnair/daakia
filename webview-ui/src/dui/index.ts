// ─── DUI — Daakia UI Component Library ───────────────────────────────────────
// Unified, theme-aware component set for all Daakia screens.
// All components use existing VS Code CSS variables — zero extra config needed.

export { ChipView } from './components/chips/ChipView';
export type { ChipViewProps } from './components/chips/ChipView';

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

export { KeyValueItemView } from './components/input/KeyValueItemView';
export type { KeyValueItemViewProps } from './components/input/KeyValueItemView';

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

export { SideNavView } from './components/layout/SideNavView';
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
