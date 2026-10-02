/**
 * IntelliSense for a script, from the container that will run it.
 *
 * A language server on this machine would check the script against this
 * machine's Python — the wrong one. `os.envhiron` is an error because of the
 * interpreter in the pod; `import boto3` is fine or not depending on what the
 * image installed; `str.removeprefix` exists on 3.9 and not on 3.8. So the
 * container's own python3 is asked, with a small analyser on the command line
 * and the script on stdin:
 *
 *   - the script is PARSED (`ast.parse`, `compile`), never run;
 *   - the modules it imports are loaded — in that separate process — to list
 *     what they really have, which is the completion list and what an
 *     attribute is checked against;
 *   - bytecode writing is off, so nothing lands on the container's disk.
 *
 * What comes back: diagnostics (syntax errors, an import the container cannot
 * satisfy, an attribute a module does not have — with "did you mean" — and
 * names never defined), the members of each imported module with kind,
 * signature and the first line of its docs, and the builtins and keywords.
 *
 * Modules the editor already holds are named in `known` and not listed again:
 * `os` has three hundred names, and they do not change between keystrokes.
 * A module reached through another is keyed by the chain that reaches it —
 * `os.path`, not `ntpath` — because that is what gets typed before the dot.
 */
import { execArgsWithStdin } from './pod-python';
import type { PodTarget } from './pod-files';

export const INTEL_MARK = '@@daakia-intel@@ ';

/*
  Python kept free of backslashes and backticks on purpose: it travels inside a
  TypeScript template and as one argv word, and an escape that means one thing
  to each is how a checker ends up with a syntax error of its own.
*/
export const ANALYZER = `import sys
sys.dont_write_bytecode = True
import ast, json, builtins, importlib, inspect, keyword, difflib
req = json.loads(sys.stdin.read())
src = req.get('source', '')
known = set(req.get('known') or [])
out = {'version': '.'.join(str(x) for x in sys.version_info[:3]), 'diagnostics': [], 'modules': {}, 'aliases': {}, 'names': [], 'defined': []}
def diag(line, col, end, msg, sev='error'):
    col = col or 0
    out['diagnostics'].append({'line': line or 1, 'col': col + 1, 'endCol': (end if end and end > col else col + 1) + 1, 'message': msg, 'severity': sev})
def kind_of(v):
    if inspect.ismodule(v): return 'module'
    if inspect.isclass(v): return 'class'
    if callable(v): return 'function'
    return 'variable'
def describe(k, v):
    kind = kind_of(v)
    sig = ''
    doc = ''
    if kind in ('function', 'class'):
        try: sig = str(inspect.signature(v))
        except Exception: sig = ''
    try:
        doc = (inspect.getdoc(v) or '').strip().split(chr(10))[0][:200] if kind != 'variable' else type(v).__name__
    except Exception:
        doc = ''
    return [k, kind, sig, doc]
def members(mod):
    items = []
    for k in sorted(dir(mod))[:600]:
        if k.startswith('__'): continue
        try: v = getattr(mod, k)
        except Exception: continue
        items.append(describe(k, v))
    return items
out['names'] = [describe(k, getattr(builtins, k)) for k in dir(builtins) if not k.startswith('_')] + [[k, 'keyword', '', ''] for k in keyword.kwlist]
def done():
    print('${INTEL_MARK}' + json.dumps(out))
    sys.exit(0)
try:
    tree = ast.parse(src)
    compile(src, 'script.py', 'exec')
except SyntaxError as e:
    col = (e.offset or 1) - 1
    end = getattr(e, 'end_offset', None)
    diag(e.lineno, col, (end - 1) if end else None, 'SyntaxError: ' + str(e.msg))
    done()
loaded = {}
def load(name, node):
    if name in loaded: return loaded[name]
    try:
        loaded[name] = importlib.import_module(name)
    except Exception as e:
        loaded[name] = None
        diag(node.lineno, node.col_offset, getattr(node, 'end_col_offset', None), type(e).__name__ + ': ' + str(e) + ' (in this container)')
    return loaded[name]
aliases = {}
defined = set(dir(builtins)) | {'__file__', '__name__', '__doc__', '__spec__', '__loader__', '__package__', '__builtins__', '__annotations__', '__path__'}
for node in ast.walk(tree):
    t = type(node).__name__
    if isinstance(node, ast.Import):
        for a in node.names:
            top = a.name.split('.')[0]
            load(a.name, node)
            if a.asname:
                aliases[a.asname] = a.name
                defined.add(a.asname)
            else:
                load(top, node)
                aliases[top] = top
                defined.add(top)
    elif isinstance(node, ast.ImportFrom):
        for a in node.names:
            defined.add(a.asname or a.name)
        if node.level or not node.module: continue
        mod = load(node.module, node)
        if mod is None: continue
        for a in node.names:
            if a.name == '*':
                defined.update(k for k in dir(mod) if not k.startswith('_'))
                continue
            if hasattr(mod, a.name):
                v = getattr(mod, a.name, None)
                if inspect.ismodule(v): aliases[a.asname or a.name] = v.__name__
                continue
            try:
                sub = importlib.import_module(node.module + '.' + a.name)
                aliases[a.asname or a.name] = sub.__name__
                continue
            except Exception:
                pass
            close = difflib.get_close_matches(a.name, [k for k in dir(mod) if not k.startswith('_')], 1)
            diag(node.lineno, node.col_offset, getattr(node, 'end_col_offset', None), "cannot import name '" + a.name + "' from '" + node.module + "'" + (" (did you mean '" + close[0] + "'?)" if close else ''))
    elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        defined.add(node.name)
    elif isinstance(node, ast.arg):
        defined.add(node.arg)
    elif isinstance(node, ast.Name) and not isinstance(node.ctx, ast.Load):
        defined.add(node.id)
    elif isinstance(node, ast.ExceptHandler) and node.name:
        defined.add(node.name)
    elif isinstance(node, (ast.Global, ast.Nonlocal)):
        defined.update(node.names)
    elif t in ('MatchAs', 'MatchStar') and isinstance(getattr(node, 'name', None), str):
        defined.add(node.name)
    elif t == 'MatchMapping' and getattr(node, 'rest', None):
        defined.add(node.rest)
def module_of(name):
    m = sys.modules.get(name)
    if m is None:
        try: m = importlib.import_module(name)
        except Exception: m = None
    return m
for alias, modname in aliases.items():
    m = module_of(modname)
    if m is None: continue
    out['aliases'][alias] = modname
    if modname not in known and modname not in out['modules']:
        out['modules'][modname] = members(m)
    for k in dir(m):
        if k.startswith('_'): continue
        sub = getattr(m, k, None)
        chain = modname + '.' + k
        if inspect.ismodule(sub) and chain not in known and chain not in out['modules'] and len(out['modules']) < 30:
            out['modules'][chain] = members(sub)
def resolve(node):
    if isinstance(node, ast.Name):
        mn = aliases.get(node.id)
        return module_of(mn) if mn else None
    if isinstance(node, ast.Attribute):
        base = resolve(node.value)
        if base is None: return None
        v = getattr(base, node.attr, None)
        return v if inspect.ismodule(v) else None
    return None
for node in ast.walk(tree):
    if isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Load):
        base = resolve(node.value)
        if base is None or hasattr(base, node.attr): continue
        try:
            importlib.import_module(base.__name__ + '.' + node.attr)
            continue
        except Exception:
            pass
        end = getattr(node, 'end_col_offset', None)
        start = (end - len(node.attr)) if end else node.col_offset
        close = difflib.get_close_matches(node.attr, [k for k in dir(base) if not k.startswith('_')], 1)
        diag(getattr(node, 'end_lineno', None) or node.lineno, start, end, "module '" + base.__name__ + "' has no attribute '" + node.attr + "'" + (" (did you mean '" + close[0] + "'?)" if close else ''))
    elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) and node.id not in defined:
        diag(node.lineno, node.col_offset, getattr(node, 'end_col_offset', None), "name '" + node.id + "' is not defined", 'warning')
out['defined'] = sorted(n for n in defined if not hasattr(builtins, n) and not n.startswith('__'))[:300]
done()
`;

