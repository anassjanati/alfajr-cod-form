import { isDarija } from './dialogue.mjs';

const recipes = {
  dessin: [['Carnet à dessin', /^(?:carnet|bloc).*dessin/i], ['Crayon graphite', /crayon.*(?:graphite|papier|hb|dessin)/i], ['Gomme', /^gomme\b/i]],
  peinture: [['Peinture acrylique', /(?:peinture|acrylique).*acrylique|acrylique.*(?:peinture|couleur)/i], ['Pinceaux', /^pinceaux?\b/i], ['Toile', /^(?:toile|canvas)\b/i]],
  bureau: [['Carnet', /^(?:carnet|notebook)\b/i], ['Stylo', /^stylo\b/i], ['Classement', /^classeur\b/i]],
};
export function explicitBundle(text) {
  const q = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (!/nbda|نبدا|نبدأ|debut|commenc|essentiel|kit\b|pack\b|wjed|وجد|جهز|equiper|equipement|liste|لائحة/.test(q)) return null;
  if (/sans |sauf |بلا |ما بغيت|mabghit|\b[2-9]\s*(?:crayon|stylo|carnet)/.test(q)) return null;
  if (/acryli|اكريليك/.test(q)) return 'peinture';
  if (/dessin|rasm|رسم/.test(q)) return 'dessin';
  if (/bureau|مكتب/.test(q)) return 'bureau';
  return null;
}
export function budgetAmount(text) {
  const q = text.replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
  const match = q.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:dh|mad|dirhams?|درهم)(?!\p{L})/iu);
  const amount = match ? Number(match[1].replace(',', '.')) : null;
  return amount > 0 && amount <= 100000 ? amount : null;
}
export function bundleReply(products, recipe, amount, message) {
  const darija = isDarija(message);
  const info = reply => ({ mode: 'info', topic: 'budget_bundle', reply, products: [] });
  if (!recipes[recipe]) return info(darija ? 'باش نوجد ليك لائحة مناسبة، شنو الاستعمال والميزانية الإجمالية ديالك؟' : 'Quel est votre usage et votre budget total pour la sélection ?');
  if (!amount) return info(darija ? 'شحال هي الميزانية الإجمالية اللي بغيتي تخصص لهاد اللائحة، بلا التوصيل؟' : 'Quel budget total souhaitez-vous consacrer à cette sélection, hors livraison ?');
  const items = [];
  const missing = [];
  for (const [label, pattern] of recipes[recipe]) {
    const choices = products.filter(p => pattern.test(p.title) && !/recharge|electri|électri|porte-|taille-crayon/i.test(p.title) && !items.some(i => i.product.id === p.id))
      .flatMap(product => product.variants.filter(v => v.available).map(variant => ({ product, variant, cents: Math.round(Number(variant.price) * 100) })))
      .filter(i => Number.isSafeInteger(i.cents) && i.cents > 0).sort((a, b) => a.cents - b.cents);
    if (choices.length) items.push(choices[0]); else missing.push(label);
  }
  if (missing.length) return info((darija ? 'ما قدرتش نكمل هاد اللائحة من المتوفر دابا. ناقص: ' : 'Je ne peux pas constituer cette sélection avec les articles disponibles. Il manque : ') + missing.join(', ') + '. https://wa.me/212650512222');
  const totalCents = items.reduce((sum, item) => sum + item.cents, 0);
  const budgetCents = Math.round(amount * 100);
  if (totalCents > budgetCents) return info(darija ? `هاد الأساسيات كتوصل لـ${(totalCents / 100).toFixed(2)} درهم بلا التوصيل، أكثر من الميزانية. واش نراجعو اللائحة ولا الميزانية؟` : `Ces essentiels coûtent ${ (totalCents / 100).toFixed(2)} MAD hors livraison, au-dessus du budget. Préférez-vous revoir la liste ou le budget ?`);
  return {
    mode: 'bundle', topic: 'budget_bundle',
    reply: darija ? 'ها اقتراح اقتصادي للأساسيات، قطعة وحدة من كل اختيار، بلا التوصيل. راجع الأنواع والكميات؛ تقدر تختار اللائحة كاملة ومن بعد تأكد الإضافة للبانير.' : 'Voici une sélection économique de base, une unité de chaque article, hors livraison. Vérifiez les modèles et quantités ; vous pouvez préparer toute la sélection puis confirmer son ajout au panier.',
    products: items.map(({ product }) => ({ id: String(product.id), title: product.title, handle: product.handle, image: product.images?.[0]?.src || null })),
    bundle: { budgetCents, totalCents, currency: 'MAD', items: items.map(({ product, variant, cents }) => ({ productId: String(product.id), handle: product.handle, variantId: String(variant.id), quantity: 1, price: cents })) },
  };
}
