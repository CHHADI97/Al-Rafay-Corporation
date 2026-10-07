/** Car detail page: gallery, lightbox, specifications and contact actions. */
import { api, observeReveals, siteValue, state, t } from './core.js';
import {
  carCardHtml, carSpecsHtml, carTitle, escapeHtml, formatMileage, formatNumber, formatPrice,
  icons, mainImage, priceChip, prettyPhone,
  telHref, thumbImage, whatsappHref,
} from './templates.js';

const $ = (selector, root = document) => root.querySelector(selector);
let car = null;
let similar = [];
let index = 0;

function slugFromPath() {
  const parts = location.pathname.split('/').filter(Boolean);
  return decodeURIComponent(parts[1] || '');
}

function galleryMarkup() {
  const images = car.images?.length ? car.images : [{ url: mainImage(car) }];
  return `
    <div class="gallery">
      <div class="gallery__main" data-open-lightbox role="button" tabindex="0" aria-label="${escapeHtml(t('common.photos'))}">
        <img id="gallery-main" src="${escapeHtml(images[0].url)}" alt="${escapeHtml(carTitle(car, state.lang))}" width="1200" height="900" />
        ${images.length > 1 ? `
          <button class="gallery__nav gallery__nav--prev" type="button" data-step="-1" aria-label="${escapeHtml(t('common.previous'))}">${icons.arrowLeft}</button>
          <button class="gallery__nav gallery__nav--next" type="button" data-step="1" aria-label="${escapeHtml(t('common.next'))}">${icons.arrowRight}</button>` : ''}
        <span class="gallery__counter" id="gallery-counter">${escapeHtml(t('common.photoOf', { index: 1, total: images.length }))}</span>
      </div>
      ${images.length > 1 ? `<div class="gallery__thumbs" role="tablist">
        ${images.map((image, position) => `
          <button class="gallery__thumb${position === 0 ? ' is-active' : ''}" type="button" data-thumb="${position}" role="tab" aria-label="${escapeHtml(t('common.photoOf', { index: position + 1, total: images.length }))}">
            <img src="${escapeHtml(image.url.replace(/\.jpg$/, '-thumb.jpg'))}" alt="" loading="lazy" />
          </button>`).join('')}
      </div>` : ''}
    </div>`;
}

function contactPanelMarkup() {
  const owners = state.owners.length ? state.owners : [{ nameEn: siteValue('businessName'), phone: siteValue('phone1') }];
  const message = `${t('car.enquiryDefault', { car: carTitle(car, state.lang) })}\n${location.origin}/cars/${car.slug}`;
  return `
    <div class="detail-card contact-panel">
      <h2 style="font-size:1.15rem">${escapeHtml(t('home.ownersTitle'))}</h2>
      ${owners.map((owner) => {
        const name = state.lang === 'ur' && owner.nameUr ? owner.nameUr : owner.nameEn;
        return `<div class="owner-mini">
          <span class="owner-mini__avatar" aria-hidden="true">${escapeHtml((owner.nameEn || '?').trim().charAt(0).toUpperCase())}</span>
          <span class="owner-mini__body">
            <span class="owner-mini__name">${escapeHtml(name)}</span>
            <span class="owner-mini__phone">${escapeHtml(prettyPhone(owner.phone))}</span>
          </span>
          <span class="owner-mini__actions">
            <a class="icon-btn" href="${escapeHtml(telHref(owner.phone))}" aria-label="${escapeHtml(t('common.callNow'))}">${icons.phone}</a>
            <a class="icon-btn icon-btn--wa" href="${escapeHtml(whatsappHref(owner.whatsapp || owner.phone, message))}" target="_blank" rel="noopener" aria-label="${escapeHtml(t('common.whatsapp'))}">${icons.whatsapp}</a>
          </span>
        </div>`;
      }).join('')}
      <a class="btn btn-whatsapp btn-block" style="margin-top:16px" href="${escapeHtml(whatsappHref(siteValue('whatsapp1'), message))}" target="_blank" rel="noopener">${icons.whatsapp}${escapeHtml(t('car.whatsappEnquiry'))}</a>
      <a class="btn btn-primary btn-block" style="margin-top:10px" href="${escapeHtml(telHref(siteValue('phone1')))}">${icons.phone}${escapeHtml(t('common.call'))} ${escapeHtml(prettyPhone(siteValue('phone1')))}</a>
      <a class="btn btn-light btn-block" style="margin-top:10px" href="/contact">${icons.mail}${escapeHtml(t('contact.formTitle'))}</a>
      <ul class="trust-list">
        <li>${icons.check}<span>${escapeHtml(t('car.priceNote'))}</span></li>
        <li>${icons.shield}<span>${escapeHtml(state.whyUs[0] ? (state.lang === 'ur' && state.whyUs[0].titleUr ? state.whyUs[0].titleUr : state.whyUs[0].titleEn) : t('why.inspected'))}</span></li>
        <li>${icons.file}<span>${escapeHtml(state.whyUs[2] ? (state.lang === 'ur' && state.whyUs[2].titleUr ? state.whyUs[2].titleUr : state.whyUs[2].titleEn) : t('why.paperwork'))}</span></li>
        <li>${icons.location}<span>${escapeHtml(siteValue('addressShort'))}</span></li>
      </ul>
    </div>`;
}

