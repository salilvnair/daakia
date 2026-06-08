export function WebSocketView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full gap-3">
      <div className="text-[40px] opacity-30" style={{ color: 'var(--color-protocol-websocket)' }}>●</div>
      <p className="text-[14px] font-medium" style={{ color: 'var(--color-protocol-websocket)' }}>WebSocket / SSE / MQTT</p>
      <p className="text-[12px] text-[var(--color-text-muted)]">Capture coming soon — paste outerHTML from devtools</p>
    </div>
  );
}
