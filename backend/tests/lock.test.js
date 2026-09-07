'use strict';

const { withLock, lotCapacityLock } = require('../src/services/lock.service');

/**
 * Redis is not available in the test environment, so these exercise the
 * in-process fallback path. That is the path that must still serialise
 * concurrent capacity checks inside a single instance.
 */
describe('withLock (in-process fallback)', () => {
  it('serialises concurrent critical sections', async () => {
    const order = [];
    const key = lotCapacityLock('lot-serialise');

    const task = (id) =>
      withLock(key, async () => {
        order.push(`start-${id}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push(`end-${id}`);
      });

    await Promise.all([task(1), task(2), task(3)]);

    // No section may start before the previous one has ended.
    for (let i = 0; i < 3; i += 1) {
      expect(order[i * 2]).toMatch(/^start-/);
      expect(order[i * 2 + 1]).toMatch(/^end-/);
    }
  });

  it('prevents two callers from taking the same last slot', async () => {
    let availableSlots = 1;
    const key = lotCapacityLock('lot-capacity');

    const attempt = () =>
      withLock(key, async () => {
        // Read-then-write, exactly as booking does.
        const current = availableSlots;
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (current <= 0) return 'rejected';
        availableSlots = current - 1;
        return 'booked';
      });

    const results = await Promise.all([attempt(), attempt(), attempt()]);

    expect(results.filter((r) => r === 'booked')).toHaveLength(1);
    expect(results.filter((r) => r === 'rejected')).toHaveLength(2);
    expect(availableSlots).toBe(0);
  });

  it('releases the lock when the critical section throws', async () => {
    const key = lotCapacityLock('lot-throwing');

    await expect(
      withLock(key, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // A later caller must not be blocked by the failed one.
    await expect(withLock(key, async () => 'ok')).resolves.toBe('ok');
  });

  it('returns the value the critical section produced', async () => {
    await expect(withLock('plain-key', async () => 42)).resolves.toBe(42);
  });
});
