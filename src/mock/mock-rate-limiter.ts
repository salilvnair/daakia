/**
 * mock-rate-limiter.ts — Per-route and global rate limiting simulation (6A.14).
 */
import type { RateLimitConfig } from './mock-types';

interface WindowEntry {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  /** routeId → window state */
  private windows = new Map<string, WindowEntry>();

  /**
   * Check if a request is within the rate limit.
   * Returns { allowed: boolean, remaining: number, retryAfterMs: number }
   */
  check(key: string, config: RateLimitConfig): { allowed: boolean; remaining: number; retryAfterMs: number } {
    if (!config.enabled) return { allowed: true, remaining: config.requestsPerWindow, retryAfterMs: 0 };

    const now = Date.now();
    let entry = this.windows.get(key);

    if (!entry || now - entry.windowStart >= config.windowMs) {
      // New window
      entry = { count: 0, windowStart: now };
      this.windows.set(key, entry);
    }

    const limit = config.requestsPerWindow + (config.burstAllowance ?? 0);
    entry.count++;

    if (entry.count > limit) {
      const retryAfterMs = config.windowMs - (now - entry.windowStart);
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    return { allowed: true, remaining: limit - entry.count, retryAfterMs: 0 };
  }

  reset(key: string) {
    this.windows.delete(key);
  }
}

/**
 * SequenceTracker — tracks which response index to serve next for each route (6A.22).
 */
export class SequenceTracker {
  private indices = new Map<string, number>();

  next(routeId: string, totalResponses: number, mode: string): number {
    if (totalResponses === 0) return 0;

    if (mode === 'random') {
      return Math.floor(Math.random() * totalResponses);
    }

    const current = this.indices.get(routeId) ?? 0;
    let next: number;

    if (mode === 'sequential') {
      // Clamp at last item (don't cycle)
      next = Math.min(current + 1, totalResponses - 1);
      // If we haven't served yet, start at 0
      if (!this.indices.has(routeId)) next = 0;
    } else {
      // round-robin
      next = this.indices.has(routeId) ? (current + 1) % totalResponses : 0;
    }

    this.indices.set(routeId, next);
    return next;
  }

  reset(routeId: string) {
    this.indices.delete(routeId);
  }

  resetAll() {
    this.indices.clear();
  }

  // Get current index without advancing
  current(routeId: string): number {
    return this.indices.get(routeId) ?? 0;
  }
}
