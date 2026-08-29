/**
 * Shown when kubectl is missing, or present but with no kubeconfig.
 *
 * A toast saying "kubectl not found" is a dead end. This is the one screen in
 * dk8s that has to be genuinely helpful to someone who has never installed it,
 * so it branches on the actual OS and gives a command they can copy.
 *
 * It also covers the subtler failure: kubectl IS installed, but the editor
 * cannot see it. On macOS a GUI-launched VS Code inherits a login shell's PATH
 * only sometimes, which produces "works in my terminal, not in the extension" —
 * hence the explicit-path escape hatch.
 */
import { useState } from 'react';
import { ButtonView, TextInputView } from '@salilvnair/dui';
import { CopyButtonView } from '@salilvnair/dui';
import { useK8sStore } from '../../store/k8s-store';

const ACCENT = 'var(--color-dk8s)';

interface Install {
  label: string;
  command: string;
  note?: string;
}

function installsFor(platform: string): Install[] {
  if (platform === 'win32') {
    return [
      { label: 'winget', command: 'winget install -e --id Kubernetes.kubectl' },
      { label: 'Chocolatey', command: 'choco install kubernetes-cli' },
      { label: 'Docker Desktop', command: 'Settings → Kubernetes → Enable Kubernetes', note: 'ships kubectl and a local cluster together' },
    ];
  }
  if (platform === 'darwin') {
    return [
      { label: 'Homebrew', command: 'brew install kubectl' },
      { label: 'MacPorts', command: 'sudo port install kubectl' },
    ];
  }
  return [
    { label: 'Debian / Ubuntu', command: 'sudo apt-get install -y kubectl' },
    { label: 'Fedora / RHEL', command: 'sudo dnf install -y kubectl' },
    { label: 'Any Linux', command: 'curl -LO "https://dl.k8s.io/release/$(curl -Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"' },
  ];
}

const CREDENTIALS: Install[] = [
  { label: 'Azure (AKS)', command: 'az aks get-credentials --resource-group <rg> --name <cluster>' },
  { label: 'AWS (EKS)', command: 'aws eks update-kubeconfig --region <region> --name <cluster>' },
  { label: 'Google (GKE)', command: 'gcloud container clusters get-credentials <cluster> --region <region>' },
  { label: 'Docker Desktop', command: 'kubectl config use-context docker-desktop' },
];

function CommandRow({ item }: { item: Install }) {
  return (
    <div className="flex flex-col gap-1 py-2" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">{item.label}</span>
        <CopyButtonView text={item.command} title={`Copy ${item.label} command`} accentColor={ACCENT} />
      </div>
      <code
        className="text-[11px] font-mono px-2 py-1.5 rounded break-all"
        style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)' }}
      >
        {item.command}
      </code>
      {item.note && (
        <span className="text-[10.5px] text-[var(--color-text-muted)]">{item.note}</span>
      )}
    </div>
  );
}

export function KubectlSetupGuide({ mode }: { mode: 'no-kubectl' | 'no-contexts' }) {
  const platform = useK8sStore(s => s.platform);
  const env = useK8sStore(s => s.env);
  const busy = useK8sStore(s => s.busy);
  const probe = useK8sStore(s => s.probe);
  const setKubectlPath = useK8sStore(s => s.setKubectlPath);
  const [manualPath, setManualPath] = useState('');
  const [showPath, setShowPath] = useState(false);

  const missing = mode === 'no-kubectl';
  const items = missing ? installsFor(platform) : CREDENTIALS;

  return (
    <div className="flex-1 overflow-auto flex justify-center px-6 py-8">
      <div className="flex flex-col gap-5" style={{ maxWidth: 560, width: '100%' }}>
        <div className="flex flex-col gap-2">
          <h2 className="text-[16px] font-semibold m-0 text-[var(--color-text-primary)]">
            {missing ? 'dk8s needs kubectl' : 'No clusters configured'}
          </h2>
          <p className="text-[12.5px] leading-relaxed m-0 text-[var(--color-text-secondary)]">
            {missing
              ? 'dk8s talks to your cluster through kubectl rather than reimplementing Kubernetes authentication, so it inherits whatever access already works in your terminal. It could not find the binary.'
              : 'kubectl is installed but your kubeconfig has no contexts, so there is no cluster to talk to yet. Fetch credentials for one:'}
          </p>
        </div>

        {missing && env?.triedPaths?.length ? (
          <div
            className="flex flex-col gap-1 p-3 rounded-md"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}
          >
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Looked in</span>
            {env.triedPaths.map(p => (
              <code key={p} className="text-[10.5px] font-mono text-[var(--color-text-muted)] break-all">{p}</code>
            ))}
          </div>
        ) : null}

        <div
          className="flex flex-col rounded-md px-3"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}
        >
          {items.map(item => <CommandRow key={item.label} item={item} />)}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ButtonView
            label={busy ? 'Checking…' : missing ? 'I installed it — check again' : 'Check again'}
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={probe}
          />
          {missing && (
            <ButtonView
              label={showPath ? 'Cancel' : 'Point me at the binary'}
              size="sm"
              variant="secondary"
              onClick={() => setShowPath(v => !v)}
            />
          )}
        </div>

        {missing && showPath && (
          <div className="flex flex-col gap-2">
            {/* The "works in my terminal but not here" case. Worth its own path
                because the user is right and the tool is wrong. */}
            <p className="text-[11.5px] m-0 text-[var(--color-text-muted)]">
              Already installed? Run <code className="font-mono">which kubectl</code>{' '}
              (or <code className="font-mono">where kubectl</code> on Windows) in your terminal and paste the result.
            </p>
            <div className="flex items-center gap-2">
              <TextInputView
                value={manualPath}
                onChange={e => setManualPath(e.target.value)}
                placeholder="/usr/local/bin/kubectl"
                size="sm"
                accentColor={ACCENT}
              />
              <ButtonView
                label="Use this"
                size="sm"
                variant="primary"
                disabled={!manualPath.trim() || busy}
                onClick={() => setKubectlPath(manualPath.trim())}
              />
            </div>
          </div>
        )}

        <p className="text-[11px] m-0 leading-relaxed text-[var(--color-text-muted)]" style={{ borderTop: '1px solid var(--color-surface-border)', paddingTop: 12 }}>
          dk8s only ever reads. It passes <code className="font-mono" style={{ color: ACCENT }}>--context</code> on
          every command and never runs <code className="font-mono">config use-context</code>, so selecting a cluster
          here cannot change what your terminal is pointed at.
        </p>
      </div>
    </div>
  );
}
