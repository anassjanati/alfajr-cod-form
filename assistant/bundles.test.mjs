import { it, expect } from 'vitest';
import { bundleReply, budgetAmount } from './bundles.mjs';
const products = ['Carnet dessin','Crayon graphite HB','Gomme blanche'].map((title, id) => ({ id, title, handle: `p-${id}`, variants: [{id: id + 10, price: '25.50', available: true}] }));
it('recognizes a MAD amount including Arabic digits without assuming other currencies', () => {
  expect(budgetAmount('nbda rasm b200 dh')).toBe(200);
  expect(budgetAmount('٢٠٠ درهم')).toBe(200);
  expect(budgetAmount('200 EUR')).toBeNull();
});
it('totals the whole list in cents and refuses a budget exceeded by the combined price', () => {
  expect(bundleReply(products,'dessin',50,'dessin').bundle).toBeUndefined();
  const result=bundleReply(products,'dessin',100,'dessin');
  expect(result.bundle.totalCents).toBe(7650);
  expect(result.bundle.items).toHaveLength(3);
});
it('does not substitute unavailable essentials or call an incomplete set complete', () => {
  const unavailable=structuredClone(products); unavailable[1].variants[0].available=false;
  expect(bundleReply(unavailable,'dessin',200,'dessin').bundle).toBeUndefined();
});
it('asks for the total before proposing a set', () => {
  expect(bundleReply(products,'dessin',null,'dessin').products).toEqual([]);
});
