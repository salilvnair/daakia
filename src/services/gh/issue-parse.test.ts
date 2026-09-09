/**
 * Reading a repository's own schema, and reading it back off an issue.
 *
 * These two together are why the board can group by Module and Environment
 * when GitHub has no such fields. Both halves are pinned here because both
 * fail silently: a template that will not parse costs a dimension, and a body
 * that will not parse costs one issue — and an issue quietly bucketed under
 * the wrong module is worse than one visibly unmapped.
 */
import { describe, it, expect } from 'vitest';
import { parseIssueBody, fieldValue, readDimensions } from './issue-body';
import {
  parseIssueForm, parseIssueForms, proposeDimensions, headingMap,
  type IssueForm,
} from './issue-forms';

// ── What GitHub actually stores when a form is submitted ────────────────────

const SUBMITTED = `### Summary

SSO sign-in hangs on submit.

### Module

Checkout

### Environment

PROD

### Steps to reproduce

1. Open /login
2. Choose Sign in with SSO
3. Press Submit

### Notes

_No response_
`;

describe('a submitted issue form', () => {
  it('splits into its headings', () => {
    const fields = parseIssueBody(SUBMITTED);
    expect(fields.map(f => f.heading)).toEqual([
      'Summary', 'Module', 'Environment', 'Steps to reproduce', 'Notes',
    ]);
  });

  it('reads a value', () => {
    const fields = parseIssueBody(SUBMITTED);
    expect(fieldValue(fields, 'Module')).toBe('Checkout');
    expect(fieldValue(fields, 'Environment')).toBe('PROD');
  });

  it('keeps a multi-line answer whole', () => {
    const steps = fieldValue(parseIssueBody(SUBMITTED), 'Steps to reproduce');
    expect(steps).toContain('1. Open /login');
    expect(steps).toContain('3. Press Submit');
  });

  it('treats _No response_ as empty, not as a value', () => {
    /* GitHub's literal text for a field left blank. A board grouping by it
       would otherwise grow a column called "_No response_". */
    expect(fieldValue(parseIssueBody(SUBMITTED), 'Notes')).toBeUndefined();
  });

  it('matches a heading regardless of case and stray spaces', () => {
    const fields = parseIssueBody('###   Module  \n\nCheckout\n');
    expect(fieldValue(fields, 'module')).toBe('Checkout');
  });

  it('does not match a near miss', () => {
    /* "Module" must not answer for "Modules". A near-miss that silently
       succeeds is worse than one that shows up as unmapped and gets fixed. */
    expect(fieldValue(parseIssueBody(SUBMITTED), 'Modules')).toBeUndefined();
  });
});

describe('bodies that are not tidy', () => {
  it('ignores prose above the first heading', () => {
    const fields = parseIssueBody('Some preamble somebody typed.\n\n### Module\n\nOrders\n');
    expect(fields).toHaveLength(1);
    expect(fieldValue(fields, 'Module')).toBe('Orders');
  });

  it('does not split a fenced block containing a hash line', () => {
    /*
      The bug this prevents: a stack trace or a pasted Markdown document inside
      "Steps to reproduce" turning into two fields, and taking half the real
      answer with it.
    */
    const body = [
      '### Steps to reproduce',
      '',
      '```',
      '### this is output, not a heading',
      'at TokenClient.refresh',
      '```',
      '',
      '### Module',
      '',
      'Checkout',
    ].join('\n');
    const fields = parseIssueBody(body);
    expect(fields.map(f => f.heading)).toEqual(['Steps to reproduce', 'Module']);
    expect(fieldValue(fields, 'Steps to reproduce')).toContain('### this is output');
  });

  it('accepts ## and # for a hand-written template', () => {
    const fields = parseIssueBody('## Module\n\nOrders\n# Environment\n\nDEV\n');
    expect(fieldValue(fields, 'Module')).toBe('Orders');
    expect(fieldValue(fields, 'Environment')).toBe('DEV');
  });

  it('returns nothing for a body with no headings at all', () => {
    /* An issue filed before the templates existed, or a blank one. It is not
       an error — it simply has no dimensions. */
    expect(parseIssueBody('Just a sentence about a bug.')).toEqual([]);
  });

  it('survives an empty body', () => {
    expect(parseIssueBody('')).toEqual([]);
  });
});

