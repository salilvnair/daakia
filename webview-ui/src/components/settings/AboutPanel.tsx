/**
 * About Daakia — what this is, which version you are on, and what changed.
 *
 * Three questions, in the order people ask them: what am I running, what is
 * new in it, and what came before. Anything else — the licence, the source,
 * the marketplace listing — is a link rather than a paragraph, because nobody
 * reads an About screen for prose.
 *
 * The version is the extension manifest's, injected at build time. A version
 * typed into the webview would be a second source of truth for the one fact
 * this screen exists to state.
 */
import { useState } from 'react';
import {
  BadgeChipView, ButtonView, CalloutView, CopyButtonView, TimelineView, IconSize,
} from '@salilvnair/dui';
import {
  Dk8sIcon, GitHubIcon, SparkleIcon, GlobeIcon, BookOpenIcon, ChevronDownIcon,
  ChevronRightIcon, CheckIcon, BugIcon, DaakiaMarkIcon,
} from '../../icons';
import { RELEASES, CURRENT_RELEASE, formatReleaseDate, type ReleaseKind } from './release-notes';

const ACCENT = 'var(--color-primary)';

/* One tone per kind, so a page of lines can be read by colour before it is
   read by word: what is new, what was broken, what moved. */
const KIND: Record<ReleaseKind, { label: string; tone: string }> = {
  feature: { label: 'new', tone: 'var(--color-success)' },
  fix: { label: 'fixed', tone: 'var(--color-warning)' },
  change: { label: 'changed', tone: 'var(--color-info)' },
};

/** What the product is, said once, in the words its own screens use. */
const PILLARS = [
  {
    icon: <GlobeIcon size={IconSize.state} />,
    title: 'Every protocol, one client',
    body: 'REST, GraphQL, gRPC, SOAP, WebSocket, SSE, MQTT and Socket.IO — '
      + 'collections, environments and history shared across all of them.',
  },
  {
    icon: <Dk8sIcon size={IconSize.state} />,
    title: 'dk8s — clusters without leaving the editor',
    body: 'Watch pods across contexts, read and search logs, open a shell, browse a '
      + 'container’s filesystem, and read heap, thread and flight-recorder dumps in place.',
  },
  {
    icon: <GitHubIcon size={IconSize.state} />,
    title: 'dkgh — issues and boards where the code is',
    body: 'A board, a table and a roadmap over your repository’s issues, through the '
      + 'GitHub CLI you already have signed in.',
  },
  {
    icon: <SparkleIcon size={IconSize.state} />,
    title: 'AI that shows its work',
    body: 'Every call names its prompt, its evidence and what was redacted before it '
      + 'left the machine — and the audit keeps the request and the response in full.',
  },
];

function Line({ kind, area, text }: { kind: ReleaseKind; area: string; text: string }) {
  const k = KIND[kind];
  return (
    <div className="flex items-start gap-2.5 py-1">
      <BadgeChipView tone={k.tone} size="xs" style={{ marginTop: 1, width: 54 }}>
        {k.label}
      </BadgeChipView>
      <span className="text-[10.5px] font-mono shrink-0" style={{ color: 'var(--color-text-muted)', width: 78, marginTop: 2 }}>
        {area}
      </span>
      <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
        {text}
      </span>
    </div>
  );
}

