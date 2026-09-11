export const isDarija = text => /[\u0600-\u06ff]|\b(?:slm|salam|bghit|bghitch|wach|endkom|3ndkom|3afak|afak|mabghitch|ntghda|nakl)\b/i.test(text);
export const isCorrection = text => /mabghitch|ma\s*bghitch|ما\s*بغيتش|mach[iy]|ماشي|pas (?:ca|ça|ce|des|un)|non[, !]|plut[oô]t|je voulais/i.test(text);
export function smallTalk(text, history = []) {
  const q = text.toLowerCase().trim().replace(/[!?.،؟]+$/g, '').trim();
  const darija = isDarija(q) || history.some(h => h.role === 'user' && isDarija(h.text));
  let reply;
  if (/^(?:(?:wach|واش)\s+(?:nta|نتا)\s+)?(?:cv|ca va|ça va|labas|لاباس)(?:\s+(?:nta|نتا))?$/.test(q)) return {mode:'info',topic:'conversation',products:[],reply:darija ? 'أنا هنا نعاونك 😊 ونتا لاباس؟' : 'Je suis là pour vous aider 😊 Et vous, ça va ?'};
  if (/^(?:h{3,}|(?:ha){2,}|(?:هه){2,}|😂+|mdr|lol)$/.test(q)) return {mode:'info',topic:'conversation',products:[],reply:darija ? 'هههه 😊' : 'Haha 😊'};
  if (/^(?:gtl[e]?k\s+la|قلت\s*ليك\s*لا|wala+|la+|non|لا)$/.test(q)) return {mode:'info',topic:'conversation',products:[],reply:darija || /gtl|wala/.test(q) ? 'سمح ليا، فهمتك غلط. نوقفو هاد الاقتراحات؛ شنو كنتي كتعني؟' : 'Pardon, je vous ai mal compris. On laisse ces suggestions. Que vouliez-vous dire ?'};
  if (/^(spirale?|سبيرال)$/i.test(q) || /bag(?:et|uette).*spiral/i.test(q)) return { mode: 'info', topic: 'clarification', products: [], reply: /bag/i.test(q) ? 'كتقصد الباگيت ديال reliure اللي كتجمع الوراق؟ واش بلاستيك ولا معدن، وشنو المقاس اللي محتاج؟' : 'كتقصد دفتر بسپيرال، ولا السپيرال ديال reliure باش تجمع الوراق؟' };
  if (/^(slm|salam|sal[a]?m al[ae]?[iy]koum|السلام(?: عليكم)?|سلام|bonjour|bonsoir|salut|hello|hi)$/.test(q)) reply = darija ? 'وعليكم السلام، مرحبا بيك عند الفجر 😊 كيفاش نقدر نعاونك؟' : 'Bonjour, bienvenue chez Al Fajr ! Comment puis-je vous aider ?';
  else if (/^(merci(?: beaucoup)?|شكرا|شكراً|chokran|choukran|lah y7fdek)$/.test(q)) reply = /merci/.test(q) ? 'Avec plaisir !' : 'مرحبا بيك، على الراس والعين!';
  else if (/\b(?:nakl|ntghda|ntghd)\b|بغيت ناكل/.test(q)) reply = 'إلى على الغدا، ما عندناش الماكلة 😊 عند الفجر نقدر نعاونك فلوازم المكتب، الدراسة والفنون. شنو محتاج؟';
  else if (/^(labas|لاباس|كيف داير|ca va|ça va)[ ?]*$/.test(q)) reply = 'مرحبا بيك 😊 أنا مساعد الفجر، هنا باش نعاونك. كيفاش نقدر نفيدك؟';
  return reply ? { mode: 'info', topic: 'conversation', reply, products: [] } : null;
}
export function contextualFallback(message, history = []) {
  const userTexts = history.filter(h => h.role === 'user').map(h => h.text);
  const darija = isDarija(message) || userTexts.some(isDarija);
  const gift = /cadeau|هدية|هديه|hdiya/i;
  const birthday = /eid\s*milad|3id\s*milad|anniversaire|عيد\s*ميلاد/i;
  const latestGift = [...userTexts].reverse().find(t => gift.test(t));
  if (gift.test(message) || latestGift && birthday.test(message)) {
    const budget = (message + ' ' + (latestGift || '')).match(/\d+(?:[.,]\d+)?\s*(?:dh|درهم|mad)/i)?.[0];
    return darija ? `واخا، هدية${birthday.test(message) ? ' لعيد الميلاد' : ''}${budget ? ' فحدود ' + budget : ''}. لمن غادي تهديها وشنو كيحب؟` : `D’accord, un cadeau${birthday.test(message) ? ' d’anniversaire' : ''}${budget ? ' avec un budget de ' + budget : ''}. Pour qui, et quels sont ses centres d’intérêt ?`;
  }
  return uncertain(darija ? 'واش' : message);
}
export function clearProductRequest(message) {
  return /\b(?:stylo|stilo|cahier|dftar|daftar|papier|wra9|crayon|gomme|trousse|cartable|classeur|pinceau|peinture|toile|carnet|notebook|agrafeuse|calculatrice|toner|imprimante|enveloppe|porte.?bloc|caisse|palette|colle|surligneur)s?\b|دفتر|ستيلو|قلم|ورق|محفظة|مقلمة|صباغة/i.test(message);
}
export function uncertain(text) {
  return isDarija(text) ? 'سمح ليا، ما فهمتش قصدك مزيان. تقدر توضح ليا شنو بغيتي أو فاش غادي تستعملو؟' : 'Je ne suis pas sûr d’avoir bien compris. Pouvez-vous préciser votre besoin ou l’usage prévu ?';
}
