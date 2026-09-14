/**
 * kubectl is not here — or it is, and dk8s cannot see it.
 *
 * A toast saying "kubectl not found" is a dead end. This is the one screen in
 * dk8s that has to be genuinely useful to somebody who has never installed it,
 * and genuinely useful to somebody who installed it an hour ago and is
 * furious that it works in their terminal.
 *
 * ── Why three tabs and not one ──
 *
 * It used to show only what the host reported this machine to be. That is
 * right nine times in ten and useless the tenth: a Windows machine driving a
 * Linux dev container, somebody reading over a shoulder, a screenshot pasted
 * into a ticket for a colleague on a Mac. The detected platform opens first
 * and is marked; the other two are one click, not a different machine.
 *
 * ── Why the explicit path is not hidden ──
 *
 * "Works in my terminal, not in the extension" is the commonest way to arrive
 * here on a machine that already has kubectl: on macOS a GUI-launched editor
 * inherits a login shell's PATH only sometimes. The person is right and the
 * tool is wrong, so the fix is a panel of its own rather than a link at the
 * bottom — and once a path is set, this screen leads with it, because an
 * install list is advice for a problem you do not have.
 */
import { useEffect, useState } from 'react';
import { ButtonView, CopyButtonView, TextInputView } from '@salilvnair/dui';
import { useK8sStore } from '../../store/k8s-store';
import { softPrimary } from './button-style';
import {
  Dk8sIcon, TerminalIcon, DownloadIcon, RefreshIcon, SearchIcon, WarningTriangleIcon,
  FolderOpenIcon, CheckCircleIcon,
} from '../../icons';
import { ACCENT } from './tone';

type Plat = 'win32' | 'darwin' | 'linux';

const PLATS: Plat[] = ['win32', 'darwin', 'linux'];
const LABEL: Record<Plat, string> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
/** What a command line starts with, so a copied line reads like its shell. */
const PROMPT: Record<Plat, string> = { win32: '>', darwin: '$', linux: '$' };

export interface Route {
  title: string;
  /** `recommended` is highlighted; anything else is a quiet label. */
  tag?: string;
  command?: string;
  /**
   * Clicks, not a command.
   *
   * "Settings → Kubernetes → Enable Kubernetes" behind a `$` with a copy
   * button beside it is an invitation to paste it into a shell and watch it
   * fail. A route that is a path through somebody else's UI is drawn as one.
   */
  ui?: boolean;
  /** A download, when there is no package manager to ask. */
  file?: string;
  note?: string;
}

/**
 * Every route each platform actually has, including the plain download.
 *
 * The locked-down corporate laptop with no package manager is the machine most
 * likely to reach this screen, and telling it to run winget is telling it
 * nothing.
 */
export const ROUTES: Record<Plat, Route[]> = {
  win32: [
    { title: 'winget', tag: 'recommended', command: 'winget install -e --id Kubernetes.kubectl',
      note: 'Ships with Windows 11. No admin prompt on most machines.' },
    { title: 'Chocolatey', command: 'choco install kubernetes-cli',
      note: 'Needs an elevated shell.' },
    { title: 'Scoop', command: 'scoop install kubectl',
      note: 'If Scoop is already how you keep your dev tools.' },
    { title: 'Docker Desktop', tag: 'cluster too', ui: true,
      command: 'Settings → Kubernetes → Enable Kubernetes',
      note: 'Installs kubectl and a local single-node cluster together — the shortest path to having something to point dk8s at.' },
    { title: 'Download', file: 'kubectl.exe',
      note: 'curl -LO "https://dl.k8s.io/release/v1.31.0/bin/windows/amd64/kubectl.exe", then put it somewhere on PATH — for a machine with no package manager.' },
  ],
  darwin: [
    { title: 'Homebrew', tag: 'recommended', command: 'brew install kubectl',
      note: 'What almost every Mac dev machine already has.' },
    { title: 'MacPorts', command: 'sudo port install kubectl',
      note: 'If MacPorts is the one you keep up to date.' },
    { title: 'Docker Desktop', tag: 'cluster too', ui: true,
      command: 'Settings → Kubernetes → Enable Kubernetes',
      note: 'kubectl and a local cluster in one, already on the Mac if you build images.' },
    { title: 'Download', file: 'kubectl',
      note: 'curl -LO "https://dl.k8s.io/release/v1.31.0/bin/darwin/arm64/kubectl" — swap arm64 for amd64 on an Intel Mac — then chmod +x and move it onto PATH.' },
  ],
  linux: [
    { title: 'Debian · Ubuntu', tag: 'apt', command: 'sudo apt-get install -y kubectl',
      note: 'Needs the Kubernetes apt repository; without it apt has no such package.' },
    { title: 'Fedora · RHEL', command: 'sudo dnf install -y kubectl' },
    { title: 'Arch', command: 'sudo pacman -S kubectl' },
    { title: 'Snap', command: 'sudo snap install kubectl --classic',
      note: 'Classic confinement, because it has to read your kubeconfig.' },
    { title: 'Download', tag: 'no sudo', file: 'kubectl',
      command: 'curl -LO "https://dl.k8s.io/release/$(curl -Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"',
      note: 'Works in a container and on a machine with no root: chmod +x kubectl and put it anywhere on PATH — or point dk8s straight at it below.' },
  ],
};

