import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => vi.fn());
vi.mock('../app/shopify.server', () => ({ authenticate: { admin: auth } }));
import { loader } from '../app/routes/app.assistant.jsx';
beforeEach(() => { vi.stubEnv('ASSISTANT_SHOP', 'allowed.myshopify.com'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('private assistant statistics', () => {
  it('requires Shopify admin authentication', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); auth.mockRejectedValueOnce(new Response('', { status: 401 }));
    await expect(loader({ request: new Request('https://example.com/app/assistant') })).rejects.toHaveProperty('status', 401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects a different shop even with an admin session', async () => {
    auth.mockResolvedValueOnce({ session: { shop: 'other.myshopify.com' } });
    await expect(loader({ request: new Request('https://example.com/app/assistant') })).rejects.toHaveProperty('status', 403);
  });
  it('returns non-cacheable stats to the correct shop', async () => {
    auth.mockResolvedValueOnce({ session: { shop: 'allowed.myshopify.com' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ days: {} })));
    const response = await loader({ request: new Request('https://example.com/app/assistant') });
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
