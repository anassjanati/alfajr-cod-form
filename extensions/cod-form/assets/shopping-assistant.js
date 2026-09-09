(() => {
  if (customElements.get('alfajr-assistant')) return;
  customElements.define('alfajr-assistant', class extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;
      this.ready = true;
      this.labels = JSON.parse(this.querySelector('.af-labels').textContent);
      this.log = this.querySelector('.af-log');
      this.panel = this.querySelector('.af-panel');
      this.launch = this.querySelector('.af-launch');
      this.input = this.querySelector('input[name=message]');
      this.form = this.querySelector('.af-form');
      this.confirmBox = this.querySelector('.af-confirm');
      this.pending = [];
      this.history = [];
      this.launch.onclick = () => this.toggle(this.panel.hidden);
      this.querySelector('.af-close').onclick = () => this.toggle(false);
      this.addEventListener('keydown', e => { if (e.key === 'Escape') this.toggle(false); });
      this.querySelector('.af-no').onclick = () => { if (!this.cartBusy) { this.pending = []; this.showPending(); this.say(this.labels.cancelled); } };
      this.querySelector('.af-yes').onclick = () => this.addPending();
      this.form.onsubmit = e => { e.preventDefault(); this.send(); };
    }
    toggle(open) {
      this.panel.hidden = !open;
      this.launch.setAttribute('aria-expanded', String(open));
      (open ? this.input : this.launch).focus();
    }
    say(text, user = false) {
      const p = document.createElement('p');
      p.className = `af-msg${user ? ' af-user' : ''}`;
      p.dir = 'auto'; p.textContent = text;
      this.log.append(p);
      while (this.log.children.length > 40) this.log.firstElementChild.remove();
      this.log.scrollTop = this.log.scrollHeight;
      return p;
    }
    async json(url, options = {}) {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.method === 'POST' ? 28000 : 10000) });
      const data = await response.json();
      if (!response.ok) throw new Error('Request failed');
      return data;
    }
    root(path) { return this.dataset.root + path; }
    money(cents, currency = this.currency || 'MAD') {
      return new Intl.NumberFormat(document.documentElement.lang || 'fr', { style: 'currency', currency }).format(cents / 100);
    }
    async send() {
      const message = this.input.value.trim();
      if (!message || this.busy || this.cartBusy) return;
      this.input.value = '';
      if (this.pending.length && /^(ok|oui|yes|نعم|واخا|واخا زيدهم|زيدهم|wakha|ah)$/i.test(message)) {
        this.say(message, true); await this.addPending(); return;
      }
      if (!this.querySelector('.af-consent').checked) {
        this.input.value = message;
        this.say(this.labels.consent);
        this.querySelector('.af-consent').focus();
        return;
      }
      this.say(message, true);
      this.busy = true; this.form.querySelector('button').disabled = true;
      const waiting = this.say(this.labels.thinking);
      try {
        const data = await this.json(this.dataset.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, history: this.history.slice(-6) }) });
        waiting.textContent = data.reply;
        this.history.push({ role: 'user', text: message }, { role: 'model', text: data.reply.slice(0, 1200) });
        this.history = this.history.slice(-6);
        for (const product of data.products || []) this.card(product);
      } catch { waiting.textContent = this.labels.unavailable; }
      finally { this.busy = false; this.form.querySelector('button').disabled = false; this.log.scrollTop = this.log.scrollHeight; }
    }
    card(product) {
      if (!/^[a-z0-9-]+$/.test(product.handle)) return;
      const card = document.createElement('div'); card.className = 'af-card';
      if (product.image) {
        try {
          const url = new URL(product.image);
          if (url.protocol === 'https:' && (url.hostname === 'cdn.shopify.com' || url.hostname === 'al-fajr.ma')) {
            const img = document.createElement('img'); img.src = url.href; img.alt = product.title; img.loading = 'lazy'; card.append(img);
          }
        } catch { /* Ignore invalid catalog image URLs. */ }
      }
      const info = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = product.title; info.append(title);
      const link = document.createElement('a'); link.href = this.root(`products/${product.handle}`); link.textContent = this.labels.view; info.append(link);
      const price = document.createElement('p'); info.append(price);
      const select = document.createElement('select'); select.setAttribute('aria-label', this.labels.choose);
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = this.labels.choose; select.append(placeholder);
      const controls = document.createElement('div'); controls.className = 'af-controls';
      const quantity = document.createElement('input'); quantity.type = 'number'; quantity.min = '1'; quantity.max = '10'; quantity.value = '1'; quantity.setAttribute('aria-label', this.labels.quantity);
      const button = document.createElement('button'); button.type = 'button'; button.textContent = this.labels.select; button.disabled = true;
      controls.append(quantity, button); info.append(select); card.append(info, controls); this.log.append(card);
      Promise.all([this.json(this.root(`products/${product.handle}.js`)), this.json(this.root('cart.js'))]).then(([live, cart]) => {
        this.currency = cart.currency;
        const variants = live.variants.filter(v => v.available);
        for (const v of variants) { const option = document.createElement('option'); option.value = String(v.id); option.textContent = `${v.public_title || v.title} — ${this.money(v.price)}`; select.append(option); }
        if (!variants.length || live.requires_selling_plan) { price.textContent = this.labels.stock; return; }
        if (variants.length === 1) select.value = String(variants[0].id);
        const change = () => { const v = variants.find(v => String(v.id) === select.value); button.disabled = !v; price.textContent = v ? this.money(v.price) : ''; };
        select.onchange = change; change();
        button.onclick = () => {
          if (this.cartBusy) return;
          const v = variants.find(v => String(v.id) === select.value);
          const count = Number(quantity.value);
          if (!v || !Number.isInteger(count) || count < 1 || count > 10) { quantity.reportValidity(); return; }
          if (this.pending.length >= 4 && !this.pending.some(p => p.id === String(v.id))) return;
          this.pending = this.pending.filter(p => p.id !== String(v.id));
          this.pending.push({ id: String(v.id), title: live.title, variant: v.public_title || v.title, price: v.price, quantity: count, handle: product.handle });
          this.showPending();
        };
      }).catch(() => { price.textContent = this.labels.unavailable; });
    }
    showPending() {
      this.confirmBox.hidden = !this.pending.length;
      this.confirmBox.querySelector('p').textContent = this.labels.confirmQuestion + '\n' + this.pending.map(p => `${p.quantity} × ${p.title} (${p.variant}) — ${this.money(p.price * p.quantity)}`).join('\n');
    }
    async addPending() {
      if (this.cartBusy || !this.pending.length) return;
      this.cartBusy = true;
      this.confirmBox.querySelectorAll('button').forEach(b => { b.disabled = true; });
      let writeStarted = false;
      try {
        const cart = await this.json(this.root('cart.js'));
        this.currency = cart.currency;
        const items = this.pending.map(p => ({ ...p }));
        let changed = false;
        for (const item of items) {
          const live = await this.json(this.root(`products/${item.handle}.js`));
          const variant = live.variants.find(v => String(v.id) === item.id);
          if (!variant?.available || live.requires_selling_plan) { this.pending = []; this.showPending(); this.say(this.labels.stock); return; }
          if (variant.price !== item.price) { item.price = variant.price; changed = true; }
        }
        if (changed) { this.pending = items; this.showPending(); this.say(this.labels.changed); return; }
        writeStarted = true;
        const result = await this.json(this.root('cart/add.js'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: items.map(p => ({ id: p.id, quantity: p.quantity })), sections: ['cart-icon-bubble'], sections_url: window.location.pathname }),
        });
        this.pending = []; this.showPending(); this.say(this.labels.added);
        const icon = document.getElementById('cart-icon-bubble');
        if (icon && result.sections?.['cart-icon-bubble']) {
          const doc = new DOMParser().parseFromString(result.sections['cart-icon-bubble'], 'text/html');
          const replacement = doc.getElementById('cart-icon-bubble');
          if (replacement) icon.replaceWith(replacement);
        }
        document.dispatchEvent(new CustomEvent('alfajr:cart-added', { detail: { items: result.items } }));
      } catch {
        if (writeStarted) { this.pending = []; this.showPending(); }
        this.say(this.labels.failed);
      } finally { this.cartBusy = false; this.confirmBox.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
    }
  });
})();
