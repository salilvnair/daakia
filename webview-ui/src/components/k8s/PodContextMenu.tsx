/**
 * What you can do to a pod, without opening it first.
 *
 * Everything here already existed somewhere: favouriting on the card, shell
 * and diagnostics inside the pod, selection behind a mode switch above the
 * list. Reaching any of them meant leaving the pod you were looking at. A
 * right-click is the one gesture that means "this one, do something to it",
 * and it was doing nothing.
 *
 * ── Why the diagnostics are gated here ──
 *
 * The Doctor group could have listed all five actions on every pod and let the
 * ones that cannot work fail after being chosen. That is a menu that lies
 * until clicked. Opening the menu probes the pod instead, so a JVM action on a
 * pod with no JVM is greyed out with the reason, and a heap dump on a pod with
 * no headroom is greyed out with the numbers — the same verdict the Doctor tab
 * shows, in the place the decision is actually being made.
 */
import { useMemo } from 'react';
import { ContextMenuView, type ContextMenuItem } from '@salilvnair/dui';
import {
  StarIcon, CopyIcon, TerminalIcon, FileTextIcon, StethoscopeIcon,
  CheckCircleIcon, XCircleIcon, CpuIcon, MemoryIcon, NetworkIcon, TimelineIcon,
} from '../../icons';
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import {
  useDk8sDoctorStore, ARTIFACT_META, type ArtifactKind,
} from '../../store/dk8s-doctor-store';
import { favoriteKey, useFavoriteKeys, toggleFavorite } from '../../store/dk8s-favorites-store';

const ACCENT = 'var(--color-dk8s)';

/*
  The diagnostics offered here, in the order the Doctor tab lists them, with
  the icons it gives them — the same action should not wear two faces
  depending on where it was reached from.
*/
const DOCTOR: { id: ArtifactKind; icon: React.ReactNode }[] = [
  { id: 'threaddump', icon: <CpuIcon size={13} /> },
  { id: 'threaddump-sigquit', icon: <CpuIcon size={13} /> },
  { id: 'histogram', icon: <MemoryIcon size={13} /> },
  { id: 'heapdump', icon: <MemoryIcon size={13} /> },
  { id: 'jfr', icon: <TimelineIcon size={13} /> },
  { id: 'conns', icon: <NetworkIcon size={13} /> },
];

/*
  A short line per action, for the menu.

  ARTIFACT_META.what is written for the Doctor tab, where a card has the room
  to explain itself in a sentence or two. Six of those stacked in a submenu is
  a wall of prose you have to read past to reach the one you wanted, so the
  menu gets its own line: what it gives you, not why you would want it. The
  full sentence is still one click away, on the card.
*/
const BRIEF: Record<string, string> = {
  threaddump: 'Every thread and what it waits on.',
  'threaddump-sigquit': 'Same, printed to the pod’s own log.',
  histogram: 'What is on the heap, by class.',
  heapdump: 'The whole heap, as a .hprof.',
  jfr: 'A 30s profile — allocation, locks, I/O.',
  conns: 'Open sockets and their states.',
};

/** Cost, coloured by what it costs the pod rather than by how it reads. */
function costColor(kind: ArtifactKind): string {
  const cost = ARTIFACT_META[kind]?.cost;
  return cost === 'heavy' ? 'var(--color-error)'
    : cost === 'moderate' ? 'var(--color-warning)'
      : 'var(--color-success)';
}

