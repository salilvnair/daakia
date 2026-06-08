/**
 * MatchBuilderPanel — Visual advanced request matching UI (6A.1-6A.6).
 * Shows condition chips for URL, header, query, cookie, and body matchers.
 */
import { useState } from 'react';
import { StyledDropdown, type DropdownOption } from '../../shared';
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

// ─── Dropdown options ──────────────────────────────────────────────────────────

const URL_TYPE_OPTIONS: DropdownOption[] = [
  { value: 'exact',      label: 'Exact' },
  { value: 'pathPrefix', label: 'Prefix' },
  { value: 'regex',      label: 'Regex' },
  { value: 'glob',       label: 'Glob' },
  { value: 'template',   label: 'Template' },
];

const MATCH_TYPE_OPTIONS: DropdownOption[] = [
  { value: 'equalTo',       label: 'equals' },
  { value: 'contains',      label: 'contains' },
  { value: 'startsWith',    label: 'starts with' },
  { value: 'endsWith',      label: 'ends with' },
  { value: 'notContaining', label: 'not containing' },
  { value: 'regex',         label: 'matches regex' },
  { value: 'present',       label: 'is present' },
  { value: 'absent',        label: 'is absent' },
];

const BODY_MATCH_OPTIONS: DropdownOption[] = [
  { value: 'equalTo',           label: 'equals (text)' },
  { value: 'contains',          label: 'contains' },
  { value: 'regex',             label: 'matches regex' },
  { value: 'equalToJson',       label: 'equals JSON' },
  { value: 'matchesJsonPath',   label: 'JSONPath' },
  { value: 'matchesJsonSchema', label: 'JSON Schema' },
  { value: 'equalToXml',        label: 'equals XML' },
  { value: 'matchesXPath',      label: 'XPath' },
];

const LOGIC_OPTIONS: DropdownOption[] = [
  { value: 'AND', label: 'ALL conditions (AND)' },
  { value: 'OR',  label: 'ANY condition (OR)' },
];

// ─── Main panel ───────────────────────────────────────────────────────────────

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
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
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
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--color-text-muted)] opacity-50">Priority</span>
          <input
            type="number"
            value={route.priority ?? ''}
            onChange={e => { e.stopPropagation(); onUpdate({ priority: e.target.value ? parseInt(e.target.value) : undefined }); }}
            onClick={e => e.stopPropagation()}
            placeholder="5"
            className="w-[40px] h-[22px] px-1.5 text-[10px] text-center rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-muted)] focus:outline-none"
          />
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-[rgba(255,255,255,0.07)]">
          {/* Logic combinator */}
          {conditionCount > 1 && (
            <div className="flex items-center gap-2 pt-2">
              <span className="text-[10px] text-[var(--color-text-muted)]">Match when</span>
              <StyledDropdown
                size="sm"
                options={LOGIC_OPTIONS}
                value={route.compositeLogic ?? 'AND'}
                onChange={v => onUpdate({ compositeLogic: v as CompositeLogic })}
                accentColor={MOCK_ACCENT}
              />
            </div>
          )}

          {/* URL Match Type */}
          <UrlMatchSection route={route} onUpdate={onUpdate} />

          {/* Header matchers */}
          <MatchRuleSection
            label="Header Conditions"
            placeholder={{ key: 'Header name', value: 'Value' }}
            rules={route.headerMatchers ?? []}
            onChange={r => onUpdate({ headerMatchers: r })}
          />

          {/* Query param matchers */}
          <MatchRuleSection
            label="Query Param Conditions"
            placeholder={{ key: 'Param name', value: 'Value' }}
            rules={route.queryParamMatchers ?? []}
            onChange={r => onUpdate({ queryParamMatchers: r })}
          />

          {/* Cookie matchers */}
          <MatchRuleSection
            label="Cookie Conditions"
            placeholder={{ key: 'Cookie name', value: 'Value' }}
            rules={route.cookieMatchers ?? []}
            onChange={r => onUpdate({ cookieMatchers: r })}
          />

          {/* Body matcher */}
          <BodyMatchSection route={route} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}

// ─── URL Match Section ────────────────────────────────────────────────────────