function renderPage() {
  const root = $('#car-root');
  if (!root) return;
  const title = carTitle(car, state.lang);
  const sold = car.status === 'sold';
  const description = state.lang === 'ur' && car.descriptionUr ? car.descriptionUr : car.descriptionEn;
  const city = state.lang === 'ur' && car.registeredCityUr ? car.registeredCityUr : car.registeredCityEn;

  document.title = `${title} — ${siteValue('businessName') || 'Al Rafay Corporation'}`;

  root.innerHTML = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/">${escapeHtml(t('nav.home'))}</a> <span aria-hidden="true">/</span>
      <a href="/cars">${escapeHtml(t('nav.cars'))}</a> <span aria-hidden="true">/</span>
      <span aria-current="page">${escapeHtml(title)}</span>
    </nav>
    <div class="car-detail">
      <div>
        ${galleryMarkup()}
        <div class="detail-card" style="margin-top:22px">
          <div class="detail-head">
            <div>
              <h1 class="detail-title">${escapeHtml(title)}</h1>
              <p class="detail-sub">${escapeHtml(car.variant || car.model)} · ${escapeHtml(city)} · <span class="num">${escapeHtml(t('common.reference'))}: ${escapeHtml(car.slug)}</span></p>
            </div>
            <div class="detail-price">
              <span class="price">${escapeHtml(formatPrice(car.price))}</span>
              <small>${escapeHtml(priceChip(car.price, state.lang))} · ${escapeHtml(t('common.negotiable'))}</small>
            </div>
          </div>
          <div class="pill-row" style="margin-top:14px">
            <span class="chip ${sold ? 'chip--muted' : 'chip--crimson'}">${escapeHtml(sold ? t('common.sold') : t('common.available'))}</span>
            ${car.featured ? `<span class="chip chip--slate">${escapeHtml(t('common.featured'))}</span>` : ''}
            <span class="chip">${icons.calendar}${escapeHtml(String(car.year))}</span>
            <span class="chip">${icons.gauge}${escapeHtml(formatMileage(car.mileageKm, state.lang))}</span>
            <span class="chip">${icons.fuel}${escapeHtml(t(`fuel.${car.fuel}`))}</span>
            <span class="chip">${icons.gearbox}${escapeHtml(t(`transmission.${car.transmission}`))}</span>
            <span class="chip">${icons.engine}${escapeHtml(formatNumber(car.engineCc))} ${escapeHtml(t('common.cc'))}</span>
            ${car.images?.length ? `<span class="chip">${icons.camera}<span class="num">${car.images.length}</span> ${escapeHtml(t('common.photos'))}</span>` : ''}
          </div>
          ${sold ? `<div class="notice notice--sold" style="margin-top:16px">${icons.check}<span>${escapeHtml(t('car.soldNotice'))}</span></div>` : ''}
          <div class="spec-grid">${carSpecsHtml(car, state.lang)}</div>
        </div>
        <div class="detail-card">
          <h2 style="font-size:1.15rem">${escapeHtml(t('car.details'))}</h2>
          <p style="color:var(--muted);margin:0;white-space:pre-line">${escapeHtml(description)}</p>
        </div>
      </div>
      <div>${contactPanelMarkup()}</div>
    </div>
    ${similar.length ? `<section class="section" style="padding-top:46px">
      <div class="section__head"><h2>${escapeHtml(t('common.similar'))}</h2></div>
      <div class="grid grid--cars">${similar.map((item) => carCardHtml(item, state.lang)).join('')}</div>
    </section>` : ''}`;

  bindGallery();
  observeReveals(root);
}

function setImage(position) {
  const images = car.images || [];
  if (!images.length) return;
  index = (position + images.length) % images.length;
  const main = $('#gallery-main');
  if (main) {
    main.style.opacity = '0.35';
    const next = new Image();
    next.src = images[index].url;
    next.onload = () => {
      main.src = images[index].url;
      main.style.opacity = '1';
    };
    main.src = images[index].url;
    main.style.opacity = '1';
  }
  const counter = $('#gallery-counter');
  if (counter) counter.textContent = t('common.photoOf', { index: index + 1, total: images.length });
  for (const thumb of document.querySelectorAll('[data-thumb]')) {
    thumb.classList.toggle('is-active', Number(thumb.dataset.thumb) === index);
  }
}

function bindGallery() {
  const root = $('#car-root');
  root.querySelectorAll('[data-step]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      setImage(index + Number(button.dataset.step));
    });
  });
  root.querySelectorAll('[data-thumb]').forEach((thumb) => {
    thumb.addEventListener('click', () => setImage(Number(thumb.dataset.thumb)));
  });
  const main = root.querySelector('[data-open-lightbox]');
  main?.addEventListener('click', () => openLightbox());
  main?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openLightbox();
    }
  });
}

/* -------------------------------------------------------------- lightbox --- */
let lightbox = null;

function ensureLightbox() {
  if (lightbox) return lightbox;
  lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.innerHTML = `
    <button class="lightbox__close" type="button" aria-label="${escapeHtml(t('common.closeViewer'))}">${icons.close}</button>
    <button class="lightbox__nav lightbox__nav--prev" type="button" aria-label="${escapeHtml(t('common.previous'))}">${icons.arrowLeft}</button>
    <img alt="" />
    <button class="lightbox__nav lightbox__nav--next" type="button" aria-label="${escapeHtml(t('common.next'))}">${icons.arrowRight}</button>
    <div class="lightbox__thumbs"></div>`;
  document.body.append(lightbox);
  lightbox.querySelector('.lightbox__close').addEventListener('click', closeLightbox);
  lightbox.querySelector('.lightbox__nav--prev').addEventListener('click', () => setImage(index - 1) || updateLightbox());
  lightbox.querySelector('.lightbox__nav--next').addEventListener('click', () => setImage(index + 1) || updateLightbox());
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', (event) => {
    if (!lightbox.classList.contains('is-open')) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') { setImage(index - 1); updateLightbox(); }
    if (event.key === 'ArrowRight') { setImage(index + 1); updateLightbox(); }
  });
  return lightbox;
}

function updateLightbox() {
  const images = car.images || [];
  if (!lightbox || !images.length) return;
  lightbox.querySelector('img').src = images[index].url;
  lightbox.querySelector('img').alt = carTitle(car, state.lang);
  const thumbs = lightbox.querySelector('.lightbox__thumbs');
  thumbs.innerHTML = images.map((image, position) => `<img src="${escapeHtml(image.url.replace(/\.jpg$/, '-thumb.jpg'))}" class="${position === index ? 'is-active' : ''}" data-lightbox-thumb="${position}" alt="" />`).join('');
  thumbs.querySelectorAll('[data-lightbox-thumb]').forEach((node) => {
    node.addEventListener('click', () => {
      setImage(Number(node.dataset.lightboxThumb));
      updateLightbox();
    });
  });
}

function openLightbox() {
  ensureLightbox();
  updateLightbox();
  lightbox.classList.add('is-open');
  document.body.classList.add('no-scroll');
}

function closeLightbox() {
  lightbox?.classList.remove('is-open');
  document.body.classList.remove('no-scroll');
}

/* ------------------------------------------------------------------ boot --- */
function stickyActions() {
  const host = $('[data-car-actions]');
  if (!host) return;
  const message = `${t('car.enquiryDefault', { car: carTitle(car, state.lang) })}\n${location.href}`;
  host.innerHTML = `
    <a class="btn btn-primary" href="${escapeHtml(telHref(siteValue('phone1')))}">${icons.phone}${escapeHtml(t('common.call'))}</a>
    <a class="btn btn-whatsapp" href="${escapeHtml(whatsappHref(siteValue('whatsapp1'), message))}" target="_blank" rel="noopener">${icons.whatsapp}${escapeHtml(t('common.whatsapp'))}</a>`;
  host.classList.add('is-visible');
  document.body.classList.add('has-sticky-actions');
}

export async function initPage() {
  const slug = slugFromPath();
  const payload = await api.get(`/api/cars/${encodeURIComponent(slug)}`).catch(() => null);
  if (!payload?.car) return false;
  car = payload.car;
  similar = payload.similar || [];
  renderPage();
  stickyActions();
  return true;
}

export { renderPage, setImage };
