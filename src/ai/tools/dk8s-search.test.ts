/**
 * The question this has to answer: "requestDataId 4242 failed — every thread,
 * before and after". On a busy pod the log around a hit is a dozen threads
 * interleaved, and the answer is only useful if it is the hit's OWN thread.
 */
import { describe, it, expect } from 'vitest';
import {
  threadOf, groupByThread, failureMatcher, maskForModel, toModelText, runDk8sSearch,
  type Dk8sSearchResult,
} from './dk8s-search';
import type { SearchMatch, SearchOptions } from '../../services/k8s/k8s-log-search';

const L = (thread: string, level: string, msg: string, t = '09:15:06.749') =>
  `2026-09-23T${t}Z ${level.padStart(5)} 1 --- [zp-backend] [${thread.padStart(15)}] `
  + `c.z.backend.client.DownstreamClient      : ${msg}`;

const match = (over: Partial<SearchMatch>): SearchMatch => ({
  pod: 'zp-backend-big-one-79879f65f7-6f5zb', namespace: 'com-zp-prod', context: 'com-eastus-zp-prod',
  line: 1, level: 'info', text: '', hits: [], before: [], after: [], ...over,
});

describe('which thread a line is on', () => {
  it('reads it off the Spring Boot layout', () => {
    expect(threadOf(L('nio-8104-exec-4', 'INFO', 'hello'))).toBe('nio-8104-exec-4');
  });

  it('says nothing for a line with no layout, rather than guessing', () => {
    expect(threadOf('just a message')).toBeUndefined();
  });
});

