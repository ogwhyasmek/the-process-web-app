/**
 * A serial task queue that spaces task starts by a minimum interval.
 *
 * Finnhub's free tier allows 60 requests/minute; the spec (§6.6, §9) asks
 * for roughly one request per second on scans. Everything the proxy sends
 * to Finnhub goes through this queue, so a screener scan can never trip
 * the rate limit no matter how fast the browser asks.
 *
 * Two priorities share the one rate budget. 'low' tasks (the ticker's
 * background refresh) only run when no 'normal' task is waiting, so a
 * research request the user is actively waiting on never sits behind ten
 * ticker quotes. Within a priority, tasks run in arrival order.
 */
export class ThrottleQueue {
  /** @param {number} minIntervalMs minimum time between task starts */
  constructor(minIntervalMs) {
    this.minIntervalMs = minIntervalMs;
    this.lastStart = 0;
    /** @type {Array<{task: () => Promise<any>, resolve: Function, reject: Function}>} */
    this.normal = [];
    /** @type {Array<{task: () => Promise<any>, resolve: Function, reject: Function}>} */
    this.low = [];
    this.draining = false;
  }

  /**
   * Enqueue a task. Resolves/rejects with the task's own result.
   * @template T
   * @param {() => Promise<T>} task
   * @param {{ priority?: 'normal' | 'low' }} [options]
   * @returns {Promise<T>}
   */
  run(task, { priority = 'normal' } = {}) {
    return new Promise((resolve, reject) => {
      (priority === 'low' ? this.low : this.normal).push({ task, resolve, reject });
      this.#drain();
    });
  }

  /** Number of tasks waiting (not counting one in flight). */
  get pending() {
    return this.normal.length + this.low.length;
  }

  async #drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending > 0) {
        const wait = this.lastStart + this.minIntervalMs - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        // Pick only after the wait, so a normal task that arrived while we
        // were sleeping still jumps ahead of queued low-priority ones.
        const job = this.normal.shift() ?? this.low.shift();
        this.lastStart = Date.now();
        // Serial: the next task starts only after this one settles. A
        // failure goes to its own caller and never stalls the queue.
        try {
          job.resolve(await job.task());
        } catch (err) {
          job.reject(err);
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
