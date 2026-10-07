/**
 * Pure HTML string builders shared by the browser and the Node server.
 * Nothing in here may touch `window`, `document` or any DOM API: the server
 * imports this module to render the same markup for SEO and no-JS visitors.
 */
import { brandLabel, shortPrice, translate } from './i18n.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const attr = (value) => escapeHtml(value);

export function formatNumber(value) {
  return new Intl.NumberFormat('en-PK').format(Number(value) || 0);
}

/** "PKR 2,650,000" */
export function formatPrice(value) {
  return `PKR ${formatNumber(value)}`;
}

/** Short chip: "26.5 lac" / "26.5 لاکھ" */
export function priceChip(value, lang = 'en') {
  return `${shortPrice(value, lang)}${lang === 'ur' ? '' : ''}`;
}

export function formatMileage(value, lang = 'en') {
  return `${formatNumber(value)} ${translate(lang, 'common.km')}`;
}

/** Local number for display: 0315 5521697 */
export function prettyPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  if (digits.length === 12 && digits.startsWith('92')) return `0${digits.slice(2, 5)} ${digits.slice(5)}`;
  return digits;
}

/** International form for tel:/wa.me links. */
export function dialNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('92')) return `+${digits}`;
  if (digits.startsWith('0')) return `+92${digits.slice(1)}`;
  return `+92${digits}`;
}

export function whatsappNumber(value) {
  return String(value || '').replace(/\D/g, '').replace(/^0+/, '');
}

