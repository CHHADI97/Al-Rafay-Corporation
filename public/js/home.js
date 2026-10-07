/* ==========================================================================
   home.js — hero car lane, featured stock, brands, stats and home sections
   ========================================================================== */
(function () {
  'use strict';
  const R = window.Rafay;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------- hero car lane ---
     Cars drive across the showroom floor one after another, in a seamless
     loop. Each car owns its own travel distance and duration, so the gaps
     between them vary the way real traffic does.                                */
  const LANE_CARS = [
    { slug: 'mehran', label: 'Suzuki Mehran', size: 21, dur: 21, delay: 0 },
    { slug: 'alto', label: 'Suzuki Alto', size: 19, dur: 24, delay: 2.6 },
    { slug: 'cultus', label: 'Suzuki Cultus', size: 23, dur: 22, delay: 5.4 },
    { slug: 'corolla', label: 'Toyota Corolla', size: 26, dur: 20, delay: 8.2 },
    { slug: 'yaris', label: 'Toyota Yaris', size: 24, dur: 23, delay: 11 },
    { slug: 'wagonr', label: 'Suzuki Wagon R', size: 21, dur: 25, delay: 13.8 },
    { slug: 'city', label: 'Honda City', size: 25, dur: 21, delay: 16.6 },
    { slug: 'civic', label: 'Honda Civic', size: 27, dur: 24, delay: 19.4 },
    { slug: 'prado', label: 'Toyota Prado', size: 25, dur: 22, delay: 22.2 },
    { slug: 'hilux', label: 'Toyota Hilux', size: 26, dur: 26, delay: 25 },
  ];

  function buildLane() {
    const track = document.getElementById('laneTrack');
    if (!track) return;
    const narrow = window.innerWidth < 760;
    const saveData = Boolean(navigator.connection && navigator.connection.saveData);
    const limit = reduceMotion ? 3 : narrow ? 5 : saveData ? 6 : LANE_CARS.length;
    // Phones show fewer cars, so scale each one up to stay readable.
    const scale = narrow ? 1.7 : 1;
    const cars = LANE_CARS.slice(0, limit);

    if (reduceMotion) {
      track.innerHTML = cars.map((car, index) => `
        <figure class="lane__car" style="left: ${8 + index * 30}%; width: ${(car.size * scale).toFixed(1)}vw">
          <figcaption>${R.escapeHtml(car.label)}</figcaption>
          <img src="/assets/img/hero/${car.slug}.webp" alt="" width="900" height="500" decoding="async">
        </figure>`).join('');
      return;
    }

    track.innerHTML = cars.map((car) => {
      const size = car.size * scale;
      const exit = -(size + 14);
      return `
        <figure class="lane__car" style="--w:${size.toFixed(1)}vw; --dur:${car.dur}s; --delay:${car.delay}s; --from:112vw; --to:${exit.toFixed(1)}vw">
          <figcaption>${R.escapeHtml(car.label.split(' ')[0])} <strong>${R.escapeHtml(car.label.split(' ').slice(1).join(' '))}</strong></figcaption>
          <img src="/assets/img/hero/${car.slug}.webp" alt="" width="900" height="500" decoding="async" loading="eager">
        </figure>`;
    }).join('');
  }

  /* ------------------------------------------------------------ parallax --- */
  function bindParallax() {
    if (reduceMotion || window.innerWidth < 760) return;
    const hero = document.getElementById('hero');
    const lane = document.getElementById('heroLane');
    const inner = hero?.querySelector('.hero__inner');
    if (!hero || !lane || !inner) return;
    let ticking = false;
    const update = () => {
      const offset = Math.min(window.scrollY, window.innerHeight);
      if (offset > window.innerHeight * 1.1) { ticking = false; return; }
      lane.style.transform = `translate3d(0, ${offset * 0.05}px, 0)`;
      inner.style.transform = `translate3d(0, ${offset * -0.05}px, 0)`;
      inner.style.opacity = String(Math.max(0, 1 - offset / (window.innerHeight * 0.85)));
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
  }

  /* ----------------------------------------------------- hero data fills --- */
  function fillHero(data) {
    const count = document.getElementById('heroStockCount');
    if (count) {
      const available = data.cars.filter((car) => (car.status || 'available') === 'available').length;
      count.textContent = `${available}+`;
    }

    const make = document.getElementById('qsMake');
    const model = document.getElementById('qsModel');
    const year = document.getElementById('qsYear');
    if (!make || !model || !year) return;

    const facets = data.facets || [];
    make.insertAdjacentHTML('beforeend', facets.map((entry) =>
      `<option value="${R.escapeHtml(entry.make)}">${R.escapeHtml(entry.make)} (${entry.count})</option>`).join(''));

    const fillModels = (selected = '') => {
      const facet = facets.find((entry) => entry.make === make.value);
      model.innerHTML = '<option value="">Any model</option>' + (facet
        ? facet.models.map((entry) => `<option value="${R.escapeHtml(entry.model)}"${entry.model === selected ? ' selected' : ''}>${R.escapeHtml(entry.model)} (${entry.count})</option>`).join('')
        : '');
      model.disabled = !facet;
    };
    make.addEventListener('change', () => fillModels());
    fillModels();

    const years = [...new Set(data.cars.map((car) => Number(car.year)).filter(Boolean))].sort((a, b) => b - a);
    year.insertAdjacentHTML('beforeend', years.map((value) => `<option value="${value}">${value} or newer</option>`).join(''));
  }

  /* ---------------------------------------------------------- home blocks --- */
  function renderFeatured(data) {
    const grid = document.getElementById('featuredGrid');
    if (!grid) return;
    const featured = data.cars.filter((car) => car.featured && (car.status || 'available') !== 'sold');
    const fallback = data.cars.filter((car) => (car.status || 'available') === 'available');
    const picks = (featured.length ? featured : fallback).slice(0, 6);
    if (!picks.length) {
      grid.innerHTML = '<p class="empty-state"><strong>Stock is being updated.</strong><span>Please call the showroom for today&rsquo;s cars.</span></p>';
      return;
    }
    grid.innerHTML = picks.map((car, index) => R.carCard(car, { priority: index < 3 })).join('');
    if (picks.length > 3 && window.innerWidth <= 720) grid.classList.add('is-scroll');
    R.observeReveals(grid);
  }

  function renderBrands(data) {
    const grid = document.getElementById('brandGrid');
    const models = document.getElementById('brandModels');
    const facets = data.facets || [];
    if (grid) {
      grid.innerHTML = facets.map((entry, index) => `
        <a class="brand-tile reveal" data-delay="${index % 4}" href="/cars?make=${encodeURIComponent(entry.make)}">
          <span class="brand-tile__name">${R.escapeHtml(entry.make)}</span>
          <span class="brand-tile__count">${entry.count} car${entry.count === 1 ? '' : 's'} in stock</span>
          <span class="brand-tile__from">${entry.from ? `From ${R.formatPrice(entry.from)}` : 'Call for price'}</span>
        </a>`).join('');
    }
    if (models) {
      const popular = [];
      facets.forEach((entry) => entry.models.slice(0, 4).forEach((model) => popular.push({ make: entry.make, ...model })));
      models.innerHTML = popular.slice(0, 16).map((entry) => `
        <a href="/cars?make=${encodeURIComponent(entry.make)}&model=${encodeURIComponent(entry.model)}">
          ${R.escapeHtml(entry.make)} ${R.escapeHtml(entry.model)} <span>(${entry.count})</span>
        </a>`).join('');
    }
  }

  /* ------------------------------------------------------------ bootstrap --- */
  async function init() {
    buildLane();
    bindParallax();

    try {
      const data = await R.loadData();
      fillHero(data);
      renderFeatured(data);
      renderBrands(data);
      R.renderWhyUs();
      R.renderStats(data.cars);
      R.renderOwners();
      R.renderFooterSocial();
      R.renderMap();
      R.bindForm('contactForm', 'formNote');
      R.observeReveals();
      R.startPolling(() => {
        renderFeatured(data);
        renderBrands(data);
        R.renderStats(data.cars);
      });
    } catch (error) {
      R.toast('Could not load live stock right now. Please refresh.', 'error');
      const grid = document.getElementById('featuredGrid');
      if (grid) {
        grid.innerHTML = '<p class="empty-state"><strong>Live stock unavailable.</strong><span>Please call the showroom — the numbers are in the header.</span></p>';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