export function AboutPanel() {
  /* Collapsed by default: the current release is the page, and the ones before
     it are there for the person who wants to know when something changed. */
  const [openVersions, setOpenVersions] = useState<string[]>([]);
  const toggle = (v: string) =>
    setOpenVersions(o => (o.includes(v) ? o.filter(x => x !== v) : [...o, v]));

  const older = RELEASES.slice(1);

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
      <div className="flex flex-col gap-6 px-6 py-5" style={{ maxWidth: 860 }}>

        {/* ── What you are running ── */}
        <div className="flex items-start gap-4">
          {/*
            The product's own mark, not an icon that stands for it.

            This was a Layers glyph in the accent colour, which is the drawing
            you reach for when you have not got the real one — and the real one
            is right there in the repository, on the Marketplace listing and in
            the activity bar. An About screen showing something other than the
            icon the reader clicked to get here is the one place that cannot
            afford a stand-in. The tile behind it is neutral, because the mark
            brings its own colours.
          */}
          <div
            className="grid place-items-center shrink-0"
            style={{
              width: 72, height: 72, borderRadius: 20,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
            }}
          >
            <DaakiaMarkIcon size={46} />
          </div>

          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h1 className="m-0 text-[21px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Daakia
              </h1>
              <BadgeChipView tone={ACCENT} size="md" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {__APP_VERSION__}
              </BadgeChipView>
              <CopyButtonView text={`Daakia ${__APP_VERSION__}`} size="xs" />
            </div>
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
              An API client that lives in the editor — and, since 3.0, a Kubernetes console
              and a GitHub board beside it. Everything runs on this machine: requests,
              log searches and dump analysis never leave it, and the one thing that does
              — an AI call — says so first and shows you what it sent.
            </p>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <ButtonView
                label="Marketplace listing" size="sm" variant="secondary"
                iconLeft={<BookOpenIcon size={IconSize.action} />}
                onClick={() => window.open('https://marketplace.visualstudio.com/items?itemName=salilvnair.daakia', '_blank')}
              />
              <ButtonView
                label="Source on GitHub" size="sm" variant="secondary"
                iconLeft={<GitHubIcon size={IconSize.action} />}
                onClick={() => window.open('https://github.com/salilvnair/daakia', '_blank')}
              />
              <ButtonView
                label="Report an issue" size="sm" variant="secondary"
                iconLeft={<BugIcon size={IconSize.action} />}
                onClick={() => window.open('https://github.com/salilvnair/daakia/issues/new', '_blank')}
              />
            </div>
          </div>
        </div>

        {/* ── What it is ── */}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))' }}>
          {PILLARS.map(p => (
            <div key={p.title} className="flex items-start gap-3 px-3.5 py-3 rounded-lg"
                 style={{
                   background: 'var(--color-surface)',
                   border: '1px solid var(--color-surface-border)',
                 }}>
              <span style={{ color: ACCENT, flexShrink: 0, marginTop: 1 }}>{p.icon}</span>
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {p.title}
                </span>
                <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                  {p.body}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── What is new ── */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2.5">
            <h2 className="m-0 text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              New in {CURRENT_RELEASE.version}
            </h2>
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {formatReleaseDate(CURRENT_RELEASE.date)}
            </span>
          </div>

          <CalloutView variant="info" title={`Daakia ${CURRENT_RELEASE.version}`}>
            {CURRENT_RELEASE.headline}
          </CalloutView>

          <div className="flex flex-col rounded-lg px-3.5 py-2.5"
               style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
            {CURRENT_RELEASE.lines.map((l, i) => <Line key={i} {...l} />)}
          </div>
        </div>

        {/* ── What came before ── */}
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Version history
          </h2>

          {/*
            A timeline for the shape of it — when each release landed and what
            it was for — with the detail behind a disclosure on each. Six
            releases fully expanded is a wall nobody reads; six headlines is a
            history somebody can scan and then open one of.
          */}
          <TimelineView
            color={ACCENT}
            entries={older.map(r => ({
              id: r.version,
              icon: openVersions.includes(r.version)
                ? <ChevronDownIcon size={IconSize.inline} />
                : <ChevronRightIcon size={IconSize.inline} />,
              title: (
                <button
                  type="button"
                  onClick={() => toggle(r.version)}
                  className="flex items-baseline gap-2.5 cursor-pointer border-none bg-transparent p-0 text-left"
                >
                  <span className="text-[12.5px] font-semibold font-mono" style={{ color: 'var(--color-text-primary)' }}>
                    {r.version}
                  </span>
                  <span className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {r.headline}
                  </span>
                </button>
              ),
              timestamp: formatReleaseDate(r.date),
              content: openVersions.includes(r.version) ? (
                <div className="flex flex-col mt-1">
                  {r.lines.map((l, i) => <Line key={i} {...l} />)}
                </div>
              ) : undefined,
            }))}
          />
        </div>

        {/* ── The small print, which is small ── */}
        <div className="flex items-center gap-2 pt-1 pb-2 text-[11px]"
             style={{ color: 'var(--color-text-muted)' }}>
          <CheckIcon size={IconSize.inline} />
          <span>
            Built by Salil V Nair · MIT licensed · {RELEASES.length} releases since{' '}
            {formatReleaseDate(RELEASES[RELEASES.length - 1].date)}
          </span>
        </div>
      </div>
    </div>
  );
}
