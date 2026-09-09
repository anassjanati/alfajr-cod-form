import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createAssistant, createBudget, createCatalog, inputSchema } from './core.mjs';

const token = process.env.ASSISTANT_INTERNAL_TOKEN;
if (!token || token.length < 32) throw new Error('ASSISTANT_INTERNAL_TOKEN must have at least 32 characters');
const number = (key, value) => Math.max(1, Number.parseInt(process.env[key] || value, 10) || value);
const catalog = createCatalog();
const assistant = createAssistant({
  catalog, budget: createBudget({ concurrent: number('ASSISTANT_CONCURRENCY', 2), perMinute: number('GEMINI_REQUESTS_PER_MINUTE', 4), perDay: number('GEMINI_REQUESTS_PER_DAY', 80) }),
  apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL,
});
let active = 0;
const server = http.createServer(async (req, res) => {
  const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  const supplied = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${token}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(401, { error: 'Unauthorized' });
  if (req.method !== 'POST' || req.url !== '/chat') return reply(404, { error: 'Not found' });
  if (active >= 16) return reply(503, { error: 'Busy' });
  active++;
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 12000) { reply(413, { error: 'Too large' }); req.destroy(); return; }
      chunks.push(chunk);
    }
    const parsed = inputSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString()));
    if (!parsed.success) return reply(400, { error: 'Invalid input' });
    reply(200, await assistant(parsed.data));
  } catch { if (!res.headersSent) reply(400, { error: 'Invalid request' }); }
  finally { active--; }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(number('ASSISTANT_PORT', 3101), '127.0.0.1', () => console.log('Al Fajr assistant listening on loopback'));
catalog.products().catch(() => console.warn('Assistant catalog warmup unavailable'));
const refresh = setInterval(() => catalog.products().catch(() => {}), 300000);
refresh.unref();
process.on('SIGTERM', () => { clearInterval(refresh); server.close(); });