function UrlMatchSection({ route, onUpdate }: Props) {
  const urlMatch = route.urlMatch ?? { type: 'exact', value: route.path };

  return (
    <div className="flex flex-col gap-1.5 pt-2">
      <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">URL Match Type</span>
      <div className="flex items-center gap-2">
        <StyledDropdown
          size="sm"
          options={URL_TYPE_OPTIONS}
          value={urlMatch.type}
          onChange={v => onUpdate({ urlMatch: { ...urlMatch, type: v as UrlMatchType } })}
          accentColor={MOCK_ACCENT}
        />
        <input
          type="text"
          value={urlMatch.type === 'exact' ? route.path : urlMatch.value}
          onChange={e => {
            if (urlMatch.type === 'exact') {
              onUpdate({ path: e.target.value, urlMatch: { ...urlMatch, value: e.target.value } });
            } else {
              onUpdate({ urlMatch: { ...urlMatch, value: e.target.value } });
            }
          }}
          placeholder={urlMatch.type === 'regex' ? '/api/users/[0-9]+' : urlMatch.type === 'glob' ? '/api/*/details' : urlMatch.type === 'template' ? '/api/users/{userId}' : '/api/path'}
          className="flex-1 h-[28px] px-2.5 text-[12px] font-mono rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
        />
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={urlMatch.caseInsensitive ?? false}
            onChange={e => onUpdate({ urlMatch: { ...urlMatch, caseInsensitive: e.target.checked } })}
            className="w-3 h-3 rounded cursor-pointer"
          />
          <span className="text-[10px] text-[var(--color-text-muted)]">case-insensitive</span>
        </label>
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
        <button
          type="button"
          onClick={addRule}
          className="flex items-center gap-1 h-[20px] px-2 text-[10px] rounded cursor-pointer transition-colors"
          style={{ color: MOCK_ACCENT, background: `color-mix(in srgb, ${MOCK_ACCENT} 10%, transparent)` }}
        >
          <PlusIcon size={9} /> Add
        </button>
      </div>

      {rules.length === 0 && (
        <p className="text-[10px] text-[var(--color-text-muted)] opacity-50 italic">No conditions — click Add to require specific {label.toLowerCase()}.</p>
      )}

      {rules.map((rule, idx) => (
        <div key={rule.id} className="flex items-center gap-1.5 group">
          <input
            type="text"
            value={rule.key}
            onChange={e => updateRule(idx, { key: e.target.value })}
            placeholder={placeholder.key}
            className="w-[140px] h-[26px] px-2 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] flex-shrink-0"
          />
          <StyledDropdown
            size="sm"
            options={MATCH_TYPE_OPTIONS}
            value={rule.matchType}
            onChange={v => updateRule(idx, { matchType: v as MatchType })}
            accentColor={MOCK_ACCENT}
          />
          {rule.matchType !== 'present' && rule.matchType !== 'absent' && (
            <input
              type="text"
              value={rule.value}
              onChange={e => updateRule(idx, { value: e.target.value })}
              placeholder={placeholder.value}
              className="flex-1 h-[26px] px-2 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          )}
          <label className="flex items-center cursor-pointer flex-shrink-0" title="Negate (NOT)">
            <input
              type="checkbox"
              checked={rule.negate ?? false}
              onChange={e => updateRule(idx, { negate: e.target.checked })}
              className="w-3 h-3 rounded cursor-pointer"
            />
            <span className="ml-0.5 text-[9px] text-[var(--color-text-muted)]">NOT</span>
          </label>
          <button
            type="button"
            onClick={() => removeRule(idx)}
            className="p-1 opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer transition-all flex-shrink-0"
          >
            <TrashIcon size={11} />
          </button>
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
          <button
            type="button"
            onClick={() => setBm({ matchType: 'equalToJson', value: '' })}
            className="flex items-center gap-1 h-[20px] px-2 text-[10px] rounded cursor-pointer"
            style={{ color: MOCK_ACCENT, background: `color-mix(in srgb, ${MOCK_ACCENT} 10%, transparent)` }}
          >
            <PlusIcon size={9} /> Add
          </button>
        ) : (
          <button type="button" onClick={() => setBm(null)} className="text-[10px] text-[var(--color-error)] cursor-pointer hover:opacity-80">Remove</button>
        )}
      </div>

      {bm && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <StyledDropdown
              size="sm"
              options={BODY_MATCH_OPTIONS}
              value={bm.matchType}
              onChange={v => setBm({ matchType: v as BodyMatchType })}
              accentColor={MOCK_ACCENT}
            />
            <label className="flex items-center gap-1 cursor-pointer flex-shrink-0">
              <input type="checkbox" checked={bm.negate ?? false} onChange={e => setBm({ negate: e.target.checked })} className="w-3 h-3 rounded cursor-pointer" />
              <span className="text-[9px] text-[var(--color-text-muted)]">NOT</span>
            </label>
            {(bm.matchType === 'equalToJson') && (
              <>
                <label className="flex items-center gap-1 cursor-pointer flex-shrink-0">
                  <input type="checkbox" checked={bm.ignoreArrayOrder ?? false} onChange={e => setBm({ ignoreArrayOrder: e.target.checked })} className="w-3 h-3" />
                  <span className="text-[9px] text-[var(--color-text-muted)]">ignore array order</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer flex-shrink-0">
                  <input type="checkbox" checked={bm.ignoreExtraElements ?? false} onChange={e => setBm({ ignoreExtraElements: e.target.checked })} className="w-3 h-3" />
                  <span className="text-[9px] text-[var(--color-text-muted)]">ignore extra fields</span>
                </label>
              </>
            )}
          </div>
          <textarea
            value={bm.value}
            onChange={e => setBm({ value: e.target.value })}
            rows={3}
            placeholder={
              bm.matchType === 'matchesJsonPath' ? '$.store.book[?(@.price < 10)]' :
              bm.matchType === 'matchesJsonSchema' ? '{"type":"object","required":["email"]}' :
              bm.matchType === 'equalToJson' ? '{"email":"user@example.com"}' :
              bm.matchType === 'matchesXPath' ? '//users/user[@id]' :
              'Value to match against request body'
            }
            className="w-full px-2.5 py-2 text-[11px] font-mono rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none resize-none"
          />
          {bm.matchType === 'matchesJsonPath' && (
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-70">Matches if JSONPath expression returns a non-empty result.</p>
          )}
        </div>
      )}
    </div>
  );
}
