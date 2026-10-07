/** Home page rendering: hero fleet, featured stock, brands, sections. */
import { api, siteValue, state, t } from './core.js';
import {
  brandTileHtml, carCardHtml, escapeHtml, faqHtml, fleetCardHtml, icons, ownerCardHtml,
  skeletonCards, statHtml, whatsappHref, whyCardHtml,
} from './templates.js';

const $ = (selector, root = document) => root.querySelector(selector);

function renderHero() {
  const title = $('[data-hero-title]');
  const subtitle = $('[data-hero-subtitle]');
  const badge = $('[data-hero-badge]');
  if (title) title.textContent = siteValue('heroTitle') || t('brand.tagline');
  if (subtitle) subtitle.textContent = siteValue('heroSubtitle');
  if (badge) badge.innerHTML = `${icons.location}<span>${escapeHtml(siteValue('addressShort') || siteValue('city'))}</span>`;
}

function marqueeRow(cars, { rowClass }) {
  const items = cars.map((car) => fleetCardHtml(car, state.lang)).join('');
  return `<div class="fleet__row ${rowClass}">${items}${items}</div>`;
}

function renderFleet(cars) {
  const fleet = $('#hero-fleet');
  if (!fleet) return;
  const pool = cars.filter((car) => car.images?.length);
  if (pool.length < 3) { fleet.hidden = true; return; }
  const half = Math.ceil(pool.length / 2);
  const rowA = pool.slice(0, half);
  const rowB = pool.slice(half).concat(pool.slice(0, Math.max(0, 4 - (pool.length - half))));
  fleet.innerHTML = marqueeRow(rowA, { rowClass: 'fleet__row--forward' })
    + marqueeRow(rowB.length ? rowB : rowA, { rowClass: 'fleet__row--reverse' });
  if (!fleet.dataset.bound) {
    fleet.dataset.bound = 'true';
    fleet.addEventListener('pointerenter', (event) => {
      if (event.target.closest('.fleet-card')) fleet.classList.add('is-paused');
    });
    fleet.addEventListener('pointerleave', () => fleet.classList.remove('is-paused'));
  }
}

function renderHeroMeta(cars) {
  const host = $('[data-hero-meta]');
  if (!host) return;
  const available = cars.filter((car) => car.status === 'available').length;
  const featured = cars.filter((car) => car.featured).length;
  host.innerHTML = `
    <span class="hero__meta-item">${icons.car}<span><strong class="num">${available}</strong> ${escapeHtml(t('home.carsInStock'))}</span></span>
    <span class="hero__meta-item">${icons.star}<span><strong class="num">${featured}</strong> ${escapeHtml(t('common.featured'))}</span></span>
    <span class="hero__meta-item">${icons.location}<span>${escapeHtml(siteValue('city'))}</span></span>`;
}

function renderFeatured(cars) {
  const grid = $('#featured-grid');
  if (!grid) return;
  const featured = cars.filter((car) => car.featured && car.status === 'available').slice(0, 8);
  const list = featured.length >= 3 ? featured : cars.filter((car) => car.status === 'available').slice(0, 8);
  grid.innerHTML = list.length
    ? list.map((car) => carCardHtml(car, state.lang)).join('')
    : `<p class="section__lead">${escapeHtml(t('common.noResults'))}</p>`;
}

async function renderBrands() {
  const grid = $('#brand-grid');
  if (!grid) return;
  const brands = await api.get('/api/brands').catch(() => []);
  const withStock = brands.filter((brand) => brand.count > 0).slice(0, 12);
  grid.innerHTML = (withStock.length ? withStock : brands.slice(0, 12)).map((brand) => brandTileHtml(brand, state.lang)).join('');
}

function renderWhy() {
  const grid = $('#why-grid');
  if (grid) grid.innerHTML = state.whyUs.map((item) => whyCardHtml(item, state.lang)).join('');
}

function renderStats() {
  const grid = $('#stats-grid');
  if (grid) grid.innerHTML = state.stats.map((stat) => statHtml(stat, state.lang)).join('');
}

function renderAbout() {
  const text = $('[data-about-text]');
  if (text) text.textContent = siteValue('about');
  const list = $('[data-about-list]');
  if (list) {
    list.innerHTML = state.whyUs.slice(0, 4).map((item) => {
      const label = state.lang === 'ur' && item.titleUr ? item.titleUr : item.titleEn;
      return `<li>${icons.check}<span>${escapeHtml(label)}</span></li>`;
    }).join('');
  }
}

function renderOwners() {
  const grid = $('#owners-grid');
  if (!grid) return;
  grid.innerHTML = state.owners.map((owner) => ownerCardHtml(owner, state.lang)).join('');
}

function renderFaq() {
  const host = $('#faq-list');
  if (host) host.innerHTML = state.faqs.map((item) => faqHtml(item, state.lang)).join('');
}

function renderMap() {
  const host = $('#map-container');
  if (!host) return;
  const embed = siteValue('mapEmbedUrl');
  const link = siteValue('mapLink') || embed;
  const mode = state.settings.mapEmbedType || 'src';
  let src = embed;
  if (mode === 'html' && embed) {
    const match = embed.match(/src=["']([^"']+)["']/i);
    src = match ? match[1] : '';
  }
  const valid = /^https?:\/\//i.test(src);
  host.innerHTML = valid
    ? `<iframe src="${escapeHtml(src)}" title="${escapeHtml(t('contact.mapLabel'))}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`
    : `<div class="map-placeholder">${icons.location}<p>${escapeHtml(siteValue('address'))}</p></div>`;
  const directions = $('[data-map-link]');
  if (directions && link) directions.setAttribute('href', link);
}

function renderCta() {
  const sell = $('[data-sell-link]');
  if (sell) {
    sell.setAttribute('href', whatsappHref(siteValue('whatsapp1'), state.lang === 'ur'
      ? 'السلام علیکم، میں اپنی گاڑی بیچنا/ایکسچینج کرنا چاہتا ہوں۔'
      : 'Hello, I would like to sell or exchange my car.'));
  }
}

export async function render() {
  renderHero();
  renderWhy();
  renderStats();
  renderAbout();
  renderOwners();
  renderFaq();
  renderMap();
  renderCta();

  const grid = $('#featured-grid');
  if (grid && !state.cars.length) grid.innerHTML = skeletonCards(6);

  if (!state.cars.length) {
    const payload = await api.get('/api/cars').catch(() => ({ cars: [] }));
    state.cars = payload.cars || [];
  }
  renderFleet(state.cars);
  renderHeroMeta(state.cars);
  renderFeatured(state.cars);
  await renderBrands();
  if (document.querySelector('#featured-grid .car-card')) {
    // keep the page snappy: cards below the fold reveal on scroll
  }
}

export function refresh() {
  render().catch((error) => console.error(error));
}
