/**
 * DebugHud — VS Code-style floating debug toolbar.
 *
 * Appears at the top center when a debug session is active.
 * Contains: Continue/Pause, Step Over, Step Into, Step Out, Restart, Stop.
 * Icons are always colorful like VS Code's debug toolbar.
 * Draggable via the grip handle.
 */
import { useRef, useCallback, useEffect } from 'react';
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
import './DebugHud.css';

export function DebugHud() {
  const { active, status, tabId, phase } = useDebugStore();
  const breakpointsMuted = useDebugStore(s => s.breakpointsMuted);
  const hudRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startLeft: number } | null>(null);

  // Drag handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = hudRef.current;
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    dragState.current = { startX: e.clientX, startLeft: rect.left };
    el.style.transition = 'none';
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragState.current || !hudRef.current) return;
      const dx = e.clientX - dragState.current.startX;
      const newLeft = dragState.current.startLeft + dx;
      hudRef.current.style.left = `${newLeft}px`;
      hudRef.current.style.transform = 'none';
    };
    const onMouseUp = () => {
      dragState.current = null;
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const isPaused = active && status === 'paused';

  const send = (type: string) => {
    postMsg({ type, tabId });
  };

  const handleContinue = () => {
    const { breakpointsMuted } = useDebugStore.getState();
    if (breakpointsMuted) {
      postMsg({ type: 'scriptDebug:setBreakpoints', tabId, breakpoints: [] });
    }
    send('scriptDebug:continue');
  };
  const handleStepOver = () => send('scriptDebug:stepOver');
  const handleStepInto = () => send('scriptDebug:stepInto');
  const handleStepOut = () => send('scriptDebug:stepOut');
  const handleStop = () => {
    send('scriptDebug:stop');
    useDebugStore.getState().stopDebug();
  };
  const handleRestart = () => {
    send('scriptDebug:stop');
    setTimeout(() => {
      postMsg({
        type: 'scriptDebug:start',
        tabId,
        phase,
        restart: true,
      });
    }, 100);
  };

  // Register debug keyboard shortcuts (Shift+digit = F-key equivalent, since VS Code captures F-keys)
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

  return (
    <div className="debug-hud" ref={hudRef}>
      <div className="debug-hud__drag" title="Drag to move" onMouseDown={onMouseDown}>
        <span className="debug-hud__grip" />
      </div>

      <button
        className="debug-hud__btn"
        onClick={handleContinue}
        disabled={!isPaused}
        title="Continue (Shift+5)"
      >
        <DbgContinueIcon />
      </button>

      <button
        className="debug-hud__btn"
        onClick={handleStepOver}
        disabled={!isPaused}
        title="Step Over (Shift+0)"
      >
        <DbgStepOverIcon />
      </button>

      <button
        className="debug-hud__btn"
        onClick={handleStepInto}
        disabled={!isPaused}
        title="Step Into (Shift+1)"
      >
        <DbgStepIntoIcon />
      </button>

      <button
        className="debug-hud__btn"
        onClick={handleStepOut}
        disabled={!isPaused}
        title="Step Out (Ctrl+Shift+1)"
      >
        <DbgStepOutIcon />
      </button>

      <div className="debug-hud__sep" />

      <button
        className="debug-hud__btn"
        onClick={handleRestart}
        title="Restart (Alt+Shift+5)"
      >
        <DbgRestartIcon />
      </button>

      <button
        className="debug-hud__btn"
        onClick={handleStop}
        title="Stop (Ctrl+Shift+5)"
      >
        <DbgStopIcon />
      </button>

      <button
        className={`debug-hud__btn${breakpointsMuted ? ' debug-hud__btn--active' : ''}`}
        onClick={() => useDebugStore.getState().toggleMuteBreakpoints()}
        title={breakpointsMuted ? 'Unmute breakpoints' : 'Mute all breakpoints'}
      >
        <MuteBreakpointsIcon />
      </button>

      <div className="debug-hud__status">
        {isPaused ? 'Paused' : 'Running…'}
      </div>
    </div>
  );
}
