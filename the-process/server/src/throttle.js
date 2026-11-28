/**
 * Spaces upstream request starts by a minimum interval.
 *
 * Finnhub's free tier allows 60 requests/minute; the spec (§6.6, §9) asks
 * for roughly one request per second on scans. Everything the proxy sends
 * to Finnhub goes through this, so a screener scan can never trip the rate
 * limit no matter how fast the browser asks.
 *
 * Two priorities share the one rate budget. 'low' tasks (the ticker's
 * background refresh) only start in a gap no 'normal' task has claimed, so
 * a research request the user is actively waiting on never sits behind
 * ticker quotes. Within a priority, tasks start in arrival order.
 *
 * Why it's built this way: in the Cloudflare Worker this instance is shared
 * by concurrent requests, and the Workers runtime cancels a request's
 * pending work when its client goes away. So no request may ever run or
 * resolve another request's task. Each caller waits on its OWN timer and
 * claims a start slot from shared numbers only (no shared promises). A
 * cancelled caller simply stops, and the slot or place in line it held is
 * skipped. (A promise-chain queue here let one cancelled request hang every
 * other request in the isolate, permanently.)
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

export class ThrottleQueue {
  /** @param {number} minIntervalMs minimum time between task starts */
  constructor(minIntervalMs) {
    this.minIntervalMs = minIntervalMs;
    /** When the most recent task started. */
    this.lastStart = -Infinity;
    /** Reserved future start times of waiting normal tasks (ascending). */
    this.normalSlots = [];
    /** Waiting low-priority tasks in arrival order: { id, lastSeen }. */
    this.lowLine = [];
    this.nextLowId = 0;
  }

  /**
   * Run a task once its turn comes. Resolves/rejects with the task's own
   * result; one task failing never affects another.
   * @template T
   * @param {() => Promise<T>} task
   * @param {{ priority?: 'normal' | 'low' }} [options]
   * @returns {Promise<T>}
   */
  async run(task, { priority = 'normal' } = {}) {
    if (priority === 'low') await this.#waitLow();
    else await this.#waitNormal();
    return task();
  }

  /** Normal: reserve the next free slot up front, then sleep until it. */
  async #waitNormal() {
    const now = Date.now();
    const lastReserved = this.normalSlots.length ? this.normalSlots[this.normalSlots.length - 1] : -Infinity;
    const slot = Math.max(now, this.lastStart + this.minIntervalMs, lastReserved + this.minIntervalMs);
    this.normalSlots.push(slot);
    await sleep(slot - Date.now());
    // Timers can fire late; spacing must hold between ACTUAL starts, so
    // wait out any shortfall if the previous task started late.
    while (Date.now() < this.lastStart + this.minIntervalMs) {
      await sleep(this.lastStart + this.minIntervalMs - Date.now());
    }
    const i = this.normalSlots.indexOf(slot);
    if (i >= 0) this.normalSlots.splice(i, 1);
    this.lastStart = Date.now();
  }

  /**
   * Low: queue in line, and start only when first in line, the interval
   * has passed, and no normal task holds a slot too close to now. Waiters
   * check in on their own timers; one that stops checking in (its request
   * was cancelled) is dropped from the line so it can't block the rest.
   */
  async #waitLow() {
    const me = { id: this.nextLowId++, lastSeen: Date.now() };
    this.lowLine.push(me);
    const poll = Math.max(5, Math.min(250, this.minIntervalMs / 4));
    const abandonAfter = poll * 4 + 50;
    for (;;) {
      const now = Date.now();
      me.lastSeen = now;
      // Forget waiters that stopped checking in, and slots in the past
      // (started — or reserved by a request that was cancelled).
      this.lowLine = this.lowLine.filter((w) => w === me || now - w.lastSeen <= abandonAfter);
      this.normalSlots = this.normalSlots.filter((s) => s >= now - this.minIntervalMs);

      const intervalOk = now >= this.lastStart + this.minIntervalMs;
      const normalNear = this.normalSlots.some((s) => s < now + this.minIntervalMs);
      if (this.lowLine[0] === me && intervalOk && !normalNear) {
        this.lowLine.shift();
        this.lastStart = now;
        return;
      }
      const untilInterval = this.lastStart + this.minIntervalMs - now;
      await sleep(Math.min(poll, Math.max(1, untilInterval)));
    }
  }
}
