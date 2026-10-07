/** Contact page: owners, address, hours, map and the enquiry form. */
import { siteValue, state, t } from './core.js';
import { escapeHtml, faqHtml, icons, ownerCardHtml, prettyPhone, telHref, whatsappHref } from './templates.js';

const $ = (selector, root = document) => root.querySelector(selector);

function renderInfo() {
  const host = $('#contact-info');
  if (!host) return;
  const rows = [];
  state.owners.forEach((owner) => {
    const name = state.lang === 'ur' && owner.nameUr ? owner.nameUr : owner.nameEn;
    rows.push({
      icon: 'users',
      label: name,
      html: `<a href="${escapeHtml(telHref(owner.phone))}">${escapeHtml(prettyPhone(owner.phone))}</a>`,
      action: `<a class="btn btn-sm btn-primary" href="${escapeHtml(telHref(owner.phone))}">${icons.phone}${escapeHtml(t('common.call'))}</a>
        <a class="btn btn-sm btn-whatsapp" href="${escapeHtml(whatsappHref(owner.whatsapp || owner.phone, t('car.enquiryDefault', { car: '' }).trim()))}" target="_blank" rel="noopener">${icons.whatsapp}${escapeHtml(t('common.whatsapp'))}</a>`,
    });
  });
  rows.push({
    icon: 'location',
    label: t('contact.addressLabel'),
    html: escapeHtml(siteValue('address')),
    action: siteValue('mapLink') ? `<a class="btn btn-sm btn-light" href="${escapeHtml(siteValue('mapLink'))}" target="_blank" rel="noopener">${icons.pin}${escapeHtml(t('contact.directions'))}</a>` : '',
  });
  rows.push({ icon: 'clock', label: t('contact.hoursLabel'), html: escapeHtml(siteValue('hours')), action: '' });
  if (state.settings.email) {
    rows.push({ icon: 'mail', label: t('contact.emailLabel'), html: `<a href="mailto:${escapeHtml(state.settings.email)}">${escapeHtml(state.settings.email)}</a>`, action: '' });
  }

  host.innerHTML = rows.map((row) => `
    <li>
      ${icons[row.icon] || icons.location}
      <div style="flex:1">
        <strong>${escapeHtml(row.label)}</strong>
        <span style="display:block">${row.html}</span>
        ${row.action ? `<div class="pill-row" style="margin-top:10px">${row.action}</div>` : ''}
      </div>
    </li>`).join('');
}

function renderOwners() {
  const grid = $('#contact-owners');
  if (grid) grid.innerHTML = state.owners.map((owner) => ownerCardHtml(owner, state.lang)).join('');
}

function renderMap() {
  const host = $('#contact-map');
  if (!host) return;
  const embed = siteValue('mapEmbedUrl');
  const mode = state.settings.mapEmbedType || 'src';
  let src = embed;
  if (mode === 'html' && embed) {
    const match = embed.match(/src=["']([^"']+)["']/i);
    src = match ? match[1] : '';
  }
  host.innerHTML = /^https?:\/\//i.test(src)
    ? `<iframe src="${escapeHtml(src)}" title="${escapeHtml(t('contact.mapLabel'))}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`
    : `<div class="map-placeholder">${icons.location}<p>${escapeHtml(siteValue('address'))}</p></div>`;
}

function renderFaq() {
  const host = $('#contact-faq');
  if (host) host.innerHTML = state.faqs.map((item) => faqHtml(item, state.lang)).join('');
}

function fillSubjects() {
  const select = $('#contact-subject');
  if (!select) return;
  const options = [
    { value: 'General enquiry', label: state.lang === 'ur' ? 'عام معلومات' : 'General enquiry' },
    { value: 'Buying a car', label: state.lang === 'ur' ? 'گاڑی خریدنا' : 'Buying a car' },
    { value: 'Selling my car', label: state.lang === 'ur' ? 'اپنی گاڑی بیچنا' : 'Selling my car' },
    { value: 'Exchange deal', label: state.lang === 'ur' ? 'ایکسچینج ڈیل' : 'Exchange deal' },
    { value: 'Instalments', label: state.lang === 'ur' ? 'انسٹالمنٹ' : 'Instalments' },
    { value: 'Other', label: state.lang === 'ur' ? 'دیگر' : 'Other' },
  ];
  const current = select.value;
  select.innerHTML = options.map((option) => `<option value="${escapeHtml(option.value)}"${current === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('');
}

export function render() {
  renderInfo();
  renderOwners();
  renderMap();
  renderFaq();
  fillSubjects();
}
