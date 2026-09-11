export const isDarija = text => /[\u0600-\u06ff]|\b(?:slm|salam|bghit|bghitch|wach|endkom|3ndkom|3afak|afak|mabghitch|ntghda|nakl)\b/i.test(text);
export const isCorrection = text => /mabghitch|ma\s*bghitch|ما\s*بغيتش|mach[iy]|ماشي|pas (?:ca|ça|ce|des|un)|non[, !]|plut[oô]t|je voulais/i.test(text);
export function smallTalk(text) {
  const q = text.toLowerCase().trim().replace(/[!?.،؟]+$/g, '').trim();
  const darija = isDarija(q);
  let reply;
  if (/^(spirale?|سبيرال)$/i.test(q) || /bag(?:et|uette).*spiral/i.test(q)) return { mode: 'info', topic: 'clarification', products: [], reply: /bag/i.test(q) ? 'كتقصد الباگيت ديال reliure اللي كتجمع الوراق؟ واش بلاستيك ولا معدن، وشنو المقاس اللي محتاج؟' : 'كتقصد دفتر بسپيرال، ولا السپيرال ديال reliure باش تجمع الوراق؟' };
  if (/^(slm|salam|sal[a]?m al[ae]?[iy]koum|السلام(?: عليكم)?|سلام|bonjour|bonsoir|salut|hello|hi)$/.test(q)) reply = darija ? 'وعليكم السلام، مرحبا بيك عند الفجر 😊 كيفاش نقدر نعاونك؟' : 'Bonjour, bienvenue chez Al Fajr ! Comment puis-je vous aider ?';
  else if (/^(merci(?: beaucoup)?|شكرا|شكراً|chokran|choukran|lah y7fdek)$/.test(q)) reply = /merci/.test(q) ? 'Avec plaisir !' : 'مرحبا بيك، على الراس والعين!';
  else if (/\b(?:nakl|ntghda|ntghd)\b|بغيت ناكل/.test(q)) reply = 'إلى على الغدا، ما عندناش الماكلة 😊 عند الفجر نقدر نعاونك فلوازم المكتب، الدراسة والفنون. شنو محتاج؟';
  else if (/^(labas|لاباس|كيف داير|ca va|ça va)[ ?]*$/.test(q)) reply = 'مرحبا بيك 😊 أنا مساعد الفجر، هنا باش نعاونك. كيفاش نقدر نفيدك؟';
  return reply ? { mode: 'info', topic: 'conversation', reply, products: [] } : null;
}
export function uncertain(text) {
  return isDarija(text) ? 'سمح ليا، ما فهمتش قصدك مزيان. تقدر توضح ليا شنو بغيتي أو فاش غادي تستعملو؟' : 'Je ne suis pas sûr d’avoir bien compris. Pouvez-vous préciser votre besoin ou l’usage prévu ?';
}
