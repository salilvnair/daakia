/**
 * DebugHud — VS Code-style floating debug toolbar.
 *
 * Appears at the top center when a debug session is active.
 * Contains: Continue/Pause, Step Over, Step Into, Step Out, Restart, Stop.
 * Icons are always colorful like VS Code's debug toolbar.
 * Draggable via the grip handle.
 */
import { useDebugStore } from '../../../store/debug-store';
import { postMsg } from '../../../vscode';
import { useKeyboardShortcut } from '../../../hooks/useKeyboardShortcut';
import {
  DbgContinueIcon,
  DbgStepOverIcon,
  DbgStepIntoIcon,
  DbgStepOutIcon,
  DbgRestartIcon,
  DbgStopIcon,
  MuteBreakpointsIcon,
} from '../../../icons/daakia-icons';
import { HudView } from '../../../dui';
import type { HudItem } from '../../../dui';

export function DebugHud() {
  const { active, status, tabId, phase } = useDebugStore();
  const breakpointsMuted = useDebugStore(s => s.breakpointsMuted);

  const isPaused = active && status === 'paused';

  const send = (type: string) => postMsg({ type, tabId });

  const handleContinue = () => {
    const { breakpointsMuted: muted } = useDebugStore.getState();
    if (muted) postMsg({ type: 'scriptDebug:setBreakpoints', tabId, breakpoints: [] });
    send('scriptDebug:continue');
  };
  const handleStepOver = () => send('scriptDebug:stepOver');
  const handleStepInto = () => send('scriptDebug:stepInto');
  const handleStepOut  = () => send('scriptDebug:stepOut');
  const handleStop = () => {
    send('scriptDebug:stop');
    useDebugStore.getState().stopDebug();
  };
  const handleRestart = () => {
    send('scriptDebug:stop');
    setTimeout(() => postMsg({ type: 'scriptDebug:start', tabId, phase, restart: true }), 100);
  };

  // Register debug keyboard shortcuts (Shift+digit = F-key equivalent)
  useKeyboardShortcut('debug.continue', { key: '5', shiftKey: true }, (e) => {
    if (!active) return;
    e.preventDefault();
    if (isPaused) handleContinue();
  }, 'Continue (Shift+5)', [isPaused, active, tabId]);

  useKeyboardShortcut('debug.stop', { key: '5', ctrlKey: true, shiftKey: true }, (e) => {
    if (!active) return;
    e.preventDefault();
    handleStop();
  }, 'Stop (Ctrl+Shift+5)', [active, tabId]);

  useKeyboardShortcut('debug.restart', { key: '5', altKey: true, shiftKey: true }, (e) => {
    if (!active) return;
    e.preventDefault();
    handleRestart();
  }, 'Restart (Alt+Shift+5)', [active, tabId, phase]);

  useKeyboardShortcut('debug.stepOver', { key: '0', shiftKey: true }, (e) => {
    if (!active) return;
    e.preventDefault();
    if (isPaused) handleStepOver();
  }, 'Step Over (Shift+0)', [isPaused, active, tabId]);

  useKeyboardShortcut('debug.stepInto', { key: '1', shiftKey: true }, (e) => {
    if (!active) return;
    e.preventDefault();
    if (isPaused) handleStepInto();
  }, 'Step Into (Shift+1)', [isPaused, active, tabId]);

  useKeyboardShortcut('debug.stepOut', { key: '1', ctrlKey: true, shiftKey: true }, (e) => {
    if (!active) return;
    e.preventDefault();
    if (isPaused) handleStepOut();
  }, 'Step Out (Ctrl+Shift+1)', [isPaused, active, tabId]);

  if (!active) return null;

  const handleMuteToggle = () => useDebugStore.getState().toggleMuteBreakpoints();

  const items: HudItem[] = [
    { id: 'continue', icon: <DbgContinueIcon />,      onClick: handleContinue,  disabled: !isPaused, title: 'Continue (Shift+5)' },
    { id: 'stepover', icon: <DbgStepOverIcon />,       onClick: handleStepOver,  disabled: !isPaused, title: 'Step Over (Shift+0)' },
    { id: 'stepinto', icon: <DbgStepIntoIcon />,       onClick: handleStepInto,  disabled: !isPaused, title: 'Step Into (Shift+1)' },
    { id: 'stepout',  icon: <DbgStepOutIcon />,        onClick: handleStepOut,   disabled: !isPaused, title: 'Step Out (Ctrl+Shift+1)' },
    { id: 'restart',  icon: <DbgRestartIcon />,        onClick: handleRestart,   separator: true,     title: 'Restart (Alt+Shift+5)' },
    { id: 'stop',     icon: <DbgStopIcon />,           onClick: handleStop,                           title: 'Stop (Ctrl+Shift+5)' },
    {
      id: 'mute',
      icon: <MuteBreakpointsIcon />,
      onClick: handleMuteToggle,
      active: breakpointsMuted,
      title: breakpointsMuted ? 'Unmute breakpoints' : 'Mute all breakpoints',
    },
  ];

  return (
    <HudView
      items={items}
      status={isPaused ? 'Paused' : 'Running…'}
    />
  );
}
