import { useAiFeaturesStore } from '../../../store/ai-features-store';
import { AIButtonView } from '../../../dui';
import type { useTabsStore } from '../../../store/tabs-store';

type Tab = ReturnType<typeof useTabsStore.getState>['tabs'][0];

interface RequestAiToolbarProps {
  tab: Tab;
  activeSection: string;
  onOpenFuzzer: () => void;
}

export function RequestAiToolbar({ tab, activeSection, onOpenFuzzer }: RequestAiToolbarProps) {
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);

  if (!aiEnabled('requestFuzzer') || activeSection !== 'body' || !tab.bodyRaw?.trim()) {
    return null;
  }

  return (
    <AIButtonView
      action="fuzz"
      label="Fuzz"
      size="xs"
      accentColor="var(--color-error)"
      onClick={onOpenFuzzer}
    />
  );
}