export function whatsappHref(number, text = '') {
  const digits = whatsappNumber(number);
  if (!digits) return '#';
  const message = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${message}`;
}

export function telHref(value) {
  const dial = dialNumber(value);
  return dial ? `tel:${dial}` : '#';
}

export function carTitle(car, lang = 'en') {
  const localized = lang === 'ur' && car.titleUr ? car.titleUr : car.titleEn;
  const base = localized || `${car.brand} ${car.model}`.trim();
  const hasYear = new RegExp(String(car.year)).test(base);
  return hasYear ? base : `${base} ${car.year}`;
}

export function carHref(car) {
  return `/cars/${encodeURIComponent(car.slug)}`;
}

export function mainImage(car) {
  const first = car.images?.[0];
  return first?.url || '/assets/img/placeholder-car.svg';
}

export function thumbImage(car) {
  const url = mainImage(car);
  if (!/\.jpe?g$/i.test(url)) return url;
  return url.replace(/\.jpg$/i, '-thumb.jpg');
}

/* ------------------------------------------------------------------- icons */
const svg = (paths, viewBox = '0 0 24 24') =>
  `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  calendar: svg('<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 3v3M16 3v3"/>'),
  gauge: svg('<path d="M12 14.5 16 9"/><circle cx="12" cy="14.5" r="1.4" fill="currentColor" stroke="none"/><path d="M4.5 18a9 9 0 1 1 15 0"/>'),
  fuel: svg('<path d="M4 20V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14M3 20h12M14 9h2.5a2 2 0 0 1 2 2v4.5a1.5 1.5 0 0 0 3 0V9l-2.5-3M7 8h4"/>'),
  gearbox: svg('<path d="M6 4v16M12 4v16M6 12h6M18 8v12M14 12h4"/>'),
  engine: svg('<path d="M5 9h3l2-2h4v3h3l2 2v6H5z"/><path d="M2.5 12h2.5M9 20v-2M14 20v-2"/>'),
  palette: svg('<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none"/>'),
  location: svg('<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>'),
  pin: svg('<path d="M9 20 3 22l3-9 9-9 6 6-9 9-3-3"/>'),
  phone: svg('<path d="M6.5 3h3l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5v3A2.5 2.5 0 0 1 18.5 20C10.5 19.5 4.5 13.5 4 5.5A2.5 2.5 0 0 1 6.5 3Z"/>'),
  whatsapp: svg('<path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.6-1.2A9 9 0 1 0 12 3Z"/><path d="M8.8 8.6c0 3.2 2.6 5.8 5.8 5.8.7 0 1.4-.6 1.4-1.3l-1.6-.8-.9.9a4.4 4.4 0 0 1-2.2-2.2l.9-.9-.8-1.6c-.7 0-1.3.6-1.3 1.4Z" fill="currentColor" stroke="none"/>'),
  camera: svg('<path d="M4 8.5h3l1.5-2h7L17 8.5h3v11H4z"/><circle cx="12" cy="13.8" r="3.2"/>'),
  car: svg('<path d="M5 16.5h14M4.5 16.5V12l2-5h11l2 5v4.5"/><circle cx="7.5" cy="17.8" r="1.6"/><circle cx="16.5" cy="17.8" r="1.6"/>'),
  check: svg('<path d="M4.5 12.5 9 17l10.5-10.5"/>'),
  shield: svg('<path d="M12 3.5 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-2.5Z"/><path d="M9 12l2 2 4-4"/>'),
  tag: svg('<path d="M20 13.5 13.5 20a2 2 0 0 1-2.8 0L4 13.3V4h9.3l6.7 6.7a2 2 0 0 1 0 2.8Z"/><circle cx="8.4" cy="8.4" r="1.3" fill="currentColor" stroke="none"/>'),
  file: svg('<path d="M6 3.5h7l5 5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M13 3.5V9h5M8.5 13h7M8.5 16.5h4"/>'),
  wrench: svg('<path d="M15.5 3a5.5 5.5 0 0 0-4.6 8.5L3.6 18.8l1.6 1.6 7.3-7.3A5.5 5.5 0 0 0 20.9 8l-3 3-2.9-2.9 3-3A5.4 5.4 0 0 0 15.5 3Z"/>'),
  star: svg('<path d="m12 4 2.4 5 5.5.8-4 3.9.9 5.5-4.8-2.6-4.8 2.6.9-5.5-4-3.9 5.5-.8Z"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>'),
  filter: svg('<path d="M4 6h16M7 12h10M10 18h4"/>'),
  sort: svg('<path d="M7 4v16M7 20l-3-3M17 20V4M17 4l3 3"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  arrowRight: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  arrowLeft: svg('<path d="M19 12H5M11 18l-6-6 6-6"/>'),
  arrowUp: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  arrowDown: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  share: svg('<circle cx="6" cy="12" r="2.4"/><circle cx="17" cy="6.5" r="2.4"/><circle cx="17" cy="17.5" r="2.4"/><path d="m8.2 10.9 6.6-3.4M8.2 13.1l6.6 3.4"/>'),
  globe: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.7 5.3 3.7 8.5S14.4 18.2 12 20.5c-2.4-2.3-3.7-5.3-3.7-8.5S9.6 5.8 12 3.5Z"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  eye: svg('<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>'),
  mail: svg('<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>'),
  facebook: svg('<path d="M14.5 8.5H17V5.5h-2.5A4 4 0 0 0 10.5 9.5V12H8v3h2.5v6h3v-6H16l.5-3h-3V9.8c0-.7.3-1.3 1-1.3Z" fill="currentColor" stroke="none"/>'),
  instagram: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1.2" fill="currentColor" stroke="none"/>'),
  youtube: svg('<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10.5 9.5 5 2.5-5 2.5Z" fill="currentColor" stroke="none"/>'),
  users: svg('<circle cx="9" cy="8.5" r="3.5"/><path d="M2.8 20a6.5 6.5 0 0 1 12.4 0M16 5.2a3.5 3.5 0 0 1 0 6.6M17.5 20a6.4 6.4 0 0 0-2-4.6"/>'),
  sparkle: svg('<path d="m12 4 1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7Z"/><path d="M18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z"/>'),
};

/* ------------------------------------------------------------ components */

export function carFlags(car, lang) {
  const flags = [];
  if (car.status === 'sold') flags.push(`<span class="badge badge--sold">${escapeHtml(translate(lang, 'common.sold'))}</span>`);
  else if (car.featured) flags.push(`<span class="badge badge--featured">${escapeHtml(translate(lang, 'common.featured'))}</span>`);
  return flags.join('');
}

export function specChips(car, lang, { limit = 4 } = {}) {
  const chips = [
    `<span class="chip">${icons.calendar}${escapeHtml(car.year)}</span>`,
    `<span class="chip">${icons.gauge}${escapeHtml(formatMileage(car.mileageKm, lang))}</span>`,
    `<span class="chip">${icons.fuel}${escapeHtml(translate(lang, `fuel.${car.fuel}`))}</span>`,
    `<span class="chip">${icons.gearbox}${escapeHtml(translate(lang, `transmission.${car.transmission}`))}</span>`,
  ];
  return chips.slice(0, limit).join('');
}

export function carCardHtml(car, lang = 'en') {
  const title = carTitle(car, lang);
  const sold = car.status === 'sold';
  const photoCount = car.images?.length || 0;
  return `<article class="car-card${sold ? ' car-card--sold' : ''}">
  <a class="car-card__media" href="${attr(carHref(car))}" aria-label="${attr(title)}">
    <img src="${attr(thumbImage(car))}" alt="${attr(title)}" loading="lazy" decoding="async" width="640" height="480" />
    <span class="car-card__flags">${carFlags(car, lang)}</span>
    ${photoCount ? `<span class="car-card__photos">${icons.camera}${photoCount}</span>` : ''}
  </a>
  <div class="car-card__body">
    <h3 class="car-card__title"><a href="${attr(carHref(car))}">${escapeHtml(title)}</a></h3>
    <p class="car-card__sub">${escapeHtml(car.variant || car.model)}${car.registeredCityEn ? ` · ${escapeHtml(lang === 'ur' && car.registeredCityUr ? car.registeredCityUr : car.registeredCityEn)}` : ''}</p>
    <div class="chips">${specChips(car, lang)}</div>
    <div class="car-card__foot">
      <div class="price-row">
        <span class="price">${escapeHtml(formatPrice(car.price))}<small>${escapeHtml(priceChip(car.price, lang))} · ${escapeHtml(translate(lang, 'common.negotiable'))}</small></span>
      </div>
      <div class="car-card__actions">
        <a class="btn btn-sm btn-primary" href="${attr(carHref(car))}">${escapeHtml(translate(lang, 'common.viewDetails'))}</a>
        <button class="btn btn-sm btn-light js-enquire" type="button" data-slug="${attr(car.slug)}" data-title="${attr(title)}">${icons.whatsapp}${escapeHtml(translate(lang, 'common.whatsapp'))}</button>
      </div>
    </div>
  </div>
</article>`;
}

export function fleetCardHtml(car, lang = 'en') {
  const title = carTitle(car, lang);
  const sold = car.status === 'sold';
  return `<a class="fleet-card" href="${attr(carHref(car))}" tabindex="-1" aria-hidden="true">
  <span class="fleet-card__media">
    <img src="${attr(thumbImage(car))}" alt="" loading="lazy" decoding="async" />
    ${car.featured || sold ? `<span class="fleet-card__flag${sold ? ' fleet-card__flag--sold' : ''}">${escapeHtml(translate(lang, sold ? 'common.sold' : 'common.featured'))}</span>` : ''}
  </span>
  <span class="fleet-card__body">
    <span class="fleet-card__title">${escapeHtml(title)}</span>
    <span class="fleet-card__meta">${escapeHtml(String(car.year))} · ${escapeHtml(formatMileage(car.mileageKm, lang))}</span>
    <span class="fleet-card__price">${escapeHtml(formatPrice(car.price))}</span>
  </span>
</a>`;
}

export function brandTileHtml(brand, lang = 'en') {
  const label = brandLabel(lang, brand.name);
  const initial = (brand.name || '?').trim().charAt(0).toUpperCase();
  return `<a class="brand-tile reveal" href="/cars?brand=${encodeURIComponent(brand.name)}">
  <span class="brand-tile__mark">${escapeHtml(initial)}</span>
  <span class="brand-tile__name">${escapeHtml(label)}</span>
  <span class="brand-tile__count">${escapeHtml(String(brand.count))} ${escapeHtml(lang === 'ur' ? 'گاڑیاں' : 'cars')}</span>
</a>`;
}

export function specRowHtml(icon, label, value) {
  return `<div class="spec">${icons[icon] || icons.car}<div><span class="spec__label">${escapeHtml(label)}</span><span class="spec__value">${escapeHtml(value)}</span></div></div>`;
}

export function carSpecsHtml(car, lang = 'en') {
  return [
    specRowHtml('calendar', translate(lang, 'common.year'), String(car.year)),
    specRowHtml('gauge', translate(lang, 'common.mileage'), formatMileage(car.mileageKm, lang)),
    specRowHtml('fuel', translate(lang, 'common.fuel'), translate(lang, `fuel.${car.fuel}`)),
    specRowHtml('gearbox', translate(lang, 'common.transmission'), translate(lang, `transmission.${car.transmission}`)),
    specRowHtml('engine', translate(lang, 'common.engine'), `${formatNumber(car.engineCc)} ${translate(lang, 'common.cc')}`),
    specRowHtml('palette', translate(lang, 'common.color'), lang === 'ur' && car.colorUr ? car.colorUr : car.colorEn),
    specRowHtml('location', translate(lang, 'common.registered'), lang === 'ur' && car.registeredCityUr ? car.registeredCityUr : car.registeredCityEn),
    specRowHtml('car', translate(lang, 'common.body'), translate(lang, `body.${car.bodyType}`)),
    specRowHtml('sparkle', translate(lang, 'common.condition'), lang === 'ur' && car.conditionUr ? car.conditionUr : car.conditionEn),
  ].join('');
}

export function ownerCardHtml(owner, lang = 'en') {
  const name = lang === 'ur' && owner.nameUr ? owner.nameUr : owner.nameEn;
  const role = lang === 'ur' && owner.roleUr ? owner.roleUr : owner.roleEn;
  const initial = (owner.nameEn || '?').trim().charAt(0).toUpperCase();
  return `<article class="owner-card reveal">
  <span class="owner-card__avatar" aria-hidden="true">${escapeHtml(initial)}</span>
  <div>
    <h3 class="owner-card__name">${escapeHtml(name)}</h3>
    ${role ? `<p class="owner-card__role">${escapeHtml(role)}</p>` : ''}
    <a class="owner-card__phone" href="${attr(telHref(owner.phone))}">${escapeHtml(prettyPhone(owner.phone))}</a>
    <div class="owner-card__actions">
      <a class="btn btn-sm btn-primary" href="${attr(telHref(owner.phone))}">${icons.phone}${escapeHtml(translate(lang, 'common.callNow'))}</a>
      <a class="btn btn-sm btn-whatsapp" href="${attr(whatsappHref(owner.whatsapp || owner.phone, translate(lang, 'car.enquiryDefault', { car: '' }).trim()))}" target="_blank" rel="noopener">${icons.whatsapp}${escapeHtml(translate(lang, 'common.whatsapp'))}</a>
    </div>
  </div>
</article>`;
}

export function whyCardHtml(item, lang = 'en') {
  const title = lang === 'ur' && item.titleUr ? item.titleUr : item.titleEn;
  const body = lang === 'ur' && item.bodyUr ? item.bodyUr : item.bodyEn;
  return `<article class="why-card reveal">
  <span class="why-card__icon">${icons[item.icon] || icons.shield}</span>
  <h3>${escapeHtml(title)}</h3>
  <p>${escapeHtml(body)}</p>
</article>`;
}

export function statHtml(stat, lang = 'en') {
  const label = lang === 'ur' && stat.labelUr ? stat.labelUr : stat.labelEn;
  return `<div class="stat reveal">
  <div class="stat__value num" data-count="${escapeHtml(String(stat.value))}" data-suffix="${attr(stat.suffix || '')}">0${escapeHtml(stat.suffix || '')}</div>
  <div class="stat__label">${escapeHtml(label)}</div>
</div>`;
}

export function faqHtml(item, lang = 'en') {
  const question = lang === 'ur' && item.questionUr ? item.questionUr : item.questionEn;
  const answer = lang === 'ur' && item.answerUr ? item.answerUr : item.answerEn;
  return `<div class="accordion__item reveal">
  <button class="accordion__trigger" type="button" aria-expanded="false">
    <span>${escapeHtml(question)}</span>
    <span class="accordion__icon">${icons.plus}</span>
  </button>
  <div class="accordion__panel"><div class="accordion__panel-inner">${escapeHtml(answer)}</div></div>
</div>`;
}

export function skeletonCards(count = 6) {
  return Array.from({ length: count }, () => `<div class="car-skeleton"><div class="car-skeleton__media"></div><div class="car-skeleton__line"></div><div class="car-skeleton__line car-skeleton__line--short"></div></div>`).join('');
}
