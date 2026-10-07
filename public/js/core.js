/* ==========================================================================
   core.js — shared helpers for the public site
   Exposes window.Rafay for the page scripts (home, inventory, detail).
   ========================================================================== */
(function () {
  'use strict';

  const ICONS = {
    shield: '<path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5l-8-3Zm0 4.3 4 1.5V11c0 3.2-1.9 6.1-4 7.4-2.1-1.3-4-4.2-4-7.4V7.8l4-1.5Z"/>',
    rupee: '<path d="M7 4h10v2h-3.3a4.5 4.5 0 0 1 0 7H12l5 7h-2.6l-5-7H9v7H7V4Zm2 2v5h4.7a2.5 2.5 0 0 0 0-5H9Z"/>',
    file: '<path d="M6 2h8l4 4v16H6V2Zm2 2v16h8V7h-3V4H8Zm2 6h4v2h-4v-2Zm0 4h6v2h-6v-2Z"/>',
    handshake: '<path d="M11 4 8 7H4v4l4 4 3-3 3 3 4-4V7h-4l-3-3Zm0 2.8 2 2H16v.8l-2 2-1.6-1.6L11 11.4 9.6 10 8 11.6l-2-2V8.8h3l2-2Z"/>',
    swap: '<path d="M7 7h9.2l-2.6-2.6L15 3l5 5-5 5-1.4-1.4L16.2 9H7V7Zm10 8H7.8l2.6 2.6L9 19l-5-5 5-5 1.4 1.4L7.8 13H17v2Z"/>',
    pin: '<path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.8-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.8L12 3Z"/>',
    check: '<path d="M9.5 16.6 5 12l1.4-1.4 3.1 3.1 8-8L19 7.1z"/>',
    car: '<path d="M5 11l1.5-4A2 2 0 0 1 8.4 5.6h7.2A2 2 0 0 1 17.5 7L19 11h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1v1.5a1.5 1.5 0 0 1-3 0V17H8v1.5a1.5 1.5 0 0 1-3 0V17H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h1Zm2.1-.4h9.8l-1.1-3.2a.6.6 0 0 0-.6-.4H8.8a.6.6 0 0 0-.6.4L7.1 10.6ZM7 13.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm10 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/>',
    camera: '<path d="M9 4h6l1 2h3v14H5V6h3l1-2Zm3 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/>',
    phone: '<path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z"/>',
    whatsapp: '<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .1-1.7-.1a11 11 0 0 1-5.6-4.9c-.4-.7-.6-1.5-.4-2.2.1-.5.6-1.2 1-1.4.3-.1.7-.1.9.2l.8 1.3c.1.3.1.5-.1.7l-.4.5c-.2.2-.2.4-.1.6.4.8 1.4 1.9 2.3 2.3.3.1.4.1.6-.1l.5-.5c.2-.2.4-.2.7-.1l1.4.7c.3.1.4.5.3.8Z"/>',
    facebook: '<path d="M13.5 21v-7h2.4l.4-3h-2.8V9.2c0-.9.3-1.5 1.6-1.5h1.3V5.1A22 22 0 0 0 14.6 5c-2.2 0-3.7 1.3-3.7 3.8V11H8.5v3h2.4v7h2.6Z"/>',
    instagram: '<path d="M12 2c2.7 0 3 0 4.1.1 1.1 0 1.8.2 2.4.5.7.2 1.2.6 1.7 1.1.5.5.9 1 1.1 1.7.3.6.4 1.3.5 2.4V16c0 1.1-.2 1.8-.5 2.4a4.6 4.6 0 0 1-1.1 1.7c-.5.5-1 .9-1.7 1.1-.6.3-1.3.4-2.4.5H8c-1.1 0-1.8-.2-2.4-.5a4.6 4.6 0 0 1-1.7-1.1 4.6 4.6 0 0 1-1.1-1.7c-.3-.6-.4-1.3-.5-2.4V8c0-1.1.2-1.8.5-2.4A4.6 4.6 0 0 1 3.9 3.9c.5-.5 1-.9 1.7-1.1C6.2 2.5 6.9 2.4 8 2.3 9.1 2.2 9.4 2 12 2Zm0 1.8c-2.6 0-2.9 0-3.9.1-.9 0-1.4.2-1.7.3-.4.2-.7.4-1 .7-.3.3-.5.6-.7 1-.1.3-.3.8-.3 1.7-.1 1-.1 1.3-.1 3.9s0 2.9.1 3.9c0 .9.2 1.4.3 1.7.2.4.4.7.7 1 .3.3.6.5 1 .7.3.1.8.3 1.7.3 1 .1 1.3.1 3.9.1s2.9 0 3.9-.1c.9 0 1.4-.2 1.7-.3.4-.2.7-.4 1-.7.3-.3.5-.6.7-1 .1-.3.3-.8.3-1.7.1-1 .1-1.3.1-3.9s0-2.9-.1-3.9c0-.9-.2-1.4-.3-1.7a2.8 2.8 0 0 0-.7-1 2.8 2.8 0 0 0-1-.7c-.3-.1-.8-.3-1.7-.3-1-.1-1.3-.1-3.9-.1Zm0 3.1a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2Zm0 8.4a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Zm6.5-8.6a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z"/>',
    youtube: '<path d="M21.6 7.2c-.2-1-.9-1.7-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3c-1 .2-1.7.9-1.9 1.9C2 9 2 12 2 12s0 3 .4 4.8c.2 1 .9 1.7 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.3c1-.2 1.7-.9 1.9-1.9.4-1.8.4-4.8.4-4.8s0-3-.4-4.8ZM10 15.5v-7l6 3.5-6 3.5Z"/>',
    tiktok: '<path d="M16.5 3c.3 2 1.5 3.5 3.5 3.9v2.6c-1.4 0-2.6-.4-3.7-1.1v5.9a5.8 5.8 0 1 1-5.8-5.8c.3 0 .6 0 .9.1v2.7a3.1 3.1 0 1 0 2.2 3V3h2.9Z"/>',
    share: '<path d="M18 16a3 3 0 0 0-2.1.9l-5.6-3.2a3.1 3.1 0 0 0 0-1.4l5.6-3.2a3 3 0 1 0-1-2.2c0 .2 0 .5.1.7L9.4 10.8a3 3 0 1 0 0 4.4l5.6 3.2c0 .2-.1.4-.1.7A3 3 0 1 0 18 16Z"/>',
  };

  const state = { site: null, cars: [], facets: [], options: {}, session: null, loadedAt: 0 };

  /* --------------------------------------------------------------- helpers */
  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, extraClass = '') {
    const path = ICONS[name] || ICONS.check;
    return `<svg class="${extraClass}" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
  }

  function formatPrice(value) {
    const amount = Number(value) || 0;
    if (amount >= 10000000) {
      const crore = amount / 10000000;
      return `PKR ${crore.toFixed(crore >= 10 ? 2 : 2)} Crore`;
    }
    if (amount >= 100000) return `PKR ${(amount / 100000).toFixed(2)} Lac`;
    return `PKR ${amount.toLocaleString('en-PK')}`;
  }

  function formatAmount(value) {
    return `Rs ${(Number(value) || 0).toLocaleString('en-PK')}`;
  }

  function formatNumber(value) {
    return (Number(value) || 0).toLocaleString('en-PK');
  }

  function formatMileage(value) {
    const km = Number(value) || 0;
    return `${formatNumber(km)} km`;
  }

  function prettyPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('0')) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    if (digits.length === 12 && digits.startsWith('92')) return `0${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
    return digits;
  }

  function international(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('92')) return digits;
    if (digits.startsWith('0')) return `92${digits.slice(1)}`;
    return digits;
  }

  function waLink(number, text) {
    const digits = international(number);
    return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  }

  function statusMeta(car) {
    const status = car.status || 'available';
    if (status === 'sold') return { key: 'sold', label: 'Sold', pill: 'pill--sold' };
    if (status === 'reserved') return { key: 'reserved', label: 'Booked', pill: 'pill--amber' };
    return { key: 'available', label: 'Available', pill: 'pill--green' };
  }

  /* ------------------------------------------------------------------- API */
  async function api(path, { method = 'GET', body, headers = {} } = {}) {
    const options = { method, headers: { Accept: 'application/json', ...headers }, credentials: 'same-origin' };
    if (body instanceof FormData) {
      options.body = body;
    } else if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    const text = await response.text();
    let data = {};
    if (text) {
      try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
    }
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function loadData({ force = false } = {}) {
    if (!force && state.loadedAt && Date.now() - state.loadedAt < 30000) return state;
    const data = await api('/api/bootstrap');
    Object.assign(state, data, { loadedAt: Date.now() });
    return state;
  }

  /* -------------------------------------------------------------- rendering */
  function carAlt(car) {
    const bits = [car.title, car.color, car.bodyType, car.registrationCity].filter(Boolean).join(' — ');
    return `${bits} for sale at ${state.site?.businessName || 'Alraffay Corporation & Traders'}, Islamabad`;
  }

  function carCard(car, options = {}) {
    const { priority = false } = options;
    const status = statusMeta(car);
    const image = (car.images && car.images[0]) || '/assets/img/photos/suv.jpg';
    const link = `/car?id=${encodeURIComponent(car.id)}`;
    const wa = waLink(
      state.site?.whatsappNumber || state.site?.owners?.[0]?.whatsapp || state.site?.phones?.[0],
      `Assalam o Alaikum, I am interested in the ${car.title} (${formatPrice(car.price)}) listed on your website.`,
    );
    const badges = [];
    if (car.featured && status.key !== 'sold') badges.push('<span class="pill pill--red">Featured</span>');
    if (status.key !== 'available') badges.push(`<span class="pill ${status.pill}">${status.label}</span>`);
    const meta = [
      car.year, formatMileage(car.mileage), car.fuel, car.transmission, car.engine,
    ].filter(Boolean).map((value) => `<span>${escapeHtml(value)}</span>`).join('');

    return `
      <article class="car-card${status.key === 'sold' ? ' is-sold' : ''} reveal" data-car-id="${escapeHtml(car.id)}">
        <a class="car-card__media" href="${link}" aria-label="${escapeHtml(car.title)}">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(carAlt(car))}" loading="${priority ? 'eager' : 'lazy'}"
               ${priority ? 'fetchpriority="high"' : ''} width="1400" height="900" decoding="async">
          ${badges.length ? `<span class="car-card__badges">${badges.join('')}</span>` : ''}
          <span class="car-card__media-count">${icon('camera')}${(car.images || []).length}</span>
        </a>
        <div class="car-card__body">
          <h3 class="car-card__title"><a href="${link}">${escapeHtml(car.title)}</a></h3>
          <p class="car-card__price"><small>Asking price</small>${formatPrice(car.price)}</p>
          <div class="car-card__meta">${meta}</div>
          <div class="car-card__foot">
            <a class="btn btn--primary btn--sm" href="${link}">View details</a>
            <a class="btn btn--whatsapp btn--sm btn--icon" href="${wa}" target="_blank" rel="noopener"
               aria-label="WhatsApp about the ${escapeHtml(car.title)}">${icon('whatsapp')}</a>
          </div>
        </div>
      </article>`;
  }

  /* ------------------------------------------------------------------ toast */
  function toast(message, type = '') {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const node = document.createElement('div');
    node.className = `toast${type ? ` toast--${type}` : ''}`;
    node.textContent = message;
    stack.appendChild(node);
    setTimeout(() => {
      node.style.transition = 'opacity .4s ease, transform .4s ease';
      node.style.opacity = '0';
      node.style.transform = 'translateY(10px)';
      setTimeout(() => node.remove(), 420);
    }, 4200);
  }

  /* --------------------------------------------------------- scroll reveal */
  let revealObserver = null;
  function observeReveals(root = document) {
    const targets = root.querySelectorAll('.reveal:not(.is-visible)');
    if (!targets.length) return;
    if (!('IntersectionObserver' in window)) {
      targets.forEach((node) => node.classList.add('is-visible'));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    }
    targets.forEach((node) => revealObserver.observe(node));
  }

  /* --------------------------------------------------------- animated stats */
  function animateCounters() {
    const band = document.querySelector('[data-counters]');
    if (!band || band.dataset.done === '1') return;
    const run = () => {
      band.dataset.done = '1';
      band.querySelectorAll('[data-count]').forEach((node) => {
        const target = Number(node.dataset.count) || 0;
        const suffix = node.dataset.suffix || '';
        const duration = 1500;
        const start = performance.now();
        const tick = (now) => {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          node.textContent = `${formatNumber(Math.round(target * eased))}${suffix}`;
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    };
    if (!('IntersectionObserver' in window)) return run();
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        run();
        observer.disconnect();
      }
    }, { threshold: 0.3 });
    observer.observe(band);
  }

  /* ------------------------------------------------------------ header / nav */
  function bindHeader() {
    const header = document.getElementById('siteHeader');
    const toggle = document.getElementById('navToggle');
    const nav = document.getElementById('primaryNav');
    if (header) {
      const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    if (!toggle || !nav) return;
    let backdrop = document.querySelector('.nav-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'nav-backdrop';
      document.body.appendChild(backdrop);
    }
    const close = () => {
      nav.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      header?.classList.remove('has-open-nav');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };
    toggle.addEventListener('click', () => {
      const open = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', open);
      backdrop.classList.toggle('is-open', open);
      header?.classList.toggle('has-open-nav', open);
      toggle.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    });
    backdrop.addEventListener('click', close);
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
  }

  /** scrollIntoView that never throws (some embedded browsers lack it). */
  function scrollToEl(target, options = { behavior: 'smooth', block: 'start' }) {
    if (!target || typeof target.scrollIntoView !== 'function') return;
    try { target.scrollIntoView(options); } catch { /* ignore */ }
  }

  function bindScrollButtons() {
    document.querySelectorAll('[data-scroll-to]').forEach((node) => {
      node.addEventListener('click', () => {
        scrollToEl(document.querySelector(node.dataset.scrollTo));
      });
    });
  }

  /* ------------------------------------------------------- google maps embed */
  function mapSrc(site) {
    if (site?.mapEmbed) return site.mapEmbed;
    const query = site?.mapQuery || site?.address || 'Thanda Pani, Islamabad';
    return `https://www.google.com/maps?q=${encodeURIComponent(query)}&hl=en&z=14&output=embed`;
  }

  function renderMap() {
    const frame = document.getElementById('mapFrame');
    if (!frame || frame.dataset.ready === '1') return;
    const site = state.site || {};
    frame.dataset.ready = '1';
    frame.innerHTML = `<iframe src="${escapeHtml(mapSrc(site))}" title="Showroom location on Google Maps"
      loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`;
  }

  /* -------------------------------------------------------------- site blocks */
  function renderFooterSocial() {
    const holder = document.getElementById('footerSocial');
    if (!holder) return;
    const social = state.site?.social || {};
    const links = Object.entries(social).filter(([, url]) => url);
    if (!links.length) {
      holder.innerHTML = `
        <a href="${waLink(state.site?.whatsappNumber)}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('whatsapp')}</a>
        <a href="/cars" aria-label="Browse cars">${icon('car')}</a>`;
      return;
    }
    holder.innerHTML = links.map(([key, url]) =>
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" aria-label="${escapeHtml(key)}">${icon(key)}</a>`).join('');
  }

  function renderOwners() {
    const site = state.site || {};
    const owners = site.owners || [];
    const waText = (owner) => `Assalam o Alaikum ${owner.name}, I am interested in a car listed on ${site.businessName}.`;

    const cards = document.getElementById('ownerCards');
    if (cards) {
      cards.innerHTML = owners.map((owner, index) => {
        const initials = String(owner.name || '').split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase();
        return `
          <article class="owner-card reveal" data-delay="${index}">
            <div class="owner-card__avatar" aria-hidden="true">${escapeHtml(initials || '97')}</div>
            <div>
              <p class="owner-card__role">${escapeHtml(owner.role || 'Owner')}</p>
              <h3 class="owner-card__name">${escapeHtml(owner.name)}</h3>
              <p class="owner-card__phone">${escapeHtml(prettyPhone(owner.phone))}</p>
              <div class="owner-card__actions">
                <a class="btn btn--primary btn--sm" href="tel:${escapeHtml(international(owner.phone))}">${icon('phone')} Call now</a>
                <a class="btn btn--whatsapp btn--sm" href="${waLink(owner.whatsapp || owner.phone, waText(owner))}" target="_blank" rel="noopener">${icon('whatsapp')} WhatsApp</a>
              </div>
            </div>
          </article>`;
      }).join('');
    }

    const mini = document.getElementById('ownerMini');
    if (mini) {
      mini.innerHTML = owners.map((owner) => `
        <div class="owner-mini__row">
          <div>
            <span class="owner-mini__name">${escapeHtml(owner.name)}</span>
            <span class="owner-mini__num">${escapeHtml(prettyPhone(owner.phone))} · ${escapeHtml(owner.role || 'Owner')}</span>
          </div>
          <div class="owner-mini__actions">
            <a class="btn btn--outline btn--sm" href="tel:${escapeHtml(international(owner.phone))}">Call</a>
            <a class="btn btn--whatsapp btn--sm" href="${waLink(owner.whatsapp || owner.phone, waText(owner))}" target="_blank" rel="noopener" aria-label="WhatsApp ${escapeHtml(owner.name)}">${icon('whatsapp')}</a>
          </div>
        </div>`).join('');
    }
  }

  function renderWhyUs() {
    const grid = document.getElementById('whyGrid');
    if (!grid) return;
    const items = state.site?.whyChooseUs || [];
    grid.innerHTML = items.map((item, index) => `
      <article class="why-card reveal" data-delay="${index % 3}">
        <div class="why-card__icon">${icon(item.icon)}</div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.text)}</p>
      </article>`).join('');
  }

  function renderStats(cars) {
    const band = document.getElementById('statsBand');
    if (!band) return;
    const stats = (state.site?.stats || []).slice(0, 4);
    const live = { available: cars.filter((car) => (car.status || 'available') === 'available').length };
    band.innerHTML = stats.map((stat, index) => {
      const isStock = /stock|available/i.test(stat.label);
      const value = isStock && live.available ? live.available : stat.value;
      const suffix = isStock && live.available ? '+' : (stat.suffix || '');
      return `
        <div class="stat reveal" data-delay="${index % 4}">
          <p class="stat__value" data-count="${value}" data-suffix="${escapeHtml(suffix)}">0</p>
          <span class="stat__label">${escapeHtml(isStock ? 'Cars in stock today' : stat.label)}</span>
        </div>`;
    }).join('');
    animateCounters();
  }

  /* --------------------------------------------------------------- enquiries */
  function bindForm(formId, noteId, { carId = '' } = {}) {
    const form = document.getElementById(formId);
    if (!form) return;
    const note = document.getElementById(noteId);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      const data = Object.fromEntries(new FormData(form).entries());
      if (carId) data.carId = carId;
      if (note) { note.textContent = 'Sending…'; note.className = 'form-note'; }
      if (submit) submit.disabled = true;
      try {
        const result = await api('/api/inquiries', { method: 'POST', body: data });
        if (note) { note.textContent = result.message || 'Thank you — we will contact you shortly.'; note.className = 'form-note is-ok'; }
        toast('Enquiry sent. The owners will call you back.', 'ok');
        form.reset();
      } catch (error) {
        if (note) { note.textContent = error.message; note.className = 'form-note is-error'; }
        toast(error.message, 'error');
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }

  /* -------------------------------------------------------------- live sync */
  function startPolling(onChange, interval = 60000) {
    let last = JSON.stringify(state.cars);
    setInterval(async () => {
      try {
        const data = await api('/api/bootstrap');
        const next = JSON.stringify(data.cars);
        Object.assign(state, data, { loadedAt: Date.now() });
        if (next !== last) {
          last = next;
          if (typeof onChange === 'function') onChange();
        }
      } catch { /* offline — keep showing the last data */ }
    }, interval);
  }

  window.Rafay = {
    state, api, loadData, escapeHtml, icon, formatPrice, formatAmount, formatNumber, formatMileage,
    prettyPhone, international, waLink, statusMeta, carCard, carAlt, toast, observeReveals, scrollToEl,
    animateCounters, bindHeader, bindScrollButtons, renderMap, mapSrc, renderFooterSocial,
    renderOwners, renderWhyUs, renderStats, bindForm, startPolling, ICONS,
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindHeader();
    bindScrollButtons();
    observeReveals();
  });
})();
