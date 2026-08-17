/**
 * Vault handler — webview-facing bridge for services/vault.ts.
 */
import { getVaultStatus, setVaultPassphrase, unlockVault, lockVault, clearVault } from '../../../services/vault';

type PostMessage = (msg: unknown) => void;

export function handleVaultGetStatus(post: PostMessage): void {
  post({ type: 'vault:statusData', status: getVaultStatus() });
}

export async function handleVaultSetPassphrase(msg: { passphrase: string }, post: PostMessage): Promise<void> {
  const result = await setVaultPassphrase(msg.passphrase);
  post({ type: 'vault:setResult', result });
  handleVaultGetStatus(post);
}

export async function handleVaultUnlock(msg: { passphrase: string }, post: PostMessage): Promise<void> {
  const result = await unlockVault(msg.passphrase);
  post({ type: 'vault:unlockResult', result });
  handleVaultGetStatus(post);
}

export function handleVaultLock(post: PostMessage): void {
  lockVault();
  handleVaultGetStatus(post);
}

export async function handleVaultClear(post: PostMessage): Promise<void> {
  // Clearing is destructive and irreversible, so it gets a result message like every
  // other vault operation — both to confirm to the user that it actually happened and
  // because the webview keys its in-flight/disabled state off these result messages.
  try {
    const { revertedCount, strandedCount } = await clearVault();
    const message = revertedCount > 0
      ? `Vault cleared — secrets in ${revertedCount} environment(s) were decrypted back to plain values, so nothing was lost.`
      : strandedCount > 0
        ? `Vault cleared. ${strandedCount} secret value(s) stay encrypted and unreadable — set the same passphrase again if you remember it, and they will come back.`
        : 'Vault cleared — the passphrase is forgotten and no new secrets will be encrypted.';
    post({ type: 'vault:clearResult', result: { ok: true, message } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to clear the vault.';
    post({ type: 'vault:clearResult', result: { ok: false, message } });
  }
  handleVaultGetStatus(post);
}
