import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const base = new URL('../extensions/cod-form/', import.meta.url);
const labels = JSON.parse(readFileSync(new URL('locales/en.default.json', base), 'utf8'));
const source = readFileSync(new URL('assets/shopping-assistant.js', base), 'utf8');
const template = readFileSync(new URL('blocks/shopping_assistant.liquid', base), 'utf8')
  .replace(/{% schema %}[\s\S]*?{% endschema %}/g, '')
  .replace(/{{ 'assistant\.([a-z_]+)' \| t \| json }}/g, (_, key) => JSON.stringify(labels.assistant[key]))
  .replace(/{{ 'assistant\.([a-z_]+)' \| t }}/g, (_, key) => labels.assistant[key])
  .replace(/{{ routes\.root_url }}/g, '/')
  .replace(/{{ routes\.search_url }}/g, '/search')
  .replace(/{{ routes\.cart_url }}/g, '/cart')
  .replace(/{{ block\.shopify_attributes }}/g, '');
const windows = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); });

function setup() {
  const dom = new JSDOM(template, { url: 'https://al-fajr.ma/', runScripts: 'outside-only' });
  const w = dom.window; windows.push(w);
  let price = 2000, available = true, failWrite = false;
  const fetcher = vi.fn(async (url, options) => {
    if (url === '/cart.js') return Response.json({ currency: 'MAD' });
    if (url === '/products/stylo.js') return Response.json({ title: 'Stylo', variants: [{ id: 101, title: 'Bleu', available, price }] });
    if (url === '/cart/add.js') {
      if (failWrite) throw new Error('Ambiguous timeout');
      return Response.json({ items: [{ id: 101, quantity: 1 }] });
    }
    if (url.includes('/api/assistant')) return Response.json({ reply: 'Un stylo pour vous.', products: [{ id: '1', title: 'Stylo', handle: 'stylo', image: null }] });
    throw new Error(`Unexpected fetch ${url} ${options?.method}`);
  });
  w.fetch = fetcher; w.confirm = vi.fn(() => true); w.AbortSignal = AbortSignal;
  w.eval(source);
  const widget = w.document.querySelector('alfajr-assistant');
  const writes = () => fetcher.mock.calls.filter(([url]) => url === '/cart/add.js');
  async function choose() {
    widget.card({ id: '1', title: 'Stylo', handle: 'stylo' });
    await vi.waitFor(() => expect(widget.querySelector('.af-controls button').disabled).toBe(false));
    widget.querySelector('.af-controls button').click();
  }
  return { w, widget, fetcher, writes, choose, setPrice: v => { price = v; }, soldOut: () => { available = false; }, failWrite: () => { failWrite = true; } };
}

describe('real widget with simulated Shopify responses', () => {
  it('opens, focuses the composer and closes on Escape', () => {
    const { widget, w } = setup(); widget.launch.click();
    expect(widget.panel.hidden).toBe(false); expect(w.document.activeElement).toBe(widget.input);
    widget.input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(widget.panel.hidden).toBe(true); expect(w.document.activeElement).toBe(widget.launch);
  });
  it('does not add from a recommendation or selection; exact consent adds once', async () => {
    const { widget, writes, choose } = setup();
    await choose(); expect(writes()).toHaveLength(0);
    widget.input.value = 'ok'; await widget.send();
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(writes()[0][1].body).items).toEqual([{ id: '101', quantity: 1 }]);
    await widget.addPending(); expect(writes()).toHaveLength(1);
  });
  it('prevents double click writes while a confirmation is running', async () => {
    const { widget, writes, choose } = setup(); await choose();
    await Promise.all([widget.addPending(), widget.addPending()]);
    expect(writes()).toHaveLength(1);
  });
  it('requires fresh consent if Shopify changes the price', async () => {
    const { widget, writes, choose, setPrice } = setup(); await choose(); setPrice(2500);
    await widget.addPending(); expect(writes()).toHaveLength(0);
    expect(widget.pending[0].price).toBe(2500);
    await widget.addPending(); expect(writes()).toHaveLength(1);
  });
  it('blocks unavailable variants before a cart write', async () => {
    const { widget, writes, choose, soldOut } = setup(); await choose(); soldOut();
    await widget.addPending(); expect(writes()).toHaveLength(0); expect(widget.pending).toHaveLength(0);
  });
  it('does not retry an ambiguous write on a second confirmation', async () => {
    const { widget, writes, choose, failWrite } = setup(); await choose(); failWrite();
    await widget.addPending(); await widget.addPending();
    expect(writes()).toHaveLength(1); expect(widget.pending).toHaveLength(0);
    expect(widget.log.textContent).toContain(labels.assistant.failed);
  });
  it('cancels pending selection without touching the cart', async () => {
    const { widget, writes, choose } = setup(); await choose();
    widget.querySelector('.af-no').click(); await widget.addPending();
    expect(writes()).toHaveLength(0);
  });
  it('renders model HTML as plain text', () => {
    const { widget } = setup(); widget.say('<img src=x onerror=alert(1)>');
    expect(widget.log.querySelector('img')).toBeNull();
  });
  it('does not send chat text when Gemini notice is declined', async () => {
    const { widget, w, fetcher } = setup(); w.confirm = () => false;
    widget.input.value = 'stylo'; await widget.send(); expect(fetcher).not.toHaveBeenCalled();
  });
});
