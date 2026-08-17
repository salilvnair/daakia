/**
 * VaultSettings — passphrase-based encryption for Environment secret values.
 *
 * Only variables flagged "Secret" in the Environments panel are ever encrypted;
 * everything else stays exactly as it is today. The passphrase itself lives in
 * the OS keychain (Keychain Access / Credential Manager / libsecret) so the
 * vault auto-unlocks on the next launch — it's never stored in the SQLite DB,
 * only a verifier hash is, so Daakia can check a re-entered passphrase is
 * correct without ever persisting the passphrase itself outside the keychain.
 */
import { useEffect, useState } from 'react';
import { ButtonView, TextInputView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { ConfirmDialog } from '../shared';
import { LockIcon, KeyIcon, CheckCircleFilledIcon, WarningTriangleIcon } from '../../icons';

const ACCENT = 'var(--color-settings)';

interface VaultStatus {
  configured: boolean;
  unlocked: boolean;
}

export function VaultSettings() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState<'save' | 'unlock' | 'clear' | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    postMsg({ type: 'vault:getStatus' });
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'vault:statusData') {
        setStatus(msg.status);
        // Every vault handler in the extension ends by posting fresh status, so this is
        // the one signal guaranteed to arrive after ANY vault operation. Releasing `busy`
        // here makes the panel self-healing: "Clear Vault" set busy='clear' and the
        // extension replied with status only — no clearResult — so nothing ever released
        // it and every button (including Create Vault on the form that reappears) stayed
        // permanently disabled until the panel was remounted.
        setBusy(null);
      } else if (msg.type === 'vault:clearResult') {
        setBusy(null);
        setPassphrase('');
        setChanging(false);
        addToast({ type: msg.result.ok ? 'success' : 'error', message: msg.result.message });
      } else if (msg.type === 'vault:setResult') {
        setBusy(null);
        if (msg.result.ok) {
          setPassphrase('');
          setChanging(false);
          const extra = msg.result.migratedCount > 0 ? ` ${msg.result.migratedCount} existing secret value(s) encrypted.` : '';
          addToast({ type: 'success', message: `${msg.result.message}${extra}` });
        } else {
          addToast({ type: 'error', message: msg.result.message });
        }
      } else if (msg.type === 'vault:unlockResult') {
        setBusy(null);
        if (msg.result.ok) setPassphrase('');
        addToast({ type: msg.result.ok ? 'success' : 'error', message: msg.result.message });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = () => {
    if (!passphrase.trim()) return;
    setBusy('save');
    postMsg({ type: 'vault:setPassphrase', passphrase });
  };

  const handleUnlock = () => {
    if (!passphrase.trim()) return;
    setBusy('unlock');
    postMsg({ type: 'vault:unlock', passphrase });
  };

  const handleLock = () => {
    postMsg({ type: 'vault:lock' });
  };

  const handleClear = () => {
    setBusy('clear');
    postMsg({ type: 'vault:clear' });
    setConfirmClear(false);
  };

  if (!status) {
    return <div className="px-5 py-4"><p className="text-[11px] text-[var(--color-text-muted)]">Checking…</p></div>;
  }

  const unlockedAndSettled = status.configured && status.unlocked && !changing;

  return (
    <div className="px-5 py-4 flex flex-col gap-6">
      {/* Copy rules learned the hard way:
          - never the phrase "at rest" — beside REST/GraphQL/gRPC tabs it reads as the protocol
          - lead with what it protects you from, not with the cipher name. "AES-256-GCM" answers
            a question nobody asked; "anyone with your laptop can read your token" is the reason
            the feature exists. */}
      <div>
        <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">Vault</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
          Password-protects the values on an Environment's <strong className="font-semibold text-[var(--color-text-secondary)]">Secrets</strong> tab.
          Without a vault those sit in Daakia's database as readable text, so anyone with your
          laptop, a backup or a disk image can read your production tokens.
        </p>
      </div>

      {/* The walkthrough earns its space only while the user is still deciding. Once a vault
          exists the status card below says everything that still matters. */}
      {!status.configured && (
        <div className="rounded-lg border px-3.5 py-3" style={{ borderColor: 'var(--color-surface-border)', background: 'var(--color-overlay-subtle)' }}>
          <p className="text-[11px] font-semibold mb-2" style={{ color: ACCENT }}>How it works</p>
          <ol className="text-[11px] flex flex-col gap-2" style={{ color: 'var(--color-text-secondary)' }}>
            <li>
              <span className="font-semibold">1.</span> Put the value under <strong className="font-semibold">Environment → Secrets</strong> —
              say <code className="font-mono">apiToken</code> = <code className="font-mono">sk_live_9f2a…</code> — and keep using
              it as <code className="font-mono">{'{{apiToken}}'}</code>, exactly as you do now.
            </li>
            <li>
              <span className="font-semibold">2.</span> Set a passphrase below. Secrets you already saved are re-encrypted straight away:
              on disk <code className="font-mono">sk_live_9f2a…</code> becomes <code className="font-mono">enc:v1:…</code> (AES-256-GCM).
              The key is derived from your passphrase and never written to disk.
            </li>
            <li>
              <span className="font-semibold">3.</span> Nothing about your workflow changes. Requests still resolve <code className="font-mono">{'{{apiToken}}'}</code> to
              the real value, and the passphrase lives in your OS keychain so the vault unlocks on launch — no retyping.
            </li>
          </ol>
          <p className="text-[11px] mt-2.5 pt-2.5 border-t" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)' }}>
            Exports and Git Sync already replace secret values with <code className="font-mono">REDACTED</code>, so an environment
            stays shareable. Ordinary variables, collections and history are stored exactly as they are today.
          </p>
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Only worth turning on if a real credential lives in an Environment — for localhost and mock servers it buys you nothing.
          </p>
        </div>
      )}

      {/* Status */}
      <div className="rounded-lg overflow-hidden border" style={{
        borderColor: `color-mix(in srgb, ${status.unlocked ? 'var(--color-success)' : status.configured ? 'var(--color-warning)' : 'var(--color-text-muted)'} 35%, var(--color-surface-border))`,
        background: `color-mix(in srgb, ${status.unlocked ? 'var(--color-success)' : status.configured ? 'var(--color-warning)' : 'var(--color-text-muted)'} 6%, var(--color-surface))`,
      }}>
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          {status.unlocked ? (
            <CheckCircleFilledIcon size={15} checked style={{ color: 'var(--color-success)' }} />
          ) : status.configured ? (
            <WarningTriangleIcon size={15} style={{ color: 'var(--color-warning)' }} />
          ) : (
            <LockIcon size={15} style={{ color: 'var(--color-text-muted)' }} />
          )}
          <span className="text-[12.5px] font-semibold" style={{ color: status.unlocked ? 'var(--color-success)' : status.configured ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
            {status.unlocked ? 'Vault Unlocked' : status.configured ? 'Vault Locked' : 'Vault Not Configured'}
          </span>
        </div>
        <div className="px-3.5 pb-3 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
          {status.unlocked
            ? 'Secret environment values encrypt automatically when saved and decrypt automatically when loaded — no action needed.'
            : status.configured
              ? 'Enter your passphrase below to unlock — encrypted secret values will show as ••••••••• until then.'
              : 'No passphrase set yet — secret environment values are stored in plaintext.'}
        </div>
      </div>

      {/* Passphrase entry — shown when not configured, locked, or explicitly changing */}
      {(!unlockedAndSettled) && (
        <div>
          <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{status.configured ? (changing ? 'New Passphrase' : 'Passphrase') : 'Create a Passphrase'}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-2">
            At least 8 characters. {!status.configured && "There's no recovery if you lose it — the OS keychain keeps you from having to re-enter it every session, but write it down somewhere safe too."}
          </p>
          <div className="flex items-center gap-2">
            <TextInputView
              masked
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') (status.configured ? (changing ? handleSave() : handleUnlock()) : handleSave()); }}
              size="md"
              accentColor={ACCENT}
              placeholder="Passphrase"
              style={{ width: '100%', maxWidth: 320 }}
            />
            {!status.configured && (
              <ButtonView size="md" variant="primary" accentColor={ACCENT} iconLeft={<KeyIcon size={13} />} onClick={handleSave} disabled={busy !== null || passphrase.trim().length < 8}>
                {busy === 'save' ? 'Encrypting…' : 'Create Vault'}
              </ButtonView>
            )}
            {status.configured && changing && (
              <>
                <ButtonView size="md" variant="primary" accentColor={ACCENT} onClick={handleSave} disabled={busy !== null || passphrase.trim().length < 8}>
                  {busy === 'save' ? 'Re-encrypting…' : 'Save New Passphrase'}
                </ButtonView>
                <ButtonView size="md" variant="secondary" accentColor="var(--color-text-muted)" onClick={() => { setChanging(false); setPassphrase(''); }} disabled={busy !== null}>Cancel</ButtonView>
              </>
            )}
            {status.configured && !status.unlocked && !changing && (
              <ButtonView size="md" variant="primary" accentColor={ACCENT} iconLeft={<LockIcon size={13} />} onClick={handleUnlock} disabled={busy !== null || !passphrase.trim()}>
                {busy === 'unlock' ? 'Unlocking…' : 'Unlock'}
              </ButtonView>
            )}
          </div>

          {/* Escape hatch. Clear Vault used to live ONLY in the unlocked actions row below, so a
              user who could not remember the passphrase had no way off this screen at all — no
              reset, no start-over, nothing. Forgetting the passphrase is exactly when you most
              need the reset, so it belongs here too. */}
          {status.configured && !status.unlocked && !changing && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
              <p className="text-[11px] text-[var(--color-text-muted)] mb-2">
                Can't remember it? Start over with a new passphrase. Values already encrypted stay
                encrypted and unreadable — but they are not deleted, so if the old passphrase ever
                comes back to you, set that same one again and they become readable.
              </p>
              <ButtonView size="md" variant="secondary" accentColor="var(--color-error)" onClick={() => setConfirmClear(true)} disabled={busy !== null}>
                Reset Vault
              </ButtonView>
            </div>
          )}
        </div>
      )}

      {/* Actions when unlocked and settled */}
      {unlockedAndSettled && (
        <div className="flex flex-wrap items-center gap-2">
          <ButtonView size="md" variant="secondary" accentColor={ACCENT} iconLeft={<KeyIcon size={13} />} onClick={() => setChanging(true)}>Change Passphrase</ButtonView>
          <ButtonView size="md" variant="secondary" accentColor={ACCENT} iconLeft={<LockIcon size={13} />} onClick={handleLock}>Lock</ButtonView>
          <ButtonView size="md" variant="secondary" accentColor="var(--color-error)" onClick={() => setConfirmClear(true)}>Clear Vault</ButtonView>
        </div>
      )}

      {/* The consequence is completely different depending on whether we can still read the
          secrets, so the dialog must not describe both with one scary sentence. */}
      {confirmClear && (
        <ConfirmDialog
          title={status.unlocked ? 'Clear Vault' : 'Reset Vault'}
          message={status.unlocked
            ? "This forgets the passphrase (from the OS keychain and Daakia's stored verifier) and turns encryption off. Because the vault is unlocked, your secret values are decrypted back to plain values first — nothing is lost, they simply stop being encrypted."
            : "The vault is locked, so Daakia cannot read your encrypted secrets and cannot decrypt them. This forgets the passphrase so you can set a new one and carry on. Values already encrypted stay encrypted and unreadable — they are NOT deleted, so if you later remember the old passphrase, setting that same one again makes them readable. Any secret you need before then must be re-entered by hand."}
          confirmLabel={status.unlocked ? 'Clear Vault' : 'Reset Vault'}
          danger
          onConfirm={handleClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}
