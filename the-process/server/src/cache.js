/**
 * A small in-memory TTL cache.
 *
 * Entries are kept after expiry so callers can fall back to stale data
 * when the upstream source is unreachable ("last known" mode, spec §6.1).
 */
export class TtlCache {
  constructor() {
    /** @type {Map<string, {value: any, storedAt: number, ttl: number}>} */
    this.map = new Map();
  }

  /** Store a value with a time-to-live in milliseconds. */
  set(key, value, ttl) {
    this.map.set(key, { value, storedAt: Date.now(), ttl });
  }

  /** Get a fresh (unexpired) value, or undefined. */
  getFresh(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.storedAt > entry.ttl) return undefined;
    return entry.value;
  }

  /**
   * Get whatever we have, fresh or stale.
   * Returns { value, ageMs, stale } or undefined if never cached.
   */
  getAny(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    const ageMs = Date.now() - entry.storedAt;
    return { value: entry.value, ageMs, stale: ageMs > entry.ttl };
  }

  delete(key) {
    this.map.delete(key);
  }
}

export const cache = new TtlCache();
