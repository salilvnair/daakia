package com.daakia.fixture;

import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Random;

/**
 * Generates an application log with a deliberate error burst, plus the ground
 * truth to check an analyzer against.
 *
 * Unlike a heap or thread dump there is no single authoritative producer of log
 * text, so this cannot be validated against "what the JVM emits". What it can do
 * is plant exact counts and shapes, and emit *real* stack traces from genuinely
 * thrown exceptions rather than hand-written approximations — multi-line entries
 * are the part of log parsing most likely to be got wrong, because a stack trace
 * must attach to the entry above it rather than become 30 entries of its own.
 *
 * Layout is Logback's common pattern:
 *   2026-08-28 10:15:30.123 ERROR [http-nio-8080-exec-3] c.a.OrderService - message
 *
 * What it plants:
 *   TOTAL_LINES        message lines, deterministic (fixed seed, no wall clock)
 *   TEMPLATE_COUNT     distinct message shapes, each with varying parameters, so
 *                      template extraction has a known target to collapse to
 *   BURST_ERRORS       errors inside one 60-second window, against a low steady
 *                      background rate — this is what a real incident looks like
 *   STACK_TRACES       real exceptions with causes, so multi-line handling and
 *                      exception-type tallying are both exercised
 */
public final class DaakiaLogFixture {

    static final int TOTAL_LINES = 20_000;
    static final int TEMPLATE_COUNT = 8;
    static final int BURST_ERRORS = 300;
    static final int STACK_TRACES = 40;
    static final int BACKGROUND_ERRORS = 60;

    /** Fixed epoch so two runs produce identical output. */
    static final long START_EPOCH_MS = 1_787_000_000_000L;   // 2026-08-28T09:33:20Z
    /** The burst sits 2 hours in, and lasts one minute. */
    static final long BURST_OFFSET_MS = 2 * 60 * 60 * 1000L;
    static final long BURST_WINDOW_MS = 60 * 1000L;

    static final DateTimeFormatter FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS").withZone(ZoneOffset.UTC);

    static final String[] TEMPLATES = {
            "Processed order %d for customer %s in %dms",
            "Cache hit ratio %d%% across %d entries",
            "Fetched %d rows from table orders in %dms",
            "User %s authenticated from %s",
            "Published event %s to topic orders.v2 partition %d",
            "Scheduled job %s completed in %dms",
            "Connection pool at %d/%d active",
            "Evicted %d stale sessions older than %ds",
    };

