/**
 * File search with the pod's own python — the fast way.
 *
 * The `find` search (pod-files `searchScript`) pays three costs a person at a
 * terminal does not notice until a pod is big:
 *
 *  - every hit forks `ls -lLd` from a shell loop, one process per file, because
 *    busybox `find` has no `-printf`;
 *  - a regex sends every path under the root through `grep`;
 *  - the walk goes into every mounted volume, and on Azure Files or blobfuse
 *    each directory read is a round trip to storage.
 *
 * Python does the walk in one process: `os.scandir` hands back each entry with
 * its type already known, the name or regex test runs in the same loop, and the
 * stat comes from the same call. Network and FUSE mounts are read from
 * /proc/self/mounts and left out unless the search starts inside one — then
 * that volume is what was asked for — and the answer names what was left out,
 * so "not found" never quietly means "not looked at".
 *
 * Each hit is one JSON line, printed as found (`-u`), so the Explorer fills in
 * as it would from `find`. The options travel as one JSON argument: a pattern
 * is not a secret, and argv needs no `-i` on the exec.
 */
import type { PodTarget, SearchHit, SearchOptions, SearchResult } from './pod-files';
import { execArgs, searchMode, streamSearch } from './pod-files';

export const PY_SEARCH = String.raw`
import fnmatch, json, os, re, sys, time

def main():
    o = json.loads(sys.argv[1])
    root = o["root"].rstrip("/") or "/"
    mode = o["mode"]; cs = bool(o.get("caseSensitive"))
    depth = int(o.get("maxDepth") or 0); kind = o.get("kind") or "file"
    limit = int(o.get("limit") or 500); skipnet = o.get("skipNetwork", True)
    t0 = time.time()

    if mode == "regex":
        rx = re.compile(o["pattern"], 0 if cs else re.I)
        match = lambda path, name: rx.search(path) is not None
    else:
        g = o["glob"] if cs else o["glob"].lower()
        match = (lambda path, name: fnmatch.fnmatchcase(name, g)) if cs else (lambda path, name: fnmatch.fnmatchcase(name.lower(), g))

    PSEUDO_FS = {"proc", "sysfs", "cgroup", "cgroup2", "devpts", "mqueue", "debugfs", "tracefs", "securityfs",
                 "pstore", "bpf", "configfs", "fusectl", "hugetlbfs", "devtmpfs", "autofs", "binfmt_misc", "rpc_pipefs", "nsfs"}
    NET_FS = {"nfs", "nfs4", "cifs", "smb3", "smbfs", "9p", "ceph", "glusterfs", "lustre", "afs", "gpfs", "beegfs"}
    skip = {}
    for p in ("/proc", "/sys", "/dev"):
        skip[p] = "pseudo"
    try:
        with open("/proc/self/mounts") as f:
            for line in f:
                parts = line.split()
                if len(parts) < 3: continue
                mp = parts[1].replace("\\040", " ").replace("\\011", "\t")
                fs = parts[2]
                if fs in PSEUDO_FS:
                    skip[mp] = "pseudo"
                elif skipnet and (fs in NET_FS or fs.startswith("fuse.") or fs == "fuse"):
                    skip[mp] = fs
    except Exception:
        pass
    # Asked to search inside one: then it is not skipped.
    for mp in list(skip):
        if root == mp or root.startswith(mp.rstrip("/") + "/"):
            del skip[mp]

    skipped = []; found = 0; scanned = 0; denied = 0
    stack = [(root, 0)]
    out = sys.stdout
    while stack:
        d, level = stack.pop()
        try:
            it = os.scandir(d)
        except OSError:
            denied += 1
            continue
        with it:
            for e in it:
                scanned += 1
                path = e.path
                try:
                    is_dir = e.is_dir(follow_symlinks=False)
                except OSError:
                    is_dir = False
                if is_dir:
                    if path in skip:
                        if skip[path] != "pseudo":
                            skipped.append({"path": path, "fs": skip[path]})
                        continue
                    if depth == 0 or level + 1 < depth:
                        stack.append((path, level + 1))
                if kind == "file":
                    try:
                        if not e.is_file(follow_symlinks=False): continue
                    except OSError:
                        continue
                elif kind == "dir" and not is_dir:
                    continue
                if not match(path, e.name):
                    continue
                if found >= limit:
                    out.write(json.dumps({"capped": True}) + "\n")
                    finish(out, scanned, denied, skipped, t0)
                    return
                found += 1
                hit = {"p": path, "k": "dir" if is_dir else "file"}
                try:
                    if e.is_symlink(): hit["k"] = "link"
                    s = e.stat(follow_symlinks=True)
                    if not is_dir: hit["s"] = s.st_size
                    hit["m"] = time.strftime("%Y-%m-%d %H:%M", time.localtime(s.st_mtime))
                except OSError:
                    pass
                out.write(json.dumps(hit) + "\n")
    finish(out, scanned, denied, skipped, t0)

def finish(out, scanned, denied, skipped, t0):
    out.write(json.dumps({"done": True, "scanned": scanned, "denied": denied, "skipped": skipped,
                          "ms": int((time.time() - t0) * 1000)}) + "\n")
    out.flush()

try:
    main()
except re.error as e:
    print(json.dumps({"fatal": "That pattern is not a regular expression python can read: %s" % e}))
except Exception as e:
    print(json.dumps({"fatal": str(e) or type(e).__name__}))
`;

