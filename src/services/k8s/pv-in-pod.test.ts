/**
 * Reading and searching a volume that is inside the cluster.
 *
 * The parsing is where this is fragile: `ls` and `grep` print formats that
 * differ between busybox and coreutils, and a path may contain both of the
 * characters grep uses as separators. Every case here came from an output
 * shape a real image produces.
 */
import { describe, it, expect } from 'vitest';
import {
  parseLsLine, parseGrepLine, parseLsDate, relativeTo, cleanPath,
  grepScript, findScript, escapeRegex, explain,
} from './pv-in-pod';

const ROOT = '/prodapp-prod-pvc/prodapp_prod_logs';

describe('a path inside a container', () => {
  it('is absolute', () => {
    expect(cleanPath('/var/log')).toBe('/var/log');
    expect(cleanPath('  /var/log/  ')).toBe('/var/log');
  });

  it('is not a Windows path, and not a relative one', () => {
    /* The bug this exists for: a POSIX path resolved on Windows came back as
       `C:\prodapp-prod-pvc\…`, naming a drive letter nobody typed about a
       machine that was never involved. */
    expect(cleanPath('C:\\prodapp-prod-pvc')).toBeUndefined();
    expect(cleanPath('logs')).toBeUndefined();
    expect(cleanPath('')).toBeUndefined();
  });
});

describe('reading an ls line', () => {
  it('takes size, time and path from what busybox prints', () => {
    const f = parseLsLine(
      '-rw-r--r--    1 0        0              152 Sep 16 02:47 '
      + `${ROOT}/archive/prodapp-2026-09-14.log`, ROOT,
    );
    expect(f?.rel).toBe('archive/prodapp-2026-09-14.log');
    expect(f?.bytes).toBe(152);
    expect(f?.mtime).toBeDefined();
  });

  it('keeps a path with spaces in it whole', () => {
    /* The path is everything after the date, which is why it is taken by
       position rather than by splitting on whitespace. */
    const f = parseLsLine(
      `-rw-r--r-- 1 0 0 10 Sep 16 02:47 ${ROOT}/old logs/app.log`, ROOT,
    );
    expect(f?.rel).toBe('old logs/app.log');
  });

  it('ignores a directory, a total line and noise', () => {
    expect(parseLsLine(`drwxr-xr-x 2 0 0 4096 Sep 16 02:47 ${ROOT}/archive`, ROOT)).toBeUndefined();
    expect(parseLsLine('total 20', ROOT)).toBeUndefined();
    expect(parseLsLine('', ROOT)).toBeUndefined();
    expect(parseLsLine('ls: cannot access', ROOT)).toBeUndefined();
  });

  it('refuses a relative path, which is not ours', () => {
    expect(parseLsLine('-rw-r--r-- 1 0 0 10 Sep 16 02:47 app.log', ROOT)).toBeUndefined();
  });
});

describe('reading an ls date', () => {
  const now = Date.UTC(2026, 8, 16);           // 16 September 2026

  it('takes a year when ls printed one', () => {
    expect(parseLsDate('Mar  4 2024', now)).toBe(Date.UTC(2024, 2, 4));
  });

  it('takes this year for a clock time already past', () => {
    expect(parseLsDate('Sep 16 02:47', now)).toBe(Date.UTC(2026, 8, 16, 2, 47));
  });

  it('takes last year for one that would be in the future', () => {
    /* `ls` prints a clock for anything within six months, so a December date
       read in January is last December — not next. */
    expect(parseLsDate('Dec 20 23:00', now)).toBe(Date.UTC(2025, 11, 20, 23, 0));
  });

  it('is nothing at all when it cannot be read', () => {
    // A wrong timestamp decides which file a "last 6 hours" search opens.
    expect(parseLsDate('whenever')).toBeUndefined();
    expect(parseLsDate('Xyz 40 99:99')).toBeUndefined();
  });
});

