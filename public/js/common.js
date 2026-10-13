/* Shared behaviour for the Appetizer Fast Foods public pages. No inline scripts; loaded with defer. */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const digitsOnly = (value = '') => String(value).replace(/\D/g, '');
  // Converts a Pakistani number such as 0301 5136842 into 923015136842 for tel: and wa.me links.
  const internationalDigits = (value = '') => {
    let number = digitsOnly(value);
    if (number.startsWith('00')) number = number.slice(2);
    if (number.startsWith('0')) number = `92${number.slice(1)}`;
    else if (number && !number.startsWith('92')) number = `92${number}`;
    return number;
  };
  const telHref = (phone = '') => {
    const number = internationalDigits(phone);
    return number ? `tel:+${number}` : '#contact';
  };
  const whatsappHref = (phone = '', message = '') => {
    const number = internationalDigits(phone);
    if (!number) return '#contact';
    return message ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : `https://wa.me/${number}`;
  };
  const mapsHref = (query = 'Appetizer Fast Foods Nilore Islamabad Lehtrar Road') => {
    const url = new URL('https://www.google.com/maps/search/');
    url.searchParams.set('api', '1');
    url.searchParams.set('query', query);
    return url.toString();
  };
  const mapsEmbedSrc = (query = 'Appetizer Fast Foods Nilore Islamabad Lehtrar Road') => `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  const formatPrice = (amount) => `Rs ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(Number(amount) || 0)}`;

  const DEFAULT_RESTAURANT = {
    name: 'Appetizer Fast Foods',
    tagline: 'Fresh Bites. Great Taste. Refresh Your Day!',
    contactPerson: 'Naveed Ahmad',
    phone: '+92 301 5136842',
    whatsapp: '+92 301 5136842',
    location: 'Nilore, Islamabad, Lehtrar Road, Pakistan',
    mapsQuery: 'Appetizer Fast Foods Nilore Islamabad Lehtrar Road',
    delivery: { available: true, charge: null, minimumOrder: null, areas: '', estimatedTime: '', note: '' },
  };
  const state = { restaurant: { ...DEFAULT_RESTAURANT }, categories: [], items: [], loaded: false };

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
    let payload = {};
    if ((response.headers.get('content-type') || '').includes('application/json')) {
      try { payload = await response.json(); } catch { payload = {}; }
    }
    if (!response.ok) throw Object.assign(new Error(payload.error || 'Something went wrong. Please try again.'), { status: response.status });
    return payload;
  }

  let dataPromise = null;
  function loadPublicData() {
    if (!dataPromise) dataPromise = fetchPublicData();
    return dataPromise;
  }

  async function fetchPublicData() {
    try {
      const data = await request('/api/public');
      state.restaurant = { ...DEFAULT_RESTAURANT, ...data.restaurant, delivery: { ...DEFAULT_RESTAURANT.delivery, ...(data.restaurant?.delivery || {}) } };
      state.categories = Array.isArray(data.categories) ? data.categories : [];
      state.items = Array.isArray(data.items) ? data.items : [];
      state.loaded = true;
    } catch {
      // Keep the built-in defaults so the pages still work if the API is briefly unavailable.
      state.loaded = false;
    }
    bindRestaurantDetails();
    document.dispatchEvent(new CustomEvent('aff:data', { detail: state }));
    return state;
  }

  function bindRestaurantDetails() {
    const r = state.restaurant;
    $$('[data-bind]').forEach((element) => {
      const key = element.dataset.bind;
      if (key === 'delivery-status') {
        element.textContent = r.delivery?.available === false ? 'Currently not offering home delivery. Please call to confirm.' : 'Home Delivery Available';
        return;
      }
      if (key in r && typeof r[key] === 'string') element.textContent = r[key];
    });
    $$('[data-href]').forEach((element) => {
      const kind = element.dataset.href;
      if (kind === 'tel') element.setAttribute('href', telHref(r.phone));
      if (kind === 'whatsapp') element.setAttribute('href', whatsappHref(r.whatsapp));
      if (kind === 'maps') element.setAttribute('href', mapsHref(r.mapsQuery));
    });
  }

  // ---------- Order basket (shared between the menu and the order form) ----------
  const BASKET_KEY = 'aff-order-basket-v1';
  const MAX_QTY = 20;
  let memoryBasket = [];
  let storageAvailable = true;
  const basketListeners = new Set();
  function readBasket() {
    try {
      const raw = window.localStorage.getItem(BASKET_KEY);
      const parsed = raw ? JSON.parse(raw) : memoryBasket;
      return Array.isArray(parsed) ? parsed.filter((line) => line && typeof line.id === 'string').map((line) => ({ id: line.id, name: String(line.name || ''), qty: clampQty(line.qty) })) : [];
    } catch {
      storageAvailable = false;
      return memoryBasket.map((line) => ({ ...line }));
    }
  }
  function writeBasket(lines) {
    memoryBasket = lines.map((line) => ({ ...line }));
    try { window.localStorage.setItem(BASKET_KEY, JSON.stringify(lines)); } catch { storageAvailable = false; }
    basketListeners.forEach((listener) => listener(lines));
    document.dispatchEvent(new CustomEvent('aff:basket', { detail: lines }));
  }
  function clampQty(value) {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return 1;
    return Math.min(MAX_QTY, Math.max(1, number));
  }
  const basket = {
    read: readBasket,
    add(item, qty = 1) {
      const lines = readBasket();
      const existing = lines.find((line) => line.id === item.id);
      if (existing) existing.qty = clampQty(existing.qty + qty);
      else lines.push({ id: item.id, name: item.name, qty: clampQty(qty) });
      writeBasket(lines);
      return lines;
    },
    setQty(id, qty) {
      const lines = readBasket().map((line) => (line.id === id ? { ...line, qty: clampQty(qty) } : line));
      writeBasket(lines);
      return lines;
    },
    remove(id) {
      const lines = readBasket().filter((line) => line.id !== id);
      writeBasket(lines);
      return lines;
    },
    clear() { writeBasket([]); },
    count() { return readBasket().reduce((sum, line) => sum + line.qty, 0); },
    onChange(listener) { basketListeners.add(listener); return () => basketListeners.delete(listener); },
  };
  window.addEventListener('storage', (event) => {
    if (event.key === BASKET_KEY) document.dispatchEvent(new CustomEvent('aff:basket', { detail: readBasket() }));
  });

  // ---------- UI helpers ----------
  let toastTimer = 0;
  function showToast(message, isError = false) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('is-error', isError);
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3600);
  }

  function initHeader() {
    const header = $('#site-header');
    const toggle = $('#menu-toggle');
    const nav = $('#primary-nav');
    const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    if (!toggle || !nav) return;
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
      nav.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      setOpen(open);
      if (open) nav.querySelector('a')?.focus();
    });
    nav.addEventListener('click', (event) => { if (event.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 961px)').addEventListener('change', (event) => { if (event.matches) setOpen(false); });
  }

  function initReveal() {
    const items = $$('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach((item) => item.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach((item) => observer.observe(item));
  }

  window.AFF = {
    $, $$, escapeHtml, digitsOnly, internationalDigits, telHref, whatsappHref, mapsHref, mapsEmbedSrc, formatPrice,
    state, request, loadPublicData, bindRestaurantDetails, basket, showToast, MAX_QTY, storageAvailable: () => storageAvailable,
  };

  document.addEventListener('DOMContentLoaded', () => {
    initHeader();
    initReveal();
    bindRestaurantDetails();
    loadPublicData();
  });
})();
