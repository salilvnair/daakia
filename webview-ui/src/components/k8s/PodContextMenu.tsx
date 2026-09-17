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
import { ContextMenuView, type ContextMenuItem, IconSize } from '@salilvnair/dui';
import {
  StarIcon, CopyIcon, LinkIcon, TerminalIcon, FileTextIcon, StethoscopeIcon, FolderOpenIcon,
  CheckCircleIcon, XCircleIcon, CpuIcon, MemoryIcon, NetworkIcon, TimelineIcon,
  ColumnsIcon,
} from '../../icons';
import { isScheduled } from '@daakia/k8s-workload';
import { filterMenuRow } from './pod-filter-menu';
import { podLogLinkForOs } from './pod-link';
import { useSplitStore, MAX_PANES } from '../../store/dk8s-split-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { logLineSettings } from './log-settings';
import { SPLIT_MODES } from './SplitLogs';
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import {
  useDk8sDoctorStore, ARTIFACT_META, type ArtifactKind,
} from '../../store/dk8s-doctor-store';
import {
  favoriteKey, useFavoriteKeys, toggleFavorite, starredKeyOf,
} from '../../store/dk8s-favorites-store';

import { ACCENT } from './tone';
import { MENU } from '../shared/menu/SurfaceMenu';
import { markRuntimeItems, targetOf } from './mark-runtime';

