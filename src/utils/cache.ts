/**
 * Bounded in-memory cache with per-entry TTL and LRU eviction.
 *
 * Backed by a `Map`, which preserves insertion order — we exploit that for O(1)
 * LRU: on `get`/`set` we re-insert the key so the oldest live entry is always
 * `Map`'s first key, evicted in O(1) when capacity is exceeded. Suitable for
 * hot, rarely-changing reads (e.g. per-gym settings) to cut DB round-trips.
 */
export class TTLCache<K, V> {
  private readonly store = new Map<K, { value: V; expiresAt: number }>();

  constructor(
    private readonly maxSize = 500,
    private readonly ttlMs = 60_000,
  ) {}

  get(key: K): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh recency (move to newest position).
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: K, value: V, ttlMs = this.ttlMs): void {
    if (this.store.has(key)) this.store.delete(key);
    else if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value as K | undefined;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Return the cached value or compute, cache and return it. */
  async getOrSet(key: K, factory: () => Promise<V>, ttlMs = this.ttlMs): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
