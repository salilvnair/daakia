/*
 * A workload with known faults, for judging the profiler.
 *
 * Everything dk8s has been tested against so far was an idle pod, which proves
 * the mechanics and nothing else. This is the opposite: a service under steady
 * load with four specific problems planted in it, each of a different kind, so
 * the question stops being "does the viewer render" and becomes "does it point
 * at the thing that is actually wrong".
 *
 * What is wrong with it, and which view should say so:
 *
 *   1. validateSlow  — quadratic string building on every order.
 *                      CPU hot spots. Should dominate self time.
 *   2. LedgerCache   — a synchronized block held across a 12ms sleep.
 *                      Lock contention. Threads should pile up behind it.
 *   3. enrich        — allocates a 256KB buffer per order and drops it.
 *                      Allocation rate. ~40MB/s of garbage.
 *   4. parseAmount   — NumberFormatException on one order in five, caught.
 *                      Exception rate. Invisible in logs, obvious in telemetry.
 *
 * Shaped like an order service rather than a benchmark on purpose: the frames
 * a reader sees should look like an application, because a profiler that only
 * reads well on `Main.loop` has not been tested on anything.
 */
import java.util.*;
import java.util.concurrent.*;

public class OrderLoad {

  static final LedgerCache LEDGER = new LedgerCache();
  static volatile long processed = 0;

  public static void main(String[] args) throws Exception {
    int workers = 6;
    ExecutorService pool = Executors.newFixedThreadPool(workers, r -> {
      Thread t = new Thread(r);
      // Named, because a profiler's thread column is useless when every row
      // says "pool-1-thread-3".
      t.setName("order-worker-" + t.getId());
      return t;
    });

    System.out.println("OrderLoad starting with " + workers + " workers");
    for (int i = 0; i < workers; i++) {
      pool.submit(OrderLoad::workerLoop);
    }

    // A heartbeat, so `kubectl logs` shows it is alive without being chatty.
    while (true) {
      Thread.sleep(10_000);
      System.out.println("processed=" + processed);
    }
  }

  static void workerLoop() {
    Random rnd = new Random(Thread.currentThread().getId());
    while (!Thread.currentThread().isInterrupted()) {
      try {
        Order o = new Order(rnd.nextInt(1_000_000), amountFor(rnd));
        submit(o, rnd);
        processed++;
      } catch (Exception e) {
        // Swallowed on purpose — see parseAmount. The exception rate is the
        // only place this shows up, which is exactly the point.
      }
    }
  }

  static String amountFor(Random rnd) {
    // One in five is malformed, which is what makes parseAmount throw.
    return rnd.nextInt(5) == 0 ? "12,50" : (rnd.nextInt(9000) + 100) + ".00";
  }

  static void submit(Order o, Random rnd) {
    validateSlow(o);
    enrich(o);
    LEDGER.post(o);
    parseAmount(o.amount);
  }

  /**
   * FAULT 1 — quadratic string building.
   *
   * Concatenating in a loop reallocates and copies the whole buffer each time,
   * so the cost grows with the square of the field count. The obvious fix is a
   * StringBuilder; the point here is that the profiler should say so without
   * anyone reading the code.
   */
  static String validateSlow(Order o) {
    String report = "";
    for (int i = 0; i < 260; i++) {
      report += "field" + i + "=" + ((o.id + i) % 97) + ";";
    }
    if (report.indexOf("field259") < 0) throw new IllegalStateException("impossible");
    return report;
  }

  /**
   * FAULT 3 — a large short-lived allocation per order.
   *
   * Escapes analysis because it is written to and read back, so the JIT cannot
   * elide it. Pure garbage: ~256KB per order, immediately unreachable.
   */
  static long enrich(Order o) {
    byte[] scratch = new byte[256 * 1024];
    scratch[0] = (byte) o.id;
    scratch[scratch.length - 1] = (byte) (o.id >> 8);
    long sum = 0;
    for (int i = 0; i < scratch.length; i += 4096) sum += scratch[i];
    o.checksum = sum;
    return sum;
  }

  /**
   * FAULT 4 — an exception on the hot path, caught and ignored.
   *
   * A fifth of all orders. Nothing in the logs, nothing in the error rate, and
   * a real cost in fill-in-stack-trace. The exception telemetry is the only
   * view that makes it visible.
   */
  static double parseAmount(String amount) {
    try {
      return Double.parseDouble(amount);
    } catch (NumberFormatException e) {
      return 0d;
    }
  }

  static final class Order {
    final int id;
    final String amount;
    long checksum;
    Order(int id, String amount) { this.id = id; this.amount = amount; }
  }

  /**
   * FAULT 2 — a lock held across a blocking wait.
   *
   * Every worker needs this monitor, and whoever holds it sleeps 12ms inside
   * it. Six workers contending for one lock that is held 12ms at a time is a
   * throughput ceiling of about 83 orders a second no matter how many cores
   * the pod has. This is the shape of the transaction-across-a-network-call
   * rule, in miniature.
   */
  static final class LedgerCache {
    private final Map<Integer, Long> posted = new HashMap<>();
    private long total;

    synchronized void post(Order o) {
      try {
        Thread.sleep(12);          // stands in for the ledger round trip
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
      total += o.checksum;
      // Bounded, so this is a contention test and not a second memory leak.
      if (posted.size() > 5_000) posted.clear();
      posted.put(o.id, total);
    }
  }
}
