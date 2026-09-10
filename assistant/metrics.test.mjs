import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMetrics } from './metrics.mjs';
describe('aggregate metrics', () => {
  it('persists counters without chat text, deduplicates cart events and retains only 30 days', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'alfajr-metrics-'));
    try {
      let now = Date.UTC(2026, 0, 1); const path = join(dir, 'stats.json');
      const stats = await createMetrics(path, () => now);
      stats.message({ message: 'cahier test@example.com' }, { mode: 'search', products: [] });
      const event = { eventId: 'same' }, product = { id: '1', title: 'Cahier' };
      stats.added(event, [product]); stats.added(event, [product]); await stats.flush();
      const stored = await readFile(path, 'utf8'); expect(stored).not.toContain('test@example');
      const restored = await createMetrics(path, () => now);
      expect(Object.values(restored.snapshot().days)[0].cartAdds).toBe(1);
      expect(Object.values(restored.snapshot().days)[0].missing.cahiers).toBe(1);
      for (let i = 0; i < 35; i++) { now += 86400000; stats.message({ message: 'hello' }, { mode: 'info', products: [] }); }
      expect(Object.keys(stats.snapshot().days)).toHaveLength(30); await stats.flush();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
