/* ==========================================================================
   detail.js — car detail page: gallery, specs, contact actions, related cars
   ========================================================================== */
(function () {
  'use strict';
  const R = window.Rafay;
  let car = null;
  let images = [];
  let index = 0;

  function carId() {
    return new URLSearchParams(window.location.search).get('id') || '';
  }

  function renderGallery() {
    const main = document.getElementById('galleryMain');
    const thumbs = document.getElementById('galleryThumbs');
    const badge = document.getElementById('galleryBadge');
    const stage = document.querySelector('.gallery__nav');
    if (!main) return;

    if (!images.length) {
      main.src = '/assets/img/showroom.jpg';
      main.alt = 'Showroom photo';
      thumbs.innerHTML = '';
      return;
    }
    main.src = images[index];
    main.alt = `${car.title} — photo ${index + 1} of ${images.length}`;
    thumbs.innerHTML = images.map((src, position) => `
      <button class="gallery__thumb${position === index ? ' is-active' : ''}" type="button" role="tab"
              aria-selected="${position === index}" data-index="${position}" aria-label="Photo ${position + 1}">
        <img src="${R.escapeHtml(src)}" alt="${R.escapeHtml(car.title)} thumbnail ${position + 1}" loading="lazy" width="200" height="150">
      </button>`).join('');
    thumbs.querySelectorAll('[data-index]').forEach((button) => {
      button.addEventListener('click', () => {
        index = Number(button.dataset.index);
        renderGallery();
      });
    });
    thumbs.querySelectorAll('[data-index]').forEach((button) => {
      if (Number(button.dataset.index) === index) R.scrollToEl(button, { block: 'nearest', inline: 'nearest' });
    });
    if (stage) stage.style.display = images.length > 1 ? '' : 'none';
    document.querySelector('.gallery__nav--next')?.style.setProperty('display', images.length > 1 ? '' : 'none');

    if (badge) {
      const status = R.statusMeta(car);
      const parts = [];
      if (car.featured && status.key !== 'sold') parts.push('<span class="pill pill--red">Featured</span>');
      if (status.key !== 'available') parts.push(`<span class="pill ${status.pill}">${status.label}</span>`);
      else parts.push('<span class="pill pill--green">Available</span>');
      badge.innerHTML = parts.join('');
    }
  }

  function step(delta) {
    if (images.length < 2) return;
    index = (index + delta + images.length) % images.length;
    renderGallery();
  }

  function bindGallery() {
    document.querySelector('[data-gallery-prev]')?.addEventListener('click', () => step(-1));
    document.querySelector('[data-gallery-next]')?.addEventListener('click', () => step(1));
    document.getElementById('galleryMain')?.addEventListener('click', openLightbox);
    document.getElementById('galleryZoom')?.addEventListener('click', openLightbox);
    document.getElementById('lightboxClose')?.addEventListener('click', closeLightbox);
    document.getElementById('lightboxPrev')?.addEventListener('click', () => { step(-1); syncLightbox(); });
    document.getElementById('lightboxNext')?.addEventListener('click', () => { step(1); syncLightbox(); });
    document.getElementById('lightbox')?.addEventListener('click', (event) => {
      if (event.target.id === 'lightbox') closeLightbox();
    });
    document.addEventListener('keydown', (event) => {
      const box = document.getElementById('lightbox');
      if (!box || box.hidden) return;
      if (event.key === 'Escape') closeLightbox();
      if (event.key === 'ArrowLeft') { step(-1); syncLightbox(); }
      if (event.key === 'ArrowRight') { step(1); syncLightbox(); }
    });

    // Touch swipe
    const stage = document.querySelector('.gallery__stage');
    let startX = null;
    stage?.addEventListener('touchstart', (event) => { startX = event.touches[0].clientX; }, { passive: true });
    stage?.addEventListener('touchend', (event) => {
      if (startX === null) return;
      const delta = event.changedTouches[0].clientX - startX;
      if (Math.abs(delta) > 45) step(delta < 0 ? 1 : -1);
      startX = null;
    });
  }

  function openLightbox() {
    const box = document.getElementById('lightbox');
    if (!box || !images.length) return;
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    syncLightbox();
  }

  function closeLightbox() {
    const box = document.getElementById('lightbox');
    if (!box) return;
    box.hidden = true;
    document.body.style.overflow = '';
  }

  function syncLightbox() {
    const image = document.getElementById('lightboxImg');
    const counter = document.getElementById('lightboxCounter');
    if (image) {
      image.src = images[index];
      image.alt = `${car.title} — photo ${index + 1} of ${images.length}`;
    }
    if (counter) counter.textContent = `${index + 1} / ${images.length}`;
  }

  function renderSpecs() {
    const list = document.getElementById('specGrid');
    if (!list) return;
    const specs = [
      ['Model year', car.year],
      ['Mileage', R.formatMileage(car.mileage)],
      ['Fuel type', car.fuel],
      ['Transmission', car.transmission],
      ['Engine', car.engine],
      ['Body type', car.bodyType],
      ['Colour', car.color],
      ['Registration city', car.registrationCity],
      ['Make', car.make],
      ['Model / variant', [car.model, car.variant].filter(Boolean).join(' ')],
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');
    list.innerHTML = specs.map(([label, value]) =>
      `<div><dt>${R.escapeHtml(label)}</dt><dd>${R.escapeHtml(value)}</dd></div>`).join('');
  }

  function renderPriceCard() {
    const site = R.state.site || {};
    const owner = (site.owners || [])[0] || {};
    const whatsapp = site.whatsappNumber || owner.whatsapp || owner.phone;
    const message = `Assalam o Alaikum, I want to ask about the ${car.title} (${R.formatPrice(car.price)}) — car reference ${car.id}.`;
    const status = R.statusMeta(car);

    const price = document.getElementById('carPrice');
    const priceMobile = document.getElementById('carPriceMobile');
    const note = document.getElementById('carPriceNote');
    const actions = document.getElementById('priceCardActions');
    const facts = document.getElementById('priceCardFacts');
    if (price) price.textContent = R.formatPrice(car.price);
    if (priceMobile) priceMobile.textContent = R.formatPrice(car.price);
    if (note) {
      note.textContent = `${R.formatAmount(car.price)} · ${status.key === 'sold'
        ? 'This unit has been sold — ask us for similar stock.'
        : 'Price is negotiable for a serious buyer. Trade-in welcome.'}`;
    }
    if (actions) {
      actions.innerHTML = `
        <a class="btn btn--primary btn--block" href="tel:+92${R.international(owner.phone).replace(/^92/, '')}">
          ${R.icon('phone')} Call ${R.escapeHtml(owner.name ? owner.name.split(' ').slice(-2).join(' ') : 'the owner')}
        </a>
        <a class="btn btn--whatsapp btn--block" href="${R.waLink(whatsapp, message)}" target="_blank" rel="noopener">
          ${R.icon('whatsapp')} WhatsApp about this car
        </a>
        <a class="btn btn--outline btn--block" href="#enquire">Send an enquiry</a>`;
    }
    if (facts) {
      facts.innerHTML = [
        ['car', `${car.make} ${car.model} ${car.variant}`.trim()],
        ['check', `${car.year} model · ${car.registrationCity || 'Pakistan'} registered`],
        ['pin', site.address || 'Thanda Pani, Islamabad'],
        ['phone', `Reference: ${car.id}`],
      ].map(([name, text]) => `<li>${R.icon(name)}<span>${R.escapeHtml(text)}</span></li>`).join('');
    }
    const bar = document.getElementById('callBarWa');
    if (bar) bar.href = R.waLink(whatsapp, message);
  }

  function renderTitle() {
    document.title = `${car.title} — ${R.formatPrice(car.price)} | ${R.state.site?.businessName || 'Alraffay Corporation & Traders'}`;
    const title = document.getElementById('carTitle');
    if (title) title.textContent = car.title;
    const crumb = document.getElementById('crumbTitle');
    if (crumb) crumb.textContent = car.title;
    const sub = document.getElementById('carSubtitle');
    if (sub) {
      sub.textContent = `${car.year} · ${R.formatMileage(car.mileage)} · ${car.fuel} · ${car.transmission}${car.engine ? ` · ${car.engine}` : ''}`;
    }
    const pills = document.getElementById('carPills');
    if (pills) {
      const status = R.statusMeta(car);
      pills.innerHTML = [
        `<span class="pill ${status.pill}">${status.label}</span>`,
        car.bodyType && `<span class="pill pill--outline">${R.escapeHtml(car.bodyType)}</span>`,
        car.color && `<span class="pill pill--outline">${R.escapeHtml(car.color)}</span>`,
        car.registrationCity && `<span class="pill pill--outline">${R.escapeHtml(car.registrationCity)}</span>`,
      ].filter(Boolean).join('');
    }
    const description = document.getElementById('carDescription');
    if (description) {
      description.textContent = car.description || 'Contact the owners for full details, condition report and a video walk-around of this car.';
    }
  }

  function renderShare() {
    const row = document.getElementById('shareRow');
    if (!row) return;
    const url = window.location.href;
    const text = `${car.title} — ${R.formatPrice(car.price)} at ${R.state.site?.businessName || 'Alraffay Corporation & Traders'}`;
    const site = R.state.site || {};
    row.innerHTML = `
      <a class="btn btn--whatsapp btn--sm" href="https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}" target="_blank" rel="noopener">${R.icon('whatsapp')} Share</a>
      <a class="btn btn--outline btn--sm" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener">Facebook</a>
      <button class="btn btn--outline btn--sm" type="button" id="copyLink">${R.icon('share')} Copy link</button>`;
    document.getElementById('copyLink')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        R.toast('Link copied — share it on WhatsApp.', 'ok');
      } catch {
        R.toast('Copy failed. You can copy the address bar instead.', 'error');
      }
    });
    if (!site.social) return;
  }

  function renderRelated(related) {
    const section = document.getElementById('relatedSection');
    const grid = document.getElementById('relatedGrid');
    if (!section || !grid || !related?.length) return;
    section.hidden = false;
    grid.innerHTML = related.map((entry) => R.carCard(entry)).join('');
    R.observeReveals(grid);
  }

  async function init() {
    const id = carId();
    try {
      const data = await R.api(`/api/cars/${encodeURIComponent(id)}`);
      car = data.car;
      images = car.images?.length ? car.images : ['/assets/img/showroom.jpg'];
      R.state.site = R.state.site || (await R.loadData()).site;
      R.renderFooterSocial();
      renderTitle();
      renderGallery();
      renderSpecs();
      renderPriceCard();
      renderShare();
      renderRelated(data.related);
      bindGallery();
      R.bindForm('carForm', 'carFormNote', { carId: car.id });
      const message = document.getElementById('cMessage');
      if (message) message.value = `Assalam o Alaikum, I am interested in the ${car.title} (${R.formatPrice(car.price)}). Please share more details.`;
    } catch (error) {
      const main = document.querySelector('.detail__main');
      if (main) {
        main.innerHTML = `<div class="empty-state"><strong>${R.escapeHtml(error.message)}</strong>
          <span>Browse the <a href="/cars">current stock</a> or call the showroom for help.</span></div>`;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
