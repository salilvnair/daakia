# dkgh.css is generated

`webview-ui/src/components/dkgh/dkgh.css` is **not hand-edited**. It is built
from the mock, and the whole point of the dkgh tab is that it matches
`plan/daakia_wiki/dkgh-mock.html` inch for inch. A hand edit to the output is
lost the next time anybody regenerates, and — worse — it drifts from the mock
silently.

```bash
python scripts/dkgh-css/build.py \
  scripts/dkgh-css/mock.css \
  scripts/dkgh-css/header.css \
  scripts/dkgh-css/additions.css \
  webview-ui/src/components/dkgh/dkgh.css
```

## The three inputs, and why the order is load-bearing

| file | what it is |
|---|---|
| `header.css` | the root, the `--dk-*` tokens, the light-theme overrides, the resets |
| `mock.css` | the mock's own `<style>` block, extracted verbatim |
| `additions.css` | everything the mock did not have to think about |

They are concatenated **in that order**, and `additions.css` goes last on
purpose. It was above the mock's rules once, and a rule with the same
specificity that comes first loses — so `.compose .right { width: auto }` was
silently beaten by the mock's `width: 238px` and the metadata column would not
stretch with its split. Anything meant to win has to be able to.

## The scale

Every `px` length in `mock.css` is multiplied by **1.2**. The mock is drawn at
a fixed figure width where 12px reads fine; the real tab is a full panel and
the same numbers read small. One factor keeps every proportion the mock chose
and simply makes the whole thing bigger.

Hairlines are left alone — a 1px border scaled to 1.2px is a blurry 1px
border — and so is anything `>= 999px`, which is a pill radius rather than a
measurement.

## What belongs in `additions.css`

Everything a mock never has to answer for, and nothing else:

- **Interaction.** The mock never hovers, focuses or presses. Cursors, hover
  tints, focus rings and disabled states are all here.
- **Real form controls.** `.inp` is a `<div>` with a fake placeholder in the
  mock, because a mock never types. A real one is an `<input>`, which brings a
  font and a focus ring of the browser's choosing, and `.inp.focus` — a class a
  mock can hand-apply — has to become a real `:focus`.
- **Rules the mock draws once.** `.note` has no bottom margin because the mock
  never stacks two; `.sub` is scoped to `.opt` because that is the only place
  the mock puts one.
- **The app's own context.** `.dkgh { min-height: 0 }` exists because the tab
  is a flex item and a flex item's `min-height` defaults to `auto`, which meant
  the root grew past its host and nothing inside it could scroll.
- **dui components that portal.** A `ModalView` renders on `document.body`,
  where nothing is under `.dkgh`; the wrapper for that is `Dk` in
  `GhShell.tsx`, and the rules its contents need are here.

## When the mock changes

Re-extract the `<style>` block from `plan/daakia_wiki/dkgh-mock.html` into
`mock.css`, rebuild, and read the diff. A rule that disappears from the mock
should disappear from the output, which is exactly what a hand-edited
stylesheet cannot give you.
