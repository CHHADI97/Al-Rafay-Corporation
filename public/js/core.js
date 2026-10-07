/**
 * Shared browser runtime: state, API access, language handling, header,
 * scroll animations, toasts and small utilities used by every page.
 */
import { dictionaries, translate } from './i18n.js';
import { escapeHtml, icons, whatsappHref, telHref } from './templates.js';

const LANG_KEY = 'arf-lang';

export const state = {
  lang: 'en',
  config: null,
  site: null,
  settings: {},
  owners: [],
  stats: [],
  whyUs: [],
  faqs: [],
  brands: [],
  cars: [],
};

/* ------------------------------------------------------------- events ---- */
const listeners = new Map();
export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}
export function emit(event, detail) {
  for (const handler of listeners.get(event) || []) {
    try { handler(detail); } catch (error) { console.error(error); }
  }
}

/* --------------------------------------------------------------- api ----- */
async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    let payload = null;
    try { payload = await response.json(); } catch { /* not json */ }
    const error = new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  get: (url) => request(url),
  post: (url, body, options = {}) => request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body ?? {}),
    ...options,
  }),
  put: (url, body, options = {}) => request(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body ?? {}),
    ...options,
  }),
  patch: (url, body, options = {}) => request(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body ?? {}),
    ...options,
  }),
  del: (url, options = {}) => request(url, { method: 'DELETE', ...options }),
};

/* ------------------------------------------------------------- language -- */
export function t(key, vars) {
  return translate(state.lang, key, vars);
}

export function detectLanguage() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (fromUrl === 'ur' || fromUrl === 'en') return fromUrl;
  const stored = localStorage.getItem(LANG_KEY);
  if (stored === 'ur' || stored === 'en') return stored;
  return 'en';
}

export function setLanguage(lang, { persist = true } = {}) {
  state.lang = lang === 'ur' ? 'ur' : 'en';
  if (persist) localStorage.setItem(LANG_KEY, state.lang);
  const dictionary = dictionaries[state.lang];
  document.documentElement.lang = state.lang;
  document.documentElement.dir = dictionary.dir;
  document.documentElement.dataset.lang = state.lang;
  applyTranslations();
  const toggle = document.querySelector('[data-lang-toggle]');
  if (toggle) {
    toggle.setAttribute('aria-label', dictionary.switchAria);
    const label = toggle.querySelector('[data-lang-label]');
    if (label) label.textContent = dictionary.switchLabel;
  }
  emit('lang', state.lang);
}

/** Fills every [data-i18n] / [data-site] node with the active language. */
export function applyTranslations(root = document) {
  for (const node of root.querySelectorAll('[data-i18n], [data-i18n-attr]')) {
    const target = node.dataset.i18nAttr;
    if (target) {
      for (const attribute of target.split(',')) {
        const [name, key = node.dataset.i18n] = attribute.split(':');
        if (!name) continue;
        node.setAttribute(name.trim(), key ? t(key.trim()) : '');
      }
    }
    if (node.dataset.i18n) node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll('[data-site]')) {
    node.textContent = siteValue(node.dataset.site);
  }
  for (const node of root.querySelectorAll('[data-site-attr]')) {
    for (const rule of node.dataset.siteAttr.split(',')) {
      const [name, key] = rule.split(':');
      if (!name || !key) continue;
      const value = siteValue(key.trim());
      if (name.trim() === 'href' && key.trim().startsWith('phone')) node.setAttribute('href', telHref(value));
      else if (name.trim() === 'href' && key.trim().startsWith('whatsapp')) node.setAttribute('href', whatsappHref(value));
      else node.setAttribute(name.trim(), value);
    }
  }
  for (const node of root.querySelectorAll('[data-whatsapp-link]')) {
    const number = node.dataset.whatsappLink || siteValue('whatsapp1');
    const message = node.dataset.whatsappText || '';
    node.setAttribute('href', whatsappHref(number, message));
  }
}

/** Resolves a settings key such as `businessName`, `address`, `phone1`, `whatsapp2`. */
export function siteValue(key) {
  if (!key) return '';
  const settings = state.settings || {};
  const owners = state.owners || [];
  const ownerMatch = key.match(/^(phone|whatsapp)(\d)$/);
  if (ownerMatch) {
    const owner = owners[Number(ownerMatch[2]) - 1];
    if (!owner) return '';
    return ownerMatch[1] === 'phone' ? owner.phone : (owner.whatsapp || owner.phone);
  }
  if (key === 'ownerNames') {
    return owners.filter((owner) => owner.showOnSite !== false)
      .map((owner) => (state.lang === 'ur' && owner.nameUr ? owner.nameUr : owner.nameEn))
      .join(' · ');
  }
  if (key in settings) return settings[key];
  const suffix = state.lang === 'ur' ? 'Ur' : 'En';
  if (`${key}${suffix}` in settings) return settings[`${key}${suffix}`];
  const other = state.lang === 'ur' ? 'En' : 'Ur';
  if (`${key}${other}` in settings) return settings[`${key}${other}`];
  return '';
}

