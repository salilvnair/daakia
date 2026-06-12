import { useState } from 'react';
import { useAiFeaturesStore } from '../../../store/ai-features-store';
import { AiAssistPopover, type AssistMode } from '../../ai/AiAssistPopover';
import { AiResponsePatternLearning } from '../../ai/AiResponsePatternLearning';
import { AiResponseActionsMenu } from './AiResponseActionsMenu';
import { AIButtonView } from '../../../dui';
import type { ResponseData } from '../../../store/tabs-store';

interface ResponseAiToolbarProps {
  tabId: string;
  response: ResponseData;
  requestMethod: string;
  requestUrl: string;
}

export function ResponseAiToolbar({ tabId, response, requestMethod, requestUrl }: ResponseAiToolbarProps) {
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const [activePopup, setActivePopup] = useState<AssistMode | null>(null);

  return (
    <div className="flex items-center gap-1.5 pb-1.5 flex-shrink-0">
      {aiEnabled('explainRest') && (
        <div className="relative">
          <AIButtonView
            action="explain"
            label="Explain"
            size="xs"
            onClick={() => setActivePopup(p => p === 'explain' ? null : 'explain')}
          />
          {activePopup === 'explain' && (
            <div className="absolute z-50 right-0 mt-1 w-[440px]">
              <AiAssistPopover
                mode="explain"
                response={response}
                requestMethod={requestMethod}
                requestUrl={requestUrl}
                onClose={() => setActivePopup(null)}
              />
            </div>
          )}
        </div>
      )}

      {aiEnabled('followUpsRest') && (
        <div className="relative">
          <AIButtonView
            action="ask"
            label="Follow-ups"
            size="xs"
            onClick={() => setActivePopup(p => p === 'follow-up' ? null : 'follow-up')}
          />
          {activePopup === 'follow-up' && (
            <div className="absolute z-50 right-0 mt-1 w-[440px]">
              <AiAssistPopover
                mode="follow-up"
                response={response}
                requestMethod={requestMethod}
                requestUrl={requestUrl}
                onClose={() => setActivePopup(null)}
              />
            </div>
          )}
        </div>
      )}

      {aiEnabled('recordBaseline') && (
        <div className="relative">
          <AiResponsePatternLearning
            responseBody={response.body || ''}
            method={requestMethod}
            url={requestUrl}
            status={response.status}
          />
        </div>
      )}

      <AiResponseActionsMenu
        tabId={tabId}
        response={response}
        requestMethod={requestMethod}
        requestUrl={requestUrl}
      />
    </div>
  );
}
