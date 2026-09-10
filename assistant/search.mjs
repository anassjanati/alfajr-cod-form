export const normalizeSearch = text => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');
const families = [
  ['stylo', /\b(?:stylos?|st[yi]l+o|stilu|9lam|9alam)\b|ستيلو|قلم حبر|اقلام حبر|قلم جاف/gu, /\bstylo|\bballpoint|\broller|\bfinepen/],
  ['cahier', /\b(?:cahiers?|kahi?y?e?r|daftar|dftar|dfater)\b|دفتر|دفاتر|كناش|كناشات/gu, /\bcahier|\bcarnet|\bnotebook/],
  ['papier', /\b(?:wra9|wara9|wra?9a|wera9)\b|وراق|اوراق|ورق/gu, /\bpapier|\brame|\bfeuille/],
  ['crayon', /\b(?:crayons?|krayon|9alam rassas)\b|قلم رصاص|اقلام رصاص/gu, /\bcrayon/],
  ['gomme', /\b(?:gommes?|goma|gomma)\b|ممحاة|محاية/gu, /\bgomme/],
  ['trousse', /\b(?:trousses?|trous|tro?sse)\b|مقلمة/gu, /\btrousse/],
  ['cartable', /\b(?:cartables?|kartabl|kartable)\b|محفظة|شكارة المدرسة/gu, /\bcartable|\bsac.*(?:ecole|scolaire)/],
  ['surligneur', /\b(?:surligneurs?|fluo|stabilo)\b|سورلينور/gu, /\bsurligneur|\bmarqueur.*fluorescent/],
  ['classeur', /\b(?:classeurs?|klasseur|klasor)\b|كلاسور/gu, /\bclasseur/],
];
const stop = new Set('je cherche recherche veux voudrais un une des les le la de du pour avec moins plus que mon ma mes est et en au aux dh mad budget ecole besoin svp bghit bghina baghi 3afak afak wach kayn kaynin 3ndkom andkom dial dyal chi wahed wahd بغيت بغينا عافاك واش كاين كاينين عندكم ديال شي واحد'.split(' '));
export function searchQuery(text) {
  let terms = normalizeSearch(text), family;
  // Replace phrases before isolated words, so printer-paper requests keep their meaning.
  terms = terms.replace(/وراق الطابعة|ورق الطباعة|wra9 (?:dial |dyal )?(?:tabi3a|tab3a|imprimante)/g, 'papier imprimante');
  for (const [key, aliases, title] of families) { aliases.lastIndex = 0; if (aliases.test(terms)) { family ||= { key, title }; aliases.lastIndex = 0; terms = terms.replace(aliases, key); } }
  if (!family && /\bpapier\b/.test(terms)) family = { key: 'papier', title: families[2][2] };
  terms = terms.replace(/\b(?:zra9|zre9|azra9)\b|ازرق|زرق/g, 'bleu').replace(/\b(?:7mer|7mar)\b|احمر|حمر/g, 'rouge').replace(/\b(?:k7el|k7al)\b|اسود|كحل/g, 'noir');
  const words = [...new Set(terms.split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1 && !stop.has(w)))];
  return { terms: words.join(' '), words, family };
}
export function explicitPrice(text) {
  const normalized = normalizeSearch(text);
  const match = normalized.match(/(?:moins de|maximum|max|budget(?: de)?|under|ma yfoutch|mayfoutch|a9al mn|قل من|اقل من|ما يفوتش)\s*(\d+(?:[.,]\d+)?)\s*(?:dh|mad|dirhams?|درهم)(?=\s|$|[.!?،؟])/u);
  return match ? { amount: Number(match[1].replace(',', '.')), phrase: match[0] } : null;
}
export function clarification(text, reason = 'unknown') {
  const darija = /[\u0600-\u06ff]|\b(?:bghit|bghina|wach|3afak|stilo|wra9|daftar)\b/i.test(text);
  if (reason === 'budget') return darija ? 'ما لقيتش نفس النوع متوفر بهاد الميزانية. واش بغيتي تبدل النوع ولا تراجع الميزانية؟' : 'Je ne trouve pas ce type de produit disponible dans ce budget. Souhaites-tu changer de type ou revoir le budget ?';
  return darija ? 'شنو النوع اللي كتقلب عليه بالضبط؟ مثلاً ستيلو، دفتر ولا ورق الطابعة. إلا عندك الماركة أو المقاس كتبهم ليا.' : 'Quel type de produit cherches-tu exactement : stylo, cahier ou papier imprimante, par exemple ? Tu peux préciser la marque ou le format.';
}
