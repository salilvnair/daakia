package com.daakia.fixture;

import java.io.FileWriter;
import java.lang.management.ManagementFactory;
import java.lang.management.ThreadMXBean;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Generates a thread dump containing a real deadlock and real lock contention,
 * plus the ground truth to check an analyzer against.
 *
 * The dump is produced by `jcmd Thread.print` against this process, so it is a
 * genuine jstack-format dump rather than something hand-written to match the
 * parser. A parser validated only against its own idea of the format is not
 * validated at all.
 *
 * What it plants:
 *
 *   DEADLOCK      Two threads taking two locks in opposite order. The JVM
 *                 detects this itself and prints a "Found one Java-level
 *                 deadlock" section, which gives the analyzer's own cycle
 *                 detection something authoritative to be checked against.
 *
 *   CONTENTION    CONTENDED_COUNT threads all blocked on one monitor held by a
 *                 thread that sleeps. This is what a real contention problem
 *                 looks like, and unlike the deadlock the JVM says nothing
 *                 about it — finding it is the analyzer's job.
 *
 *   PARKED        PARKED_COUNT threads in TIMED_WAITING on a latch, so the
 *                 state distribution has a known answer.
 *
 * Thread names are fixed and prefixed so assertions can find them without
 * depending on ordering.
 */
public final class DaakiaThreadFixture {

    static final int CONTENDED_COUNT = 12;
    static final int PARKED_COUNT = 5;

    static final Object LOCK_A = new Object();
    static final Object LOCK_B = new Object();
    static final Object HOT_MONITOR = new Object();

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("usage: DaakiaThreadFixture <output-dir> [dumpName]");
            System.exit(2);
        }
        Path outDir = Path.of(args[0]);
        Files.createDirectories(outDir);
        String dumpName = args.length > 1 ? args[1] : "deadlock";

        List<Thread> all = new ArrayList<>();

        // ── Deadlock: two threads, two locks, opposite order ──
        CountDownLatch bothInside = new CountDownLatch(2);
        Thread d1 = new Thread(() -> {
            synchronized (LOCK_A) {
                bothInside.countDown();
                await(bothInside);
                synchronized (LOCK_B) { idle(); }
            }
        }, "daakia-deadlock-1");
        Thread d2 = new Thread(() -> {
            synchronized (LOCK_B) {
                bothInside.countDown();
                await(bothInside);
                synchronized (LOCK_A) { idle(); }
            }
        }, "daakia-deadlock-2");
        d1.setDaemon(true); d2.setDaemon(true);
        d1.start(); d2.start();
        all.add(d1); all.add(d2);

        // ── Contention: one holder, many blocked ──
        CountDownLatch holderIn = new CountDownLatch(1);
        Thread holder = new Thread(() -> {
            synchronized (HOT_MONITOR) {
                holderIn.countDown();
                idle();
            }
        }, "daakia-lock-holder");
        holder.setDaemon(true);
        holder.start();
        all.add(holder);
        holderIn.await();

        for (int i = 0; i < CONTENDED_COUNT; i++) {
            Thread t = new Thread(() -> {
                synchronized (HOT_MONITOR) { idle(); }
            }, "daakia-contended-" + i);
            t.setDaemon(true);
            t.start();
            all.add(t);
        }

        // ── Parked: known TIMED_WAITING population ──
        CountDownLatch never = new CountDownLatch(1);
        for (int i = 0; i < PARKED_COUNT; i++) {
            Thread t = new Thread(() -> {
                try { never.await(10, TimeUnit.MINUTES); } catch (InterruptedException ignored) { }
            }, "daakia-parked-" + i);
            t.setDaemon(true);
            t.start();
            all.add(t);
        }

        // Let every thread reach its blocking point before dumping.
        Thread.sleep(1500);

        ThreadMXBean bean = ManagementFactory.getThreadMXBean();
        long[] deadlocked = bean.findDeadlockedThreads();
        int deadlockCount = deadlocked == null ? 0 : deadlocked.length;

        // ── Capture a real jstack-format dump via jcmd ──
        long pid = ProcessHandle.current().pid();
        Path jcmd = Path.of(System.getProperty("java.home"), "bin",
                System.getProperty("os.name").toLowerCase().contains("win") ? "jcmd.exe" : "jcmd");
        Path dump = outDir.resolve(dumpName + ".txt");
        Process p = new ProcessBuilder(jcmd.toString(), String.valueOf(pid), "Thread.print")
                .redirectOutput(dump.toFile())
                .redirectErrorStream(false)
                .start();
        if (!p.waitFor(60, TimeUnit.SECONDS) || p.exitValue() != 0) {
            System.err.println("jcmd failed with exit " + p.exitValue());
            System.exit(3);
        }

        try (FileWriter w = new FileWriter(outDir.resolve(dumpName + ".truth.json").toFile())) {
            w.write("{\n");
            w.write("  \"dump\": \"" + dumpName + ".txt\",\n");
            w.write("  \"jvm\": \"" + System.getProperty("java.version") + "\",\n");
            w.write("  \"deadlockedThreads\": " + deadlockCount + ",\n");
            w.write("  \"deadlockNames\": [\"daakia-deadlock-1\", \"daakia-deadlock-2\"],\n");
            w.write("  \"contendedCount\": " + CONTENDED_COUNT + ",\n");
            w.write("  \"contendedPrefix\": \"daakia-contended-\",\n");
            w.write("  \"lockHolderName\": \"daakia-lock-holder\",\n");
            w.write("  \"parkedCount\": " + PARKED_COUNT + ",\n");
            w.write("  \"parkedPrefix\": \"daakia-parked-\",\n");
            w.write("  \"fixtureThreads\": " + all.size() + "\n");
            w.write("}\n");
        }

        System.out.println("wrote " + dump.toAbsolutePath() + " (" + Files.size(dump) + " bytes)");
        System.out.println("deadlocked threads reported by the JVM: " + deadlockCount);
        // The deadlocked threads never finish; the JVM exits because all are daemons.
        Runtime.getRuntime().halt(0);
    }

    private static void await(CountDownLatch latch) {
        try { latch.await(5, TimeUnit.SECONDS); } catch (InterruptedException ignored) { }
    }

    /** Blocks forever without spinning, so the dump is stable while jcmd runs. */
    private static void idle() {
        try { Thread.sleep(Long.MAX_VALUE); } catch (InterruptedException ignored) { }
    }
}
