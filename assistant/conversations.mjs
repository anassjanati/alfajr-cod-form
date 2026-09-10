import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export function scrub(value) {
  return String(value || '').slice(0, 4000)
    .replace(/[٠-٩۰-۹]/g, c => String('٠١٢٣٤٥٦٧٨٩'.includes(c) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(c) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email masqué]')
    .replace(/(?:\+?\d[\s().-]*){8,}/g, '[numéro masqué]')
    .replace(/(?:je m'appelle|mon nom est|smiti|سميتي|اسمي)\s+[^\n,.!?،؟]+/gi, '[nom masqué]')
    .replace(/(?:mon adresse|j'habite|adresse personnelle|العنوان ديالي|عنواني)\s*[:：]?\s*[^\n!?؟]+/gi, '[adresse masquée]');
}

export async function createConversations(path, now = Date.now) {
  let rows = [], pending = Promise.resolve(), timer;
  try { const data = JSON.parse(await readFile(path, 'utf8')); if (data.version === 1 && Array.isArray(data.rows)) rows = data.rows; } catch { /* New installation. */ }
  function prune() {
    const cutoff = now() - 30 * 86400000;
    rows = rows.filter(r => r.updatedAt > cutoff).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 500);
    let count = 0;
    rows = rows.filter(r => { r.turns = r.turns.filter(t => t.at > cutoff).slice(-40); count += r.turns.length; return count <= 5000 && r.turns.length; });
  }
  function flush() {
    clearTimeout(timer); timer = null; prune();
    const data = JSON.stringify({ version: 1, rows });
    pending = pending.catch(() => {}).then(async () => { await writeFile(path + '.new', data, { mode: 0o600 }); await rename(path + '.new', path); });
    return pending;
  }
  return {
    record(input, reply) {
      const id = input.conversationId || randomUUID();
      let row = rows.find(r => r.id === id);
      if (!row) { row = { id, updatedAt: now(), turns: [] }; rows.push(row); }
      row.updatedAt = now();
      const turnId = randomUUID();
      row.turns.push({ turnId, at: now(), question: scrub(input.message), answer: scrub(reply.reply), mode: reply.mode,
        products: (reply.products || []).slice(0, 4).map(p => ({ title: scrub(p.title), handle: p.handle })) });
      prune();
      if (!timer) { timer = setTimeout(() => flush().catch(() => console.warn('Conversation storage unavailable')), 1000); timer.unref?.(); }
      return turnId;
    },
    async feedback({ conversationId, turnId, rating }) {
      prune();
      const turn = rows.find(r => r.id === conversationId)?.turns.find(t => t.turnId === turnId);
      if (!turn || !['up', 'down'].includes(rating)) return false;
      turn.rating = rating;
      await flush();
      return true;
    },
    snapshot(page = 1) { prune(); const pages = Math.max(1, Math.ceil(rows.length / 20)); page = Math.min(pages, Math.max(1, Number.parseInt(page, 10) || 1)); return { rows: structuredClone(rows.slice((page - 1) * 20, page * 20)), page, pages, total: rows.length }; },
    flush,
  };
}
