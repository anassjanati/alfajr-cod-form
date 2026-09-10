(() => {
  const key = 'alfajr-chat-v2', ttl = 2 * 60 * 60 * 1000;
  const button = (text, action) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = action; return b; };
  function initialize() {
    for (const w of document.querySelectorAll('alfajr-assistant')) {
      if (!w.ready || w.extrasReady) continue;
      w.conversationId = crypto.randomUUID();
      w.extrasReady = true; w.compareIds = new Set();
      w.feedbackControl = node => {
        if (!/^[0-9a-f-]{36}$/i.test(node.dataset.turnId || '')) return;
        const conversationId = w.conversationId, turnId = node.dataset.turnId;
        const area = document.createElement('div'); area.className = 'af-tools';
        const status = document.createElement('small'); status.setAttribute('role', 'status');
        const votes = ['up', 'down'].map(rating => {
          const b = button(rating === 'up' ? '👍' : '👎', async () => {
            votes.forEach(v => v.disabled = true); status.textContent = 'Envoi…';
            try {
              await w.json(w.dataset.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'feedback', conversationId, turnId, rating }) });
              node.dataset.rating = rating; votes.forEach((v, i) => v.setAttribute('aria-pressed', String(['up', 'down'][i] === rating)));
              status.textContent = 'Merci pour ton avis !'; w.saveState?.();
            } catch { status.textContent = 'Avis non enregistré. Réessaie.'; }
            finally { votes.forEach(v => v.disabled = false); }
          });
          b.setAttribute('aria-label', rating === 'up' ? 'Réponse utile' : 'Réponse peu utile');
          b.setAttribute('aria-pressed', String(node.dataset.rating === rating)); return b;
        });
        area.append(...votes, status); node.after(area);
      };
      w.lastProducts = [];
      w.buildContext = intent => ({ ...(w.dataset.product ? { productHandle: w.dataset.product } : {}), productIds: [...(intent === 'compare' && w.compareIds.size ? w.compareIds : w.lastProducts.map(p => p.id))].slice(0, 4), intent });
      w.saveState = () => {
        try { sessionStorage.setItem(key, JSON.stringify({ conversationId: w.conversationId, expires: Date.now() + ttl, history: w.history.slice(-6), messages: [...w.log.querySelectorAll('.af-msg:not(.af-typing)')].slice(-12).map(n => ({ text: n.textContent.slice(0, 1400), turnId: n.dataset.turnId, rating: n.dataset.rating, user: n.classList.contains('af-user') })), products: w.lastProducts.slice(0, 4), open: !w.panel.hidden })); } catch { /* Storage can be disabled. Chat still works. */ }
      };
      const toggle = w.toggle.bind(w);
      w.toggle = open => { toggle(open); w.saveState(); };
      w.compareControl = (container, product) => {
        const label = document.createElement('label'); label.className = 'af-compare-choice';
        const box = document.createElement('input'); box.type = 'checkbox'; box.checked = w.compareIds.has(product.id);
        box.onchange = () => { if (box.checked && w.compareIds.size >= 3) { box.checked = false; return; } box.checked ? w.compareIds.add(product.id) : w.compareIds.delete(product.id); };
        label.append(box, document.createTextNode(' Comparer')); container.append(label);
      };
      w.renderComparison = rows => {
        const area = document.createElement('div'); area.className = 'af-comparison';
        const heading = document.createElement('strong'); heading.textContent = 'Comparaison des produits'; area.append(heading);
        for (const row of rows.slice(0, 3)) {
          if (!/^[a-z0-9-]+$/.test(row.handle)) continue;
          const section = document.createElement('section');
          for (const text of [row.title, `Type : ${row.type}`, row.description || 'Caractéristiques : non précisées', `Options : ${row.options || 'Non précisées'}`]) { const p = document.createElement('p'); p.textContent = text; section.append(p); }
          const price = document.createElement('p'); price.textContent = 'Vérification du prix…'; section.append(price); area.append(section);
          Promise.all([w.json(w.root(`products/${row.handle}.js`)), w.json(w.root('cart.js'))]).then(([p, cart]) => {
            const prices = p.variants.filter(v => v.available).map(v => v.price);
            price.textContent = prices.length ? `Prix disponible : ${w.money(Math.min(...prices), cart.currency)}${Math.max(...prices) !== Math.min(...prices) ? ' à ' + w.money(Math.max(...prices), cart.currency) : ''}` : 'Actuellement indisponible';
          }).catch(() => { price.textContent = 'Consultez la fiche pour le prix actuel.'; });
        }
        w.log.append(area);
      };
      const toolbar = document.createElement('div'); toolbar.className = 'af-tools';
      toolbar.append(button('Comparer la sélection', () => { if (w.busy || w.cartBusy) return; w.input.value = 'Compare ces produits'; w.send('compare'); }), button('Compléter ce produit', () => { if (w.busy || w.cartBusy) return; w.input.value = 'Des fournitures pour compléter ce produit'; w.send('complements'); }), button('Recommencer', () => { if (w.busy || w.cartBusy) return; w.conversationId = crypto.randomUUID(); w.history = []; w.lastProducts = []; w.compareIds.clear(); w.pending = []; w.showPending(); w.log.replaceChildren(); try { sessionStorage.removeItem(key); } catch {} }));
      w.querySelector('.af-intro').after(toolbar);
      w.recordAdded = items => {
        const productIds = [...new Set(items.map(p => p.productId))].filter(id => /^\d+$/.test(id));
        if (productIds.length) w.json(w.dataset.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'cart_added', eventId: crypto.randomUUID(), productIds }) }).catch(() => {});
        const offer = button('Voir les fournitures complémentaires', () => { if (w.busy || w.cartBusy) return; w.lastProducts = items.slice(0, 4).map(p => ({ id: p.productId, title: p.title, handle: p.handle })); w.input.value = 'Des fournitures pour compléter mon achat'; w.send('complements'); });
        offer.className = 'af-complement-offer'; w.log.append(offer);
      };
      try {
        const raw = sessionStorage.getItem(key);
        if (raw && raw.length < 24000) {
          const saved = JSON.parse(raw);
          if (saved.expires > Date.now() && saved.expires <= Date.now() + ttl && Array.isArray(saved.messages) && Array.isArray(saved.history)) {
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.conversationId || '')) w.conversationId = saved.conversationId;
            w.history = saved.history.filter(h => ['user', 'model'].includes(h.role) && typeof h.text === 'string').slice(-6).map(h => ({ role: h.role, text: h.text.slice(0, 1200) }));
            for (const m of saved.messages.slice(-12)) if (typeof m.text === 'string') { const node = w.say(m.text.slice(0, 1400), m.user === true); if (!m.user && /^[0-9a-f-]{36}$/i.test(m.turnId || '')) { node.dataset.turnId = m.turnId; node.dataset.rating = ['up', 'down'].includes(m.rating) ? m.rating : ''; w.feedbackControl(node); } }
            w.lastProducts = (Array.isArray(saved.products) ? saved.products : []).filter(p => p && typeof p.id === 'string' && /^\d+$/.test(p.id) && typeof p.title === 'string' && /^[a-z0-9-]+$/.test(p.handle)).slice(0, 4);
            for (const p of w.lastProducts) w.card(p);
            if (saved.open) toggle(true);
          } else sessionStorage.removeItem(key);
        }
      } catch { /* Ignore invalid or unavailable storage. */ }
    }
  }
  document.addEventListener('alfajr:ready', initialize);
  customElements.whenDefined('alfajr-assistant').then(initialize);
})();