describe('reading dimensions off an issue', () => {
  const map = { Module: 'module', Environment: 'environment' };

  it('reads what is there', () => {
    expect(readDimensions(SUBMITTED, map)).toEqual({ module: 'Checkout', environment: 'PROD' });
  });

  it('omits a dimension the body does not answer', () => {
    expect(readDimensions('### Module\n\nOrders\n', map)).toEqual({ module: 'Orders' });
  });

  it('lets two headings feed one dimension, first answer winning', () => {
    /*
      This is what keeps a repository readable after somebody renames a field:
      issues filed before the rename carry the old heading, issues after carry
      the new one, and both are the same dimension.
    */
    const renamed = { Environment: 'environment', 'Deploy target': 'environment' };
    expect(readDimensions('### Deploy target\n\nPROD\n', renamed)).toEqual({ environment: 'PROD' });
    expect(readDimensions('### Environment\n\nDEV\n', renamed)).toEqual({ environment: 'DEV' });
  });
});

// ── The template side ───────────────────────────────────────────────────────

const BUG_FORM = `name: Bug report
description: Something is not working
labels: [bug]
body:
  - type: markdown
    attributes:
      value: Thanks for filing.
  - type: textarea
    id: summary
    attributes:
      label: Summary
    validations:
      required: true
  - type: dropdown
    id: module
    attributes:
      label: Module
      options: [Checkout, Orders, Reporting, Admin]
    validations:
      required: true
  - type: dropdown
    id: env
    attributes:
      label: Environment
      options:
        - DEV
        - PROD
    validations:
      required: true
`;

describe('an issue form', () => {
  const form = parseIssueForm('bug_report.yml', BUG_FORM) as IssueForm;

  it('reads the form itself', () => {
    expect(form.name).toBe('Bug report');
    expect(form.labels).toEqual(['bug']);
  });

  it('reads a dropdown and its enumerated values', () => {
    /* The fact the whole board rests on: there are four modules and no fifth,
       and dkgh did not have to guess that. */
    const module = form.fields.find(f => f.label === 'Module');
    expect(module?.options).toEqual(['Checkout', 'Orders', 'Reporting', 'Admin']);
    expect(module?.required).toBe(true);
  });

  it('reads both YAML list spellings', () => {
    expect(form.fields.find(f => f.label === 'Environment')?.options).toEqual(['DEV', 'PROD']);
  });

  it('drops markdown blocks, which hold no answer', () => {
    expect(form.fields.some(f => f.type === 'markdown')).toBe(false);
  });

  it('keeps a textarea, which has a heading but no options', () => {
    const summary = form.fields.find(f => f.label === 'Summary');
    expect(summary?.type).toBe('textarea');
    expect(summary?.options).toEqual([]);
  });
});

describe('a form that will not parse', () => {
  it('names the file and the offending field rather than throwing', () => {
    const bad = `name: Enhancement
body:
  - type: dropdown
    attributes:
      label: Priority
      options: "High, Medium, Low"
`;
    const result = parseIssueForm('enhancement.yml', bad);
    expect('fields' in result).toBe(false);
    const err = result as { file: string; message: string };
    expect(err.file).toBe('enhancement.yml');
    expect(err.message).toMatch(/options/);
    expect(err.message).toMatch(/Priority/);
  });

  it('reports a line number for broken YAML', () => {
    const result = parseIssueForm('broken.yml', 'name: X\nbody:\n  - type: [unclosed\n') as { line?: number };
    expect(result.line).toBeGreaterThan(0);
  });

  it('says plainly when a file is not an issue form', () => {
    const result = parseIssueForm('PULL_REQUEST_TEMPLATE.md', '## Checklist\n- [ ] tests\n') as { message: string };
    expect(result.message).toMatch(/not an issue form/);
  });
});

