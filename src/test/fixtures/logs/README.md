# Log fixtures

Golden fixture for the Doctor log analyzer. The log is **not committed** — it is
generated into `out/`, which existing `.gitignore` rules already exclude along
with `build/`.

## What is different about this one

A heap or thread dump has an authoritative producer to validate against; log
text does not. So this fixture cannot claim "matches what the JVM emits". What
it can do is plant exact counts, and emit **real** stack traces from genuinely
thrown exceptions — multi-line handling is the part of log parsing most likely
to be wrong, because a trace must attach to the entry above it rather than
become thirty entries of its own, and a parser that gets this wrong still looks
like it worked while inflating every count downstream.

## Regenerate

```
cd src/test/fixtures/logs
javac -d build gen/DaakiaLogFixture.java
java -cp build com.daakia.fixture.DaakiaLogFixture out
```

Output is deterministic — fixed seed, fixed epoch, no wall clock.

| File | What it is |
|---|---|
| `out/app.log` | 2.5 MB Logback-format log with a planted error burst |
| `out/app.truth.json` | The planted counts |

## What is planted

| Shape | Count | Exercises |
|---|---|---|
| INFO lines across 8 message shapes | 20,000 | Template extraction — 8 shapes with varying parameters must collapse to 8 |
| WARN lines spread thin across the file | 60 | The background rate a burst is measured against |
| ERROR lines inside one 60-second window | 300 | Burst detection against that baseline |
| Real exceptions with a `Caused by:` | 40 | Multi-line folding, exception-type and root-cause tallying |

Totals: 20,360 entries across 20,601 lines — the difference being the 240
continuation lines that must **not** become entries.

## Check it

```
npm run logs:verify
```

22 checks across parsing, template extraction, burst detection, correlation and
robustness — including an empty file, a log with no timestamps at all, CRLF
endings, a runaway 5,000-line stack trace, and early termination.

## Two bugs this fixture caught

**Numbers with unit suffixes never collapsed.** `\b\d+\b` requires a word
boundary after the digits, and `212ms` has none — so every duration became its
own template and 20,360 entries reduced to 2,352 shapes instead of 10.

**A lone burst was its own baseline.** Taking the median of *error-bearing*
buckets means that when the only errors in a file are the burst, the burst can
never be three times itself, and detection silently returned nothing. The
baseline is now the median over all buckets, quiet ones included.

Both produced plausible-looking output. Neither would have been noticed without
planted counts to check against.
