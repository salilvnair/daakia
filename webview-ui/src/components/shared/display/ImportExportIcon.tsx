import { FolderTransferIcon } from '../../../icons';

export function ImportExportIcon({ className = '', size = '1.2em' }: { className?: string; size?: string }) {
  return (
    <FolderTransferIcon className={className} style={{ width: size, height: size }} />
  );
}