/**
 * MatchBuilderPanel — Visual advanced request matching UI (6A.1-6A.6).
 * Shows condition chips for URL, header, query, cookie, and body matchers.
 */
import { useState } from 'react';
import {
  SelectInputView, TextInputView, ButtonView, IconButtonView,
  CheckboxView, EditorView, ResizablePanelView, type SelectOption, type EditorLanguage,
} from '@salilvnair/dui';
import { PlusIcon, TrashIcon, ChevronDownIcon } from '../../../icons';
import type {
  MockRoute, UrlMatchConfig, UrlMatchType, MatchRule, MatchType,
  BodyMatcher, BodyMatchType, CompositeLogic,
} from '../mock-types';

const MOCK_ACCENT = 'var(--color-mock-server)';

interface Props {
  route: MockRoute;
  onUpdate: (patch: Partial<MockRoute>) => void;
}

const URL_TYPE_OPTIONS: SelectOption[] = [
  { value: 'exact',      label: 'Exact' },
  { value: 'pathPrefix', label: 'Prefix' },
  { value: 'regex',      label: 'Regex' },
  { value: 'glob',       label: 'Glob' },
  { value: 'template',   label: 'Template' },
];

const MATCH_TYPE_OPTIONS: SelectOption[] = [
  { value: 'equalTo',       label: 'equals' },
  { value: 'contains',      label: 'contains' },
  { value: 'startsWith',    label: 'starts with' },
  { value: 'endsWith',      label: 'ends with' },
  { value: 'notContaining', label: 'not containing' },
  { value: 'regex',         label: 'matches regex' },
  { value: 'present',       label: 'is present' },
  { value: 'absent',        label: 'is absent' },
];

const BODY_MATCH_OPTIONS: SelectOption[] = [
  { value: 'equalTo',           label: 'equals (text)' },
  { value: 'contains',          label: 'contains' },
  { value: 'regex',             label: 'matches regex' },
  { value: 'equalToJson',       label: 'equals JSON' },
  { value: 'matchesJsonPath',   label: 'JSONPath' },
  { value: 'matchesJsonSchema', label: 'JSON Schema' },
  { value: 'equalToXml',        label: 'equals XML' },
  { value: 'matchesXPath',      label: 'XPath' },
];

const LOGIC_OPTIONS: SelectOption[] = [
  { value: 'AND', label: 'ALL conditions (AND)' },
  { value: 'OR',  label: 'ANY condition (OR)' },
];

