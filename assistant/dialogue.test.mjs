import { it, expect, vi } from 'vitest';
import { createAssistant, createBudget } from './core.mjs';
const catalog = { products: async () => [], collections: async () => [] };
it('greets without pushing the viewed product or using Gemini', async () => {
  const fetcher = vi.fn();
  const assistant = createAssistant({ catalog: {}, fetcher, budget: createBudget() });
  for (const message of ['SLM', 'السلام', 'bonjour']) {
    const result = await assistant({ message, context: { productHandle: 'caisse' } });
    expect(result.products).toEqual([]);
    expect(result.reply).not.toMatch(/stylo|caisse|دفتر/);
  }
  expect(fetcher).not.toHaveBeenCalled();
});
it('clarifies binding supplies and does not keep recommending notebooks', async () => {
  const assistant = createAssistant({ catalog, budget: createBudget() });
  for (const message of ['SPIRALE', 'MABGHITCH HADCHI BGHIT BAGET SPIRALE']) {
    const result = await assistant({ message });
    expect(result.products).toEqual([]);
    expect(result.reply).toContain('reliure');
  }
});
it('handles the lunch joke without product cards', async () => {
  const assistant = createAssistant({ catalog, budget: createBudget() });
  const result = await assistant({ message: 'stylo pilot ntghda bih eafak' });
  expect(result.products).toEqual([]);
  expect(result.reply).toContain('الماكلة');
});
it('allows a conversational model response without searching or a second call', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ action: 'reply', reply: 'Pour quel usage ?', terms: '', collection: '', maxPrice: null }) }] } }] })));
  const assistant = createAssistant({ catalog, fetcher, apiKey: 'test', model: 'test', budget: createBudget() });
  const result = await assistant({ message: 'Je ne sais pas quoi choisir' });
  expect(result.reply).toBe('Pour quel usage ?');
  expect(result.products).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not recycle rejected products when Gemini is unavailable', async () => {
  const assistant = createAssistant({ catalog, budget: createBudget() });
  const result = await assistant({ message: 'non, pas ce modele' });
  expect(result.products).toEqual([]);
  expect(result.reply).not.toMatch(/stylo|cahier/);
});