    static final String[] LOGGERS = {
            "c.a.OrderService", "c.a.CacheManager", "c.a.OrderRepository",
            "c.a.AuthFilter", "c.a.EventPublisher", "c.a.JobRunner",
            "c.a.PoolMonitor", "c.a.SessionReaper",
    };

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("usage: DaakiaLogFixture <output-dir> [name]");
            System.exit(2);
        }
        Path outDir = Path.of(args[0]);
        Files.createDirectories(outDir);
        String name = args.length > 1 ? args[1] : "app";

        Random rnd = new Random(20260828L);   // fixed seed: deterministic output
        Path log = outDir.resolve(name + ".log");
        int stackTracesWritten = 0;
        int burstErrorsWritten = 0;
        int backgroundErrorsWritten = 0;
        long burstStart = START_EPOCH_MS + BURST_OFFSET_MS;

        try (PrintWriter w = new PrintWriter(new FileWriter(log.toFile()))) {
            for (int i = 0; i < TOTAL_LINES; i++) {
                // Spread entries evenly across four hours.
                long ts = START_EPOCH_MS + (long) ((i / (double) TOTAL_LINES) * 4 * 60 * 60 * 1000L);
                int t = i % TEMPLATE_COUNT;
                String thread = "http-nio-8080-exec-" + (1 + rnd.nextInt(16));
                String message = String.format(TEMPLATES[t],
                        args(t, rnd));

                w.printf("%s INFO  [%s] %s - %s%n", FMT.format(Instant.ofEpochMilli(ts)), thread, LOGGERS[t], message);
            }

            // ── Background errors, spread thin across the whole file ──
            for (int i = 0; i < BACKGROUND_ERRORS; i++) {
                long ts = START_EPOCH_MS + (long) ((i / (double) BACKGROUND_ERRORS) * 4 * 60 * 60 * 1000L);
                w.printf("%s WARN  [scheduler-1] c.a.JobRunner - Retrying job %s after transient failure%n",
                        FMT.format(Instant.ofEpochMilli(ts)), "job-" + (1000 + i));
                backgroundErrorsWritten++;
            }

            // ── The burst: errors concentrated in one minute ──
            for (int i = 0; i < BURST_ERRORS; i++) {
                long ts = burstStart + (long) ((i / (double) BURST_ERRORS) * BURST_WINDOW_MS);
                String thread = "http-nio-8080-exec-" + (1 + rnd.nextInt(16));
                w.printf("%s ERROR [%s] c.a.OrderService - Failed to persist order %d: connection timed out%n",
                        FMT.format(Instant.ofEpochMilli(ts)), thread, 50_000 + i);
                burstErrorsWritten++;

                // Every Nth error carries a real stack trace.
                if (stackTracesWritten < STACK_TRACES && i % (BURST_ERRORS / STACK_TRACES) == 0) {
                    w.print(realStackTrace());
                    stackTracesWritten++;
                }
            }
        }

        try (FileWriter t = new FileWriter(outDir.resolve(name + ".truth.json").toFile())) {
            t.write("{\n");
            t.write("  \"log\": \"" + name + ".log\",\n");
            t.write("  \"infoLines\": " + TOTAL_LINES + ",\n");
            t.write("  \"templateCount\": " + TEMPLATE_COUNT + ",\n");
            t.write("  \"burstErrors\": " + burstErrorsWritten + ",\n");
            t.write("  \"backgroundWarnings\": " + backgroundErrorsWritten + ",\n");
            t.write("  \"stackTraces\": " + stackTracesWritten + ",\n");
            t.write("  \"totalEntries\": " + (TOTAL_LINES + backgroundErrorsWritten + burstErrorsWritten) + ",\n");
            t.write("  \"burstStartIso\": \"" + FMT.format(Instant.ofEpochMilli(burstStart)) + "\",\n");
            t.write("  \"burstWindowMs\": " + BURST_WINDOW_MS + ",\n");
            t.write("  \"exceptionType\": \"java.net.SocketTimeoutException\",\n");
            t.write("  \"causeType\": \"java.io.IOException\"\n");
            t.write("}\n");
        }

        System.out.println("wrote " + log.toAbsolutePath() + " (" + Files.size(log) + " bytes)");
        System.out.println("entries: " + (TOTAL_LINES + backgroundErrorsWritten + burstErrorsWritten)
                + ", stack traces: " + stackTracesWritten);
    }

    /** Parameters per template, so each shape varies only in its variable parts. */
    private static Object[] args(int template, Random rnd) {
        switch (template) {
            case 0: return new Object[]{ 10_000 + rnd.nextInt(89_999), "cust-" + (100 + rnd.nextInt(900)), 5 + rnd.nextInt(300) };
            case 1: return new Object[]{ 60 + rnd.nextInt(40), 1_000 + rnd.nextInt(9_000) };
            case 2: return new Object[]{ 1 + rnd.nextInt(500), 2 + rnd.nextInt(80) };
            case 3: return new Object[]{ "user-" + (1 + rnd.nextInt(5000)), "10.0." + rnd.nextInt(255) + "." + rnd.nextInt(255) };
            case 4: return new Object[]{ "evt-" + java.util.UUID.nameUUIDFromBytes(("e" + rnd.nextInt(100000)).getBytes()), rnd.nextInt(12) };
            case 5: return new Object[]{ "job-" + (1 + rnd.nextInt(40)), 10 + rnd.nextInt(5000) };
            case 6: return new Object[]{ 1 + rnd.nextInt(40), 40 };
            case 7: return new Object[]{ rnd.nextInt(200), 1800 };
            default: return new Object[]{};
        }
    }

    /**
     * A genuinely thrown exception with a cause, so the trace has the real
     * "Caused by:" and "... N more" shapes rather than invented ones.
     */
    private static String realStackTrace() {
        try {
            try {
                throw new java.io.IOException("Connection reset by peer");
            } catch (java.io.IOException cause) {
                // initCause rather than an anonymous subclass: the latter makes the
                // trace header read "DaakiaLogFixture$1", which is not the type the
                // analyzer is supposed to report.
                java.net.SocketTimeoutException e = new java.net.SocketTimeoutException("Read timed out after 30000ms");
                e.initCause(cause);
                throw e;
            }
        } catch (Exception e) {
            StringWriter sw = new StringWriter();
            e.printStackTrace(new PrintWriter(sw));
            return sw.toString();
        }
    }
}
