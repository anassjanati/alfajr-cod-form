import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn() }));
vi.mock('../app/shopify.server', () => ({ authenticate: { public: { appProxy: mocks.auth } } }));
vi.mock('../app/lib/rateLimiter', () => ({ checkRateLimit: mocks.limit, getClientIp: () => 'test-ip' }));
import { action } from '../app/routes/api.assistant.jsx';

beforeEach(() => {
  vi.stubEnv('ASSISTANT_ENABLED', 'true');
  vi.stubEnv('ASSISTANT_SHOP', 'test.myshopify.com');
  vi.stubEnv('ASSISTANT_INTERNAL_TOKEN', 'test-token');
  mocks.auth.mockResolvedValue({ session: { shop: 'test.myshopify.com' } });
  mocks.limit.mockReturnValue({ allowed: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const request = data => new Request('https://cod.al-fajr.ma/api/assistant', { method: 'POST', body: JSON.stringify(data) });

describe('Shopify proxy forwarding boundary', () => {
  it('stays disabled without the explicit feature flag', async () => {
    vi.stubEnv('ASSISTANT_ENABLED', 'false');
    expect((await action({ request: request({ message: 'stylo' }) })).status).toBe(503);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it('refuses sessions from another shop', async () => {
    mocks.auth.mockResolvedValue({ session: { shop: 'other.myshopify.com' } });
    expect((await action({ request: request({ message: 'stylo' }) })).status).toBe(403);
  });
  it('does not bypass invalid app-proxy signatures', async () => {
    mocks.auth.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    await expect(action({ request: request({ message: 'stylo' }) })).rejects.toHaveProperty('status', 401);
  });
  it('rejects oversized bodies before contacting the worker', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await action({ request: request({ message: 'x'.repeat(13000) }) })).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('forwards only validated input to the loopback worker', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ mode: 'search', products: [] }));
    vi.stubGlobal('fetch', fetcher);
    expect((await action({ request: request({ message: 'stylo' }) })).status).toBe(200);
    expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:3101/chat');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ message: 'stylo', history: [] });
  });
  it('returns a bounded error when the worker is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
    expect((await action({ request: request({ message: 'stylo' }) })).status).toBe(503);
  });
});