describe('grouping hits by thread', () => {
  const failure = failureMatcher();

  it('keeps only the hit\'s own thread from the neighbours', () => {
    const m = match({
      text: L('nio-8104-exec-4', 'ERROR', 'hard disconnect failed for requestDataId=4242'),
      level: 'error',
      before: [
        L('nio-8104-exec-4', 'INFO', 'calling prsu-inventory for requestDataId=4242'),
        L('nio-8104-exec-9', 'INFO', 'GET /api/v1/rules -> 200 in 20ms'),
        L('nio-8104-exec-4', 'INFO', 'request 4242 moved to status 940'),
      ],
      after: [
        L('scheduling-2', 'INFO', 'disconnect scheduler picked up 3 requests'),
        L('nio-8104-exec-4', 'INFO', 'request 4242 moved to status 945'),
      ],
    });
    const { groups } = groupByThread([m], { around: 20, failure });
    expect(groups).toHaveLength(1);
    expect(groups[0].thread).toBe('nio-8104-exec-4');
    expect(groups[0].lines.map(l => l.role)).toEqual(['before', 'before', 'failure', 'after']);
    // exec-9 and scheduling-2 are someone else's requests.
    expect(groups[0].lines.some(l => l.text.includes('exec-9'))).toBe(false);
  });

  it('keeps a stack trace with the line it belongs to, in order', () => {
    const m = match({
      text: L('nio-8104-exec-4', 'INFO', 'request 4242 moved to status 945'),
      before: [
        L('nio-8104-exec-4', 'ERROR', 'hard disconnect failed for requestDataId=4242'),
        '\tat c.z.backend.client.DownstreamClient.call(DownstreamClient.java:88)',
        '\t... 31 more',
      ],
    });
    const { groups } = groupByThread([m], { around: 20, failure });
    // The frames fold under the line they belong to, so they cannot push its neighbours off the card.
    expect(groups[0].lines).toHaveLength(2);
    expect(groups[0].lines[0].frames).toEqual([
      'at c.z.backend.client.DownstreamClient.call(DownstreamClient.java:88)', '... 31 more',
    ]);
    expect(groups[0].lines[0].msg).toBe('hard disconnect failed for requestDataId=4242');
    expect(groups[0].lines[0].logger).toContain('DownstreamClient');
    expect(groups[0].lines[1].role).toBe('hit');
  });

  it('drops frames that belong to another thread\'s line', () => {
    const m = match({
      text: L('nio-8104-exec-4', 'INFO', 'request 4242 moved to status 945'),
      before: [
        L('nio-8104-exec-9', 'ERROR', 'someone else failed'),
        '\tat somebody.Else.run(Else.java:1)',
      ],
    });
    const { groups } = groupByThread([m], { around: 20, failure });
    expect(groups[0].lines).toHaveLength(1);
  });

  it('stops at `around` lines each side', () => {
    const before = Array.from({ length: 30 }, (_, i) => L('nio-8104-exec-4', 'INFO', `step ${i}`));
    const m = match({ text: L('nio-8104-exec-4', 'ERROR', 'failed for 4242'), level: 'error', before });
    const { groups } = groupByThread([m], { around: 5, failure });
    expect(groups[0].lines.filter(l => l.role === 'before')).toHaveLength(5);
    // The five nearest, not the five oldest.
    expect(groups[0].lines[4].text).toContain('step 29');
  });

  it('records what it ran, as the commands that ran', async () => {
    const r = await runDk8sSearch({ query: '4242' }, {
      targets: [{ context: 'c', namespace: 'n', pod: 'p-1' }],
      searchLogs: (_t, _o, cb) => {
        cb.onPodDone({ pod: 'p-1', namespace: 'n', context: 'c', scanned: 10, matched: 2, capped: false, elapsedMs: 40 }, []);
        cb.onFinished({ pods: 1, matched: 2, scanned: 10, stopped: false });
        return { cancel() {} };
      },
      searchArchive: async () => ({
        result: { pod: 'p-1', namespace: 'n', scanned: 0, matched: 1, capped: false, elapsedMs: 900, files: [], commands: ['kubectl --context c -n n exec p-1 -- sh -c "grep -rn 4242 /var/log"'] },
        matches: [],
      }),
    });
    expect(r.runs!.map(x => x.kind)).toEqual(['live', 'archive']);
    expect(r.runs![0].command).toBe('kubectl --context c -n n logs p-1 --timestamps --tail=20000');
    expect(r.runs![1].command).toContain('grep -rn 4242');
  });

  it('makes one group per thread, failures first', () => {
    const quiet = match({ text: L('scheduling-2', 'INFO', 'picked up 4242') });
    const loud = match({ text: L('nio-8104-exec-4', 'ERROR', 'failed for 4242'), level: 'error' });
    const { groups } = groupByThread([quiet, loud], { around: 20, failure });
    expect(groups.map(g => g.thread)).toEqual(['nio-8104-exec-4', 'scheduling-2']);
  });

  it('numbers citations in reading order across every group', () => {
    const a = match({ text: L('nio-8104-exec-4', 'ERROR', 'failed for 4242'), level: 'error' });
    const b = match({ text: L('scheduling-2', 'INFO', 'picked up 4242') });
    const { groups } = groupByThread([b, a], { around: 20, failure });
    expect(groups[0].lines.find(l => l.n)?.n).toBe(1);
    expect(groups[1].lines.find(l => l.n)?.n).toBe(2);
  });

  it("never cites or counts another request's failure that sat beside a hit", () => {
    // exec-9 served 8505 just before 9806 — 8505's timeout is context, not ours.
    const m = match({
      text: L('nio-8104-exec-9', 'INFO', 'calling moig for requestDataId=9806'),
      before: [L('nio-8104-exec-9', 'ERROR', 'read timed out after 30000ms calling billing for requestDataId=8505')],
    });
    const ours = match({ text: L('scheduling-1', 'ERROR', 'read timed out after 30000ms calling moig for requestDataId=9806'), level: 'error' });
    const { groups } = groupByThread([m, ours], { around: 20, failure });
    expect(groups.map(g => g.thread)).toEqual(['scheduling-1', 'nio-8104-exec-9']);
    expect(groups[1].failures).toBe(0);
    const theirs = groups[1].lines[0];
    expect(theirs).toMatchObject({ role: 'before', alarm: true });
    expect(theirs.n).toBeUndefined();
    expect(groups[0].lines[0].n).toBe(1);
  });

  it('masks what the card shows, and keeps the raw line to find it by', () => {
    const raw = L('nio-8104-exec-4', 'INFO', 'request payload {"requestDataId":4242,"card":{"last4":"9359","token":"tok_live_32019358"}}');
    const { groups } = groupByThread([match({ text: raw })], { around: 20, failure });
    expect(groups[0].lines[0].msg).not.toContain('tok_live');
    expect(groups[0].lines[0].msg).toContain('"token":"••••••"');
    expect(groups[0].lines[0].text).toBe(raw);
  });

  it('does not repeat a line that came back as both a hit and context', () => {
    const shared = L('nio-8104-exec-4', 'INFO', 'request 4242 moved to status 940');
    const a = match({ text: L('nio-8104-exec-4', 'ERROR', 'failed for 4242'), level: 'error', before: [shared] });
    const b = match({ text: shared });
    const { groups } = groupByThread([a, b], { around: 20, failure });
    expect(groups[0].lines.filter(l => l.text === shared)).toHaveLength(1);
    expect(groups[0].lines.find(l => l.text === shared)?.role).toBe('hit');
  });

  it('keeps live and archive apart, because they open differently', () => {
    const live = match({ text: L('nio-8104-exec-4', 'INFO', '4242 live') });
    const archived = { ...match({ text: L('nio-8104-exec-4', 'INFO', '4242 old') }),
      source: 'archive' as const, rel: 'zp-backend.2026-09-23.0.log', file: '/var/log/zp-backend/zp-backend.2026-09-23.0.log', line: 5786 };
    const { groups } = groupByThread([live, archived], { around: 20, failure });
    expect(groups.map(g => g.source).sort()).toEqual(['archive', 'live']);
    expect(groups.find(g => g.source === 'archive')!.lines[0].fileLine).toBe(5786);
  });
});