export interface IntelDiagnostic {
  line: number;
  /** 1-based, as Monaco counts. */
  col: number;
  endCol: number;
  message: string;
  severity: 'error' | 'warning';
}

/** A module member: name, kind, signature, first line of its docs (or its type, for a value). */
export type IntelMember = [string, 'module' | 'class' | 'function' | 'variable' | 'keyword', string, string];

export interface IntelResult {
  version?: string;
  diagnostics: IntelDiagnostic[];
  /** Module name → members, for modules the editor did not already have. */
  modules: Record<string, IntelMember[]>;
  /** The script's names for modules: `np` → `numpy`. */
  aliases: Record<string, string>;
  /** Builtins and keywords. */
  names: IntelMember[];
  /** Names the script itself defines. */
  defined: string[];
}

/** `kubectl exec -i … -- python3 -c <analyser>`, the script to go on stdin. */
export function intelArgs(t: PodTarget, interpreter: string): string[] {
  return execArgsWithStdin(t, [interpreter, '-c', ANALYZER]);
}

/** What the analyser printed, or why there is nothing. */
export function parseIntel(stdout: string, stderr = ''): IntelResult | { error: string } {
  const line = stdout.split('\n').find(l => l.startsWith(INTEL_MARK));
  if (!line) {
    const last = stderr.trim().split('\n').pop();
    return { error: last || 'The container’s python did not answer.' };
  }
  try {
    const v = JSON.parse(line.slice(INTEL_MARK.length)) as Partial<IntelResult>;
    return {
      version: v.version,
      diagnostics: Array.isArray(v.diagnostics) ? v.diagnostics : [],
      modules: v.modules && typeof v.modules === 'object' ? v.modules : {},
      aliases: v.aliases && typeof v.aliases === 'object' ? v.aliases : {},
      names: Array.isArray(v.names) ? v.names : [],
      defined: Array.isArray(v.defined) ? v.defined : [],
    };
  } catch {
    return { error: 'The analyser’s answer did not parse.' };
  }
}
