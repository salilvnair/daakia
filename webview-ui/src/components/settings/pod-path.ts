/**
 * Is that a path inside a container?
 *
 * The rule is one line long and the cost of breaking it is the worst kind of
 * failure this product has: a wrong path does not error, it finds nothing,
 * which looks exactly like an app with no archive. So it is said while the
 * path is being typed, rather than discovered from an empty result later.
 *
 * A Windows path is worth naming outright. The settings page used to describe
 * a volume mounted on this machine and read it with `fs`, so a drive letter
 * was once the right answer here — and habits, file pickers and configs
 * written under the old model all still produce one.
 *
 * `cleanPath` in `services/k8s/pv-in-pod` enforces the same rule where the
 * path is actually used. This is the half that can say so in words.
 */
export function pathComplaint(raw: string): string | undefined {
  const p = (raw ?? '').trim();
  if (!p) return undefined;
  if (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')) {
    return 'That is a path on a Windows machine. A path inside the container starts with "/".';
  }
  if (!p.startsWith('/')) {
    return 'A path inside a container is absolute — it starts with "/".';
  }
  return undefined;
}