export function MatchBuilderPanel({ route, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);

  const hasAdvanced = !!(
    (route.urlMatch && route.urlMatch.type !== 'exact') ||
    route.headerMatchers?.length ||
    route.queryParamMatchers?.length ||
    route.cookieMatchers?.length ||
    route.bodyMatcher
  );

  const conditionCount =
    (route.headerMatchers?.length ?? 0) +
    (route.queryParamMatchers?.length ?? 0) +
    (route.cookieMatchers?.length ?? 0) +
    (route.bodyMatcher ? 1 : 0);

  return (
    <div className="border border-dashed border-[rgba(255,255,255,0.1)] rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="w-full flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span
            className="transition-transform duration-150 text-[var(--color-text-muted)]"
            style={{ display: 'inline-flex', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          >
            <ChevronDownIcon size={12} />
          </span>
          <span className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
            Advanced Match Rules
          </span>
          {conditionCount > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: `color-mix(in srgb, ${MOCK_ACCENT} 15%, transparent)`, color: MOCK_ACCENT }}>
              {conditionCount} condition{conditionCount !== 1 ? 's' : ''}
            </span>
          )}
          {hasAdvanced && !conditionCount && (
            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>
              custom URL match
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <span className="text-[10px] text-[var(--color-text-muted)] opacity-50">Priority</span>
          <TextInputView
            type="number"
            value={String(route.priority ?? '')}
            onChange={e => onUpdate({ priority: e.target.value ? parseInt(e.target.value) : undefined })}
            placeholder="5"
            size="md"
            style={{ width: 40, textAlign: 'center' }}
          />
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-[rgba(255,255,255,0.07)]">
          {/* Logic combinator */}
          {conditionCount > 1 && (
            <div className="flex items-center gap-2 pt-2">
              <span className="text-[10px] text-[var(--color-text-muted)]">Match when</span>
              <SelectInputView
                size="md"
                options={LOGIC_OPTIONS}
                value={route.compositeLogic ?? 'AND'}
                onChange={v => onUpdate({ compositeLogic: v as CompositeLogic })}
                accentColor={MOCK_ACCENT}
              />
            </div>
          )}

          <UrlMatchSection route={route} onUpdate={onUpdate} />

          <MatchRuleSection
            label="Header Conditions"
            placeholder={{ key: 'Header name', value: 'Value' }}
            rules={route.headerMatchers ?? []}
            onChange={r => onUpdate({ headerMatchers: r })}
          />

          <MatchRuleSection
            label="Query Param Conditions"
            placeholder={{ key: 'Param name', value: 'Value' }}
            rules={route.queryParamMatchers ?? []}
            onChange={r => onUpdate({ queryParamMatchers: r })}
          />

          <MatchRuleSection
            label="Cookie Conditions"
            placeholder={{ key: 'Cookie name', value: 'Value' }}
            rules={route.cookieMatchers ?? []}
            onChange={r => onUpdate({ cookieMatchers: r })}
          />

          <BodyMatchSection route={route} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}

// ─── URL Match Section ────────────────────────────────────────────────────────

function UrlMatchSection({ route, onUpdate }: Props) {
  const urlMatch: UrlMatchConfig = route.urlMatch ?? { type: 'exact', value: route.path };

  return (
    <div className="flex flex-col gap-1.5 pt-2">
      <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">URL Match Type</span>
      <div className="flex items-center gap-2">
        <SelectInputView
          size="md"
          options={URL_TYPE_OPTIONS}
          value={urlMatch.type}
          onChange={v => onUpdate({ urlMatch: { ...urlMatch, type: v as UrlMatchType } })}
          accentColor={MOCK_ACCENT}
        />
        <TextInputView
          value={urlMatch.type === 'exact' ? route.path : urlMatch.value}
          onChange={e => {
            if (urlMatch.type === 'exact') {
              onUpdate({ path: e.target.value, urlMatch: { ...urlMatch, value: e.target.value } });
            } else {
              onUpdate({ urlMatch: { ...urlMatch, value: e.target.value } });
            }
          }}
          placeholder={
            urlMatch.type === 'regex' ? '/api/users/[0-9]+' :
            urlMatch.type === 'glob' ? '/api/*/details' :
            urlMatch.type === 'template' ? '/api/users/{userId}' : '/api/path'
          }
          size="md"
          style={{ flex: 1, fontFamily: 'monospace' }}
        />
        <CheckboxView
          checked={urlMatch.caseInsensitive ?? false}
          onChange={v => onUpdate({ urlMatch: { ...urlMatch, caseInsensitive: v } })}
          label="case-insensitive"
          size="sm"
        />
      </div>
      {urlMatch.type === 'regex' && (
        <p className="text-[10px] text-[var(--color-text-muted)] opacity-70">Pattern tested against full request path. Named groups become path params.</p>
      )}
      {urlMatch.type === 'glob' && (
        <p className="text-[10px] text-[var(--color-text-muted)] opacity-70">Use * for single segment, ** for any path, ? for single char.</p>
      )}
      {urlMatch.type === 'template' && (
        <p className="text-[10px] text-[var(--color-text-muted)] opacity-70">Use {'{name}'} for path params. Available in template as {'{{request.pathParams.name}}'}.</p>
      )}
    </div>
  );
}

// ─── Match Rule Section ───────────────────────────────────────────────────────

interface MatchRuleSectionProps {
  label: string;
  placeholder: { key: string; value: string };
  rules: MatchRule[];
  onChange: (rules: MatchRule[]) => void;
}

function MatchRuleSection({ label, placeholder, rules, onChange }: MatchRuleSectionProps) {
  const addRule = () => {
    onChange([...rules, { id: crypto.randomUUID(), key: '', matchType: 'equalTo', value: '' }]);
  };

  const updateRule = (idx: number, patch: Partial<MatchRule>) => {
    const updated = [...rules];
    updated[idx] = { ...updated[idx], ...patch };
    onChange(updated);
  };

  const removeRule = (idx: number) => {
    onChange(rules.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">{label}</span>
        <ButtonView
          size="md"
          accentColor={MOCK_ACCENT}
          iconLeft={<PlusIcon size={9} />}
          onClick={addRule}
        >
          Add
        </ButtonView>
      </div>

      {rules.length === 0 && (
        <p className="text-[10px] text-[var(--color-text-muted)] opacity-50 italic">No conditions — click Add to require specific {label.toLowerCase()}.</p>
      )}

      {rules.map((rule, idx) => (
        <div key={rule.id} className="flex items-center gap-1.5 group">
          <TextInputView
            value={rule.key}
            onChange={e => updateRule(idx, { key: e.target.value })}
            placeholder={placeholder.key}
            size="md"
            style={{ width: 140, fontFamily: 'monospace', flexShrink: 0 }}
          />
          <SelectInputView
            size="md"
            options={MATCH_TYPE_OPTIONS}
            value={rule.matchType}
            onChange={v => updateRule(idx, { matchType: v as MatchType })}
            accentColor={MOCK_ACCENT}
          />
          {rule.matchType !== 'present' && rule.matchType !== 'absent' && (
            <TextInputView
              value={rule.value}
              onChange={e => updateRule(idx, { value: e.target.value })}
              placeholder={placeholder.value}
              size="md"
              style={{ flex: 1, fontFamily: 'monospace' }}
            />
          )}
          <CheckboxView
            checked={rule.negate ?? false}
            onChange={v => updateRule(idx, { negate: v })}
            label="NOT"
            size="sm"
          />
          <IconButtonView
            size="sm"
            icon={<TrashIcon size={11} />}
            accentColor="var(--color-error)"
            className="opacity-0 group-hover:opacity-100 flex-shrink-0"
            onClick={() => removeRule(idx)}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Body Match Section ───────────────────────────────────────────────────────

function BodyMatchSection({ route, onUpdate }: Props) {
  const bm = route.bodyMatcher;

  const setBm = (patch: Partial<BodyMatcher> | null) => {
    if (patch === null) { onUpdate({ bodyMatcher: undefined }); return; }
    onUpdate({ bodyMatcher: { matchType: 'equalTo', value: '', ...bm, ...patch } });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Body Condition</span>
        {!bm ? (
          <ButtonView
            size="md"
            accentColor={MOCK_ACCENT}
            iconLeft={<PlusIcon size={9} />}
            onClick={() => setBm({ matchType: 'equalToJson', value: '' })}
          >
            Add
          </ButtonView>
        ) : (
          <ButtonView
            size="md"
            accentColor="var(--color-error)"
            onClick={() => setBm(null)}
          >
            Remove
          </ButtonView>
        )}
      </div>

      {bm && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <SelectInputView
              size="md"
              options={BODY_MATCH_OPTIONS}
              value={bm.matchType}
              onChange={v => setBm({ matchType: v as BodyMatchType })}
              accentColor={MOCK_ACCENT}
            />
            <CheckboxView
              checked={bm.negate ?? false}
              onChange={v => setBm({ negate: v })}
              label="NOT"
              size="sm"
            />
            {bm.matchType === 'equalToJson' && (
              <>
                <CheckboxView
                  checked={bm.ignoreArrayOrder ?? false}
                  onChange={v => setBm({ ignoreArrayOrder: v })}
                  label="ignore array order"
                  size="sm"
                />
                <CheckboxView
                  checked={bm.ignoreExtraElements ?? false}
                  onChange={v => setBm({ ignoreExtraElements: v })}
                  label="ignore extra fields"
                  size="sm"
                />
              </>
            )}
          </div>
          <ResizablePanelView defaultHeight={80} minHeight={60} maxHeight={300}>
            <EditorView
              value={bm.value}
              onChange={val => setBm({ value: val })}
              language={(
                bm.matchType === 'equalToJson' || bm.matchType === 'matchesJsonPath' || bm.matchType === 'matchesJsonSchema' ? 'json' :
                bm.matchType === 'equalToXml' || bm.matchType === 'matchesXPath' ? 'xml' :
                'plaintext'
              ) as EditorLanguage}
              placeholder={
                bm.matchType === 'matchesJsonPath' ? '$.store.book[?(@.price < 10)]' :
                bm.matchType === 'matchesJsonSchema' ? '{"type":"object","required":["email"]}' :
                bm.matchType === 'equalToJson' ? '{"email":"user@example.com"}' :
                bm.matchType === 'matchesXPath' ? '//users/user[@id]' :
                'Value to match against request body'
              }
              height="100%"
              bordered
            />
          </ResizablePanelView>
          {bm.matchType === 'matchesJsonPath' && (
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-70">Matches if JSONPath expression returns a non-empty result.</p>
          )}
        </div>
      )}
    </div>
  );
}
