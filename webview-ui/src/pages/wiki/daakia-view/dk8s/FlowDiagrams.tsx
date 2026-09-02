/**
 * Drawings for the pages that are not about search.
 *
 * Both show a decision the app makes on your behalf, which is exactly the kind
 * of thing prose describes badly: what happens when a cluster says no, and how
 * one container's capabilities pick the command that gets run on it.
 */
import { Defs, Box, T, MUTED, LIVE, ARCH, HIT, STOP } from './diagram-kit';

/* ── Getting connected ───────────────────────────────────────────────────── */

export function ConnectDiagram() {
  const a = 'url(#conn-arrow)';
  return (
    <svg viewBox="0 0 950 288" style={{ width: '100%', minWidth: 730, height: 'auto' }}>
      <Defs id="conn-arrow" />

      <Box x={10} y={110} w={122} h={58} />
      <T x={71} y={133} weight={600}>find kubectl</T>
      <T x={71} y={150} fill={MUTED} size={10}>setting, then PATH</T>

      <line x1={132} y1={139} x2={168} y2={139} stroke={MUTED} markerEnd={a} />

      <Box x={174} y={110} w={140} h={58} stroke={LIVE} />
      <T x={244} y={133} fill={LIVE} weight={600}>version</T>
      <T x={244} y={150} fill={MUTED} size={10}>proves it can reach</T>

      <line x1={314} y1={139} x2={350} y2={139} stroke={MUTED} markerEnd={a} />

      <Box x={356} y={110} w={140} h={58} />
      <T x={426} y={133} weight={600}>namespaces</T>
      <T x={426} y={150} fill={MUTED} size={10}>or the one you can see</T>

      <line x1={496} y1={139} x2={532} y2={139} stroke={MUTED} markerEnd={a} />

      <Box x={538} y={98} w={158} h={82} stroke={ARCH} />
      <T x={617} y={122} fill={ARCH} weight={600}>auth can-i</T>
      <T x={617} y={140} fill={MUTED} size={10}>logs · exec · get</T>
      <T x={617} y={154} fill={MUTED} size={10}>one call each,</T>
      <T x={617} y={168} fill={MUTED} size={10}>failure reads as yes</T>

      <line x1={696} y1={122} x2={764} y2={122} stroke={MUTED} markerEnd={a} />
      <Box x={770} y={98} w={170} h={48} stroke={HIT} />
      <T x={855} y={121} fill={HIT} weight={600}>allowed — offered</T>
      <T x={855} y={137} fill={MUTED} size={10}>the button works</T>

      <line x1={696} y1={158} x2={764} y2={158} stroke={MUTED} markerEnd={a} />
      <Box x={770} y={158} w={170} h={62} stroke={STOP} />
      <T x={855} y={180} fill={STOP} weight={600}>refused — disabled</T>
      <T x={855} y={197} fill={MUTED} size={10}>with the reason on it,</T>
      <T x={855} y={211} fill={MUTED} size={10}>never a dead end</T>

      <Box x={174} y={206} w={322} h={54} dash="4 3" />
      <T x={335} y={228} weight={600}>watch: list first, then stream</T>
      <T x={335} y={246} fill={MUTED} size={10}>a list that fails is a visible error, not a silent stream</T>

      <T x={10} y={278} fill={MUTED} size={10} anchor="start">
        A refusal is discovered before you click, not after — the cost of four cheap calls at connect time.
      </T>
    </svg>
  );
}

/* ── One probe decides every collector ───────────────────────────────────── */

export function CollectDiagram() {
  const a = 'url(#coll-arrow)';
  return (
    <svg viewBox="0 0 950 320" style={{ width: '100%', minWidth: 730, height: 'auto' }}>
      <Defs id="coll-arrow" />

      <Box x={10} y={126} w={150} h={72} stroke={LIVE} />
      <T x={85} y={150} fill={LIVE} weight={600}>one exec, one script</T>
      <T x={85} y={168} fill={MUTED} size={10}>shell? binaries? pid?</T>
      <T x={85} y={182} fill={MUTED} size={10}>CAP_SYS_PTRACE?</T>

      <line x1={160} y1={162} x2={200} y2={162} stroke={MUTED} markerEnd={a} />
      <line x1={200} y1={52} x2={200} y2={272} stroke={MUTED} />

      <line x1={200} y1={52} x2={244} y2={52} stroke={MUTED} markerEnd={a} />
      <Box x={250} y={28} w={250} h={48} />
      <T x={375} y={49} weight={600}>jcmd present</T>
      <T x={375} y={66} fill={MUTED} size={10}>Thread.print · GC.class_histogram · JFR.start</T>

      <line x1={200} y1={116} x2={244} y2={116} stroke={MUTED} markerEnd={a} />
      <Box x={250} y={92} w={250} h={48} />
      <T x={375} y={113} weight={600}>jstack / jmap only</T>
      <T x={375} y={130} fill={MUTED} size={10}>the older pair, same artifacts</T>

      <line x1={200} y1={180} x2={244} y2={180} stroke={MUTED} markerEnd={a} />
      <Box x={250} y={156} w={250} h={48} stroke={ARCH} />
      <T x={375} y={177} fill={ARCH} weight={600}>a JRE image — neither</T>
      <T x={375} y={194} fill={MUTED} size={10}>kill -3, then read it back out of the log</T>

      <line x1={200} y1={244} x2={244} y2={244} stroke={MUTED} markerEnd={a} />
      <Box x={250} y={220} w={250} h={48} stroke={STOP} />
      <T x={375} y={241} fill={STOP} weight={600}>no shell at all</T>
      <T x={375} y={258} fill={MUTED} size={10}>distroless — collectors greyed out, with why</T>

      <line x1={500} y1={52} x2={560} y2={52} stroke={MUTED} markerEnd={a} />
      <line x1={500} y1={116} x2={560} y2={116} stroke={MUTED} markerEnd={a} />
      <line x1={500} y1={180} x2={560} y2={180} stroke={MUTED} markerEnd={a} />

      <Box x={566} y={92} w={164} h={76} stroke={HIT} />
      <T x={648} y={116} fill={HIT} weight={600}>an artifact</T>
      <T x={648} y={134} fill={MUTED} size={10}>text straight back, or</T>
      <T x={648} y={148} fill={MUTED} size={10}>a file written in the pod</T>
      <T x={648} y={162} fill={MUTED} size={10}>then kubectl cp'd out</T>

      <line x1={730} y1={130} x2={772} y2={130} stroke={MUTED} markerEnd={a} />
      <Box x={778} y={104} w={162} h={52} />
      <T x={859} y={126} weight={600}>Artifacts</T>
      <T x={859} y={143} fill={MUTED} size={10}>durable, then analysed</T>

      <T x={10} y={306} fill={MUTED} size={10} anchor="start">
        The probe is the feature, not defensive plumbing: it is what turns "it failed" into "this image has no jcmd".
      </T>
    </svg>
  );
}
