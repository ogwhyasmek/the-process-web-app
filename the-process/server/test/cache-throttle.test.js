/** The TTL cache ("last known" fallback) and the ~1 req/sec throttle queue. */
import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { TtlCache } from '../src/cache.js';
import { ThrottleQueue } from '../src/throttle.js';

describe('TtlCache', () => {
  afterEach(() => mock.timers.reset());

  it('serves fresh values, then keeps them as stale "last known" data', () => {
    mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const cache = new TtlCache();
    cache.set('quote:AAPL', { c: 310 }, 25_000);

    assert.deepEqual(cache.getFresh('quote:AAPL'), { c: 310 });
    assert.equal(cache.getAny('quote:AAPL').stale, false);

    mock.timers.tick(25_001);
    assert.equal(cache.getFresh('quote:AAPL'), undefined); // expired for normal reads…
    const stale = cache.getAny('quote:AAPL'); // …but still there when upstream is down
    assert.deepEqual(stale.value, { c: 310 });
    assert.equal(stale.stale, true);
    assert.equal(stale.ageMs, 25_001);
  });

  it('returns undefined for keys never cached, and after delete', () => {
    const cache = new TtlCache();
    assert.equal(cache.getAny('nope'), undefined);
    cache.set('k', 1, 1000);
    cache.delete('k');
    assert.equal(cache.getAny('k'), undefined);
  });
});

describe('ThrottleQueue', () => {
  it('spaces task starts by the minimum interval and runs them in order', async () => {
    const queue = new ThrottleQueue(40);
    const starts = [];
    const results = await Promise.all(
      [1, 2, 3].map((n) => queue.run(async () => { starts.push(Date.now()); return n; })),
    );
    assert.deepEqual(results, [1, 2, 3]);
    for (let i = 1; i < starts.length; i++) {
      assert.ok(starts[i] - starts[i - 1] >= 38, `gap ${starts[i] - starts[i - 1]}ms`); // ~timer slack
    }
  });

  it('keeps going after a task fails, passing the error to its caller only', async () => {
    const queue = new ThrottleQueue(1);
    const failed = queue.run(async () => { throw new Error('upstream 429'); });
    const next = queue.run(async () => 'ok');
    await assert.rejects(failed, /upstream 429/);
    assert.equal(await next, 'ok');
  });
});
