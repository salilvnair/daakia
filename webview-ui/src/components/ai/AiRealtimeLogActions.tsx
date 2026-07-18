/**
 * AiRealtimeLogActions — reusable AI toolbar for realtime protocol message logs.
 * Used by: WebSocketPanel (9.1-9.5, 9.7, 9.9), SSEPanel (9.10-9.13, 9.15-9.16),
 *          MQTTPanel (9.17-9.20, 9.22), SocketIOPanel (9.24-9.26, 9.28).
 *
 * Renders: Explain ✦, Follow-ups ✦, Baseline button, ⋮ AI Actions, Traffic Analyzer ✦.
 * Shows: Smart Retry Advisor banner when connection error (on error state).
 */
import { useState, useRef } from 'react';
import { SparkleIcon } from '../../icons';
import { AiAssistPopover, type AssistMode } from '../ai/AiAssistPopover';
import { AiResponseActionsMenu } from '../rest/response/AiResponseActionsMenu';
import { AiResponsePatternLearning } from './AiResponsePatternLearning';
import { AiSmartRetryAdvisor } from './AiSmartRetryAdvisor';
import { AiTrafficAnalyzerModal } from './AiTrafficAnalyzerModal';
import { AiMqttTopicSuggesterModal } from './AiMqttTopicSuggesterModal';
import { AiSseEventSuggesterModal } from './AiSseEventSuggesterModal';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import { AIButtonView } from '@salilvnair/dui';
import type { ResponseData } from '../../store/tabs-store';

interface Props {
  tabId: string;
  url: string;
  protocol: 'websocket' | 'sse' | 'mqtt' | 'socketio';
  messages: string[];
  hasError?: boolean;
  errorMsg?: string;
  accentColor: string;
  // Traffic analyzer flag name
  trafficAnalyzerFlag?: 'wsTrafficAnalyzer' | 'sseTrafficAnalyzer' | 'sioTrafficAnalyzer';
  showTopicSuggester?: boolean;
  showEventSuggester?: boolean;
  subscribedTopics?: string[];
  observedEventTypes?: string[];
}

function fakeResponse(messages: string[]): ResponseData {
  const body = messages.length > 0 ? messages[messages.length - 1] : '';
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    body,
    size: body.length,
    time: 0,
    contentType: 'application/json',
    cookies: [],
  };
}

