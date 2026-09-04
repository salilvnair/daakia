/**
 * The `ls -lA` parser is the single most likely thing in the explorer to be
 * quietly wrong, so it is tested against real output from the images this will
 * actually meet: busybox/Alpine, GNU coreutils, and a symlink-heavy `/bin`. A
 * wrong parse does not throw — it shows a file with the wrong size, or drops
 * one, and nothing says so.
 */
import { describe, it, expect } from 'vitest';
import {
  parseLsLine, joinPath, parentOf, kindOf, looksBinary,
  shellQuote, explainExecFailure, VIEW_LIMIT_BYTES,
} from './pod-files';

describe('parseLsLine — busybox / Alpine', () => {
  it('reads a file', () => {
    const e = parseLsLine(
      '-rw-r--r--    1 app      app           4312 Aug 30 11:20 application.properties',
      '/etc/app');
    expect(e).toMatchObject({
      name: 'application.properties', kind: 'file', size: 4312,
      modified: 'Aug 30 11:20', path: '/etc/app/application.properties',
    });
  });

  it('reads a directory, and gives it no size', () => {
    /*
      `ls` reports 4096 for a directory, which is the size of the directory
      entry rather than of what is in it. Showing that as the folder's size
      would be a number that means nothing to the reader.
    */
    const e = parseLsLine(
      'drwxr-xr-x    2 app      app           4096 Sep  1 03:14 2026-08', '/data');
    expect(e).toMatchObject({ name: '2026-08', kind: 'dir' });
    expect(e!.size).toBeUndefined();
  });

  it('reads a symlink and where it points', () => {
    const e = parseLsLine(
      'lrwxrwxrwx    1 root     root             7 Jan  1 00:00 sh -> busybox', '/bin');
    expect(e).toMatchObject({ name: 'sh', kind: 'link', linkTarget: 'busybox' });
  });
});

describe('parseLsLine — GNU coreutils', () => {
  it('reads a file with the narrower column layout', () => {
    const e = parseLsLine('-rw-r--r-- 1 root root 1049600 Sep  3 22:00 snapshot.db', '/data');
    expect(e).toMatchObject({ name: 'snapshot.db', kind: 'file', size: 1049600 });
  });

  it('reads a year in place of a time, for an old file', () => {
    // Anything older than six months prints the year instead of HH:MM, which
    // is still three fields — the reason the split counts eight and not six.
    const e = parseLsLine('-rw-r--r-- 1 root root 812 Aug 12  2025 rotate.sh', '/opt');
    expect(e).toMatchObject({ name: 'rotate.sh', size: 812 });
  });

  it('keeps an SELinux or ACL marker out of the name', () => {
    const e = parseLsLine('-rw-r--r--. 1 root root 20 Sep  4 06:02 labelled.txt', '/data');
    expect(e).toMatchObject({ name: 'labelled.txt', size: 20 });
  });
});

describe('parseLsLine — the awkward ones', () => {
  it('keeps a filename containing spaces whole', () => {
    /*
      The reason the split stops at eight fields. Splitting the whole line
      gives `quarterly` and loses the rest, which is a file that silently
      cannot be opened because the path built from it is wrong.
    */
    const e = parseLsLine(
      '-rw-r--r-- 1 app app 91 Sep  4 06:02 quarterly report final.csv', '/data');
    expect(e!.name).toBe('quarterly report final.csv');
    expect(e!.path).toBe('/data/quarterly report final.csv');
  });

  it('skips the total line both shells print', () => {
    expect(parseLsLine('total 24', '/data')).toBeUndefined();
    expect(parseLsLine('total 0', '/data')).toBeUndefined();
  });

  it('skips . and .. rather than offering them as entries', () => {
    expect(parseLsLine('drwxr-xr-x 2 app app 4096 Sep  1 03:14 .', '/data')).toBeUndefined();
    expect(parseLsLine('drwxr-xr-x 2 app app 4096 Sep  1 03:14 ..', '/data')).toBeUndefined();
  });

  it('keeps a dotfile, which is not the same thing', () => {
    const e = parseLsLine('-rw------- 1 root root 2048 Aug 30 11:20 .keystore', '/etc');
    expect(e).toMatchObject({ name: '.keystore', kind: 'file', size: 2048 });
  });

  it('returns nothing for a line it does not understand', () => {
    // Better an entry missing than an entry invented out of a warning line.
    expect(parseLsLine('ls: cannot open directory: Permission denied', '/x')).toBeUndefined();
    expect(parseLsLine('', '/x')).toBeUndefined();
  });
});