export interface PySearchOptions extends SearchOptions {
  /** Leave network and FUSE volumes out of a walk that does not start inside one. Default on. */
  skipNetwork?: boolean;
}

export function pySearchArgs(t: PodTarget, interpreter: string, o: PySearchOptions): string[] {
  const { mode, glob } = searchMode(o.pattern);
  const opts = {
    root: o.root, pattern: o.pattern, mode, glob,
    caseSensitive: !!o.caseSensitive, maxDepth: o.maxDepth ?? 8, kind: o.kind ?? 'file',
    limit: o.limit ?? 500, skipNetwork: o.skipNetwork ?? true,
  };
  return execArgs(t, [interpreter, '-u', '-c', PY_SEARCH, JSON.stringify(opts)]);
}

export interface PySearchTrailer {
  done?: boolean;
  capped?: boolean;
  fatal?: string;
  scanned?: number;
  denied?: number;
  skipped?: { path: string; fs: string }[];
  ms?: number;
}

/** One line the script printed: a hit, or what it says about the walk. */
export function parsePySearchLine(line: string): { hit: SearchHit } | { trailer: PySearchTrailer } | undefined {
  const l = line.trim();
  if (!l.startsWith('{')) return undefined;
  try {
    const o = JSON.parse(l) as { p?: string; k?: string; s?: number; m?: string } & PySearchTrailer;
    if (typeof o.p === 'string') {
      const kind = o.k === 'dir' || o.k === 'link' || o.k === 'file' ? o.k : 'other';
      return { hit: {
        path: o.p,
        name: o.p.slice(o.p.lastIndexOf('/') + 1),
        kind,
        ...(typeof o.s === 'number' ? { size: o.s } : {}),
        ...(o.m ? { modified: o.m } : {}),
      } };
    }
    return { trailer: o };
  } catch {
    return undefined;
  }
}

/**
 * The python walk, streamed like `find`'s. A `fatal` line — a regex python
 * cannot read, a crash — comes back as the error, so the caller can fall back.
 */
export async function searchFilesPy(
  t: PodTarget, interpreter: string, o: PySearchOptions, onHits?: (hits: SearchHit[]) => void,
): Promise<SearchResult> {
  let trailer: PySearchTrailer = {};
  const r = await streamSearch(pySearchArgs(t, interpreter, o), o, line => {
    const got = parsePySearchLine(line);
    if (!got) return undefined;
    if ('hit' in got) return got.hit;
    trailer = { ...trailer, ...got.trailer };
    return undefined;
  }, onHits);
  const done: PySearchTrailer = trailer;
  return {
    ...r,
    engine: 'python',
    capped: r.capped || !!done.capped,
    ...(done.fatal && !r.hits.length ? { error: done.fatal } : {}),
    ...(done.skipped?.length ? { skipped: done.skipped } : {}),
    ...(done.scanned !== undefined ? { scanned: done.scanned } : {}),
    ...(done.ms !== undefined ? { ms: done.ms } : {}),
  };
}