/* ----------------------------------------------------------- UI helpers -- */
export function toast(message, { type = 'info', duration = 3200 } = {}) {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.append(stack);
  }
  const node = document.createElement('div');
  node.className = `toast${type === 'error' ? ' toast--error' : ''}`;
  node.textContent = message;
  stack.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .3s ease, transform .3s ease';
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    setTimeout(() => node.remove(), 320);
  }, duration);
}

export async function copyLink(url, message) {
  try {
    await navigator.clipboard.writeText(url);
    toast(message || t('common.copied'));
  } catch {
    toast(url);
  }
}

export function sharePage() {
  const data = { title: document.title, url: location.href };
  if (navigator.share) {
    navigator.share(data).catch(() => {});
  } else {
    copyLink(location.href, t('common.copied'));
  }
}

/* --------------------------------------------------------------- chrome -- */
function initHeader() {
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('[data-menu-toggle]');
  const nav = document.getElementById('primary-nav');
  const scrim = document.querySelector('[data-nav-scrim]');

  if (toggle && nav) {
    const close = () => {
      nav.classList.remove('is-open');
      scrim?.classList.remove('is-visible');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('no-scroll');
    };
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      scrim?.classList.toggle('is-visible', open);
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('no-scroll', open);
    });
    scrim?.addEventListener('click', close);
    nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
  }

  if (header) {
    const onScroll = () => header.classList.toggle('is-stuck', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  const toTop = document.querySelector('[data-to-top]');
  if (toTop) {
    toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.addEventListener('scroll', () => {
      toTop.classList.toggle('is-visible', window.scrollY > 520);
    }, { passive: true });
  }

  const langToggle = document.querySelector('[data-lang-toggle]');
  langToggle?.addEventListener('click', () => {
    setLanguage(state.lang === 'ur' ? 'en' : 'ur');
  });

  const path = location.pathname.replace(/\/+$/, '') || '/';
  for (const link of document.querySelectorAll('.nav__link, .footer-links a')) {
    const href = link.getAttribute('href') || '';
    const target = href.split('#')[0].split('?')[0].replace(/\/+$/, '') || '/';
    if (target === path && target !== '/') link.classList.add('is-active');
    else if (target === '/' && path === '/') link.classList.add('is-active');
  }

  for (const node of document.querySelectorAll('[data-year]')) {
    node.textContent = String(new Date().getFullYear());
  }

  const share = document.querySelector('[data-share]');
  share?.addEventListener('click', (event) => {
    event.preventDefault();
    sharePage();
  });

  document.querySelectorAll('[data-print]').forEach((button) => {
    button.addEventListener('click', () => window.print());
  });
}

/* ------------------------------------------------------------- reveals --- */
let revealObserver = null;
export function observeReveals(root = document) {
  const nodes = root.querySelectorAll('.reveal:not(.is-visible)');
  if (!nodes.length) return;
  if (!('IntersectionObserver' in window)) {
    nodes.forEach((node) => node.classList.add('is-visible'));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  }
  nodes.forEach((node) => revealObserver.observe(node));
}

export function initCounters(root = document) {
  const nodes = root.querySelectorAll('[data-count]:not([data-counted])');
  if (!nodes.length) return;
  const run = (node) => {
    node.dataset.counted = 'true';
    const target = Number(node.dataset.count) || 0;
    const suffix = node.dataset.suffix || '';
    const duration = 1500;
    const started = performance.now();
    const step = (now) => {
      const progress = Math.min((now - started) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(target * eased);
      node.textContent = `${new Intl.NumberFormat('en-PK').format(value)}${suffix}`;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if (!('IntersectionObserver' in window)) {
    nodes.forEach(run);
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      run(entry.target);
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.4 });
  nodes.forEach((node) => observer.observe(node));
}

export function initParallax() {
  const nodes = document.querySelectorAll('[data-parallax]');
  if (!nodes.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let frame = 0;
  const update = () => {
    frame = 0;
    const scrollY = window.scrollY;
    for (const node of nodes) {
      const speed = Number(node.dataset.parallax) || 0.12;
      node.style.transform = `translate3d(0, ${(-scrollY * speed).toFixed(2)}px, 0)`;
    }
  };
  window.addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(update);
  }, { passive: true });
  update();
}

/* ------------------------------------------------------------- accordion -- */
export function initAccordions(root = document) {
  for (const trigger of root.querySelectorAll('.accordion__trigger')) {
    if (trigger.dataset.bound) continue;
    trigger.dataset.bound = 'true';
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.accordion__item');
      const panel = item.querySelector('.accordion__panel');
      const open = item.classList.toggle('is-open');
      trigger.setAttribute('aria-expanded', String(open));
      panel.style.maxHeight = open ? `${panel.scrollHeight}px` : '0px';
      for (const other of item.parentElement.querySelectorAll('.accordion__item.is-open')) {
        if (other === item) continue;
        other.classList.remove('is-open');
        other.querySelector('.accordion__trigger').setAttribute('aria-expanded', 'false');
        other.querySelector('.accordion__panel').style.maxHeight = '0px';
      }
    });
  }
}

