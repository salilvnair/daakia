package com.daakia.fixture;

import com.sun.management.HotSpotDiagnosticMXBean;
import java.io.FileWriter;
import java.lang.management.ManagementFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;

/**
 * Generates a heap dump with a deliberate, exactly-countable leak, plus the
 * ground-truth numbers a parser test can assert against.
 *
 * Everything here is deterministic — fixed counts, fixed sizes, no randomness,
 * no time or identity hashing in the shape of the graph — so the same JDK always
 * produces the same object counts for the fixture classes.
 *
 * The shapes it plants, and what each one exercises in the analyzer:
 *
 *   LeakedEntry     ENTRY_COUNT instances reachable only from a static Map.
 *                   The classic unbounded-cache leak. Tests GC-root discovery
 *                   through a static field, dominator attribution to the map,
 *                   and retained-size accumulation.
 *
 *   byte[PAYLOAD]   One per LeakedEntry. Gives the leak a large, easily
 *                   predicted retained size: ENTRY_COUNT * PAYLOAD bytes, so a
 *                   retained-size calculation can be checked against arithmetic
 *                   rather than against another tool.
 *
 *   DupHolder       DUP_COUNT instances each holding a String with identical
 *                   content in distinct backing arrays (copied via char[], since
 *                   new String(String) shares one), so duplicate-string
 *                   detection has a known answer.
 *
 *   DeepNode        A CHAIN_DEPTH-long singly-linked chain off a static root.
 *                   Tests path-to-GC-root over a long chain and dominator-tree
 *                   depth without branching.
 *
 *   ParkedThread    THREAD_COUNT live threads, each holding a distinct object in
 *                   a local, so thread GC roots (ROOT_JAVA_FRAME / ROOT_THREAD_OBJ)
 *                   appear in the dump rather than only static roots.
 *
 * Dumped with live=true, which runs a full GC first, so unreachable objects are
 * excluded and the counts stay stable.
 */
public final class DaakiaHeapFixture {

    // ── Ground-truth constants. Change these and the assertions change with them. ──
    // ENTRY_COUNT is overridable from the command line so a second, larger dump
    // can be produced for the two-dump growth comparison. Everything else stays
    // fixed, so the delta between two dumps is attributable to the cache alone.
    static int ENTRY_COUNT        = 50_000;
    static final int PAYLOAD      = 512;
    static final int DUP_COUNT    = 10_000;
    static final int CHAIN_DEPTH  = 5_000;
    static final int THREAD_COUNT = 8;
    static final int WEAK_COUNT   = 4_000;
    static final int WEAK_PAYLOAD = 1_024;
    static final String DUP_TEXT  = "daakia-duplicate-string-fixture-value";

    /** The leak: a static map nothing ever evicts from. */
    static final Map<String, LeakedEntry> CACHE = new HashMap<>();
    /** Head of the deep chain, held statically so it stays reachable. */
    static DeepNode chainHead;
    /** Holds the duplicate-string objects alive. */
    static final List<DupHolder> DUPS = new ArrayList<>();

    /**
     * Weak-reference test: the payloads are held STRONGLY here so they survive
     * the full GC and appear in the dump, and WEAKLY by WEAK_OBSERVER below.
     *
     * That separation is the whole point. If they were only weakly held the GC
     * would collect them and there would be nothing left to measure. Held both
     * ways, the observer must retain almost nothing — its WeakReferences do not
     * keep the payloads alive — while the strong list retains all of them. An
     * analyzer that treats a referent as an ordinary edge gets this backwards
     * and blames the observer.
     */
    static final List<byte[]> WEAK_PAYLOADS_STRONG = new ArrayList<>();
    static WeakObserver WEAK_OBSERVER;

    public static final class WeakObserver {
        final java.lang.ref.WeakReference<byte[]>[] refs;
        @SuppressWarnings("unchecked")
        WeakObserver(int n) { this.refs = new java.lang.ref.WeakReference[n]; }
    }

    public static final class LeakedEntry {
        final int id;
        final byte[] payload;
        final String label;
        LeakedEntry(int id) {
            this.id = id;
            this.payload = new byte[PAYLOAD];
            this.label = "entry-" + id;
        }
    }

    public static final class DupHolder {
        final String text;
        DupHolder(String text) { this.text = text; }
    }

    public static final class DeepNode {
        final int depth;
        DeepNode next;
        DeepNode(int depth) { this.depth = depth; }
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("usage: DaakiaHeapFixture <output-dir> [entryCount] [dumpName]");
            System.exit(2);
        }
        Path outDir = Path.of(args[0]);
        Files.createDirectories(outDir);
        if (args.length > 1) ENTRY_COUNT = Integer.parseInt(args[1]);
        String dumpName = args.length > 2 ? args[2] : "leak";

        // ── Plant the leak ──
        for (int i = 0; i < ENTRY_COUNT; i++) {
            CACHE.put("key-" + i, new LeakedEntry(i));
        }

