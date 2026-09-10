import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConversations, scrub } from './conversations.mjs';

it('redacts common contact details including Arabic digits', () => {
  const text = scrub('smiti Ahmed. email test@example.com tel +212 650 123 456 et ٠٦٥٠١٢٣٤٥٦');
  expect(text).not.toMatch(/Ahmed|test@|650|٠٦/);
  expect(scrub('cahier 96 pages 35 DH')).toBe('cahier 96 pages 35 DH');
});
it('groups turns, persists only redacted text, paginates and expires without new messages', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alfajr-conversations-'));
  try {
    let now = Date.now(); const path = join(dir, 'conversations.json');
    const store = await createConversations(path, () => now);
    for (let i = 0; i < 45; i++) store.record({ conversationId: 'one', message: 'test@example.com' }, { reply: 'Contact 0650123456', products: [], mode: 'info' });
    expect(store.snapshot().rows[0].turns).toHaveLength(40);
    await store.flush(); expect(await readFile(path, 'utf8')).not.toMatch(/test@example|065012/);
    const restored = await createConversations(path, () => now); expect(restored.snapshot().total).toBe(1);
    for (let i = 0; i < 21; i++) restored.record({ conversationId: String(i), message: 'cahier' }, { reply: 'Bonjour' });
    expect(restored.snapshot(2).rows).toHaveLength(2);
    now += 31 * 86400000; expect(restored.snapshot().total).toBe(0); await restored.flush();
    expect(JSON.parse(await readFile(path, 'utf8')).rows).toEqual([]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