export function AiRealtimeLogActions({
  tabId, url, protocol, messages, hasError, errorMsg, accentColor,
  trafficAnalyzerFlag, showTopicSuggester, showEventSuggester,
  subscribedTopics, observedEventTypes,
}: Props) {
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const [activePopup, setActivePopup] = useState<AssistMode | null>(null);
  const [showTrafficAnalyzer, setShowTrafficAnalyzer] = useState(false);
  const [showTopicSug, setShowTopicSug] = useState(false);
  const [showEventSug, setShowEventSug] = useState(false);
  const explainRef = useRef<HTMLDivElement>(null);
  const followUpRef = useRef<HTMLDivElement>(null);

  const methodLabel = protocol === 'websocket' ? 'WS' : protocol === 'sse' ? 'SSE' : protocol === 'mqtt' ? 'MQTT' : 'SIO';
  const hasMessages = messages.length > 0;
  const fakeResp = fakeResponse(messages);
  const explainFlag = protocol === 'socketio' ? 'explainRest' : 'explainRest';
  const followFlag = 'followUpsRest';

  return (
    <>
      {/* Inline action buttons */}
      <div className="flex items-center gap-1">
        {/* Explain ✦ */}
        {hasMessages && aiEnabled(explainFlag) && (
          <>
            <div ref={explainRef} className="flex-shrink-0" style={{ whiteSpace: 'nowrap' }}>
              <AIButtonView
                action="explain"
                label="Explain"
                size="xs"
                accentColor="var(--color-protocol-ai)"
                onClick={() => setActivePopup(p => p === 'explain' ? null : 'explain')}
              />
            </div>
            {activePopup === 'explain' && (
              <AiAssistPopover
                mode="explain"
                response={fakeResp}
                requestMethod={methodLabel}
                requestUrl={url}
                onClose={() => setActivePopup(null)}
                anchorEl={explainRef.current}
              />
            )}
          </>
        )}

        {/* Follow-ups ✦ */}
        {hasMessages && aiEnabled(followFlag) && protocol !== 'sse' && protocol !== 'mqtt' && (
          <>
            <div ref={followUpRef} className="flex-shrink-0" style={{ whiteSpace: 'nowrap' }}>
              <AIButtonView
                action="ask"
                label="Follow-ups"
                size="xs"
                accentColor="var(--color-protocol-ai)"
                onClick={() => setActivePopup(p => p === 'follow-up' ? null : 'follow-up')}
              />
            </div>
            {activePopup === 'follow-up' && (
              <AiAssistPopover
                mode="follow-up"
                response={fakeResp}
                requestMethod={methodLabel}
                requestUrl={url}
                onClose={() => setActivePopup(null)}
                anchorEl={followUpRef.current}
              />
            )}
          </>
        )}

        {/* Record Baseline (red — matches REST exactly) */}
        {hasMessages && aiEnabled('recordBaseline') && (
          <div className="flex-shrink-0" style={{ whiteSpace: 'nowrap' }}>
            <AiResponsePatternLearning
              responseBody={messages[messages.length - 1] || ''}
              method={methodLabel}
              url={url}
              status={200}
            />
          </div>
        )}

        {/* Traffic Analyzer ✦ */}
        {trafficAnalyzerFlag && hasMessages && aiEnabled(trafficAnalyzerFlag as any) && (
          <button
            type="button"
            onClick={() => setShowTrafficAnalyzer(true)}
            className="flex items-center flex-shrink-0 whitespace-nowrap gap-[3px] px-[6px] h-[20px] rounded-md text-[9px] font-medium cursor-pointer transition-all"
            style={{ color: accentColor, backgroundColor: `color-mix(in srgb, ${accentColor} 8%, transparent)` }}
            title="AI Traffic Analyzer"
          >
            <SparkleIcon size={10} />
            Analyze
          </button>
        )}

        {/* Topic Suggester (MQTT) */}
        {showTopicSuggester && aiEnabled('mqttTopicSuggester') && (
          <button
            type="button"
            onClick={() => setShowTopicSug(true)}
            className="flex items-center flex-shrink-0 whitespace-nowrap gap-[3px] px-[6px] h-[20px] rounded-md text-[9px] font-medium cursor-pointer transition-all"
            style={{ color: accentColor, backgroundColor: `color-mix(in srgb, ${accentColor} 8%, transparent)` }}
            title="AI Topic Suggester"
          >
            <SparkleIcon size={10} />
            Topics
          </button>
        )}

        {/* Event Suggester (SSE) */}
        {showEventSuggester && aiEnabled('sseEventSuggester') && (
          <button
            type="button"
            onClick={() => setShowEventSug(true)}
            className="flex items-center flex-shrink-0 whitespace-nowrap gap-[3px] px-[6px] h-[20px] rounded-md text-[9px] font-medium cursor-pointer transition-all"
            style={{ color: accentColor, backgroundColor: `color-mix(in srgb, ${accentColor} 8%, transparent)` }}
            title="AI Event Suggester"
          >
            <SparkleIcon size={10} />
            Events
          </button>
        )}

        {/* ⋮ AI Actions menu */}
        {hasMessages && (aiEnabled('assertGeneration') || aiEnabled('semanticValidator') || aiEnabled('responseTransformer')) && (
          <AiResponseActionsMenu
            tabId={tabId}
            response={fakeResp}
            requestMethod={methodLabel}
            requestUrl={url}
          />
        )}
      </div>

      {/* Smart Retry Advisor (on error/disconnect) */}
      {hasError && errorMsg && aiEnabled('smartRetryAdvisor') && (
        <div className="border-t border-[var(--color-surface-border)]">
          <AiSmartRetryAdvisor
            status={0}
            responseBody={errorMsg}
            method={methodLabel}
            url={url}
          />
        </div>
      )}

      {/* Modals */}
      {showTrafficAnalyzer && trafficAnalyzerFlag && (
        <AiTrafficAnalyzerModal
          protocol={protocol === 'mqtt' ? 'websocket' : protocol as any}
          messages={messages}
          onClose={() => setShowTrafficAnalyzer(false)}
        />
      )}
      {showTopicSug && <AiMqttTopicSuggesterModal subscribedTopics={subscribedTopics || []} onClose={() => setShowTopicSug(false)} />}
      {showEventSug && <AiSseEventSuggesterModal observedEventTypes={observedEventTypes || []} onClose={() => setShowEventSug(false)} />}
    </>
  );
}
