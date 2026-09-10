import { expect, it } from 'vitest';
import { rankProducts, createAssistant, createBudget } from './core.mjs';
import { explicitPrice, searchQuery } from './search.mjs';
const p = (id,title,price='10',available=true,body_html='') => ({id,title,handle:`p-${id}`,body_html,variants:[{id:id+100,title:'Default',price,available}]});
const products=[p(1,'Stylo bleu'),p(2,'Cahier A4'),p(3,'Rame papier imprimante A4'),p(4,'Trousse', '10',true,'Rangement stylo bleu'),p(5,'Stylo luxe','100'),p(6,'Stylo rouge','5',false),p(7,'Protège cahier A4'),p(8,'Stylo correcteur'),p(9,'Papier autocollant imprimante')];
it('recognizes Darija aliases and avoids description-only category matches',()=>{
  for(const term of ['bghit stilo','بغيت ستيلو','3afak 9alam']) expect(rankProducts(products,term).map(p=>p.id)).toEqual([1,5]);
  expect(rankProducts(products,'بغيت دفتر')[0].id).toBe(2);
  expect(rankProducts(products,'wra9 dial tabi3a')[0].id).toBe(3);
  expect(rankProducts(products,'وراق الطابعة')[0].id).toBe(3);
});
it('extracts Darija budgets without interpreting page counts as prices',()=>{
  expect(explicitPrice('stilo ma yfoutch 30 dh').amount).toBe(30);
  expect(explicitPrice('قلم اقل من 30 درهم').amount).toBe(30);
  expect(explicitPrice('cahier 96 pages')).toBeNull();
  expect(searchQuery('bghit chi wahed').words).toEqual([]);
});
it('clarifies empty results, preserves budget, and resolves short followups offline',async()=>{
  const assistant=createAssistant({catalog:{products:async()=>products,collections:async()=>[]},budget:createBudget()});
  expect((await assistant({message:'bghit stilo ma yfoutch 30 dh'})).products.map(p=>p.id)).toEqual(['1']);
  const unknown=await assistant({message:'bghit chi wahed'}); expect(unknown.products).toEqual([]);expect(unknown.reply).toContain('شنو');
  const cheap=await assistant({message:'stylo maximum 1 dh'});expect(cheap.products).toEqual([]);expect(cheap.reply).toContain('budget');
  const follow=await assistant({message:'maximum 30 dh',history:[{role:'user',text:'bghit stilo'}]});expect(follow.products.map(p=>p.id)).toEqual(['1']);
});