/** Fetching credentials for a cluster, once kubectl is there but empty. */
const CREDENTIALS: Route[] = [
  { title: 'Azure · AKS', command: 'az aks get-credentials --resource-group <rg> --name <cluster>' },
  { title: 'AWS · EKS', command: 'aws eks update-kubeconfig --region <region> --name <cluster>' },
  { title: 'Google · GKE', command: 'gcloud container clusters get-credentials <cluster> --region <region>' },
  { title: 'Docker Desktop', command: 'kubectl config use-context docker-desktop',
    note: 'Already there if you enabled Kubernetes in Docker Desktop.' },
];

const DOCS = 'https://kubernetes.io/docs/tasks/tools/';

// ── Pieces ──────────────────────────────────────────────────────────────────

function Card({ children, tone }: { children: React.ReactNode; tone?: 'accent' | 'warn' }) {
  const edge = tone === 'accent' ? ACCENT : tone === 'warn' ? 'var(--color-warning)' : undefined;
  return (
    <div
      className="flex flex-col gap-2 rounded-lg px-3.5 py-3"
      style={{
        background: edge ? `color-mix(in srgb, ${edge} 7%, var(--color-surface))` : 'var(--color-surface)',
        border: `1px solid ${edge ? `color-mix(in srgb, ${edge} 32%, transparent)` : 'var(--color-surface-border)'}`,
      }}
    >
      {children}
    </div>
  );
}

function Tag({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  const tone = strong ? ACCENT : 'var(--color-text-muted)';
  return (
    <span
      className="text-[9.5px] uppercase tracking-wider px-1.5 rounded"
      style={{
        color: tone,
        border: `1px solid color-mix(in srgb, ${tone} 40%, transparent)`,
        background: `color-mix(in srgb, ${tone} 10%, transparent)`,
        lineHeight: '15px',
      }}
    >
      {children}
    </span>
  );
}

/** One install route: what it is called, the line to run, and the caveat. */
function RouteCard({ route, plat }: { route: Route; plat: Plat }) {
  const strong = route.tag === 'recommended';
  return (
    <Card tone={strong ? 'accent' : undefined}>
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {route.title}
        </span>
        {route.tag && <Tag strong={strong}>{route.tag}</Tag>}
        <span className="flex-1" />
        {route.command && !route.ui && (
          <CopyButtonView text={route.command} title={`Copy the ${route.title} command`} accentColor={ACCENT} />
        )}
      </div>

      {route.command && route.ui ? (
        /* A path through Docker Desktop's own settings — no prompt, because it
           is not a line you can run. */
        <div className="flex items-center gap-2 text-[12px]"
             style={{ color: 'var(--color-text-secondary)' }}>
          <FolderOpenIcon size={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <span>{route.command}</span>
        </div>
      ) : route.command ? (
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded font-mono text-[11.5px]"
          style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)' }}
        >
          <span style={{ color: ACCENT, userSelect: 'none' }}>{PROMPT[plat]}</span>
          <span className="break-all">{route.command}</span>
        </div>
      ) : (
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded font-mono text-[11.5px]"
          style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}
        >
          <DownloadIcon size={13} />
          <span className="break-all">{route.file}</span>
        </div>
      )}

      {route.note && (
        <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {route.note}
        </span>
      )}
    </Card>
  );
}

