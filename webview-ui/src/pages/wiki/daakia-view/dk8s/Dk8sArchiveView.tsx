/**
 * The archived half: telling dk8s where a pod's older logs actually live.
 */
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, WikiTable, Callout, Divider, Code, CodeBlock,
  chips, TocBar, type TocItem,
} from '../shared/WikiShared';

const TOC_ITEMS: TocItem[] = [
  { id: 'ar-why', emoji: '🗃️', label: 'Why' },
  { id: 'ar-mounts', emoji: '📁', label: 'Mounts & templates' },
  { id: 'ar-tokens', emoji: '🏷️', label: 'Tokens' },
  { id: 'ar-probe', emoji: '🔎', label: 'The probe' },
  { id: 'ar-zone', emoji: '🕐', label: 'Timestamps' },
];

export function Dk8sArchiveView() {
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="🗃️"
          title="dk8s — archived logs"
          subtitle="kubectl reaches two containers. A volume holds everything before that — this is how dk8s finds it."
          chips={chips(['mounts', 'templates', 'layouts', 'probe', 'log timezone'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <SectionTitle id="ar-why" emoji="🗃️">Why this exists</SectionTitle>
        <p className="dw-p">
          <Code>kubectl logs</Code> reaches the running container and the one before it. Everything
          older is gone as far as the API is concerned. A pod that ships its logs to a volume still
          has that history — dk8s reads it directly, as files, and treats it as the other half of
          the same log rather than a separate feature.
        </p>
        <Callout type="info" title="Configured once, used everywhere">
          Once a mount is set, log search, whole-log export and search export all include the
          archive automatically, each reporting it as its own row or its own file. There is no
          per-search switch to forget.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="ar-mounts" emoji="📁">Mounts and templates</SectionTitle>
        <p className="dw-p">
          A <strong>mount</strong> is a directory dk8s can read — an NFS share, a synced copy, a
          local folder. A <strong>template</strong> says where a given pod's files sit inside it.
        </p>
        <CodeBlock label="a template, expanded per pod" lang="text">{`template:   {app}-{env}-pvc/**/{app}*.log*

pv-billing  in  dk8s-test   →   pv-billing-prod-pvc/pv-billing.log
                                pv-billing-prod-pvc/archived/pv-billing-2026-08-30.log
                                pv-billing-prod-pvc/archived/pv-billing-2026-08-29.log.gz`}</CodeBlock>
        <p className="dw-p">
          <Code>**</Code> matches zero directories as well as many, which is what lets one template
          cover the live file at the claim's root and the rotated ones under <Code>archived/</Code>.
          A template without it finds only one of the two, and which one it misses depends on where
          the wildcard was put.
        </p>
        <WikiTable
          headers={['Setting', 'What it does']}
          rows={[
            ['Mounts', 'One or more roots, each with a label. All are searched'],
            ['Template', 'The per-pod path, relative to each mount'],
            ['Pattern', 'A regex over the mount-relative path, for anything the template misses'],
            ['File extensions', <>Matched anywhere in the name, so <Code>.log</Code> also admits <Code>.log.gz</Code> and <Code>.log.1</Code></>],
            ['Ignore files older than', <>Days. <Code>0</Code> searches everything</>],
            ['Layouts', 'Saved templates, offered beside the shipped ones — a layout is only meaningful next to the mounts it describes'],
          ]}
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="ar-tokens" emoji="🏷️">Tokens</SectionTitle>
        <WikiTable
          headers={['Token', 'Resolves to']}
          rows={[
            [<Code>{'{namespace}'}</Code>, 'The pod’s namespace'],
            [<Code>{'{pod}'}</Code>, 'The full pod name, replica suffix and all'],
            [<Code>{'{app}'}</Code>, 'The workload behind the pod — the Deployment, not the replica. Overridable per pod where the derivation gets it wrong'],
            [<Code>{'{env}'}</Code>, <>Mapped per context. Unmapped it expands to <Code>*</Code>, which still finds the files — it just searches more of them</>],
            [<Code>{'{date}'}</Code>, 'A date component in the path'],
          ]}
        />
        <Callout type="tip" title="{app} and {env} are assumptions, and can be overridden">
          They assume the claim is named after the workload and the environment. Where that is not
          true, both have per-pod and per-context overrides — and the override values are themselves
          templates, so globs still work inside them.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="ar-probe" emoji="🔎">The probe</SectionTitle>
        <p className="dw-p">
          The probe answers “is this right, now?” — it walks the configured mounts and reports what
          it actually found: how many files, how big, the oldest and newest, and a real sample of
          paths.
        </p>
        <WikiTable
          headers={['Behaviour', 'Why']}
          rows={[
            ['Every mount is probed, not just the first', 'A config with a working prod volume and a mistyped dev one should say exactly that, rather than reporting “ok” and quietly searching half of what was asked for'],
            ['Never answers from cache', 'A probe is you asking about the state right now, so it cannot answer from a walk made before you changed the path'],
            ['Shows the files it found', 'A count alone cannot tell you the template matched the wrong thing; a list of paths can'],
            ['Reports how much of the walk is shown', 'No silent truncation — if the sample is a subset, it says so'],
          ]}
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="ar-zone" emoji="🕐">Timestamps, and whose clock</SectionTitle>
        <p className="dw-p">
          A line like <Code>2026-08-30 06:32:25</Code> names no zone, so turning it into an instant
          means assuming one. <strong>“These logs are written in”</strong> is that assumption, stated
          rather than guessed. It defaults to UTC, which is what a container writes unless told
          otherwise.
        </p>
        <Callout type="warn" title="What it looks like when this is wrong">
          A pod writing UTC, read by someone on CST, lands every archived line five hours from where
          it belongs. A search for the last hour returns nothing while the log plainly holds
          matches; a window over a past day returns the wrong day's. Nothing on screen shows the
          mistake, because the line and the window each look correct on their own.
        </Callout>
        <p className="dw-p">
          Lines carrying their own <Code>Z</Code> or <Code>+05:30</Code> are already unambiguous and
          ignore the setting entirely — it only ever fills in what the log left out. The dates you
          type into a search are on your own device's clock and need no configuration.
        </p>
      </div>
    </WikiScrollPage>
  );
}
