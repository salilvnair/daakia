/**
 * The three drawings on the dk8s log-search page.
 *
 * Primitives live in `diagram-kit`, shared with the other dk8s diagrams so a
 * change to the arrowhead or the neutral stroke lands everywhere at once.
 */
import { Defs, Box, T, MUTED, LIVE, ARCH, HIT } from './diagram-kit';

/* ── 1. The pipeline ─────────────────────────────────────────────────────── */

export function PipelineDiagram() {
  const a = 'url(#pipe-arrow)';
  return (
    <svg viewBox="0 0 950 300" style={{ width: '100%', minWidth: 730, height: 'auto' }}>
      <Defs id="pipe-arrow" />

      <Box x={10} y={116} w={132} h={54} />
      <T x={76} y={139} weight={600}>query + pods</T>
      <T x={76} y={156} fill={MUTED} size={10}>SearchOptions</T>

      <line x1={142} y1={143} x2={190} y2={143} stroke={MUTED} markerEnd={a} />

      <Box x={196} y={110} w={124} h={66} />
      <T x={258} y={134} weight={600}>matcher</T>
      <T x={258} y={151} fill={MUTED} size={10}>compiled once,</T>
      <T x={258} y={165} fill={MUTED} size={10}>not per line</T>

      <line x1={320} y1={143} x2={356} y2={143} stroke={MUTED} />
      <line x1={356} y1={62} x2={356} y2={226} stroke={MUTED} />
      <line x1={356} y1={62} x2={398} y2={62} stroke={MUTED} markerEnd={a} />
      <line x1={356} y1={226} x2={398} y2={226} stroke={MUTED} markerEnd={a} />

      <Box x={404} y={30} w={200} h={66} stroke={LIVE} />
      <T x={504} y={53} fill={LIVE} weight={600}>live — kubectl logs</T>
      <T x={504} y={71} fill={MUTED} size={10}>4 pods at a time, streamed</T>
      <T x={504} y={85} fill={MUTED} size={10}>--tail, --since-time</T>

      <Box x={404} y={194} w={200} h={66} stroke={ARCH} />
      <T x={504} y={217} fill={ARCH} weight={600}>archive — mounted volume</T>
      <T x={504} y={235} fill={MUTED} size={10}>one pod at a time, in turn</T>
      <T x={504} y={249} fill={MUTED} size={10}>seek, then read</T>

      <line x1={604} y1={62} x2={648} y2={62} stroke={MUTED} />
      <line x1={604} y1={226} x2={648} y2={226} stroke={MUTED} />
      <line x1={648} y1={62} x2={648} y2={226} stroke={MUTED} />
      <line x1={648} y1={143} x2={688} y2={143} stroke={MUTED} markerEnd={a} />

      <Box x={694} y={110} w={140} h={66} />
      <T x={764} y={134} weight={600}>result groups</T>
      <T x={764} y={151} fill={MUTED} size={10}>keyed live: / archive:</T>
      <T x={764} y={165} fill={MUTED} size={10}>one row each</T>

      <line x1={834} y1={143} x2={866} y2={143} stroke={MUTED} markerEnd={a} />

      <Box x={872} y={110} w={70} h={66} dash="4 3" />
      <T x={907} y={139} weight={600}>export</T>
      <T x={907} y={156} fill={MUTED} size={10}>re-runs</T>

      <T x={10} y={288} fill={MUTED} size={10} anchor="start">
        Both halves run on every search — the archive is not a fallback, it is the other half of the log.
      </T>
    </svg>
  );
}

/* ── 2. The per-line loop ────────────────────────────────────────────────── */