/*
  The diagnostics offered here, in the order the Doctor tab lists them, with
  the icons it gives them — the same action should not wear two faces
  depending on where it was reached from.
*/
const DOCTOR: { id: ArtifactKind; icon: React.ReactNode }[] = [
  { id: 'threaddump', icon: <CpuIcon size={IconSize.item} /> },
  { id: 'threaddump-sigquit', icon: <CpuIcon size={IconSize.item} /> },
  { id: 'histogram', icon: <MemoryIcon size={IconSize.item} /> },
  { id: 'heapdump', icon: <MemoryIcon size={IconSize.item} /> },
  { id: 'jfr', icon: <TimelineIcon size={IconSize.item} /> },
  { id: 'conns', icon: <NetworkIcon size={IconSize.item} /> },
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

export function PodContextMenu({ pod, at, onClose, onConfirmUnfavorite, onTestPv, onOpen }: {
  pod: PodSummary | undefined;
  at: { x: number; y: number } | undefined;
  onClose: () => void;
  /** Ask before un-starring — the grid owns the dialog. */
  onConfirmUnfavorite: (pod: PodSummary) => void;
  /** Opens the "where would a search look" check for this pod. */
  onTestPv: (pod: PodSummary) => void;
  /** Open the pod's detail view, for the items that are a way in. */
  onOpen: (pod: PodSummary, tab?: 'logs' | 'doctor' | 'explorer') => void;
}) {
  const beginSelection = useK8sStore(s => s.beginSelection);
  const togglePodSelected = useK8sStore(s => s.togglePodSelected);
  const selected = useK8sStore(s => s.selected);
  /*
    The pods behind the ticks, for the split — it opens panes from summaries
    rather than from uids.

    Derived with `useMemo` rather than inside the selector. A selector that
    filters returns a new array on every call, zustand compares it by identity,
    finds it different every time and re-renders forever — which is what this
    did: "getSnapshot should be cached", then maximum update depth, then a
    blank panel.
  */
  const allPods = useK8sStore(s => s.pods);
  const selectedPods = useMemo(
    () => allPods.filter(p => selected.includes(p.uid)),
    [allPods, selected],
  );
  const openSplit = useSplitStore(s => s.open);
  const splitPrefs = useUiStateStore(s => s.prefs);
  const splitTail = useMemo(() => logLineSettings(splitPrefs).tailDefault, [splitPrefs]);
  const copyPodText = useK8sStore(s => s.copyPodText);
  const openShellFor = useK8sStore(s => s.openShellFor);
  const menuProbe = useK8sStore(s => s.menuProbe);
  const guardHeapDump = useK8sStore(s => s.guardHeapDump);
  const access = useK8sStore(s => s.access);
  const detail = useK8sStore(s => s.detail);
  const runtimeMark = useK8sStore(s => s.runtimeMark);
  const contextName = useK8sStore(s => s.context);
  const collect = useDk8sDoctorStore(s => s.collect);
  const running = useDk8sDoctorStore(s => s.running);
  const favorites = useFavoriteKeys();
  /* The grid's filter, built once and shared with the background menu. */
  const podFilter = useK8sStore(s => s.podFilter);
  const setPodFilter = useK8sStore(s => s.setPodFilter);
  const filterRow = useMemo(
    () => filterMenuRow(allPods, podFilter, setPodFilter, MENU.read) as ContextMenuItem | undefined,
    [allPods, podFilter, setPodFilter],
  );

  const items = useMemo<ContextMenuItem[]>(() => {
    if (!pod) return [];
    const existing = starredKeyOf(pod, favorites);
    const starred = !!existing;
    /* Whichever is on comes off; a new one goes on the workload. */
    const key = existing ?? favoriteKey(pod);
    const picked = selected.includes(pod.uid);
    const copy = (text: string) => () => { void navigator.clipboard?.writeText(text); onClose(); };

    // The probe is for this pod, or it is for the last one and says nothing
    // about this one. Anything else would show one pod's capabilities under
    // another pod's name.
    const probe = menuProbe?.pod === pod.name ? menuProbe : undefined;
    /* Only for the pod that is open — a row's menu has not been probed, so it
       offers the marks without claiming to know what is already set. */
    const currentMark = detail?.name === pod.name ? runtimeMark : undefined;
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
        icon: picked ? <XCircleIcon size={IconSize.item} /> : <CheckCircleIcon size={IconSize.item} />,
        iconColor: picked ? 'var(--color-warning)' : MENU.narrow,
        onClick: () => {
          if (picked) togglePodSelected(pod.uid); else beginSelection(pod.uid);
          onClose();
        },
      },
      { id: 'sep-1', label: '', separator: true },
      {
        id: 'logs',
        iconColor: MENU.read,
        label: 'Show logs',
        icon: <FileTextIcon size={IconSize.item} />,
        onClick: () => { onOpen(pod, 'logs'); onClose(); },
      },
      /*
        Split open, where the selection can fill more than one pane.

        Only with two or more picked, because a split of one is the log view
        with extra chrome. It sits under Show logs rather than beside Select,
        since it is the other answer to the same question — show me this
        output — and the one that applies when there is more than one pod to
        show.

        The same submenu the action bar carries. A reader who found the
        selection through the menu should not have to go and find a button to
        act on it.
      */
      ...(selectedPods.length > 1 ? [{
        id: 'split',
        label: `Split open ${selectedPods.length} pods`,
        description: 'Follow them side by side, each in its own log view.',
        icon: <ColumnsIcon size={IconSize.item} />,
        iconColor: MENU.read,
        children: SPLIT_MODES.map(({ id, label, Icon }) => {
          const room = Math.min(selectedPods.length, MAX_PANES[id]);
          return {
            id: `split-${id}`,
            label,
            /* Said before it is chosen: picking five pods and a mode that
               holds three is a decision about which two get dropped. */
            description: room < selectedPods.length
              ? `The first ${room} of them.`
              : `${room} panes.`,
            icon: <Icon size={IconSize.item} />,
            iconColor: MENU.read,
            onClick: () => {
              openSplit(selectedPods, id, splitTail);
              onClose();
            },
          };
        }),
      }] : []),
      {
        id: 'shell',
        iconColor: MENU.make,
        label: 'Open shell',
        icon: <TerminalIcon size={IconSize.item} />,
        // Offered only where it will work: a shell that opens on a 403 is a
        // worse answer than an item that says it is not yours to run.
        disabled: access?.exec === false,
        description: access?.exec === false
          ? 'This account cannot exec into pods in this namespace.'
          : undefined,
        onClick: () => { openShellFor(pod); onClose(); },
      },
      { id: 'sep-2', label: '', separator: true },
      /*
        What this pod is, when dk8s could not tell.

        Here rather than only in Doctor because this is where you are when you
        notice: the pod list is the screen you scan, and being sent to open a
        pod, read a tab and find a sentence about a Kubernetes label is three
        steps to say one thing you already know.
      */
      ...markRuntimeItems(targetOf(pod, contextName ?? ''), currentMark),
      { id: 'sep-mark', label: '', separator: true },
      {
        id: 'copy',
        iconColor: MENU.copy,
        label: 'Copy',
        icon: <CopyIcon size={IconSize.item} />,
        children: [
          {
            id: 'copy-pod', label: 'Pod name', shortcut: 'P',
            icon: <CopyIcon size={IconSize.item} />, iconColor: MENU.copy,
            onClick: copy(pod.name),
          },
          {
            id: 'copy-workload',
            label: pod.workload ? `${pod.workload.kind} name` : 'Workload name',
            shortcut: 'D',
            icon: <CopyIcon size={IconSize.item} />,
            /* Left uncoloured only where it is disabled: grey is what a row you
               cannot use looks like, so it must not be worn by one you can. */
            iconColor: pod.workload ? MENU.copy : undefined,
            // A bare pod has no owning workload, and copying its own name
            // under a second label would look like it had one.
            disabled: !pod.workload,
            description: pod.workload ? undefined : 'This pod has no owning workload.',
            onClick: copy(pod.workload?.name ?? pod.name),
          },
          {
            id: 'copy-ns', label: 'Namespace', shortcut: 'N',
            icon: <CopyIcon size={IconSize.item} />, iconColor: MENU.copy,
            onClick: copy(pod.namespace),
          },
          { id: 'copy-sep', label: '', separator: true },
          {
            /*
              A link somebody else can open on this pod.

              The `vscode://` spelling rather than the app's own, because that
              is the one that survives leaving daakia: pasted into a chat it
              opens the editor on this pod, and pasted back into dk8s's own
              search box it is understood there too. One entry that works in
              both places beats two that each work in one.
            */
            id: 'copy-link', label: 'Link to this pod',
            description: 'Opens dk8s here, for anyone with daakia.',
            icon: <LinkIcon size={IconSize.item} />, iconColor: MENU.copy,
            onClick: copy(podLogLinkForOs({
              context: pod.context ?? '', namespace: pod.namespace, pod: pod.name,
            })),
          },
          { id: 'copy-sep-2', label: '', separator: true },
          {
            id: 'copy-describe', label: 'Describe',
            description: 'Fetches it first, then copies.',
            icon: <FileTextIcon size={IconSize.item} />, iconColor: MENU.read,
            onClick: () => { copyPodText(pod, 'describe'); onClose(); },
          },
          {
            id: 'copy-yaml', label: 'YAML',
            description: 'Fetches it first, then copies.',
            icon: <FileTextIcon size={IconSize.item} />, iconColor: MENU.read,
            onClick: () => { copyPodText(pod, 'yaml'); onClose(); },
          },
        ],
      },
      {
        id: 'doctor',
        label: 'Doctor',
        icon: <StethoscopeIcon size={IconSize.item} />,
        iconColor: ACCENT,
        children: doctor,
      },
      /*
        Where a log search would look, for this pod.

        Here rather than only in Settings because this is where the question
        occurs to you: a search came back empty and you want to know whether
        it looked in the wrong place or found nothing in the right one. Those
        are the same result on screen and different problems entirely.

        Never on a finished run. The question is where this app's logs pile
        up over time, and a CronJob run answers it for nobody: it is gone,
        its filesystem with it, and the paths worth checking belong to the
        app that is still up.
      */
      ...(isScheduled(pod.workload) ? [] : [{
        id: 'pv-check',
        label: 'Test PV config',
        description: 'Run every configured log path against this pod.',
        icon: <StethoscopeIcon size={IconSize.item} />,
        iconColor: MENU.narrow,
        onClick: () => { onTestPv(pod); onClose(); },
      }]),
      {
        /*
          Browsing is one exec, so it is offered exactly where the shell is —
          an Explorer that opens onto a 403 is a worse answer than an entry
          that is not there.
        */
        id: 'explorer',
        label: 'Browse files',
        icon: <FolderOpenIcon size={IconSize.item} />,
        iconColor: MENU.pin,
        onClick: () => { onOpen(pod, 'explorer'); onClose(); },
      },
      { id: 'sep-3', label: '', separator: true },
      /*
        The grid's filter, reachable from a pod as well as from the gap
        between them.

        It lived only on the background, so narrowing the list was a thing you
        did by right-clicking empty space — the harder target, and the one
        nobody thinks to try. The rows come from `pod-filter-menu`, shared with
        that background menu, so a facet added to one is in both.
      */
      ...(filterRow ? [filterRow, { id: 'sep-filter', label: '', separator: true }] : []),
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
        icon: <StarIcon size={IconSize.item} filled={starred} />,
        iconColor: 'var(--color-warning)',
        /* The app, the same as the star on the row — a pod-scoped star stopped
           referring to anything the moment the pod was replaced. */
        description: pod.workload
          ? `${pod.workload.kind} ${pod.workload.name} — survives a rollout`
          : undefined,
        onClick: () => {
          if (starred) { onConfirmUnfavorite(pod); } else { toggleFavorite(key); }
          onClose();
        },
      },
    ];
  }, [pod, favorites, selected, selectedPods, openSplit, splitTail, menuProbe, guardHeapDump, access, running, detail, runtimeMark, contextName, onTestPv, filterRow,
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