describe('what counts as a failure', () => {
  it('catches the usual shapes by default', () => {
    const f = failureMatcher();
    for (const t of ['ERROR boom', 'POST /x -> 500 in 20ms', 'hard disconnect failed', 'java.io.IOException']) {
      expect(f.test(t), t).toBe(true);
    }
    expect(f.test('POST /x -> 200 in 20ms')).toBe(false);
  });

  it('survives a model\'s regex that does not compile', () => {
    expect(failureMatcher('5xx|(unclosed').test('the (unclosed thing')).toBe(true);
  });
});

describe('what leaves the machine', () => {
  it('masks credential values and keeps the keys', () => {
    expect(maskForModel('"card":{"last4":"4471","token":"tok_live_9Qa"}'))
      .toBe('"card":{"last4":"4471","token":"••••••"}');
    expect(maskForModel('Authorization: Bearer abc.def.ghi')).toBe('Authorization: Bearer ••••••');
    expect(maskForModel('password=hunter2 user=salil')).toBe('password=•••••• user=salil');
  });

  it('tells the model plainly when nothing matched', () => {
    const empty: Dk8sSearchResult = {
      query: 'requestDataId=1', around: 20, groups: [], errors: [], truncated: false,
      scanned: { pods: 9, lines: 1000, archivePods: 0 }, elapsedMs: 5,
    };
    expect(toModelText(empty)).toContain('NO LINE MATCHED');
  });

  it('numbers the lines it sends and masks them', () => {
    const { groups } = groupByThread([match({
      text: L('nio-8104-exec-4', 'ERROR', 'failed token=tok_live_9Qa for 4242'), level: 'error',
    })], { around: 20, failure: failureMatcher() });
    const text = toModelText({
      query: '4242', around: 20, groups, errors: [], truncated: false,
      scanned: { pods: 1, lines: 10, archivePods: 0 }, elapsedMs: 5,
    });
    expect(text).toContain('[1] failure');
    expect(text).not.toContain('tok_live_9Qa');
  });
});

describe('the archive, pod by pod', () => {
  it('says which pod it is reading and where, counts the files that held a hit, and names the workload of each group', async () => {
    const phases: Record<string, unknown>[] = [];
    const hit = (pod: string) => ({
      pod, namespace: 'n', context: 'c', line: 7, level: 'error', hits: [], before: [], after: [],
      text: L('nio-8104-exec-4', 'ERROR', 'failed for 4242'), source: 'archive' as const,
      rel: 'zp.log.1', file: '/var/log/zp/zp.log.1',
    });
    const r = await runDk8sSearch({ query: '4242' }, {
      targets: [
        { context: 'c', namespace: 'n', pod: 'zp-a', workload: 'zp-backend' },
        { context: 'c', namespace: 'n', pod: 'zp-b', workload: 'zp-backend' },
      ],
      searchLogs: (_t, _o, cb) => { cb.onFinished({ pods: 2, matched: 0, scanned: 0, stopped: false }); return { cancel() {} }; },
      searchArchive: async (t) => ({
        result: {
          pod: t.pod, namespace: 'n', scanned: 0, matched: 1, capped: false, elapsedMs: 5, roots: ['/var/log/zp'],
          files: t.pod === 'zp-a' ? [{ rel: 'zp.log.1', file: '/var/log/zp/zp.log.1', bytes: 0, mtime: 0, scanned: 0, matched: 1 }] : [],
        },
        matches: t.pod === 'zp-a' ? [hit(t.pod)] : [],
      }),
      onPhase: p => phases.push({ ...p }),
    });
    const running = phases.filter(p => p.phase === 'archive' && p.pod);
    expect(running.map(p => [p.pod, p.podIndex])).toEqual([['zp-a', 1], ['zp-b', 2]]);
    // The second pod is announced under the path the first one was read at.
    expect(running[1].roots).toEqual(['/var/log/zp']);
    expect(running[1].files).toBe(1);
    expect(phases.at(-1)).toMatchObject({ phase: 'archive', state: 'done', files: 1, roots: ['/var/log/zp'] });
    expect(r.scanned.archiveFiles).toBe(1);
    expect(r.groups[0].workload).toBe('zp-backend');
  });
});