export function ScanLoopDiagram() {
  const a = 'url(#scan-arrow)';
  return (
    <svg viewBox="0 0 950 336" style={{ width: '100%', minWidth: 730, height: 'auto' }}>
      <Defs id="scan-arrow" />

      <Box x={10} y={132} w={104} h={48} />
      <T x={62} y={161} weight={600}>next line</T>

      <line x1={114} y1={156} x2={152} y2={156} stroke={MUTED} markerEnd={a} />

      <Box x={158} y={120} w={128} h={72} />
      <T x={222} y={142} weight={600}>owed context?</T>
      <T x={222} y={160} fill={MUTED} size={10}>append to hits</T>
      <T x={222} y={174} fill={MUTED} size={10}>still short of their N</T>

      <line x1={286} y1={156} x2={324} y2={156} stroke={MUTED} markerEnd={a} />

      <Box x={330} y={120} w={130} h={72} />
      <T x={395} y={142} weight={600}>timestamp</T>
      <T x={395} y={160} fill={MUTED} size={10}>none? inherit the</T>
      <T x={395} y={174} fill={MUTED} size={10}>last one seen</T>

      <line x1={460} y1={156} x2={498} y2={156} stroke={MUTED} markerEnd={a} />

      <Box x={504} y={120} w={122} h={72} />
      <T x={565} y={148} weight={600}>in the window?</T>
      <T x={565} y={167} fill={MUTED} size={10}>from ≤ ts ≤ to</T>

      <line x1={565} y1={120} x2={565} y2={74} stroke={MUTED} />
      <line x1={565} y1={74} x2={872} y2={74} stroke={MUTED} markerEnd={a} />
      <T x={572} y={66} fill={MUTED} size={10} anchor="start">no — the matcher never sees it</T>

      <line x1={626} y1={156} x2={664} y2={156} stroke={MUTED} markerEnd={a} />
      <T x={645} y={148} fill={MUTED} size={10}>yes</T>

      <Box x={670} y={120} w={116} h={72} stroke={HIT} />
      <T x={728} y={148} fill={HIT} weight={600}>match?</T>
      <T x={728} y={167} fill={MUTED} size={10}>ranges, or null</T>

      <line x1={786} y1={156} x2={818} y2={156} stroke={MUTED} markerEnd={a} />

      <Box x={824} y={112} w={118} h={88} />
      <T x={883} y={136} weight={600}>count it</T>
      <T x={883} y={156} fill={MUTED} size={10}>store it too, if</T>
      <T x={883} y={170} fill={MUTED} size={10}>under the cap</T>
      <T x={883} y={190} fill={MUTED} size={10}>else: mark capped</T>

      <Box x={330} y={240} w={296} h={54} dash="4 3" />
      <T x={478} y={262} weight={600}>push the line into the ring</T>
      <T x={478} y={280} fill={MUTED} size={10}>keeps the last N, so a hit already has its "before"</T>

      <line x1={883} y1={200} x2={883} y2={267} stroke={MUTED} />
      <line x1={883} y1={267} x2={632} y2={267} stroke={MUTED} markerEnd={a} />
      <line x1={330} y1={267} x2={62} y2={267} stroke={MUTED} />
      <line x1={62} y1={267} x2={62} y2={186} stroke={MUTED} markerEnd={a} />

      <T x={10} y={322} fill={MUTED} size={10} anchor="start">
        One pass, one line in hand at a time. Nothing accumulates but the hits kept and the ring of recent lines.
      </T>
    </svg>
  );
}

/* ── 3. What the archive refuses to read ─────────────────────────────────── */

export function ArchiveSkipDiagram() {
  const a = 'url(#arch-arrow)';
  return (
    <svg viewBox="0 0 950 272" style={{ width: '100%', minWidth: 730, height: 'auto' }}>
      <Defs id="arch-arrow" />

      <Box x={10} y={104} w={128} h={52} />
      <T x={74} y={126} weight={600}>a rotation file</T>
      <T x={74} y={143} fill={MUTED} size={10}>newest first</T>

      <line x1={138} y1={130} x2={176} y2={130} stroke={MUTED} markerEnd={a} />

      <Box x={182} y={94} w={152} h={72} stroke={ARCH} />
      <T x={258} y={118} fill={ARCH} weight={600}>mtime &lt; window start?</T>
      <T x={258} y={137} fill={MUTED} size={10}>its newest line is older</T>
      <T x={258} y={151} fill={MUTED} size={10}>than anything asked for</T>

      <line x1={258} y1={94} x2={258} y2={46} stroke={MUTED} />
      <line x1={258} y1={46} x2={398} y2={46} stroke={MUTED} markerEnd={a} />
      <T x={266} y={38} fill={MUTED} size={10} anchor="start">yes</T>

      <Box x={404} y={22} w={168} h={48} />
      <T x={488} y={45} weight={600}>skipped, unopened</T>
      <T x={488} y={61} fill={MUTED} size={10}>zero bytes read</T>

      <line x1={334} y1={130} x2={372} y2={130} stroke={MUTED} markerEnd={a} />
      <T x={353} y={122} fill={MUTED} size={10}>no</T>

      <Box x={378} y={94} w={140} h={72} />
      <T x={448} y={118} weight={600}>compressed?</T>
      <T x={448} y={137} fill={MUTED} size={10}>a byte offset means</T>
      <T x={448} y={151} fill={MUTED} size={10}>nothing in a stream</T>

      <line x1={448} y1={166} x2={448} y2={202} stroke={MUTED} markerEnd={a} />
      <Box x={362} y={208} w={172} h={48} dash="4 3" />
      <T x={448} y={228} fill={MUTED} size={10}>yes — inflate it whole,</T>
      <T x={448} y={244} fill={MUTED} size={10}>then filter line by line</T>

      <line x1={518} y1={130} x2={556} y2={130} stroke={MUTED} markerEnd={a} />
      <T x={537} y={122} fill={MUTED} size={10}>no</T>

      <Box x={562} y={94} w={168} h={72} stroke={LIVE} />
      <T x={646} y={118} fill={LIVE} weight={600}>bisect to the start</T>
      <T x={646} y={137} fill={MUTED} size={10}>halve, snap to a line,</T>
      <T x={646} y={151} fill={MUTED} size={10}>read its time, repeat</T>

      <line x1={730} y1={130} x2={768} y2={130} stroke={MUTED} markerEnd={a} />

      <Box x={774} y={104} w={168} h={52} stroke={HIT} />
      <T x={858} y={126} fill={HIT} weight={600}>read from there</T>
      <T x={858} y={143} fill={MUTED} size={10}>not from byte 0</T>
    </svg>
  );
}
