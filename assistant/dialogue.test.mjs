import { it, expect, vi } from 'vitest';
import { createAssistant, createBudget } from './core.mjs';
import { needsAdvice, smallTalk } from './dialogue.mjs';
const catalog = { products: async () => [], collections: async () => [] };
it('clarifies ambiguous bags and desk setup before selecting products',()=>{
  expect(needsAdvice('Bghit xkara').products).toEqual([]);
  expect(needsAdvice('bghit nqad bureau diali o endi budget dial 300dh').products).toEqual([]);
  expect(needsAdvice('bghit xkara laptop')).toBeNull();
  expect(smallTalk('Salaaaam').reply).toContain('وعليكم');
  expect(smallTalk('lanas',[{role:'user',text:'slm'}]).reply).toContain('لاباس');
});
it('does not invent a store-wide schoolbook exclusion',async()=>{
  const assistant=createAssistant({catalog,budget:createBudget()});
  const result=await assistant({message:'bghit ktab faransiya mostawa 6 btidaei riyada'});
  expect(result.reply).toContain('https://wa.me/');
  expect(result.reply).not.toContain('ما كنوفروش');
});
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
  const sent=JSON.parse(fetcher.mock.calls[0][1].body);
  expect(sent.generationConfig.responseSchema.properties.recipe.enum).not.toContain('');
});
it('does not recycle rejected products when Gemini is unavailable', async () => {
  const assistant = createAssistant({ catalog, budget: createBudget() });
  const result = await assistant({ message: 'non, pas ce modele' });
  expect(result.products).toEqual([]);
  expect(result.reply).not.toMatch(/stylo|cahier/);
});
it('keeps the full greeting, rejection and birthday conversation coherent during an outage', async () => {
  const misleading = {id:1,title:'Papier pour CV',body_html:'cv nta hhhh',variants:[{id:11,price:'20',available:true}]};
  const assistant=createAssistant({catalog:{products:async()=>[misleading],collections:async()=>[]},budget:createBudget()});
  const history=[];
  for(const message of ['salam','hhhhh','cv','walaaa','gtlk la','wach nta cv','bghit cadeau b 200dh','eid milad']) {
    const result=await assistant({message,history:history.slice(-6)});
    expect(result.products).toEqual([]);
    expect(result.reply).toMatch(/[\u0600-\u06ff]/);
    if(message==='eid milad') { expect(result.reply).toContain('200dh'); expect(result.reply).toContain('عيد الميلاد'); }
    history.push({role:'user',text:message},{role:'model',text:result.reply});
  }
});
it('does not search arbitrary conversational words in catalogue descriptions', async()=>{
  const assistant=createAssistant({catalog:{products:async()=>[{id:1,title:'Papier',body_html:'bonjour ami comment',variants:[{id:11,price:'10',available:true}]}],collections:async()=>[]},budget:createBudget()});
  expect((await assistant({message:'bonjour mon ami comment vas tu'})).products).toEqual([]);
});
it('handles audited greeting and references offline',async()=>{
 const assistant=createAssistant({catalog,budget:createBudget()});
 expect((await assistant({message:'labas elik'})).reply).toContain('لاباس');
 expect((await assistant({message:'Bghit wahad ktab'})).reply).toContain('سميت الكتاب');
 for(const message of ['Options 3 student book','kan9lb 3la mo9arar mostawa 6 riyad kayn??']) expect((await assistant({message})).reply).toContain('https://wa.me/');
 expect((await assistant({message:'est ce que je peux passer direkt a la bibliotheque'})).reply).toContain('55 Ave');
 expect(needsAdvice('cartable rose et violet 320dh')).toBeNull();
 expect(needsAdvice('cartable mdrassa')).toBeNull();
});
it('includes the contact link when the model refers to WhatsApp',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({action:'reply',reply:'Notre équipe WhatsApp peut confirmer.',terms:'',collection:'',maxPrice:null})}]}}]})));
 const assistant=createAssistant({catalog,fetcher,apiKey:'test',model:'test',budget:createBudget()});
 expect((await assistant({message:'Personnaliser son texte'})).reply).toContain('https://wa.me/212650512222');
});