// ── The screen ──────────────────────────────────────────────────────────────

export function KubectlSetupGuide({ mode }: { mode: 'no-kubectl' | 'no-contexts' }) {
  const platform = useK8sStore(s => s.platform);
  const env = useK8sStore(s => s.env);
  const busy = useK8sStore(s => s.busy);
  const probe = useK8sStore(s => s.probe);
  const setKubectlPath = useK8sStore(s => s.setKubectlPath);

  const detected: Plat = PLATS.includes(platform as Plat) ? (platform as Plat) : 'linux';
  const [plat, setPlat] = useState<Plat>(detected);
  /* The host's answer can arrive after the first render — follow it until
     somebody picks a tab themselves, which is what `touched` records. */
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (!touched) setPlat(detected); }, [detected, touched]);

  const override = env?.override;
  const [path, setPath] = useState('');
  /* Open when a path is already in force: it is then the most likely thing to
     be wrong, and the first thing worth reading. The host's answer arrives
     after the first render, so this follows it rather than reading it once. */
  const [locating, setLocating] = useState(false);
  useEffect(() => { if (override) setLocating(true); }, [override]);

  const missing = mode === 'no-kubectl';

  return (
    <div className="flex-1 overflow-auto flex justify-center px-6 py-7"
         style={{ scrollbarGutter: 'stable' }}>
      <div className="flex flex-col gap-4" style={{ maxWidth: 720, width: '100%' }}>

        {/* ── What is wrong ── */}
        <div className="flex items-start gap-3">
          <span
            className="grid place-items-center shrink-0"
            style={{
              width: 40, height: 40, borderRadius: 11, color: ACCENT,
              background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${ACCENT} 26%, transparent)`,
            }}
          >
            {missing ? <TerminalIcon size={19} /> : <Dk8sIcon size={19} />}
          </span>
          <div className="flex flex-col gap-1.5 min-w-0">
            <h2 className="m-0 text-[17px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {missing ? 'dk8s needs kubectl' : 'No clusters configured'}
            </h2>
            <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {missing
                ? 'dk8s drives kubectl rather than reimplementing Kubernetes authentication, so it inherits whatever access already works in your terminal — your credentials never reach Daakia. It could not find the binary.'
                : 'kubectl is installed, but your kubeconfig has no contexts, so there is nothing to point dk8s at yet. Fetch credentials for a cluster:'}
            </p>
          </div>
        </div>

        {/*
          A path that was set by hand and did not work comes first. Everything
          below is advice for a machine without kubectl, and this machine may
          well have it.
        */}
        {missing && override && (
          <Card tone="warn">
            <div className="flex items-center gap-2">
              <WarningTriangleIcon size={14} style={{ color: 'var(--color-warning)' }} />
              <span className="text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {env?.overrideFromEnv ? 'DAAKIA_KUBECTL is set' : 'A path was set by hand'}
              </span>
              <span className="flex-1" />
              {!env?.overrideFromEnv && (
                <ButtonView
                  label="Clear it"
                  size="xs"
                  variant="secondary"
                  onClick={() => { setKubectlPath(''); setPath(''); }}
                />
              )}
            </div>
            <code className="text-[11.5px] font-mono break-all" style={{ color: 'var(--color-text-secondary)' }}>
              {override}
            </code>
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Only that was tried — nothing else was looked at.
              {env?.overrideFromEnv && ' It comes from the environment, so it cannot be cleared here.'}
            </span>
          </Card>
        )}

        {/* ── Install, by platform ── */}
        {missing && (
          <>
            <div className="flex items-center gap-1 p-0.5 rounded-lg self-start"
                 style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
              {PLATS.map(p => {
                const on = p === plat;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setTouched(true); setPlat(p); }}
                    title={p === detected ? 'What this machine reports' : undefined}
                    className="text-[12px] px-3 py-1 rounded-md cursor-pointer"
                    style={{
                      border: 'none',
                      color: on ? ACCENT : 'var(--color-text-secondary)',
                      background: on ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent',
                      fontWeight: on ? 600 : 400,
                    }}
                  >
                    {LABEL[p]}
                    {p === detected && (
                      <span style={{ color: ACCENT, marginLeft: 5, opacity: on ? 1 : 0.6 }}>·</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2.5">
              {ROUTES[plat].map(r => <RouteCard key={r.title} route={r} plat={plat} />)}
            </div>
          </>
        )}

        {/* ── Or fetch credentials, when kubectl is there ── */}
        {!missing && (
          <div className="flex flex-col gap-2.5">
            {CREDENTIALS.map(r => <RouteCard key={r.title} route={r} plat={detected} />)}
          </div>
        )}

        {/* ── Where it looked ── */}
        {missing && env?.triedPaths?.length ? (
          <Card>
            <div className="flex items-center gap-2">
              <SearchIcon size={13} style={{ color: 'var(--color-text-muted)' }} />
              <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Where it looked
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {env.triedPaths.map(p => (
                <code key={p} className="text-[11px] font-mono break-all" style={{ color: 'var(--color-text-muted)' }}>
                  {p}
                </code>
              ))}
            </div>
          </Card>
        ) : null}

        {/* ── I already have it ── */}
        {missing && (
          <Card tone={locating ? 'accent' : undefined}>
            <button
              type="button"
              onClick={() => setLocating(v => !v)}
              className="flex items-center gap-2 cursor-pointer bg-transparent border-none p-0 text-left"
            >
              <FolderOpenIcon size={14} style={{ color: ACCENT }} />
              <span className="text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                I already have it — point dk8s at the binary
              </span>
            </button>

            {locating && (
              <>
                <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                  Run <code className="font-mono">{plat === 'win32' ? 'where kubectl' : 'which kubectl'}</code>{' '}
                  in your terminal and paste what it prints. A GUI-launched editor inherits a login
                  shell&rsquo;s PATH only sometimes, which is the whole of &ldquo;works in my terminal,
                  not in the extension&rdquo;.
                </span>
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0">
                    <TextInputView
                      value={path}
                      onChange={e => setPath(e.target.value)}
                      placeholder={plat === 'win32'
                        ? 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\kubectl.exe'
                        : '/usr/local/bin/kubectl'}
                      size="sm"
                      /* Fills the row: a path is long and a narrow box shows a
                         third of it. */
                      width="fullWidth"
                      accentColor={ACCENT}
                    />
                  </span>
                  <ButtonView
                    label="Use this"
                    size="sm"
                    variant="secondary"
                    accentColor={ACCENT}
                    color={!path.trim() || busy ? 'var(--color-text-muted)' : ACCENT}
                    disabled={!path.trim() || busy}
                    onClick={() => setKubectlPath(path.trim())}
                    style={softPrimary(ACCENT, !!path.trim() && !busy)}
                  />
                </div>
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  Kept for next time, and changeable in Settings → DK8S → General.
                </span>
              </>
            )}
          </Card>
        )}

        {/* ── What to do next ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <ButtonView
            label={busy ? 'Checking…' : missing ? 'I installed it — check again' : 'Check again'}
            size="sm"
            variant="secondary"
            accentColor={ACCENT}
            iconLeft={busy ? undefined : <RefreshIcon size={13} />}
            color={busy ? 'var(--color-text-muted)' : ACCENT}
            disabled={busy}
            onClick={probe}
            style={softPrimary(ACCENT, !busy)}
          />
          <ButtonView
            label="Installation docs"
            size="sm"
            variant="secondary"
            onClick={() => window.open(DOCS, '_blank')}
          />
        </div>

        {/* ── The promise this screen is making ── */}
        <div className="flex items-start gap-2 pt-3 text-[11px] leading-relaxed"
             style={{ borderTop: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
          <CheckCircleIcon size={13} style={{ marginTop: 1, flexShrink: 0, color: ACCENT }} />
          <span>
            dk8s only ever reads. It passes{' '}
            <code className="font-mono" style={{ color: ACCENT }}>--context</code> on every command
            and never runs <code className="font-mono">config use-context</code>, so choosing a
            cluster here cannot change what your terminal is pointed at.
          </span>
        </div>
      </div>
    </div>
  );
}
