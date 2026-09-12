"""
An asyncio service with the classic fault planted in it.

The Python equivalent of the graded Java workload: a real event loop doing
real work, with one coroutine making a BLOCKING call. On an event loop that
does not slow one request — it stalls every request the loop is carrying,
including the ones that never touch the slow dependency, because there is one
thread and it is inside `time.sleep` instead of the selector.

What is wrong with it, and what should say so:

  1. price_lookup  — time.sleep on the loop.        The event-loop rule.
  2. render_report — quadratic string building.     CPU, if anything samples it.

`price_lookup` is deliberately shaped like real code: it is `async def`, it is
awaited, and it looks perfectly ordinary. That is what makes the bug common —
nothing at the call site says the call is blocking.
"""
import asyncio
import time


async def price_lookup(sku: int) -> float:
    """FAULT 1 — a blocking call inside a coroutine.

    `time.sleep` holds the thread. Every other task on this loop stops for the
    duration, which is what makes it different from `await asyncio.sleep`.
    """
    time.sleep(0.05)          # stands in for a synchronous HTTP or DB client
    return (sku % 97) * 1.5


def render_report(order_id: int) -> str:
    """FAULT 2 — quadratic string building on the hot path."""
    report = ""
    for i in range(220):
        report += f"field{i}={(order_id + i) % 97};"
    return report


async def handle(order_id: int) -> None:
    await price_lookup(order_id)
    render_report(order_id)


async def worker(name: str) -> None:
    n = 0
    while True:
        await handle(n)
        n += 1
        if n % 200 == 0:
            print(f"{name} handled {n}", flush=True)


async def main() -> None:
    print("AsyncioLoad starting", flush=True)
    await asyncio.gather(*(worker(f"worker-{i}") for i in range(4)))


if __name__ == "__main__":
    asyncio.run(main())
