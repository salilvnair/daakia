# Thread dump fixtures

Golden fixtures for the Doctor thread analyzer. The dump is **not committed** —
it is generated on demand into `out/`, which existing `.gitignore` rules already
exclude along with `build/`.

## Why it is a real dump

The fixture does not hand-write jstack output to match the parser. It deadlocks
a real JVM and captures `jcmd <pid> Thread.print` against itself, so the parser
is validated against what the JVM actually emits. A parser checked only against
its own idea of the format is not checked at all.

That also gives two independent authorities to test against: the counts the
fixture planted, and the JVM's own `Found one Java-level deadlock` section —
which the analyzer's cycle detection is compared with rather than copied from.

## Regenerate

```
cd src/test/fixtures/threads
javac -d build gen/DaakiaThreadFixture.java
java -cp build com.daakia.fixture.DaakiaThreadFixture out
```

On Windows the JDK tools may not be on `PATH` even when `java` is; use the full
path, e.g. `"/c/Program Files/Java/jdk-17/bin/javac.exe"`.

| File | What it is |
|---|---|
| `out/deadlock.txt` | Real `jcmd Thread.print` output from a deadlocked JVM |
| `out/deadlock.truth.json` | The planted counts, written by the generator |

## What is planted

| Shape | Count | Exercises |
|---|---|---|
| Two threads taking two locks in opposite order | 2 | Cycle detection in the wait-for graph, cross-checked against the JVM's own report |
| Threads blocked on one monitor held by a sleeper | 12 | Contention detection, owner attribution, shared blocked frame — the JVM says nothing about this, so finding it is the analyzer's job |
| Threads parked on a latch | 5 | `TIMED_WAITING` accounting and parking-target parsing |

## Check it

```
npm run threads:verify
```

21 checks across parsing, deadlock detection, contention, grouping and
robustness — including an empty file, a non-dump text file, a dump truncated
mid-thread, and CRLF line endings.

## Notes for the parser

- Each thread appears **twice** in the JVM's deadlock section — once as the
  waiter and once as the holder named by the other. Both sides need dedup, or a
  two-thread cycle reads as three entries and stops matching the computed one.
- Negative line numbers appear in frames (`-3` as unsigned `4294967293`) and are
  HotSpot sentinels for compiled or native frames, not real lines.
- JDK 9+ prefixes frame locations with `module@version/`, which is stripped.
- The format is unspecified and varies by vendor and version, so unrecognised
  lines are counted and skipped rather than thrown on: one odd frame in a
  2,000-thread dump must not lose the other 1,999.