describe('paths are always absolute', () => {
  it('joins without producing a relative path', () => {
    expect(joinPath('/var/lib', 'app')).toBe('/var/lib/app');
    expect(joinPath('/', 'etc')).toBe('/etc');
    expect(joinPath('/var/lib/', 'app')).toBe('/var/lib/app');
  });

  it('keeps an already-absolute name as it is', () => {
    // `find` returns absolute paths; joining them again would double the root.
    expect(joinPath('/var', '/etc/passwd')).toBe('/etc/passwd');
  });

  it('walks up, and stops at the root', () => {
    expect(parentOf('/var/lib/app')).toBe('/var/lib');
    expect(parentOf('/var')).toBe('/');
    expect(parentOf('/')).toBe('/');
  });

});

describe('kindOf', () => {
  it('recognises the formats that actually turn up on a pod', () => {
    expect(kindOf('application.properties').mode).toBe('properties');
    expect(kindOf('values.yaml').mode).toBe('yaml');
    expect(kindOf('ledger.csv').mode).toBe('csv');
    expect(kindOf('rotate.sh').mode).toBe('shell');
  });

  it('treats an extensionless name as text, because most of /etc is', () => {
    expect(kindOf('hosts').viewable).toBe(true);
    expect(kindOf('resolv.conf').viewable).toBe(true);
  });

  it('refuses what nothing can render', () => {
    expect(kindOf('snapshot.db').viewable).toBe(false);
    expect(kindOf('app.jar').viewable).toBe(false);
  });

  it('says "too large" rather than the type, past the cap', () => {
    // The type is irrelevant when the reason is size, and naming it would
    // suggest the file is about to open.
    const k = kindOf('huge.log', VIEW_LIMIT_BYTES + 1);
    expect(k.viewable).toBe(false);
    expect(k.label).toBe('too large');
  });
});

describe('looksBinary', () => {
  it('finds a NUL, whatever the name claimed', () => {
    expect(looksBinary('SQLite format 3\0')).toBe(true);
  });

  it('leaves ordinary text alone', () => {
    expect(looksBinary('spring.datasource.url=jdbc:postgresql://db:5432/x\n')).toBe(false);
  });

  it('does not scan a whole file to decide', () => {
    // A NUL past the first 8 KB is not worth reading a gigabyte to find.
    expect(looksBinary('a'.repeat(9000) + '\0')).toBe(false);
  });
});

describe('shellQuote', () => {
  it('survives a pattern containing a quote', () => {
    /*
      A filename with an apostrophe is ordinary, and inside `sh -c` an
      unescaped one ends the string and hands the rest to the shell as
      commands. This is the one place in the explorer where getting quoting
      wrong is a security bug rather than a display bug.
    */
    expect(shellQuote("o'brien")).toBe("'o'\\''brien'");
  });

  it('leaves a glob intact inside the quotes, for find to expand', () => {
    expect(shellQuote('*invoice*')).toBe("'*invoice*'");
  });

  it('contains a command substitution attempt rather than running it', () => {
    const quoted = shellQuote('$(rm -rf /)');
    expect(quoted).toBe("'$(rm -rf /)'");
  });
});

describe('explainExecFailure', () => {
  it('names the cause for a distroless image', () => {
    const m = explainExecFailure(
      'OCI runtime exec failed: exec failed: unable to start container process: '
      + 'exec: "ls": executable file not found in $PATH', '/data');
    expect(m).toMatch(/no shell or coreutils/i);
    expect(m).toMatch(/distroless/i);
  });

  it('separates "cannot read" from "is not there"', () => {
    // Two different things to do next, and the raw messages do not
    // distinguish them in a way anyone reads.
    expect(explainExecFailure('ls: /data: Permission denied', '/data'))
      .toMatch(/Permission denied/);
    expect(explainExecFailure('ls: /nope: No such file or directory', '/nope'))
      .toMatch(/No such directory/);
  });

  it('says RBAC when it is RBAC', () => {
    const m = explainExecFailure('Error from server (Forbidden): pods "x" is forbidden', '/');
    expect(m).toMatch(/RBAC/);
  });

  it('falls back to what the container said rather than inventing', () => {
    expect(explainExecFailure('some novel error', '/x')).toBe('some novel error');
  });
});