describe('a directory of forms', () => {
  const parsed = parseIssueForms([
    { file: 'bug_report.yml', text: BUG_FORM },
    { file: 'enhancement.yml', text: 'name: E\nbody:\n  - type: dropdown\n    attributes:\n      label: P\n      options: "a, b"\n' },
    { file: 'config.yml', text: 'blank_issues_enabled: false\n' },
  ]);

  it('keeps the good ones when one is broken', () => {
    /* A repository with three templates and one typo should get two working
       dimensions, not none. */
    expect(parsed.forms.map(f => f.file)).toEqual(['bug_report.yml']);
    expect(parsed.errors.map(e => e.file)).toEqual(['enhancement.yml']);
  });

  it('skips config.yml, which is settings and not a form', () => {
    expect(parsed.errors.some(e => e.file === 'config.yml')).toBe(false);
    expect(parsed.forms.some(f => f.file === 'config.yml')).toBe(false);
  });
});

describe('proposing board dimensions', () => {
  const { forms } = parseIssueForms([{ file: 'bug_report.yml', text: BUG_FORM }]);
  const proposed = proposeDimensions(forms);

  it('finds Module and Environment', () => {
    expect(proposed.map(p => p.dimension)).toEqual(['module', 'environment']);
  });

  it('carries the heading to read and the values to expect', () => {
    const module = proposed.find(p => p.dimension === 'module')!;
    expect(module.heading).toBe('Module');
    expect(module.options).toEqual(['Checkout', 'Orders', 'Reporting', 'Admin']);
  });

  it('accepts a repository that calls it Component or Area', () => {
    const alt = parseIssueForm('a.yml',
      'name: A\nbody:\n  - type: dropdown\n    attributes:\n      label: Component\n      options: [Web, API]\n') as IssueForm;
    expect(proposeDimensions([alt])[0].dimension).toBe('module');
  });

  it('does not propose a free-text field', () => {
    /*
      A textarea called "Module" holds whatever somebody typed. Grouping by it
      gives one column per issue, which is worse than no dimension at all.
    */
    const text = parseIssueForm('t.yml',
      'name: T\nbody:\n  - type: input\n    attributes:\n      label: Module\n') as IssueForm;
    expect(proposeDimensions([text])).toEqual([]);
  });

  it('unions the values when two forms declare the same dimension', () => {
    const a = parseIssueForm('a.yml', 'name: A\nbody:\n  - type: dropdown\n    attributes:\n      label: Module\n      options: [Checkout, Orders]\n') as IssueForm;
    const b = parseIssueForm('b.yml', 'name: B\nbody:\n  - type: dropdown\n    attributes:\n      label: Module\n      options: [Orders, Admin]\n') as IssueForm;
    const p = proposeDimensions([a, b])[0];
    expect(p.options).toEqual(['Checkout', 'Orders', 'Admin']);
    expect(p.files).toEqual(['a.yml', 'b.yml']);
  });

  it('returns a stable order regardless of the order the forms declared them', () => {
    /* So the Repository screen does not reshuffle between reads. */
    const f = parseIssueForm('x.yml',
      'name: X\nbody:\n  - type: dropdown\n    attributes:\n      label: Environment\n      options: [DEV]\n  - type: dropdown\n    attributes:\n      label: Module\n      options: [A]\n') as IssueForm;
    expect(proposeDimensions([f]).map(p => p.dimension)).toEqual(['module', 'environment']);
  });
});

describe('the two halves meeting', () => {
  it('a form-derived map reads a real submitted body', () => {
    /*
      The loop that has to close: the schema comes from the YAML, the value
      comes from the body, and the heading is what joins them. If this test
      fails the board fills with issues it cannot read.
    */
    const { forms } = parseIssueForms([{ file: 'bug_report.yml', text: BUG_FORM }]);
    const map = headingMap(proposeDimensions(forms));
    expect(readDimensions(SUBMITTED, map)).toEqual({ module: 'Checkout', environment: 'PROD' });
  });
});
