import { transform } from 'sucrase';
import * as DUI from '../../../../dui';
import * as Icons from '../../../../icons';
import * as ReactNS from 'react';
import { STUBS } from './PlaygroundStubs';

export function buildAndEval(code: string): { Component: ReactNS.ComponentType | null; error: string | null } {
  try {
    const trimmed = code.trim();

    let moduleBody: string;

    // Check if user wrote a full `function Preview() { ... }` or `const Preview = ...`
    const isFullComponent = /^(function\s+Preview[\s({]|const\s+Preview\s*=)/.test(trimmed);

    if (isFullComponent) {
      moduleBody = `${trimmed}\nreturn Preview;`;
    } else {
      const lines = trimmed.split('\n');

      // Find the first line that opens a JSX tag (starts with `<` but not `</` or `<!--`)
      const jsxLineIdx = lines.findIndex(l => {
        const t = l.trimStart();
        return t.startsWith('<') && !t.startsWith('</') && !t.startsWith('<!--');
      });

      if (jsxLineIdx < 0) {
        // No JSX found — wrap the whole thing as a function body returning null
        // (Handles pure JS snippets like toast() calls)
        moduleBody = [
          'function Preview() {',
          `  ${trimmed.replace(/\n/g, '\n  ')}`,
          '  return null;',
          '}',
          'return Preview;',
        ].join('\n');
      } else if (jsxLineIdx === 0) {
        // Starts directly with JSX — wrap as expression (handles pure JSX with no setup)
        moduleBody = `function Preview() { return (<>${trimmed}</>); }\nreturn Preview;`;
      } else {
        // There is content before the first JSX line — treat it as function body setup.
        // This handles: comments, const/let/var declarations, function calls, etc.
        const setup = lines.slice(0, jsxLineIdx).join('\n').trim();
        const jsx   = lines.slice(jsxLineIdx).join('\n').trim();
        moduleBody = [
          'function Preview() {',
          `  ${setup.replace(/\n/g, '\n  ')}`,
          '  return (',
          `    <>${jsx}</>`,
          '  );',
          '}',
          'return Preview;',
        ].join('\n');
      }
    }

    // Build injection strings
    const duiInject = Object.keys(DUI)
      .filter(k => /^[A-Za-z]/.test(k))
      .map(k => `const ${k} = __DUI__[${JSON.stringify(k)}];`)
      .join('\n');

    const iconInject = Object.keys(Icons)
      .filter(k => /^[A-Za-z]/.test(k))
      .map(k => `const ${k} = __Icons__[${JSON.stringify(k)}];`)
      .join('\n');

    const stubInject = Object.keys(STUBS)
      .map(k => `const ${k} = __stubs__[${JSON.stringify(k)}];`)
      .join('\n');

    const full = `
const React = __React__;
const { useState, useEffect, useCallback, useRef, useMemo, useReducer } = __React__;
${duiInject}
${iconInject}
${stubInject}
${moduleBody}
`.trim();

    const { code: js } = transform(full, { transforms: ['jsx'] });
    // eslint-disable-next-line no-new-func
    const factory = new Function('__React__', '__DUI__', '__Icons__', '__stubs__', js);
    const Comp = factory(ReactNS, DUI, Icons, STUBS) as ReactNS.ComponentType;
    return { Component: Comp, error: null };
  } catch (e) {
    return { Component: null, error: String(e) };
  }
}