export function PodContextMenu({ pod, at, onClose, onConfirmUnfavorite, onOpen }: {
  pod: PodSummary | undefined;
  at: { x: number; y: number } | undefined;
  onClose: () => void;
  /** Ask before un-starring — the grid owns the dialog. */
  onConfirmUnfavorite: (pod: PodSummary) => void;
  /** Open the pod's detail view, for the items that are a way in. */
  onOpen: (pod: PodSummary, tab?: 'logs' | 'doctor') => void;
}) {
  const beginSelection = useK8sStore(s => s.beginSelection);
  const togglePodSelected = useK8sStore(s => s.togglePodSelected);
  const selected = useK8sStore(s => s.selected);
  const copyPodText = useK8sStore(s => s.copyPodText);
  const openShellFor = useK8sStore(s => s.openShellFor);
  const menuProbe = useK8sStore(s => s.menuProbe);
  const guardHeapDump = useK8sStore(s => s.guardHeapDump);
  const access = useK8sStore(s => s.access);
  const collect = useDk8sDoctorStore(s => s.collect);
  const running = useDk8sDoctorStore(s => s.running);
  const favorites = useFavoriteKeys();

  const items = useMemo<ContextMenuItem[]>(() => {
    if (!pod) return [];
    const key = favoriteKey(pod);
    const starred = favorites.includes(key);
    const picked = selected.includes(pod.uid);
    const copy = (text: string) => () => { void navigator.clipboard?.writeText(text); onClose(); };

    // The probe is for this pod, or it is for the last one and says nothing
    // about this one. Anything else would show one pod's capabilities under
    // another pod's name.
    const probe = menuProbe?.pod === pod.name ? menuProbe : undefined;
    const checking = !probe || probe.busy;

    const doctor: ContextMenuItem[] = DOCTOR.map(({ id, icon }) => {
      const meta = ARTIFACT_META[id]!;
      const action = probe?.actions.find(a => a.id === id);

      /*
        A heap dump on a pod with no headroom is the one action that can
        destroy the thing it was meant to diagnose, so the memory verdict
        overrides "the tooling is present" — the same rule the Doctor tab
        applies, for the same reason.
      */
      const memoryBlocked = id === 'heapdump'
        && guardHeapDump
        && probe?.safety?.verdict === 'unsafe';

      const reason = checking ? 'Checking what this pod supports…'
        : !pod.context ? 'No cluster context for this pod, so this cannot be run safely.'
          : !action ? 'Not available on this pod.'
            : memoryBlocked
              ? `Blocked: ${probe?.safety?.headline ?? 'Not enough space for the dump.'}`
              : !action.available ? (action.reason ?? 'Not available on this pod.')
                : (BRIEF[id] ?? meta.what);

      /*
        No context means we cannot say WHICH cluster this pod is in, and with
        multi-cluster watching that is not a detail to guess at — a heap dump
        taken against the wrong cluster is the exact failure this guards. The
        Doctor tab refuses to fire without one; here it greys the item out, so
        the refusal is visible before the click rather than after it.
      */
      const usable = !checking && !!action?.available && !memoryBlocked
        && !running && !!pod.context;

      return {
        id: `doctor-${id}`,
        label: meta.label,
        description: reason,
        shortcut: usable ? meta.costLabel : undefined,
        icon,
        iconColor: usable ? costColor(id) : undefined,
        disabled: !usable,
        onClick: () => {
          /*
            A heavy action is confirmed where it is explained.

            The Doctor tab states the cost and asks once before stopping a
            JVM, and a menu item that skipped that would be the same action
            with the warning removed. So the costly ones open the tab; the
            safe ones run from here.
          */
          if (meta.cost === 'heavy' || meta.warning.length > 90) {
            onOpen(pod, 'doctor');
          } else if (pod.context) {
            collect({
              kind: id, context: pod.context, namespace: pod.namespace, pod: pod.name,
            });
          }
          onClose();
        },
      };
    });

    return [
      {
        id: 'select',
        /*
          The item says what pressing it does, which on an already-ticked pod
          is the opposite of what it used to say. Offering "Select" on a pod
          that is selected reads as a no-op, and a menu that describes the
          state rather than the action is one you have to test to understand.
        */
        label: picked ? 'Deselect' : 'Select',
        description: picked
          ? 'Drop this pod from the selection.'
          : 'Pick this pod, and others, to search or export together.',
        icon: picked ? <XCircleIcon size={13} /> : <CheckCircleIcon size={13} />,
        iconColor: picked ? 'var(--color-warning)' : undefined,
        onClick: () => {
          if (picked) togglePodSelected(pod.uid); else beginSelection(pod.uid);
          onClose();
        },
      },
      { id: 'sep-1', label: '', separator: true },
      {
        id: 'logs',
        label: 'Show logs',
        icon: <FileTextIcon size={13} />,
        onClick: () => { onOpen(pod, 'logs'); onClose(); },
      },
      {
        id: 'shell',
        label: 'Open shell',
        icon: <TerminalIcon size={13} />,
        // Offered only where it will work: a shell that opens on a 403 is a
        // worse answer than an item that says it is not yours to run.
        disabled: access?.exec === false,
        description: access?.exec === false
          ? 'This account cannot exec into pods in this namespace.'
          : undefined,
        onClick: () => { openShellFor(pod); onClose(); },
      },
      { id: 'sep-2', label: '', separator: true },
      {
        id: 'copy',
        label: 'Copy',
        icon: <CopyIcon size={13} />,
        children: [
          {
            id: 'copy-pod', label: 'Pod name', shortcut: 'P',
            icon: <CopyIcon size={13} />, onClick: copy(pod.name),
          },
          {
            id: 'copy-workload',
            label: pod.workload ? `${pod.workload.kind} name` : 'Workload name',
            shortcut: 'D',
            icon: <CopyIcon size={13} />,
            // A bare pod has no owning workload, and copying its own name
            // under a second label would look like it had one.
            disabled: !pod.workload,
            description: pod.workload ? undefined : 'This pod has no owning workload.',
            onClick: copy(pod.workload?.name ?? pod.name),
          },
          {
            id: 'copy-ns', label: 'Namespace', shortcut: 'N',
            icon: <CopyIcon size={13} />, onClick: copy(pod.namespace),
          },
          { id: 'copy-sep', label: '', separator: true },
          {
            id: 'copy-describe', label: 'Describe',
            description: 'Fetches it first, then copies.',
            icon: <FileTextIcon size={13} />,
            onClick: () => { copyPodText(pod, 'describe'); onClose(); },
          },
          {
            id: 'copy-yaml', label: 'YAML',
            description: 'Fetches it first, then copies.',
            icon: <FileTextIcon size={13} />,
            onClick: () => { copyPodText(pod, 'yaml'); onClose(); },
          },
        ],
      },
      {
        id: 'doctor',
        label: 'Doctor',
        icon: <StethoscopeIcon size={13} />,
        iconColor: ACCENT,
        children: doctor,
      },
      { id: 'sep-3', label: '', separator: true },
      {
        /*
          Last, and asked about before it undoes anything.

          It sat first, so the entry most likely to be hit by accident was the
          one under the cursor when the menu opened — and starring is a list
          you curate over time, where losing one is a small annoyance you only
          notice later. Adding needs no ceremony; removing does.
        */
        id: 'favorite',
        label: starred ? 'Remove from favourites' : 'Add to favourites',
        icon: <StarIcon size={13} filled={starred} />,
        iconColor: starred ? 'var(--color-warning)' : undefined,
        onClick: () => {
          if (starred) { onConfirmUnfavorite(pod); } else { toggleFavorite(key); }
          onClose();
        },
      },
    ];
  }, [pod, favorites, selected, menuProbe, guardHeapDump, access, running,
    beginSelection, togglePodSelected, copyPodText, openShellFor, collect,
    onClose, onConfirmUnfavorite, onOpen]);

  return (
    <ContextMenuView
      open={!!pod && !!at}
      anchorEl={null}
      position={at}
      onClose={onClose}
      items={items}
      width={270}
    />
  );
}
