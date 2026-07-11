/**
 * A serial task queue that spaces task starts by a minimum interval.
 *
 * Finnhub's free tier allows 60 requests/minute; the spec (§6.6, §9) asks
 * for roughly one request per second on scans. Everything the proxy sends
 * to Finnhub goes through this queue, so a screener scan can never trip
 * the rate limit no matter how fast the browser asks.
 */
export class ThrottleQueue {
  /** @param {number} minIntervalMs minimum time between task starts */
  constructor(minIntervalMs) {
    this.minIntervalMs = minIntervalMs;
    this.lastStart = 0;
    this.chain = Promise.resolve();
  }

  /**
   * Enqueue a task. Resolves/rejects with the task's own result.
   * @template T
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  run(task) {
    const result = this.chain.then(async () => {
      const wait = this.lastStart + this.minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastStart = Date.now();
      return task();
    });
    // Keep the chain alive even when a task fails.
    this.chain = result.then(() => undefined, () => undefined);
    return result;
  }
}
