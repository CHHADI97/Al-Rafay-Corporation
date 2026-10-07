/**
 * Server-rendered markup for the parts of a page that also exist as an
 * interactive client-side view. Crawlers and no-JS visitors get the full
 * content; the browser then replaces it with the live version.
 */
import {
  carCardHtml, carSpecsHtml, carTitle, escapeHtml, formatMileage, formatNumber, formatPrice,
  icons, mainImage, prettyPhone, telHref, whatsappHref,
} from '../public/js/templates.js';
import { translate } from '../public/js/i18n.js';

export function featuredCardsHtml(cars, lang = 'en') {
  const featured = cars.filter((car) => car.featured && car.status === 'available').slice(0, 8);
  const list = featured.length >= 3 ? featured : cars.filter((car) => car.status === 'available').slice(0, 8);
  return list.map((car) => carCardHtml(car, lang)).join('');
}

export function inventoryCardsHtml(cars, lang = 'en', limit = 24) {
  return cars.slice(0, limit).map((car) => carCardHtml(car, lang)).join('');
}

export function inventoryCountHtml(cars, lang = 'en', shown = cars.length) {
  return translate(lang, 'inventory.showing', {
    count: `<strong>${formatNumber(shown)}</strong>`,
    total: `<strong>${formatNumber(cars.length)}</strong>`,
  });
}

/** Static version of the car detail page (same structure the client renders). */
export function carDetailHtml(car, site, lang = 'en') {
  const owners = (site?.owners || []).filter((owner) => owner.showOnSite !== false);
  const settings = site?.settings || {};
  const title = carTitle(car, lang);
  const description = lang === 'ur' && car.descriptionUr ? car.descriptionUr : car.descriptionEn;
  const city = lang === 'ur' && car.registeredCityUr ? car.registeredCityUr : car.registeredCityEn;
  const images = car.images?.length ? car.images : [{ url: mainImage(car) }];
  const sold = car.status === 'sold';
  const message = `${translate(lang, 'car.enquiryDefault', { car: title })}\n/cars/${car.slug}`;
  const mainNumber = settings.whatsappNumber || owners[0]?.whatsapp || owners[0]?.phone || '';

  return `
    <nav class="breadcrumbs" style="color:var(--muted)" aria-label="Breadcrumb">
      <a href="/">${escapeHtml(translate(lang, 'nav.home'))}</a> <span aria-hidden="true">/</span>
      <a href="/cars">${escapeHtml(translate(lang, 'nav.cars'))}</a> <span aria-hidden="true">/</span>
      <span aria-current="page" style="color:var(--ink)">${escapeHtml(title)}</span>
    </nav>
    <div class="car-detail">
      <div>
        <div class="gallery">
          <div class="gallery__main">
            <img src="${escapeHtml(images[0].url)}" alt="${escapeHtml(title)}" width="1200" height="900" />
            <span class="gallery__counter">${escapeHtml(translate(lang, 'common.photoOf', { index: 1, total: images.length }))}</span>
          </div>
        </div>
        <div class="detail-card" style="margin-top:22px">
          <div class="detail-head">
            <div>
              <h1 class="detail-title">${escapeHtml(title)}</h1>
              <p class="detail-sub">${escapeHtml(car.variant || car.model)} · ${escapeHtml(city)}</p>
            </div>
            <div class="detail-price">
              <span class="price">${escapeHtml(formatPrice(car.price))}</span>
              <small>${escapeHtml(translate(lang, 'common.negotiable'))}</small>
            </div>
          </div>
          <div class="pill-row" style="margin-top:14px">
            <span class="chip ${sold ? 'chip--muted' : 'chip--crimson'}">${escapeHtml(translate(lang, sold ? 'common.sold' : 'common.available'))}</span>
            <span class="chip">${icons.calendar}${escapeHtml(String(car.year))}</span>
            <span class="chip">${icons.gauge}${escapeHtml(formatMileage(car.mileageKm, lang))}</span>
            <span class="chip">${icons.fuel}${escapeHtml(translate(lang, `fuel.${car.fuel}`))}</span>
            <span class="chip">${icons.gearbox}${escapeHtml(translate(lang, `transmission.${car.transmission}`))}</span>
            <span class="chip">${icons.engine}${escapeHtml(formatNumber(car.engineCc))} ${escapeHtml(translate(lang, 'common.cc'))}</span>
          </div>
          ${sold ? `<div class="notice notice--sold" style="margin-top:16px">${icons.check}<span>${escapeHtml(translate(lang, 'car.soldNotice'))}</span></div>` : ''}
          <div class="spec-grid">${carSpecsHtml(car, lang)}</div>
        </div>
        <div class="detail-card">
          <h2 style="font-size:1.15rem">${escapeHtml(translate(lang, 'car.details'))}</h2>
          <p style="color:var(--muted);margin:0">${escapeHtml(description)}</p>
        </div>
      </div>
      <div>
        <div class="detail-card contact-panel">
          <h2 style="font-size:1.15rem">${escapeHtml(translate(lang, 'home.ownersTitle'))}</h2>
          ${owners.map((owner) => `
            <div class="owner-mini">
              <span class="owner-mini__body">
                <span class="owner-mini__name">${escapeHtml(lang === 'ur' && owner.nameUr ? owner.nameUr : owner.nameEn)}</span>
                <a class="owner-mini__phone" href="${escapeHtml(telHref(owner.phone))}">${escapeHtml(prettyPhone(owner.phone))}</a>
              </span>
              <span class="owner-mini__actions">
                <a class="icon-btn" href="${escapeHtml(telHref(owner.phone))}" aria-label="${escapeHtml(translate(lang, 'common.callNow'))}">${icons.phone}</a>
                <a class="icon-btn icon-btn--wa" href="${escapeHtml(whatsappHref(owner.whatsapp || owner.phone, message))}" target="_blank" rel="noopener" aria-label="WhatsApp">${icons.whatsapp}</a>
              </span>
            </div>`).join('')}
          <a class="btn btn-whatsapp btn-block" style="margin-top:16px" href="${escapeHtml(whatsappHref(mainNumber, message))}" target="_blank" rel="noopener">${icons.whatsapp}${escapeHtml(translate(lang, 'car.whatsappEnquiry'))}</a>
        </div>
      </div>
    </div>`;
}
