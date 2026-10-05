(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const cleanDigits = (value = '') => String(value).replace(/\D/g, '');
  const phoneHref = (phone = '') => {
    let number = cleanDigits(phone);
    if (number.startsWith('00')) number = number.slice(2);
    if (number.startsWith('0')) number = `92${number.slice(1)}`;
    else if (number && !number.startsWith('92')) number = `92${number}`;
    return number ? `+${number}` : '';
  };
  const whatsappHref = (phone = '', message = '') => {
    const number = phoneHref(phone).replace(/\D/g, '');
    return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : '#contact';
  };
  const formatPrice = (amount) => `Rs ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(Number(amount) || 0)}`;
  const formatCount = (amount) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(Number(amount) || 0);
  const waIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.4 11.8a8.2 8.2 0 0 1-12.1 7.1L4 20l1.2-4A8.2 8.2 0 1 1 20.4 11.8Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 8.5c.3-.4.7-.3.9 0l.7 1.5c.1.3 0 .5-.3.8l-.4.5c.6 1.1 1.5 1.9 2.6 2.4l.5-.6c.2-.3.5-.4.8-.2l1.4.7c.3.2.4.5.2.9-.3.7-.9 1.1-1.6 1.1-2.5-.1-5.6-2.9-5.9-5.5-.1-.7.3-1.3 1.1-1.6Z" fill="currentColor"/></svg>';

  let publicCars = [];
  let publicSite = {};
  let csrfToken = '';
  let adminData = null;
  let selectedCategory = '';
  let previousCarUrl = '/#cars';
  let carDialogFromHistory = false;
  let toastTimer = 0;
  let revealObserver;
  let loginTimer;

  async function request(url, options = {}) {
    const headers = new Headers(options.headers || {});
    const isForm = options.body instanceof FormData;
    if (options.body && !isForm && typeof options.body !== 'string') {
      headers.set('Content-Type', 'application/json');
      options = { ...options, body: JSON.stringify(options.body) };
    }
    if (!isForm && typeof options.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (url.startsWith('/api/admin/') && !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase()) && csrfToken) headers.set('X-CSRF-Token', csrfToken);
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, headers });
    let payload = {};
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      try { payload = await response.json(); } catch { payload = {}; }
    }
    if (!response.ok) {
      if (response.status === 401 && url.startsWith('/api/admin/')) csrfToken = '';
      throw Object.assign(new Error(payload.error || 'Something went wrong. Please try again.'), { status: response.status });
    }
    return payload;
  }

  function showToast(message, isError = false) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('is-error', isError);
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3900);
  }

  function setStatus(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', isError);
  }

  function initMotion() {
    if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
      $$('.reveal').forEach((element) => revealObserver.observe(element));
    } else {
      $$('.reveal').forEach((element) => element.classList.add('is-visible'));
    }

    const progress = $('#scroll-progress');
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const range = document.documentElement.scrollHeight - window.innerHeight;
        if (progress) progress.style.width = `${range > 0 ? Math.min(100, (window.scrollY / range) * 100) : 0}%`;
        ticking = false;
      });
    }, { passive: true });

    const menuButton = $('#mobile-menu-toggle');
    const nav = $('#primary-nav');
    menuButton?.addEventListener('click', () => {
      const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', String(!isOpen));
      menuButton.setAttribute('aria-label', isOpen ? 'Open navigation menu' : 'Close navigation menu');
      nav?.classList.toggle('is-open', !isOpen);
    });
    $$('.nav-link').forEach((link) => link.addEventListener('click', () => {
      nav?.classList.remove('is-open');
      menuButton?.setAttribute('aria-expanded', 'false');
      menuButton?.setAttribute('aria-label', 'Open navigation menu');
    }));
    const search = $('#car-search');
    document.addEventListener('keydown', (event) => {
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        if (search && !$('#admin-screen:not([hidden])')) { event.preventDefault(); search.focus(); }
      }
      if (event.key === 'Escape' && nav?.classList.contains('is-open')) {
        nav.classList.remove('is-open'); menuButton?.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function brandOptions() {
    const brands = [...new Set(publicCars.map((car) => car.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const years = [...new Set(publicCars.map((car) => Number(car.year)).filter(Number.isFinite))].sort((a, b) => b - a);
    const conditions = [...new Set(publicCars.map((car) => car.condition).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const brand = $('#filter-brand');
    const year = $('#filter-year');
    const condition = $('#filter-condition');
    if (brand) brand.innerHTML = '<option value="">All brands</option>' + brands.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
    if (year) year.innerHTML = '<option value="">Any year</option>' + years.map((item) => `<option value="${item}">${item}</option>`).join('');
    if (condition) condition.innerHTML = '<option value="">Any condition</option>' + conditions.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
    populateModels();
  }

  function populateModels() {
    const modelSelect = $('#filter-model');
    const selectedBrand = $('#filter-brand')?.value || '';
    if (!modelSelect) return;
    const models = [...new Set(publicCars.filter((car) => !selectedBrand || car.brand === selectedBrand).map((car) => car.model).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    modelSelect.innerHTML = '<option value="">All models</option>' + models.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  }

  function renderCarCard(car, index) {
    const name = escapeHtml(car.name || car.model || 'Car');
    const brand = escapeHtml(car.brand || 'Car');
    const model = escapeHtml(car.model || car.name || 'Car');
    const category = escapeHtml(car.category || 'Car');
    const badge = car.featured ? '<span class="car-badge featured"><span class="car-badge-dot"></span> FEATURED</span>' : '<span class="car-badge">SAMPLE LISTING</span>';
    const cardMessage = `Hello, I’m interested in the ${car.year} ${car.brand} ${car.model} listing on AL RAFAY CORPORATION’s website.`;
    const wa = whatsappHref(publicSite.ownerPhone, cardMessage);
    return `<article class="car-card reveal" style="--card-order:${Math.min(index, 12)}">
      <button class="car-image-wrap" type="button" data-open-car="${escapeHtml(car.id)}" aria-label="See details for ${name}, ${Number(car.year) || ''}">
        <img src="${escapeHtml(car.image || '/assets/img/alto.jpg')}" alt="${escapeHtml(`${car.year || ''} ${brand} ${model}`.trim())}" loading="lazy" decoding="async">
        <span class="car-image-top">${badge}</span><span class="car-category-tag">${category}</span><span class="car-image-number">${String(index + 1).padStart(2, '0')} / ${String(publicCars.length).padStart(2, '0')}</span>
      </button>
      <div class="car-card-content">
        <div class="car-card-topline"><span class="car-brand">${brand} <span>·</span> ${category}</span><span class="car-year">MODEL ${Number(car.year) || ''}</span></div>
        <h3>${name}</h3>
        <div class="car-price">${formatPrice(car.price)} <small>ASK FOR DETAILS</small></div>
        <div class="car-spec-list"><span class="car-spec"><span class="car-spec-icon" aria-hidden="true">↗</span><span>${formatCount(car.mileage)} km</span></span><span class="car-spec"><span class="car-spec-icon" aria-hidden="true">◉</span><span>${escapeHtml(car.transmission || '—')}</span></span><span class="car-spec"><span class="car-spec-icon" aria-hidden="true">⛽</span><span>${escapeHtml(car.fuel || '—')}</span></span></div>
        <div class="car-card-footer"><button class="card-detail-button" type="button" data-open-car="${escapeHtml(car.id)}">VIEW CAR DETAILS <span aria-hidden="true">↗</span></button><a class="card-whatsapp" href="${wa}" target="_blank" rel="noopener noreferrer" aria-label="Ask about the ${name} on WhatsApp">${waIcon}<span>WhatsApp</span></a></div>
      </div>
    </article>`;
  }

  function applyCarFilters() {
    const query = ($('#car-search')?.value || '').trim().toLowerCase();
    const brand = $('#filter-brand')?.value || '';
    const model = $('#filter-model')?.value || '';
    const year = $('#filter-year')?.value || '';
    const condition = $('#filter-condition')?.value || '';
    const priceRange = $('#filter-price')?.value || '';
    let minimum = -Infinity;
    let maximum = Infinity;
    if (priceRange) {
      const [min, max] = priceRange.split('-');
      minimum = Number(min);
      maximum = max ? Number(max) : Infinity;
    }
    const filtered = publicCars.filter((car) => {
      const searchable = `${car.brand || ''} ${car.model || ''} ${car.name || ''} ${car.category || ''}`.toLowerCase();
      return (!query || searchable.includes(query)) && (!brand || car.brand === brand) && (!model || car.model === model) && (!year || String(car.year) === year) && (!condition || car.condition === condition) && (!selectedCategory || car.category === selectedCategory) && Number(car.price) >= minimum && Number(car.price) <= maximum;
    });
    const grid = $('#car-grid');
    if (grid) {
      grid.innerHTML = filtered.map((car, index) => renderCarCard(car, index)).join('');
      $$('.car-card.reveal', grid).forEach((element) => {
        if (revealObserver) revealObserver.observe(element);
        else element.classList.add('is-visible');
      });
    }
    const count = $('#inventory-count');
    if (count) count.textContent = `Showing ${filtered.length} of ${publicCars.length} ${publicCars.length === 1 ? 'car' : 'cars'}`;
    const allCount = $('#all-count');
    if (allCount) allCount.textContent = String(publicCars.length).padStart(2, '0');
    $('#empty-inventory')?.toggleAttribute('hidden', filtered.length !== 0);
    if (grid) grid.toggleAttribute('hidden', filtered.length === 0);
  }

  function resetFilters() {
    ['#car-search', '#filter-brand', '#filter-model', '#filter-price', '#filter-year', '#filter-condition'].forEach((selector) => {
      const element = $(selector);
      if (element) element.value = '';
    });
    selectedCategory = '';
    $$('.category-tab').forEach((button) => button.classList.toggle('is-active', button.dataset.category === ''));
    populateModels();
    applyCarFilters();
  }

  function renderOwners() {
    const owners = [
      { name: publicSite.ownerName || 'CH NAEEM AKHTER', phone: publicSite.ownerPhone || '' },
      { name: publicSite.secondOwnerName || 'CH FAHEEM AKHTER', phone: publicSite.secondOwnerPhone || '' },
    ];
    const list = $('#owner-list');
    const contactOwners = $('#contact-owners');
    if (list) {
      list.innerHTML = owners.map((owner, index) => {
        const tel = phoneHref(owner.phone);
        const wa = whatsappHref(owner.phone, `Hello ${owner.name}, I’m getting in touch through the AL RAFAY CORPORATION website.`);
        return `<div class="owner-card"><span class="owner-avatar" aria-hidden="true">${index === 0 ? 'N' : 'F'}</span><span><small>${index === 0 ? 'OWNER · AVAILABLE TO HELP' : 'SECOND OWNER · HERE FOR YOU'}</small><strong>${escapeHtml(owner.name)}</strong></span><span class="owner-links"><a class="owner-action" href="tel:${escapeHtml(tel)}" aria-label="Call ${escapeHtml(owner.name)}">⌕</a><a class="owner-action wa" href="${wa}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp ${escapeHtml(owner.name)}">${waIcon}</a></span></div>`;
      }).join('');
    }
    if (contactOwners) {
      contactOwners.innerHTML = owners.map((owner, index) => {
        const tel = phoneHref(owner.phone);
        const wa = whatsappHref(owner.phone, `Hello ${owner.name}, I’m getting in touch through the AL RAFAY CORPORATION website.`);
        return `<div class="contact-owner-row"><span class="contact-owner-initial" aria-hidden="true">${index === 0 ? 'N' : 'F'}</span><span class="contact-owner-details"><small>${index === 0 ? 'OWNER · DIRECT LINE' : 'SECOND OWNER · DIRECT LINE'}</small><strong>${escapeHtml(owner.name)}</strong></span><span class="contact-owner-actions"><a href="tel:${escapeHtml(tel)}" aria-label="Call ${escapeHtml(owner.name)}">☎ Call</a><a class="wa-link" href="${wa}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp ${escapeHtml(owner.name)}">${waIcon} WhatsApp</a></span></div>`;
      }).join('');
    }
  }

  function updatePublicSite() {
    const setText = (selector, text) => { const element = $(selector); if (element) element.textContent = text || ''; };
    setText('#hero-tagline', publicSite.tagline || 'Premium Cars. Trusted Deals.');
    setText('#hero-description', publicSite.heroDescription || 'A considered collection of Pakistan’s most-loved cars, with a more personal way to find the one that feels right.');
    setText('#about-copy', publicSite.about || 'At AL RAFAY CORPORATION, finding your next car starts with a real conversation.');
    setText('#location-address', publicSite.location || 'Lethrar Road, Thanda Pani, Nilore, Islamabad, Pakistan');
    setText('#contact-address', publicSite.location || 'Lethrar Road, Thanda Pani, Nilore, Islamabad, Pakistan');
    const mapQuery = encodeURIComponent(publicSite.location || 'Lethrar Road, Thanda Pani, Nilore, Islamabad, Pakistan');
    const map = $('#map-embed');
    if (map) map.src = `https://www.google.com/maps?q=${mapQuery}&output=embed`;
    const directions = $('#directions-link');
    if (directions) directions.href = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
    const contactSelect = $('#contact-car-select');
    if (contactSelect) contactSelect.innerHTML = '<option value="">Just exploring</option>' + publicCars.map((car) => `<option value="${escapeHtml(car.id)}">${escapeHtml(car.year)} ${escapeHtml(car.brand)} ${escapeHtml(car.model)}</option>`).join('');
    renderOwners();
  }

  function spec(label, value) {
    return `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value || 'Not specified')}</strong></div>`;
  }

  function openCarDetails(id, { pushRoute = true } = {}) {
    const car = publicCars.find((item) => item.id === id);
    if (!car) { if (location.pathname.startsWith('/cars/')) history.replaceState({}, '', '/#cars'); return; }
    const dialog = $('#car-dialog');
    const body = $('#dialog-body');
    if (!dialog || !body) return;
    if (pushRoute && !location.pathname.startsWith('/cars/')) {
      previousCarUrl = `${location.pathname}${location.search}${location.hash}` || '/#cars';
      carDialogFromHistory = true;
      history.pushState({ arcCar: car.id }, '', `/cars/${encodeURIComponent(car.id)}`);
    } else if (!carDialogFromHistory) {
      previousCarUrl = '/#cars';
    }
    const message = `Hello, I’m interested in the ${car.year} ${car.brand} ${car.model} listing on AL RAFAY CORPORATION’s website. Is it available?`;
    const primaryTel = phoneHref(publicSite.ownerPhone);
    const primaryWhatsapp = whatsappHref(publicSite.ownerPhone, message);
    body.innerHTML = `<div class="dialog-image"><img src="${escapeHtml(car.image || '/assets/img/alto.jpg')}" alt="${escapeHtml(`${car.year} ${car.brand} ${car.model}`)}"><span class="dialog-image-caption">${escapeHtml(car.category || 'CAR')} · ${escapeHtml(car.condition || 'USED')}</span></div><div class="dialog-copy"><span class="dialog-eyebrow">${escapeHtml(car.brand)} <span>·</span> ${escapeHtml(car.category || 'CAR')}</span><h2 id="dialog-car-name">${escapeHtml(car.name || car.model)}</h2><span class="dialog-model-year">MODEL YEAR ${Number(car.year) || ''}</span><div class="dialog-price">${formatPrice(car.price)}</div><p class="dialog-description">${escapeHtml(car.description || 'Contact the owner for more information about this car.')}</p><div class="dialog-specs">${spec('Mileage', `${formatCount(car.mileage)} km`)}${spec('Fuel', car.fuel)}${spec('Transmission', car.transmission)}${spec('Engine', car.engine)}${spec('Condition', car.condition)}${spec('Category', car.category)}</div><div class="dialog-actions"><a class="button button-dark" href="tel:${escapeHtml(primaryTel)}"><span>CALL TO ENQUIRE</span><span class="button-arrow">↗</span></a><a class="button button-red" href="${primaryWhatsapp}" target="_blank" rel="noopener noreferrer"><span>WHATSAPP</span><span class="button-arrow">↗</span></a></div><p class="dialog-contact-phone">Speak directly with ${escapeHtml(publicSite.ownerName || 'the owner')} · ${escapeHtml(publicSite.ownerPhone || '')}</p><p class="dialog-sample-note">Preview listing — confirm the current stock, mileage and asking price with the owner.</p></div>`;
    if (!dialog.open) dialog.showModal();
  }

  function closeCarDetails({ fromPopState = false } = {}) {
    const dialog = $('#car-dialog');
    if (dialog?.open) dialog.close();
    if (!fromPopState && location.pathname.startsWith('/cars/')) history.replaceState({}, '', previousCarUrl || '/#cars');
    carDialogFromHistory = false;
  }

  function initCarInteractions() {
    $('#car-grid')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open-car]');
      if (button) openCarDetails(button.dataset.openCar);
    });
    $('#car-dialog .dialog-close')?.addEventListener('click', () => closeCarDetails());
    $('#car-dialog')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) closeCarDetails(); });
    $('#car-dialog')?.addEventListener('close', () => {
      if (location.pathname.startsWith('/cars/')) history.replaceState({}, '', previousCarUrl || '/#cars');
      carDialogFromHistory = false;
    });

    ['#car-search', '#filter-price', '#filter-year', '#filter-condition', '#filter-model'].forEach((selector) => $(selector)?.addEventListener(selector === '#car-search' ? 'input' : 'change', applyCarFilters));
    $('#filter-brand')?.addEventListener('change', () => { populateModels(); applyCarFilters(); });
    $('#filter-brand')?.addEventListener('input', () => { populateModels(); applyCarFilters(); });
    $('#filter-price')?.addEventListener('change', applyCarFilters);
    $('#filter-year')?.addEventListener('change', applyCarFilters);
    $('#filter-condition')?.addEventListener('change', applyCarFilters);
    $('#filter-model')?.addEventListener('change', applyCarFilters);
    $('#reset-filters')?.addEventListener('click', resetFilters);
    $('#empty-reset')?.addEventListener('click', resetFilters);
    $$('.category-tab').forEach((button) => button.addEventListener('click', () => {
      selectedCategory = button.dataset.category || '';
      $$('.category-tab').forEach((item) => item.classList.toggle('is-active', item === button));
      applyCarFilters();
    }));
  }

  function showContactStatus(message, isError = false) {
    const status = $('#contact-status');
    if (!status) return;
    status.textContent = message;
    status.classList.add('is-visible');
    status.classList.toggle('is-error', isError);
  }

  function initContactForm() {
    const form = $('#contact-form');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = $('#contact-status');
      status?.classList.remove('is-visible', 'is-error');
      const submit = $('.form-submit', form);
      if (!form.reportValidity()) return;
      const data = Object.fromEntries(new FormData(form).entries());
      if (submit) { submit.disabled = true; submit.querySelector('span:first-child').textContent = 'SENDING…'; }
      try {
        const result = await request('/api/contact', { method: 'POST', body: data });
        form.reset();
        showContactStatus(result.message || 'Thanks — your message has been sent to the owner inbox.');
      } catch (error) {
        showContactStatus(error.message || 'We could not send that message. Please call or WhatsApp us instead.', true);
      } finally {
        if (submit) { submit.disabled = false; submit.querySelector('span:first-child').textContent = 'SEND YOUR MESSAGE'; }
      }
    });
  }

  async function loadPublicData() {
    const data = await request('/api/public');
    publicCars = Array.isArray(data.cars) ? data.cars : [];
    publicSite = data.site || {};
    updatePublicSite();
    brandOptions();
    applyCarFilters();
  }

  /* Owner dashboard */
  const panelTitles = { overview: 'Overview', cars: 'Car inventory', inquiries: 'Your inbox', business: 'Business details', security: 'Security' };
  function setAdminView(view) {
    if (!panelTitles[view]) return;
    $$('.admin-nav-button').forEach((button) => button.classList.toggle('is-active', button.dataset.adminView === view));
    $$('.admin-panel-view').forEach((panel) => panel.classList.toggle('is-visible', panel.dataset.adminPanel === view));
    const title = $('#admin-page-title');
    if (title) title.innerHTML = `${escapeHtml(panelTitles[view])}<span>.</span>`;
    if (window.innerWidth < 641) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateAdminCounters() {
    if (!adminData) return;
    const visibleCars = adminData.cars.filter((car) => car.published).length;
    const unread = adminData.inquiries.filter((message) => !message.read).length;
    const cars = $('#overview-car-count');
    const inbox = $('#overview-inquiry-count');
    const sideCars = $('#admin-nav-car-count');
    const sideInbox = $('#admin-nav-inquiry-count');
    const badge = $('#inbox-count-badge');
    if (cars) cars.textContent = String(visibleCars).padStart(2, '0');
    if (inbox) inbox.textContent = String(unread).padStart(2, '0');
    if (sideCars) sideCars.textContent = String(adminData.cars.length);
    if (sideInbox) sideInbox.textContent = String(unread);
    if (badge) badge.textContent = `${String(unread).padStart(2, '0')} NEW`;
  }

  function renderAdminCars() {
    const container = $('#admin-car-list');
    if (!container || !adminData) return;
    if (!adminData.cars.length) {
      container.innerHTML = '<div class="inquiry-empty"><span>↗</span><h3>Your showroom is ready.</h3><p>Add your first car to start building your online inventory.</p></div>';
      return;
    }
    container.innerHTML = adminData.cars.map((car) => `<div class="admin-car-row"><span class="admin-car-primary"><img src="${escapeHtml(car.image || '/assets/img/alto.jpg')}" alt="" loading="lazy"><span><strong>${escapeHtml(car.year)} ${escapeHtml(car.brand)} ${escapeHtml(car.name)}</strong><small>${escapeHtml(car.category)} · ${escapeHtml(car.condition)}</small></span></span><span class="admin-car-row-price">${formatPrice(car.price)}</span><span class="visibility-tag ${car.published ? '' : 'is-hidden'}"><i></i>${car.published ? 'Published' : 'Hidden'}</span><span class="admin-row-actions"><button type="button" data-car-action="edit" data-id="${escapeHtml(car.id)}" aria-label="Edit ${escapeHtml(car.name)}" title="Edit car">✎</button><button class="delete-car" type="button" data-car-action="delete" data-id="${escapeHtml(car.id)}" aria-label="Delete ${escapeHtml(car.name)}" title="Delete car">×</button></span></div>`).join('');
  }

  function renderOverview() {
    if (!adminData) return;
    const recent = $('#overview-recent-cars');
    if (!recent) return;
    const sorted = adminData.cars.slice(0, 3);
    if (!sorted.length) {
      recent.innerHTML = '<div class="inquiry-empty"><span>↗</span><h3>Ready for your first listing.</h3><p>Use “Add a new car” to get started.</p></div>';
      return;
    }
    recent.innerHTML = sorted.map((car) => `<div class="recent-car-row"><img src="${escapeHtml(car.image || '/assets/img/alto.jpg')}" alt="" loading="lazy"><span><strong class="recent-car-title">${escapeHtml(car.year)} ${escapeHtml(car.brand)} ${escapeHtml(car.name)}</strong><small class="recent-car-subtitle">${escapeHtml(car.category)} · ${car.published ? 'Published' : 'Hidden'}</small></span><span class="recent-car-price">${formatPrice(car.price)}</span></div>`).join('');
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Just now';
    return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function renderInquiries() {
    const container = $('#admin-inquiry-list');
    if (!container || !adminData) return;
    if (!adminData.inquiries.length) {
      container.innerHTML = '<div class="inquiry-empty"><span>✉</span><h3>Your inbox is clear.</h3><p>New messages from your website visitors will appear here.</p></div>';
      return;
    }
    container.innerHTML = adminData.inquiries.map((item) => {
      const car = adminData.cars.find((entry) => entry.id === item.carId);
      const phone = phoneHref(item.phone);
      const wa = whatsappHref(item.phone, `Hello ${item.name}, thank you for contacting AL RAFAY CORPORATION. I’m following up on your message.`);
      return `<article class="inquiry-card ${item.read ? '' : 'is-unread'}"><div><div class="inquiry-head"><strong>${escapeHtml(item.name)}</strong><time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(formatDate(item.createdAt))}${item.read ? '' : ' · NEW'}</time></div><p>${escapeHtml(item.message)}</p><span class="inquiry-links"><a href="tel:${escapeHtml(phone)}">☎ ${escapeHtml(item.phone)}</a>${item.email ? `<a href="mailto:${escapeHtml(item.email)}">✉ ${escapeHtml(item.email)}</a>` : ''}${car ? `<span>Interested in ${escapeHtml(car.year)} ${escapeHtml(car.name)}</span>` : ''}</span></div><span class="inquiry-actions">${item.read ? '' : `<button type="button" data-inquiry-action="read" data-id="${escapeHtml(item.id)}">Mark read</button>`}<a class="inquiry-actions button" style="text-decoration:none" href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a><button type="button" data-inquiry-action="delete" data-id="${escapeHtml(item.id)}" aria-label="Delete message from ${escapeHtml(item.name)}">Delete</button></span></article>`;
    }).join('');
  }

  function renderAdminData() {
    updateAdminCounters();
    renderAdminCars();
    renderOverview();
    renderInquiries();
    const form = $('#site-settings-form');
    if (form && adminData.site) {
      for (const [key, value] of Object.entries(adminData.site)) {
        const input = form.elements.namedItem(key);
        if (input) input.value = value || '';
      }
    }
  }

  async function refreshAdminData() {
    adminData = await request('/api/admin/data');
    renderAdminData();
  }

  async function setAdminVisibility(showDashboard) {
    $('#admin-login-page')?.toggleAttribute('hidden', showDashboard);
    $('#admin-layout')?.toggleAttribute('hidden', !showDashboard);
    if (!showDashboard) { setStatus($('#login-status'), ''); return; }
    const today = $('#admin-today');
    if (today) today.textContent = `TODAY · ${new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()).toUpperCase()} · ISLAMABAD`;
    try { await refreshAdminData(); }
    catch (error) {
      if (error.status === 401) { csrfToken = ''; setAdminVisibility(false); return; }
      showToast(error.message, true);
    }
  }

  async function initAdminScreen() {
    $('#site-shell')?.setAttribute('hidden', '');
    const screen = $('#admin-screen');
    screen?.removeAttribute('hidden');
    document.title = 'Owner Dashboard | AL RAFAY CORPORATION';
    try {
      const state = await request('/api/admin/session');
      csrfToken = state.csrfToken || '';
      await setAdminVisibility(Boolean(state.authenticated));
    } catch {
      setAdminVisibility(false);
      setStatus($('#login-status'), 'Could not connect to the owner dashboard. Refresh the page and try again.', true);
    }

    $('#login-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const password = form.elements.namedItem('password').value;
      const submit = form.querySelector('button[type="submit"]');
      setStatus($('#login-status'), '');
      if (submit) { submit.disabled = true; submit.querySelector('span:first-child').textContent = 'CHECKING…'; }
      try {
        const result = await request('/api/admin/login', { method: 'POST', body: { password } });
        csrfToken = result.csrfToken || '';
        form.reset();
        setStatus($('#login-status'), '');
        await setAdminVisibility(true);
      } catch (error) {
        setStatus($('#login-status'), error.message, true);
        form.elements.namedItem('password').focus();
      } finally {
        if (submit) { submit.disabled = false; submit.querySelector('span:first-child').textContent = 'SIGN IN SECURELY'; }
      }
    });

    $('#password-toggle')?.addEventListener('click', (event) => {
      const input = $('#owner-password');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      event.currentTarget.textContent = show ? 'HIDE' : 'SHOW';
      event.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });

    const nav = $('#admin-nav');
    nav?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-admin-view]');
      if (button) setAdminView(button.dataset.adminView);
    });
    $$('.admin-main [data-admin-view]').forEach((button) => button.addEventListener('click', () => setAdminView(button.dataset.adminView)));
    $('#admin-quick-add')?.addEventListener('click', (event) => { event.preventDefault(); openCarForm(); });
    $('.admin-quick-add')?.addEventListener('click', (event) => { event.preventDefault(); openCarForm(); });
    $('#admin-add-car')?.addEventListener('click', () => openCarForm());
    $('#admin-logout')?.addEventListener('click', signOut);
    $('#admin-logout-mobile')?.addEventListener('click', signOut);
    $('#admin-car-list')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-car-action]');
      if (!button) return;
      const car = adminData?.cars.find((item) => item.id === button.dataset.id);
      if (!car) return;
      if (button.dataset.carAction === 'edit') openCarForm(car);
      if (button.dataset.carAction === 'delete') deleteCar(car);
    });
    $('#admin-inquiry-list')?.addEventListener('click', handleInquiryAction);
    $('#site-settings-form')?.addEventListener('submit', saveSiteSettings);
    $('#change-password-form')?.addEventListener('submit', changePassword);
    $('#admin-car-form')?.addEventListener('submit', saveCar);
    $('#cancel-car-form')?.addEventListener('click', closeCarForm);
    $('#car-form-dialog .admin-modal-close')?.addEventListener('click', closeCarForm);
    $('#car-form-dialog')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) closeCarForm(); });
    $('#admin-car-form input[name="imageFile"]')?.addEventListener('change', (event) => {
      const file = event.currentTarget.files?.[0];
      $('#current-image-name').textContent = file ? `${file.name} · ${formatCount(file.size)} bytes` : 'No photo chosen yet';
    });
  }

  async function signOut() {
    try { await request('/api/admin/logout', { method: 'POST', body: {} }); } catch { /* Expired sessions can simply be cleared locally. */ }
    csrfToken = '';
    adminData = null;
    $('#admin-layout')?.setAttribute('hidden', '');
    $('#admin-login-page')?.removeAttribute('hidden');
    setStatus($('#login-status'), 'You have been signed out.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveSiteSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    if (!form.reportValidity()) return;
    const fields = ['tagline', 'city', 'heroDescription', 'about', 'ownerName', 'ownerPhone', 'secondOwnerName', 'secondOwnerPhone', 'location'];
    const data = Object.fromEntries(fields.map((key) => [key, form.elements.namedItem(key).value.trim()]));
    if (button) button.disabled = true;
    try {
      const result = await request('/api/admin/site', { method: 'PUT', body: data });
      adminData.site = result.site;
      publicSite = result.site;
      updatePublicSite();
      showToast('Business details saved. Your public website is up to date.');
      setStatus($('#dashboard-status'), 'Business details saved.');
    } catch (error) { showToast(error.message, true); }
    finally { if (button) button.disabled = false; }
  }

  function openCarForm(car = null) {
    const dialog = $('#car-form-dialog');
    const form = $('#admin-car-form');
    if (!dialog || !form) return;
    form.reset();
    form.elements.namedItem('id').value = car?.id || '';
    form.elements.namedItem('name').value = car?.name || '';
    form.elements.namedItem('brand').value = car?.brand || '';
    form.elements.namedItem('model').value = car?.model || '';
    form.elements.namedItem('year').value = car?.year || '';
    form.elements.namedItem('price').value = car?.price ?? '';
    form.elements.namedItem('mileage').value = car?.mileage ?? '';
    form.elements.namedItem('fuel').value = car?.fuel || 'Petrol';
    form.elements.namedItem('transmission').value = car?.transmission || 'Manual';
    form.elements.namedItem('engine').value = car?.engine || '';
    form.elements.namedItem('condition').value = car?.condition || '';
    form.elements.namedItem('category').value = car?.category || 'Hatchback';
    form.elements.namedItem('description').value = car?.description || '';
    form.elements.namedItem('published').checked = car?.published !== false;
    form.elements.namedItem('featured').checked = car?.featured === true;
    form.dataset.currentImage = car?.image || '';
    $('#current-image-name').textContent = car?.image ? `Current photo · ${car.image.split('/').pop()}` : 'No photo chosen yet';
    $('#car-form-heading').innerHTML = `${car ? 'Edit car' : 'Add a car'}<span>.</span>`;
    $('#car-form-submit-label').textContent = car ? 'SAVE CHANGES' : 'SAVE CAR';
    setStatus($('#car-form-status'), '');
    if (!dialog.open) dialog.showModal();
  }

  function closeCarForm() {
    const dialog = $('#car-form-dialog');
    if (dialog?.open) dialog.close();
    setStatus($('#car-form-status'), '');
  }

  async function fileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the selected photo.'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  async function saveCar(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const fields = ['name', 'brand', 'model', 'year', 'price', 'mileage', 'fuel', 'transmission', 'engine', 'condition', 'category', 'description'];
    const data = Object.fromEntries(fields.map((key) => [key, form.elements.namedItem(key).value.trim()]));
    data.year = Number(data.year); data.price = Number(data.price); data.mileage = Number(data.mileage);
    data.published = form.elements.namedItem('published').checked;
    data.featured = form.elements.namedItem('featured').checked;
    const id = form.elements.namedItem('id').value;
    const file = form.elements.namedItem('imageFile').files?.[0];
    const status = $('#car-form-status');
    const button = form.querySelector('button[type="submit"]');
    setStatus(status, '');
    if (button) { button.disabled = true; $('#car-form-submit-label').textContent = file ? 'UPLOADING PHOTO…' : 'SAVING…'; }
    try {
      data.image = form.dataset.currentImage || '/assets/img/alto.jpg';
      if (file) {
        if (file.size > 5 * 1024 * 1024) throw new Error('Choose a photo smaller than 5 MB.');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo.');
        const upload = await request('/api/admin/upload', { method: 'POST', body: { dataUrl: await fileAsDataUrl(file) } });
        data.image = upload.image;
      }
      const saved = await request(id ? `/api/admin/cars/${encodeURIComponent(id)}` : '/api/admin/cars', { method: id ? 'PUT' : 'POST', body: data });
      if (!adminData) adminData = { cars: [], inquiries: [], site: {} };
      if (id) adminData.cars = adminData.cars.map((car) => car.id === id ? saved.car : car);
      else adminData.cars.unshift(saved.car);
      renderAdminData();
      closeCarForm();
      setAdminView('cars');
      showToast(id ? 'Car updated. Changes are now live.' : 'Car added. It is now in your website inventory.');
    } catch (error) { setStatus(status, error.message, true); }
    finally { if (button) { button.disabled = false; $('#car-form-submit-label').textContent = id ? 'SAVE CHANGES' : 'SAVE CAR'; } }
  }

  async function deleteCar(car) {
    if (!window.confirm(`Delete the ${car.year} ${car.brand} ${car.name} listing? This cannot be undone.`)) return;
    try {
      await request(`/api/admin/cars/${encodeURIComponent(car.id)}`, { method: 'DELETE' });
      adminData.cars = adminData.cars.filter((item) => item.id !== car.id);
      renderAdminData();
      showToast('Car listing deleted from the website.');
    } catch (error) { showToast(error.message, true); }
  }

  async function handleInquiryAction(event) {
    const button = event.target.closest('[data-inquiry-action]');
    if (!button) return;
    const id = button.dataset.id;
    try {
      if (button.dataset.inquiryAction === 'read') await request(`/api/admin/inquiries/${encodeURIComponent(id)}`, { method: 'PATCH', body: {} });
      else if (button.dataset.inquiryAction === 'delete') {
        if (!window.confirm('Delete this visitor message?')) return;
        await request(`/api/admin/inquiries/${encodeURIComponent(id)}`, { method: 'DELETE' });
      }
      await refreshAdminData();
      showToast(button.dataset.inquiryAction === 'read' ? 'Message marked as read.' : 'Message deleted.');
    } catch (error) { showToast(error.message, true); }
  }

  async function changePassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const currentPassword = form.elements.namedItem('currentPassword').value;
    const newPassword = form.elements.namedItem('newPassword').value;
    const confirmation = form.elements.namedItem('confirmPassword').value;
    if (newPassword.length < 12) { setStatus($('#password-status'), 'Choose a password with at least 12 characters.', true); return; }
    if (newPassword !== confirmation) { setStatus($('#password-status'), 'Your new passwords do not match.', true); return; }
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const result = await request('/api/admin/password', { method: 'POST', body: { currentPassword, newPassword } });
      csrfToken = result.csrfToken || '';
      form.reset();
      setStatus($('#password-status'), 'Your password has been changed. This device remains signed in.');
      showToast('Owner password updated.');
    } catch (error) { setStatus($('#password-status'), error.message, true); }
    finally { if (button) button.disabled = false; }
  }

  function startAdmin() {
    initAdminScreen();
  }

  function startPublic() {
    document.title = 'AL RAFAY CORPORATION — Premium Cars. Trusted Deals.';
    initMotion();
    initCarInteractions();
    initContactForm();
    $('#copyright-year').textContent = String(new Date().getFullYear());
    loadPublicData().catch((error) => {
      showToast(`Could not load the car listings. ${error.message}`, true);
      const grid = $('#car-grid');
      if (grid) grid.innerHTML = '<div class="inquiry-empty"><span>↗</span><h3>We’re getting the showroom ready.</h3><p>Please refresh in a moment or call the dealership.</p></div>';
    }).then(() => {
      const match = location.pathname.match(/^\/cars\/([a-zA-Z0-9-]+)\/?$/);
      const queryId = new URLSearchParams(location.search).get('car');
      const id = match?.[1] || queryId;
      if (id) openCarDetails(id, { pushRoute: false });
    });
    window.addEventListener('popstate', () => {
      const match = location.pathname.match(/^\/cars\/([a-zA-Z0-9-]+)\/?$/);
      const dialog = $('#car-dialog');
      if (match) openCarDetails(decodeURIComponent(match[1]), { pushRoute: false });
      else if (dialog?.open) closeCarDetails({ fromPopState: true });
    });
  }

  if (/^\/admin\/?$/.test(location.pathname)) startAdmin();
  else startPublic();
})();
