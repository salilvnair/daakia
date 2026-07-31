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
  await clearVault();
  handleVaultGetStatus(post);
}
