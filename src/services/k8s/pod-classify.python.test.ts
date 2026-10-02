/**
 * The probe's Python answers: which interpreter, which version, and where a
 * script could be written.
 *
 * The script is shell and runs in a container; this checks the half that
 * reads its answer, which is where a wrong "python 3.11" in a header would
 * come from.
 */
import { describe, it, expect } from 'vitest';
import { parseProbeOutput, type PodCapabilities } from './pod-classify';

const empty = (): PodCapabilities => ({
  shell: null, tar: false, python3: false, jcmd: false, jstack: false, jmap: false, jfr: false,
});

describe('parseProbeOutput — python', () => {
  it('reads the version, the binary and the writable directories', () => {
    const caps = parseProbeOutput([
      'shell=sh',
      'bin=tar',
      'bin=python3',
      'pid=python:1',
      'py3=Python 3.11.6',
      'wdir=/tmp',
      'wdir=/dev/shm',
      'wdir=/home/app',
    ].join('\n'), empty());
    expect(caps.python3).toBe(true);
    expect(caps.python3Version).toBe('Python 3.11.6');
    expect(caps.pythonVersion).toBeUndefined();
    expect(caps.writableDirs).toEqual(['/tmp', '/dev/shm', '/home/app']);
    expect(caps.targetPid).toBe('1');
  });

  it('keeps a Python 2 `python` apart from python3', () => {
    const caps = parseProbeOutput('shell=bash\npy=Python 2.7.18\n', empty());
    expect(caps.python3Version).toBeUndefined();
    expect(caps.pythonVersion).toBe('Python 2.7.18');
  });

  it('ignores an error where a version should be', () => {
    const caps = parseProbeOutput('py3=sh: python3: Permission denied\n', empty());
    expect(caps.python3Version).toBeUndefined();
  });

  it('reports a read-only /tmp by its absence', () => {
    const caps = parseProbeOutput('shell=sh\nwdir=/dev/shm\n', empty());
    expect(caps.writableDirs).toEqual(['/dev/shm']);
  });

  it('never offers / or a relative path as somewhere to write', () => {
    const caps = parseProbeOutput('wdir=/\nwdir=tmp\n', empty());
    expect(caps.writableDirs).toBeUndefined();
  });

  it('tolerates CRLF', () => {
    const caps = parseProbeOutput('py3=Python 3.12.1\r\nwdir=/tmp\r\n', empty());
    expect(caps.python3Version).toBe('Python 3.12.1');
    expect(caps.writableDirs).toEqual(['/tmp']);
  });
});