describe('reading a grep line', () => {
  it('reads a hit', () => {
    const m = parseGrepLine(`${ROOT}/prodapp.log:42:ERROR timeout talking to billing`, ROOT);
    expect(m).toMatchObject({
      rel: 'prodapp.log', line: 42, text: 'ERROR timeout talking to billing',
    });
    expect(m?.context).toBeUndefined();
  });

  it('reads a context line against the files that had hits', () => {
    const m = parseGrepLine(`${ROOT}/prodapp.log-41-INFO starting`, ROOT,
      [`${ROOT}/prodapp.log`]);
    expect(m).toMatchObject({ rel: 'prodapp.log', line: 41, context: true });
  });

  it('is not fooled by a date in the line it is quoting', () => {
    /*
      The live archive broke the first version of this. Greedy on the dash
      matched the `-09-` inside `… archived day 2026-09-14`, and the file came
      back as `archive/prodapp-2026-09-14.log-1-2026-09-14 INFO …`.
    */
    const file = `${ROOT}/archive/prodapp-2026-09-14.log`;
    const m = parseGrepLine(
      `${file}-1-2026-09-14 INFO  [main] c.a.CheckoutService - archived day 2026-09-14`,
      ROOT, [file],
    );
    expect(m?.rel).toBe('archive/prodapp-2026-09-14.log');
    expect(m?.line).toBe(1);
    expect(m?.text).toContain('archived day 2026-09-14');
  });

  it('takes the longest matching file, because one path can prefix another', () => {
    const short = `${ROOT}/app.log`;
    const long = `${ROOT}/app.log.1`;
    const m = parseGrepLine(`${long}-3-line`, ROOT, [short, long]);
    expect(m?.file).toBe(long);
  });

  it('drops a context line for a file that had no hit, rather than guessing', () => {
    expect(parseGrepLine(`${ROOT}/other.log-3-x`, ROOT, [])).toBeUndefined();
  });

  it('ignores the separator grep puts between groups', () => {
    expect(parseGrepLine('--', ROOT)).toBeUndefined();
  });

  it('survives a path containing a colon and a dash', () => {
    /* The split is anchored on the LAST `:<digits>:`, because the path may
       hold both characters and a filename like `app-2026-09-14.log` holds
       three dashes before the one that matters. */
    const m = parseGrepLine(`${ROOT}/archive/app-2026-09-14.log:7:took 12:30 to finish`, ROOT);
    expect(m?.rel).toBe('archive/app-2026-09-14.log');
    expect(m?.line).toBe(7);
    expect(m?.text).toBe('took 12:30 to finish');
  });

  it('keeps a matched line that is itself empty', () => {
    const m = parseGrepLine(`${ROOT}/prodapp.log:9:`, ROOT);
    expect(m?.line).toBe(9);
    expect(m?.text).toBe('');
  });
});

describe('the command it runs', () => {
  it('greps recursively, in the pod, with the context asked for', () => {
    const s = grepScript(ROOT, 'timeout', { contextLines: 2 });
    expect(s).toContain('grep -rn');
    expect(s).toContain('-C 2');
    expect(s).toContain(ROOT);
    // Capped, so a matching log of a million lines cannot be the answer.
    expect(s).toContain('head -n');
  });

  it('is case-insensitive unless asked otherwise', () => {
    expect(grepScript(ROOT, 'x', {})).toContain('-Ei');
    expect(grepScript(ROOT, 'x', { caseSensitive: true })).toContain('-E ');
  });

  it('treats a literal search literally', () => {
    /* `c.a.CheckoutService` is a logger name, not a wildcard for anything. */
    expect(escapeRegex('c.a.CheckoutService')).toBe('c\\.a\\.CheckoutService');
    expect(grepScript(ROOT, 'c.a.X', {})).toContain('c\\.a\\.X');
    expect(grepScript(ROOT, 'c.a.X', { regex: true })).toContain('c.a.X');
  });

  it('passes the pattern with -e, so one starting with a dash is a pattern', () => {
    expect(grepScript(ROOT, '-v', {})).toContain('-e ');
  });

  it('bounds the walk when listing', () => {
    const s = findScript(ROOT, ['*.log'], 100);
    expect(s).toContain('-maxdepth');
    expect(s).toContain('-type f');
    expect(s).toContain('head -n 100');
  });
});

describe('a path relative to its root', () => {
  it('drops the root and its slash', () => {
    expect(relativeTo(ROOT, `${ROOT}/archive/a.log`)).toBe('archive/a.log');
  });

  it('leaves a path that is not under the root alone', () => {
    expect(relativeTo(ROOT, '/var/log/a.log')).toBe('/var/log/a.log');
  });
});

describe('what went wrong', () => {
  it('names the mount when there is nothing at the path', () => {
    expect(explain('ls: /x: No such file or directory', '/x')).toContain('Nothing is mounted at /x');
  });

  it('separates "not mounted" from "mounted and unreadable"', () => {
    /* Two different problems needing two different things done — and the
       second is invisible from outside the container. */
    expect(explain('grep: /x: Permission denied', '/x')).toContain('not for the user');
  });

  it('says when the image cannot do it at all', () => {
    expect(explain('sh: grep: not found', '/x')).toContain('no shell or no grep');
  });

  it('says when the container is not running', () => {
    expect(explain('error: unable to upgrade connection: container not found', '/x'))
      .toContain('may not be running');
  });
});
