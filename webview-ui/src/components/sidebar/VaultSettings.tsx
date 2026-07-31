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
      <div>
        <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">Vault</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
          Set a passphrase to encrypt variables flagged "Secret" in Environments at rest (AES-256-GCM). Everything else is stored exactly as it is today.
        </p>
      </div>

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

      {confirmClear && (
        <ConfirmDialog
          title="Clear Vault"
          message="This permanently forgets the passphrase (from the OS keychain and Daakia's stored verifier). Any secret environment values already encrypted become unrecoverable — you'll need to re-enter them. This cannot be undone."
          confirmLabel="Clear Vault"
          danger
          onConfirm={handleClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}
