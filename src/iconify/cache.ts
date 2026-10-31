/**
 * In-memory TTL cache used by the Iconify client.
 */

/**
 * One cached value and the timestamp at which it becomes stale.
 *
 * @typeParam T - Stored value.
 */
interface CacheEntry<T> {
  /**
   * Cached payload.
   */
  value: T;

  /**
   * Expiry time in the same clock units as `now`, exclusive.
   */
  expires: number;
}

/**
 * Small in-memory TTL cache.
 *
 * Insertion order is the eviction order, and a successful read refreshes that
 * order so hot icon sets stay resident. Expired entries are removed on read,
 * not by a background timer.
 *
 * @typeParam T - Stored value.
 */
export class TtlCache<T> {
  /**
   * Live entries, oldest first.
   */
  private readonly entries = new Map<string, CacheEntry<T>>();

  /**
   * @param maxEntries - Maximum number of stored keys. The oldest key is removed past this limit.
   * @param now - Clock used for expiry checks. Defaults to `Date.now`.
   */
  constructor(
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Reads a key and marks it as the newest entry when it is still fresh.
   *
   * @param key - Cache key.
   * @returns The stored value, or `undefined` when the key is missing or expired.
   */
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /**
   * Stores a value until `ttlMs` elapses.
   *
   * @param key - Cache key. Replaces any previous value for the same key.
   * @param value - Value to store.
   * @param ttlMs - Lifetime in milliseconds. Zero and negative values are not stored.
   */
  set(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) return;
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  /**
   * Number of keys currently stored, including entries that have expired but
   * have not been read since they expired.
   */
  get size(): number {
    return this.entries.size;
  }
}
