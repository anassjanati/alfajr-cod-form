import { Buffer } from 'node:buffer';
import process from 'node:process';
import { authenticate } from '../shopify.server';
import { checkRateLimit, getClientIp } from '../lib/rateLimiter';
import { inputSchema } from '../../assistant/core.mjs';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
let inFlight = 0;

export async function action({ request }) {
  if (process.env.ASSISTANT_ENABLED !== 'true') return json({ error: 'Assistant disabled' }, 503);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const { session } = await authenticate.public.appProxy(request);
  if (!session || session.shop !== process.env.ASSISTANT_SHOP) return json({ error: 'Unauthorized' }, 403);
  if (!checkRateLimit('assistant:global', 120, 60).allowed ||
      !checkRateLimit(`assistant:${session.shop}:${getClientIp(request)}`, 10, 60).allowed || inFlight >= 16) {
    return json({ error: 'Please wait before retrying' }, 429);
  }
  inFlight++;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Missing body' }, 400);
    const chunks = [];
    let bytes = 0;
    while (bytes <= 12000) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 12000) { await reader.cancel(); return json({ error: 'Too large' }, 413); }
      chunks.push(Buffer.from(value));
    }
    let input;
    try { input = inputSchema.parse(JSON.parse(Buffer.concat(chunks).toString())); }
    catch { return json({ error: 'Invalid input' }, 400); }
    if (!process.env.ASSISTANT_INTERNAL_TOKEN) return json({ error: 'Not configured' }, 503);
    const response = await fetch('http://127.0.0.1:3101/chat', {
      method: 'POST', signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ASSISTANT_INTERNAL_TOKEN}` },
      body: JSON.stringify(input),
    });
    if (!response.ok) return json({ error: 'Assistant temporarily unavailable' }, 503);
    return json(await response.json());
  } catch { return json({ error: 'Assistant temporarily unavailable' }, 503); }
  finally { inFlight--; }
}

export function loader() { return json({ error: 'Method not allowed' }, 405); }