        // ── Plant the duplicate strings ──
        // new String(String) SHARES the backing array in JDK 9+, so it produces
        // distinct String objects over one byte[] and tests nothing about
        // duplicate *content*. Copying through a char[] forces a fresh backing
        // array per instance, which is the shape a real duplicate-string problem
        // has and what the analyzer's scanner needs to detect.
        for (int i = 0; i < DUP_COUNT; i++) {
            DUPS.add(new DupHolder(new String(DUP_TEXT.toCharArray())));
        }

        // ── Plant the weak-reference case ──
        WEAK_OBSERVER = new WeakObserver(WEAK_COUNT);
        for (int i = 0; i < WEAK_COUNT; i++) {
            byte[] payload = new byte[WEAK_PAYLOAD];
            WEAK_PAYLOADS_STRONG.add(payload);                                    // strong
            WEAK_OBSERVER.refs[i] = new java.lang.ref.WeakReference<>(payload);   // weak
        }

        // ── Plant the deep chain ──
        chainHead = new DeepNode(0);
        DeepNode cursor = chainHead;
        for (int d = 1; d < CHAIN_DEPTH; d++) {
            cursor.next = new DeepNode(d);
            cursor = cursor.next;
        }

        // ── Park threads so thread roots exist in the dump ──
        CountDownLatch hold = new CountDownLatch(1);
        CountDownLatch ready = new CountDownLatch(THREAD_COUNT);
        List<Thread> threads = new ArrayList<>();
        for (int t = 0; t < THREAD_COUNT; t++) {
            Thread thread = new Thread(() -> {
                byte[] localOnly = new byte[1024];  // reachable only from this frame
                ready.countDown();
                try { hold.await(); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
                if (localOnly.length == -1) System.out.print("");  // defeat elimination
            }, "daakia-fixture-" + t);
            thread.setDaemon(true);
            thread.start();
            threads.add(thread);
        }
        ready.await();

        // ── Dump ──
        Path dump = outDir.resolve(dumpName + ".hprof");
        Files.deleteIfExists(dump);
        HotSpotDiagnosticMXBean bean = ManagementFactory.newPlatformMXBeanProxy(
                ManagementFactory.getPlatformMBeanServer(),
                "com.sun.management:type=HotSpotDiagnostic",
                HotSpotDiagnosticMXBean.class);
        bean.dumpHeap(dump.toAbsolutePath().toString(), true);

        // ── Emit ground truth beside it ──
        String pkg = DaakiaHeapFixture.class.getPackageName();
        try (FileWriter w = new FileWriter(outDir.resolve(dumpName + ".truth.json").toFile())) {
            w.write("{\n");
            w.write("  \"dump\": \"" + dumpName + ".hprof\",\n");
            w.write("  \"jvm\": \"" + System.getProperty("java.version") + "\",\n");
            w.write("  \"arch\": \"" + System.getProperty("os.arch") + "\",\n");
            w.write("  \"classes\": {\n");
            w.write("    \"leakedEntry\": \"" + pkg + ".DaakiaHeapFixture$LeakedEntry\",\n");
            w.write("    \"dupHolder\":   \"" + pkg + ".DaakiaHeapFixture$DupHolder\",\n");
            w.write("    \"deepNode\":    \"" + pkg + ".DaakiaHeapFixture$DeepNode\"\n");
            w.write("  },\n");
            w.write("  \"counts\": {\n");
            w.write("    \"leakedEntry\": " + ENTRY_COUNT + ",\n");
            w.write("    \"dupHolder\": " + DUP_COUNT + ",\n");
            w.write("    \"deepNode\": " + CHAIN_DEPTH + ",\n");
            w.write("    \"fixtureThreads\": " + THREAD_COUNT + "\n");
            w.write("  },\n");
            w.write("  \"payloadBytesEach\": " + PAYLOAD + ",\n");
            w.write("  \"payloadBytesTotal\": " + ((long) ENTRY_COUNT * PAYLOAD) + ",\n");
            w.write("  \"duplicateStringText\": \"" + DUP_TEXT + "\",\n");
            w.write("  \"chainDepth\": " + CHAIN_DEPTH + ",\n");
            w.write("  \"weakCount\": " + WEAK_COUNT + ",\n");
            w.write("  \"weakPayloadEach\": " + WEAK_PAYLOAD + ",\n");
            w.write("  \"weakPayloadTotal\": " + ((long) WEAK_COUNT * WEAK_PAYLOAD) + ",\n");
            w.write("  \"weakObserverClass\": \"" + pkg + ".DaakiaHeapFixture$WeakObserver\"\n");
            w.write("}\n");
        }

        hold.countDown();
        for (Thread t : threads) t.join(1000);

        System.out.println("wrote " + dump.toAbsolutePath() + " (" + Files.size(dump) + " bytes)");
        System.out.println("wrote " + outDir.resolve(dumpName + ".truth.json").toAbsolutePath());
    }
}
