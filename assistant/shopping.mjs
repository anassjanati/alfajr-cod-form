export const POLICY_LINKS = ['https://al-fajr.ma/pages/livraison', 'https://al-fajr.ma/pages/politique-retour'];
// Merchant's published pages checked 10 September 2026. Do not invent delivery times.
export function policyReply(question) {
  const shipping = /livraison|livrer|shipping|delivery|tawsil|tawssil|التوصيل|الشحن|توصيل/i.test(question);
  const returns = /retour|rembours|echang|refund|return|ترجيع|ارجاع|إرجاع|استرجاع|تبديل|nrj3|nrej3/i.test(question);
  if (!shipping && !returns) return null;
  const parts = [];
  if (shipping) parts.push('Livraison au Maroc à partir de 35 DH. Au-delà de 5 kg, les frais peuvent augmenter selon le poids et les dimensions. Le montant exact est confirmé avec votre commande. Aucun délai précis ne figure sur cette page : notre équipe peut vous renseigner.\n' + POLICY_LINKS[0]);
  if (returns) parts.push('Vous pouvez demander un retour sous 7 jours après réception : produit non utilisé, dans son état et emballage d’origine. Les articles personnalisés, ouverts ou endommagés après livraison ne sont pas éligibles selon la politique publiée. Les frais peuvent être à votre charge, sauf erreur ou produit défectueux. Contactez notre équipe avant tout retour.\n' + POLICY_LINKS[1]);
  return { mode: 'info', topic: shipping ? 'livraison' : 'retours', reply: parts.join('\n\n') + '\nhttps://wa.me/212650512222', products: [] };
}

export function productFacts(p) {
  return { id: String(p.id), title: p.title, type: p.product_type || '', description: String(p.body_html || '').replace(/<[^>]*>/g, ' ').slice(0, 900), variants: p.variants.slice(0, 40).map(v => ({ title: v.title, available: v.available, price: v.price })) };
}

export function comparisonRows(products) {
  return products.slice(0, 3).map(p => {
    const text = String(p.body_html || '').replace(/<[^>]*>/g, ' ');
    const start = text.search(/spécifications techniques|caractéristiques techniques|détails techniques|fiche technique|dimensions\s*:/i);
    return { id: String(p.id), handle: p.handle, title: p.title, type: p.product_type || 'Non précisé', description: start >= 0 ? text.slice(start, start + 650) : 'Caractéristiques détaillées : consulter la fiche produit.', options: [...new Set(p.variants.map(v => v.title))].slice(0, 10).join(', ') };
  });
}

export function complementTerms(product) {
  const title = (product?.title || '').toLowerCase();
  // Generic supplies only. Printer ink, refills and other compatibility claims require evidence.
  if (/cahier|carnet|notebook/.test(title)) return 'stylo crayon gomme';
  if (/stylo|crayon/.test(title)) return 'cahier trousse';
  if (/peinture|acrylique|gouache/.test(title)) return 'pinceau palette toile';
  if (/toile/.test(title)) return 'pinceau peinture acrylique';
  if (/classeur|chemise/.test(title)) return 'intercalaire pochette';
  return null;
}
