import { readFile, writeFile, rename } from 'node:fs/promises';

const labels = { search: 'Recherche', ai: 'Conseil', offline: 'Indisponible', info: 'Information', comparison: 'Comparaison', recommendation: 'Compléments' };
const groups = [['stylos', /stylo|stilo|قلم/i], ['cahiers', /cahier|carnet|دفتر/i], ['peinture', /peinture|acrylique|gouache/i], ['impression', /imprim|toner|cartouche/i], ['classement', /classeur|chemise|pochette/i]];
export async function createMetrics(path, now = Date.now) {
  let days = {}, seen = new Map(), timer, pending = Promise.resolve();
  try { const data = JSON.parse(await readFile(path, 'utf8')); if (data.version === 1 && data.days && typeof data.days === 'object') days = data.days; } catch { /* A new installation starts empty. */ }
  const flush = () => {
    clearTimeout(timer); timer = null;
    const text = JSON.stringify({ version: 1, days });
    pending = pending.catch(() => {}).then(async () => { await writeFile(path + '.new', text, { mode: 0o600 }); await rename(path + '.new', path); });
    return pending;
  };
  function bucket() {
    const date = new Date(now()).toISOString().slice(0, 10);
    days[date] ||= { messages: 0, suggestions: 0, noResults: 0, cartAdds: 0, topics: {}, missing: {}, products: {} };
    for (const key of Object.keys(days).sort().slice(0, -30)) delete days[key];
    if (!timer) { timer = setTimeout(() => flush().catch(() => console.warn('Assistant metrics save unavailable')), 1000); timer.unref?.(); }
    return days[date];
  }
  function productCount(day, p, field) {
    const id = String(p.id);
    if (!day.products[id] && Object.keys(day.products).length >= 500) return;
    day.products[id] ||= { title: String(p.title).slice(0, 180), suggested: 0, added: 0 };
    day.products[id][field]++;
  }
  return {
    message(input, reply) {
      const day = bucket(); day.messages++; day.suggestions += reply.products?.length || 0;
      const topic = reply.topic || labels[reply.mode] || 'Autre'; day.topics[topic] = (day.topics[topic] || 0) + 1;
      if (['ai', 'search'].includes(reply.mode) && !reply.products?.length) {
        day.noResults++;
        const group = groups.find(([, pattern]) => pattern.test(input.message))?.[0] || 'Autres recherches';
        day.missing[group] = (day.missing[group] || 0) + 1;
      }
      for (const p of reply.products || []) productCount(day, p, 'suggested');
    },
    added(event, products) {
      if (seen.has(event.eventId)) return;
      seen.set(event.eventId, now());
      while (seen.size > 2000) seen.delete(seen.keys().next().value);
      const day = bucket(); day.cartAdds++;
      for (const p of products) productCount(day, p, 'added');
    },
    snapshot: () => ({ days: structuredClone(days), retentionDays: 30, generatedAt: new Date(now()).toISOString() }),
    flush,
  };
}
