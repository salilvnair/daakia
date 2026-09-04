/**
 * The current object set, and the steps that produced it.
 *
 * The heap views each had their own idea of what was being looked at. The
 * histogram had a package filter, the treemap had the same string passed in
 * beside it, and the retention graph had none — so narrowing in one place and
 * switching tabs silently widened back out, and there was nowhere on screen
 * saying what the numbers on the current tab were about.
 *
 * A single set fixes both. Every view reads it, every view can narrow it, and
 * each narrowing is a step. The steps ARE the navigation model: no back
 * button, no view state to remember, just the decisions that got you here and
 * a way back to any of them.
 *
 * The set size travels with it, because "40,132 objects" is what tells you
 * whether the last step was the right one.
 */

import { decodeClassName, fullClassName } from './class-name';

export type StepKind = 'all' | 'package' | 'class' | 'search';

export interface SetStep {
  kind: StepKind;
  /** What the breadcrumb shows: `class Leak`, `package com.acme`. */
  label: string;
  /**
   * What the query layer filters on.
   *
   * One string, because that is what every heap view already takes — this is
   * a narrowing of the existing filter rather than a second mechanism beside
   * it.
   */
  filter: string;
}


export const ROOT: SetStep = { kind: 'all', label: 'all objects', filter: '' };

export type ObjectSet = SetStep[];

export const emptySet = (): ObjectSet => [ROOT];

/**
 * The filter every view should apply.
 *
 * The last step wins rather than the steps being concatenated: narrowing from
 * `com.acme` to `com.acme.order.Cart` is a move to a smaller set, not a search
 * for something matching both. Concatenating would make the second step
 * usually match nothing, which reads as "there is nothing here" rather than
 * "that was not what the step meant".
 */
export function filterOf(set: ObjectSet): string {
  for (let i = set.length - 1; i >= 0; i--) {
    if (set[i].filter) return set[i].filter;
  }
  return '';
}

/** Adds a step, unless it would repeat the one already in effect. */
export function narrow(set: ObjectSet, step: SetStep): ObjectSet {
  const last = set[set.length - 1];
  if (last && last.kind === step.kind && last.filter === step.filter) return set;
  return [...set, step];
}

/** Back to a step, dropping everything after it. */
export function backTo(set: ObjectSet, index: number): ObjectSet {
  if (index <= 0) return emptySet();
  return set.slice(0, index + 1);
}

/** A package prefix, as a step. */
export function packageStep(pkg: string): SetStep {
  return { kind: 'package', label: `package ${pkg}`, filter: pkg };
}

/**
 * One class, as a step.
 *
 * The filter is the full class name: the query layer matches on prefix, and a
 * class name is a prefix of itself plus its inner classes — which is the set
 * someone means when they click `Leak` and expect `Leak$Entry` to come with it.
 */
export function classStep(className: string): SetStep {
  /*
    Decoded, not split on dots.

    `[B` has no dot, so splitting returned `[B` and the breadcrumb read
    `class [B` — the engine's spelling of `byte[]`, in the one place meant to
    tell a person where they are. `[Ljava.lang.Object;` was worse: it split to
    `Object;`, a name of nothing.

    The FILTER is the readable form too, not just the label, so the box the
    reader can type in shows the same string it is matching on. The engine
    accepts it — see `toDescriptor` in heap-filter.
  */
  const readable = fullClassName(className);
  return {
    kind: 'class',
    label: `class ${decodeClassName(className).simpleName}`,
    filter: readable,
  };
}

/** A free-text search, as a step. */
export function searchStep(text: string): SetStep {
  return { kind: 'search', label: `matching “${text}”`, filter: text };
}

/** Whether anything has been narrowed at all. */
export const isNarrowed = (set: ObjectSet): boolean => set.length > 1;