describe('running it', () => {
  const targets = [
    { context: 'c', namespace: 'n', pod: 'zp-backend-big-one-1' },
    { context: 'c', namespace: 'n', pod: 'postgres-1' },
  ];

  it('searches only the pods the glob names', async () => {
    const seen: string[] = [];
    await runDk8sSearch({ query: '4242', pods: 'zp-backend*' }, {
      targets,
      searchLogs: (t, _o, cb) => { seen.push(...t.map(x => x.pod)); cb.onFinished({ pods: 1, matched: 0, scanned: 0, stopped: false }); return { cancel() {} }; },
    });
    expect(seen).toEqual(['zp-backend-big-one-1']);
  });

  it('reads a /regex/ query as a regex', async () => {
    let regex = false;
    await runDk8sSearch({ query: '/requestDataId=42\\d\\d/' }, {
      targets,
      searchLogs: (_t, o, cb) => { regex = o.regex; cb.onFinished({ pods: 0, matched: 0, scanned: 0, stopped: false }); return { cancel() {} }; },
    });
    expect(regex).toBe(true);
  });

  it('searches inside a window with room for a busy thread', async () => {
    let seen: SearchOptions | undefined;
    await runDk8sSearch({ query: 'scheduling-1', from: '2026-09-25T02:39:45Z', to: '2026-09-25T02:40:46Z', archive: false }, {
      targets,
      searchLogs: (_t, o, cb) => { seen = o; cb.onFinished({ pods: 0, matched: 0, scanned: 0, stopped: false }); return { cancel() {} }; },
    });
    expect(seen!.fromMs).toBe(Date.parse('2026-09-25T02:39:45Z'));
    expect(seen!.toMs).toBe(Date.parse('2026-09-25T02:40:46Z'));
    expect(seen!.maxMatchesPerPod).toBeGreaterThan(40);
  });

  it('searches a thread as a whole name, and keeps only the lines it wrote', async () => {
    let seen: SearchOptions | undefined;
    const r = await runDk8sSearch({ thread: 'scheduling-1', archive: false }, {
      targets,
      searchLogs: (t, o, cb) => {
        seen = o;
        const hit = (thread: string, msg: string) => ({
          pod: t[0].pod, namespace: 'n', context: 'c', line: 1, level: 'info', hits: [], before: [], after: [],
          text: L(thread, 'INFO', msg),
        });
        cb.onPodDone({ pod: t[0].pod, namespace: 'n', context: 'c', scanned: 3, matched: 3, capped: false, elapsedMs: 1 },
          [hit('scheduling-1', 'mine'), hit('scheduling-2', 'handing off to scheduling-1'), hit('scheduling-1', 'mine too')]);
        cb.onFinished({ pods: 1, matched: 3, scanned: 3, stopped: false });
        return { cancel() {} };
      },
    });
    const re = new RegExp(seen!.query);
    expect(seen!.regex).toBe(true);
    expect(re.test('[   scheduling-1] x')).toBe(true);
    expect(re.test('[  scheduling-10] x')).toBe(false);
    expect(r.groups.map(g => g.thread)).toEqual(['scheduling-1']);
    expect(r.groups[0].lines.filter(l => l.role === 'hit')).toHaveLength(2);
  });

  it('ignores a time it cannot read rather than searching nothing', async () => {
    let seen: SearchOptions | undefined;
    await runDk8sSearch({ query: 'x', from: 'yesterday-ish', archive: false }, {
      targets,
      searchLogs: (_t, o, cb) => { seen = o; cb.onFinished({ pods: 0, matched: 0, scanned: 0, stopped: false }); return { cancel() {} }; },
    });
    expect(seen!.fromMs).toBeUndefined();
  });

  it('holds `around` to 500 however much is asked for', async () => {
    const r = await runDk8sSearch({ query: 'x', around: 100000 }, {
      targets,
      searchLogs: (_t, _o, cb) => { cb.onFinished({ pods: 0, matched: 0, scanned: 0, stopped: false }); return { cancel() {} }; },
    });
    expect(r.around).toBe(500);
  });

  it('gives up at the timeout rather than hanging the conversation', async () => {
    let cancelled = false;
    const r = await runDk8sSearch({ query: 'x' }, {
      targets, timeoutMs: 30,
      searchLogs: () => ({ cancel() { cancelled = true; } }),
    });
    expect(cancelled).toBe(true);
    expect(r.groups).toEqual([]);
  });

  it('says which pod failed to read instead of dropping it', async () => {
    const r = await runDk8sSearch({ query: 'x', archive: false }, {
      targets,
      searchLogs: (_t, _o, cb) => {
        cb.onPodDone({ pod: 'postgres-1', namespace: 'n', context: 'c', scanned: 0, matched: 0, capped: false, elapsedMs: 1, error: 'forbidden' }, []);
        cb.onFinished({ pods: 2, matched: 0, scanned: 0, stopped: false });
        return { cancel() {} };
      },
    });
    expect(r.errors).toEqual([{ pod: 'postgres-1', error: 'forbidden' }]);
  });
});