/* -------------------------------------------------------------- enquire --- */
export function initEnquiryButtons(root = document) {
  for (const button of root.querySelectorAll('.js-enquire')) {
    if (button.dataset.bound) continue;
    button.dataset.bound = 'true';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const title = button.dataset.title || '';
      const slug = button.dataset.slug || '';
      const number = button.dataset.number || siteValue('whatsapp1');
      const link = slug ? `${location.origin}/cars/${slug}` : location.href;
      const message = `${t('car.enquiryDefault', { car: title })}\n${link}`;
      window.open(whatsappHref(number, message), '_blank', 'noopener');
    });
  }
}

/* ------------------------------------------------------- contact form ----- */
export function initContactForm() {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;
  const alertBox = form.querySelector('[data-form-alert]');
  const submit = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.company) return; // honeypot
    if (submit) { submit.disabled = true; submit.textContent = t('contact.sending'); }
    alertBox?.classList.remove('is-visible');
    try {
      await api.post('/api/messages', data);
      form.reset();
      if (alertBox) {
        alertBox.textContent = t('contact.sent');
        alertBox.className = 'form-alert form-alert--ok is-visible';
      }
      toast(t('contact.sent'));
    } catch (error) {
      const message = error.payload?.fields ? `${t('contact.error')} (${error.payload.fields.join(', ')})` : t('contact.error');
      if (alertBox) {
        alertBox.textContent = message;
        alertBox.className = 'form-alert form-alert--error is-visible';
      }
      toast(message, { type: 'error' });
    } finally {
      if (submit) { submit.disabled = false; submit.textContent = t('contact.send'); }
    }
  });
}

/* ----------------------------------------------------------------- boot --- */
export async function boot() {
  setLanguage(detectLanguage(), { persist: false });
  const [config, site] = await Promise.all([
    api.get('/api/config').catch(() => null),
    api.get('/api/site').catch(() => null),
  ]);
  state.config = config;
  state.site = site;
  if (site) {
    state.settings = site.settings || {};
    state.owners = (site.owners || []).filter((owner) => owner.showOnSite !== false);
    state.stats = site.stats || [];
    state.whyUs = site.whyUs || [];
    state.faqs = site.faqs || [];
    state.brands = site.brands || [];
  }
  applyTranslations();
  initHeader();
  initContactForm();
  initEnquiryButtons();
  observeReveals();
  initParallax();
  emit('ready', state);
  return state;
}

/** Renders the `<!--SEO-->`-time static sections' dynamic counterparts. */
export function fillFooterExtras() {
  const credits = document.querySelector('[data-credits]');
  if (credits) {
    credits.innerHTML = `${icons.sparkle}<span>${escapeHtml(state.lang === 'ur' ? (state.settings.creditsUr || 'ویب سائٹ ڈیزائن: عبدالہادی') : (state.settings.creditsEn || 'Website designed by Abdul Hadi'))}</span>`;
  }
  const social = document.querySelector('[data-social]');
  if (social) {
    const links = [
      ['facebook', state.settings.facebookUrl, 'Facebook'],
      ['instagram', state.settings.instagramUrl, 'Instagram'],
      ['youtube', state.settings.youtubeUrl, 'YouTube'],
    ].filter(([, url]) => url);
    social.innerHTML = links.map(([icon, url, label]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" aria-label="${label}">${icons[icon]}</a>`).join('');
    social.closest('.social-row')?.classList.toggle('is-empty', !links.length);
  }
}

export function whatsappToken(number) {
  return String(number || '').replace(/\D/g, '').replace(/^0+/, '');
}

/** Re-runs every animation/enhancement helper after markup changed. */
export function afterRender(root = document) {
  observeReveals(root);
  initCounters(root);
  initAccordions(root);
  initEnquiryButtons(root);
  applyTranslations(root);
  fillFooterExtras();
}
