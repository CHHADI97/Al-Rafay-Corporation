/* Menu page: renders the published menu, search and category filters, quantity selectors and per-item ordering. */
(() => {
  'use strict';

  const AFF = window.AFF;
  const { $, escapeHtml, formatPrice, state } = AFF;
  const FALLBACK_CATEGORIES = ['Burgers', 'Shawarma', 'Chaat & Refreshments', 'Snacks', 'BBQ & Chicken', 'Beverages'];
  const qtyById = new Map();
  const params = new URLSearchParams(window.location.search);
  let activeCategory = '';
  let query = '';
  let status = 'loading'; // loading | ready | failed

  const categories = () => (state.categories.length ? state.categories : FALLBACK_CATEGORIES);
  const itemById = (id) => state.items.find((item) => item.id === id);
  const qtyFor = (id) => qtyById.get(id) || 1;
  const waIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.4 11.8a8.2 8.2 0 0 1-12.1 7.1L4 20l1.2-4A8.2 8.2 0 1 1 20.4 11.8Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 8.5c.3-.4.7-.3.9 0l.7 1.5c.1.3 0 .5-.3.8l-.4.5c.6 1.1 1.5 1.9 2.6 2.4l.5-.6c.2-.3.5-.4.8-.2l1.4.7c.3.2.4.5.2.9-.3.7-.9 1.1-1.6 1.1-2.5-.1-5.6-2.9-5.9-5.5-.1-.7.3-1.3 1.1-1.6Z" fill="currentColor"/></svg>';

  function whatsappMessageFor(item, qty) {
    return [
      'Assalam-o-Alaikum! I would like to order from Appetizer Fast Foods.',
      '',
      `Item: ${item.name}`,
      `Quantity: ${qty}`,
      '',
      'Please confirm the price, delivery charges, and estimated delivery time.',
    ].join('\n');
  }

  function renderFilters() {
    const group = $('#category-filters');
    const options = ['', ...categories()];
    group.innerHTML = options.map((category) => {
      const label = category || 'All';
      const pressed = category === activeCategory;
      return `<button class="filter-chip" type="button" data-category="${escapeHtml(category)}" aria-pressed="${pressed}">${escapeHtml(label)}</button>`;
    }).join('');
  }

  function matches(item) {
    if (activeCategory && item.category !== activeCategory) return false;
    if (!query) return true;
    const haystack = `${item.name} ${item.description} ${item.category}`.toLowerCase();
    return query.split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
  }

  function cardHtml(item) {
    const qty = qtyFor(item.id);
    const priced = Number.isInteger(item.price);
    const priceHtml = priced
      ? `<p class="food-price">${escapeHtml(formatPrice(item.price))}</p>`
      : '<p class="food-price is-tbc">Price to be confirmed</p>';
    const availabilityHtml = item.available
      ? '<span class="pill is-available">Available</span>'
      : '<span class="pill is-unavailable">Currently unavailable</span>';
    const featuredHtml = item.featured ? '<span class="pill is-featured">Popular</span>' : '';
    const disabled = item.available ? '' : ' aria-disabled="true"';
    return `
      <article class="food-card" data-id="${escapeHtml(item.id)}">
        <div class="food-media">
          <img src="${escapeHtml(item.image)}" alt="Photo of ${escapeHtml(item.name)}" width="800" height="600" loading="lazy" decoding="async">
          <div class="food-badges">${featuredHtml}${availabilityHtml}</div>
        </div>
        <div class="food-body">
          <span class="food-category">${escapeHtml(item.category)}</span>
          <h3>${escapeHtml(item.name)}</h3>
          <p class="food-desc">${escapeHtml(item.description)}</p>
          ${priceHtml}
          <div class="food-controls">
            <div class="qty" role="group" aria-labelledby="qty-label-${escapeHtml(item.id)}">
              <span class="qty-label" id="qty-label-${escapeHtml(item.id)}">Quantity</span>
              <div class="qty-buttons">
                <button type="button" data-qty-dec aria-label="Decrease quantity of ${escapeHtml(item.name)}"${qty <= 1 || !item.available ? ' disabled' : ''}>−</button>
                <output aria-live="polite" aria-label="Selected quantity of ${escapeHtml(item.name)}" data-qty-output>${qty}</output>
                <button type="button" data-qty-inc aria-label="Increase quantity of ${escapeHtml(item.name)}"${qty >= AFF.MAX_QTY || !item.available ? ' disabled' : ''}>+</button>
              </div>
            </div>
            <div class="food-actions">
              <button class="btn btn-small" type="button" data-order${disabled}${item.available ? '' : ' disabled'}>${item.available ? 'Order This Item' : 'Unavailable'}</button>
              <a class="wa-icon-btn" data-wa href="${escapeHtml(AFF.whatsappHref(state.restaurant.whatsapp, whatsappMessageFor(item, qty)))}" target="_blank" rel="noopener" aria-label="Order ${escapeHtml(item.name)} on WhatsApp" title="Order on WhatsApp"${disabled}>${waIcon}</a>
            </div>
          </div>
        </div>
      </article>`;
  }

  function render() {
    const container = $('#menu-sections');
    const count = $('#results-count');
    const empty = $('#menu-empty');
    renderFilters();
    if (status === 'loading') {
      container.innerHTML = '<div class="empty-state"><p>Loading the menu…</p></div>';
      count.textContent = 'Loading the menu…';
      empty.hidden = true;
      return;
    }
    if (status === 'failed') {
      container.innerHTML = `<div class="empty-state"><h3>We couldn’t load the menu just now.</h3><p>Please try again in a moment, or call us to order.</p><a class="btn btn-small" href="tel:+923015136842">Call +92 301 5136842</a></div>`;
      count.textContent = 'Menu unavailable';
      empty.hidden = true;
      return;
    }
    const visible = state.items.filter(matches);
    const sections = categories().map((category) => {
      const items = visible.filter((item) => item.category === category);
      if (!items.length) return '';
      return `
        <section class="menu-section" aria-labelledby="section-${escapeHtml(category.replace(/[^a-z0-9]+/gi, '-'))}">
          <div class="menu-section-head">
            <h2 id="section-${escapeHtml(category.replace(/[^a-z0-9]+/gi, '-'))}">${escapeHtml(category)}</h2>
            <span>${items.length} ${items.length === 1 ? 'item' : 'items'}</span>
          </div>
          <div class="food-grid">${items.map(cardHtml).join('')}</div>
        </section>`;
    }).join('');
    container.innerHTML = sections;
    empty.hidden = visible.length > 0;
    count.textContent = `Showing ${visible.length} of ${state.items.length} items`;
  }

  function setCategory(category, { updateUrl = true } = {}) {
    activeCategory = category;
    if (updateUrl) {
      const url = new URL(window.location.href);
      if (category) url.searchParams.set('category', category);
      else url.searchParams.delete('category');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
    render();
  }

  function renderBasket() {
    const bar = $('#basket-bar');
    const lines = AFF.basket.read();
    const total = lines.reduce((sum, line) => sum + line.qty, 0);
    bar.hidden = total === 0;
    bar.classList.toggle('is-visible', total > 0);
    $('#basket-count').textContent = String(total);
    $('#basket-names').textContent = lines.map((line) => `${line.name} × ${line.qty}`).join(' · ');
  }

  function setupEvents() {
    $('#category-filters').addEventListener('click', (event) => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      setCategory(button.dataset.category);
    });
    $('#menu-search').addEventListener('input', (event) => {
      query = event.target.value.trim().toLowerCase();
      render();
    });
    $('#clear-menu-filters').addEventListener('click', () => {
      query = '';
      $('#menu-search').value = '';
      setCategory('');
      $('#menu-search').focus();
    });
    $('#menu-sections').addEventListener('click', (event) => {
      const card = event.target.closest('.food-card');
      if (!card) return;
      const id = card.dataset.id;
      const item = itemById(id);
      if (!item) return;
      const output = card.querySelector('[data-qty-output]');
      if (event.target.closest('[data-qty-inc]') && item.available) {
        qtyById.set(id, Math.min(AFF.MAX_QTY, qtyFor(id) + 1));
      } else if (event.target.closest('[data-qty-dec]') && item.available) {
        qtyById.set(id, Math.max(1, qtyFor(id) - 1));
      } else if (event.target.closest('[data-order]')) {
        if (!item.available) return;
        const qty = qtyFor(id);
        AFF.basket.add(item, qty);
        window.location.href = `/contact?added=${encodeURIComponent(id)}&qty=${qty}#order-form`;
        return;
      } else {
        return;
      }
      const qty = qtyFor(id);
      output.textContent = String(qty);
      card.querySelector('[data-qty-dec]').disabled = qty <= 1;
      card.querySelector('[data-qty-inc]').disabled = qty >= AFF.MAX_QTY;
      card.querySelector('[data-wa]').setAttribute('href', AFF.whatsappHref(state.restaurant.whatsapp, whatsappMessageFor(item, qty)));
    });
    document.addEventListener('aff:basket', renderBasket);
  }

  function init() {
    const requested = params.get('category') || '';
    activeCategory = categories().includes(requested) ? requested : '';
    setupEvents();
    renderBasket();
    render();
    AFF.loadPublicData().then((data) => {
      status = data.loaded ? 'ready' : 'failed';
      if (activeCategory && !categories().includes(activeCategory)) activeCategory = '';
      render();
    });
  }

  init();
})();
