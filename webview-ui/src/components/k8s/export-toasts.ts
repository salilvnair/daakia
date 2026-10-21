/**
 * What became of a log download, said wherever you are.
 *
 * Export replies were heard only by the dk8s panel, and shown only as the pod
 * grid's banner — which said "done" and nothing else. Downloading from a search
 * results tab, a split pane or a downloaded-log tab closed the dialog and then
 * said nothing at all: no path, and no error when it failed. A results tab
 * restored without a dk8s tab open did not even have the listener.
 *
 * Installed once at the app's root, beside the paste bridge.
 */
import { useToastStore } from '../../store/toast-store';

function toast(type: 'success' | 'error' | 'info', message: string): void {
  useToastStore.getState().addToast({ type, message, duration: type === 'error' ? 9000 : 6000 });
}

export function installExportToasts(): () => void {
  const onMsg = (e: MessageEvent) => {
    const m = e.data as Record<string, unknown> | undefined;
    switch (m?.type) {
      case 'dk8s:exportDone': {
        const summary = typeof m.summary === 'string' ? m.summary : 'Logs written';
        toast('success', m.destDir ? `${summary} — ${String(m.destDir)}` : summary);
        break;
      }
      case 'dk8s:exportError':
        toast('error', `Download failed: ${String(m.error ?? 'no reason given')}`);
        break;
      case 'dk8s:captureSaved':
        if (m.cancelled) break;
        if (m.error) toast('error', `Could not save the log: ${String(m.error)}`);
        else toast('success', `${m.partial ? 'Saved what has downloaded so far' : 'Saved the whole log'} — ${String(m.path)}`);
        break;
      default:
        break;
    }
  };
  window.addEventListener('message', onMsg);
  return () => window.removeEventListener('message', onMsg);
}
