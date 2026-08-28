# Heap dump fixtures

Golden fixtures for the Doctor heap analyzer. **The dumps are not committed** — a
minimal one is ~42 MB — so they are generated on demand and land in `out/`, which
existing `.gitignore` rules already exclude along with `build/`.

## Why these exist

A heap parser that decodes a field layout slightly wrong doesn't crash. It produces
plausible, confidently-wrong numbers — the same failure class as a test translator
that silently inverts an assertion. Without a dump whose contents are known exactly,
there is nothing to check the parser against, so these come before the parser.

## Regenerate

```
cd src/test/fixtures/heap
javac -d build gen/DaakiaHeapFixture.java
java -Xmx512m -cp build com.daakia.fixture.DaakiaHeapFixture out
```

On Windows the JDK tools may not be on `PATH` even when `java` is; use the full path,
e.g. `"/c/Program Files/Java/jdk-17/bin/javac.exe"`.

Produces:

| File | What it is |
|---|---|
| `out/leak.hprof` | Heap dump with a deliberate, exactly-countable leak |
| `out/leak.truth.json` | The planted counts, written by the generator itself |

## What is planted, and what it exercises

| Shape | Count | Exercises |
|---|---|---|
| `LeakedEntry` reachable only from a `static HashMap` | 50,000 | GC roots through a static field, dominator attribution, retained-size accumulation |
| `byte[512]`, one per entry | 50,000 | Retained size checkable by arithmetic (25,600,000 bytes) rather than against another tool |
| `DupHolder` holding `new String(...)` of identical content | 10,000 | Duplicate-string detection with a known answer |
| `DeepNode` singly-linked chain | 5,000 deep | Path-to-GC-root over a long unbranched chain |
| Parked threads holding a local | 8 | Thread roots (`ROOT_JAVA_FRAME`, `ROOT_THREAD_OBJ`), not just static roots |

Dumped with `live=true`, so a full GC runs first and unreachable objects are excluded.
That keeps the counts stable across runs.

## Validate the format walk

`scan.mjs` walks every record and sub-record without building a graph. It is the
cheapest possible check that the reader is synchronised:

```
node scan.mjs out/leak.hprof
```

A correct walk consumes **every byte** and lands exactly on the file end. Any error in
a field width desynchronises the cursor and either throws on an unknown sub-record tag
or leaves a remainder. Verified output on JDK 17.0.12 (amd64):

```
magic="JAVA PROFILE 1.0.2" idSize=8 bodyStart=31
consumed 44488360 of 44488360 bytes  EXACT
top-level tags   0x01:47900  0x02:1697  0x04:103  0x05:16  0x1c:42  0x2c:1
heap sub-records 0x01:81  0x03:225  0x05:1324  0x08:15  0x20:1526
                 0x21:243488  0x22:4786  0x23:155607
strings=47900  classes=1526  gcRoots=1645

  50000  com/daakia/fixture/DaakiaHeapFixture$LeakedEntry
  10000  com/daakia/fixture/DaakiaHeapFixture$DupHolder
   5000  com/daakia/fixture/DaakiaHeapFixture$DeepNode
```

All three match the planted constants exactly.

## Notes for the parser

- Class names arrive in JVM internal form (`com/daakia/...`), not dotted — normalise
  for display, but key on the raw name.
- This dump is **segmented**: 42 × `HEAP_DUMP_SEGMENT` (`0x1c`) then one
  `HEAP_DUMP_END` (`0x2c`). Handling a single `HEAP_DUMP` (`0x0c`) record is not enough.
- `idSize` is 8 here. A 32-bit dump cannot be produced on this machine (no 32-bit JVM
  ships for JDK 17), so the 4-byte identifier path needs a synthetic fixture or a dump
  from an older VM before it can be trusted.
