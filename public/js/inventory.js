/* ==========================================================================
   inventory.js — search, filters, sorting and pagination on /cars
   ========================================================================== */
(function () {
  'use strict';
  const R = window.Rafay;
  const PAGE_SIZE = 9;
  let allCars = [];
  let visible = PAGE_SIZE;

  const form = () => document.getElementById('filterForm');
  const controls = () => ['q', 'make', 'model', 'minPrice', 'maxPrice', 'minYear', 'maxYear', 'status', 'sort']
    .map((name) => document.querySelector(`#filterForm [name="${name}"]`))
    .filter(Boolean);

  function readFilters() {
    const values = {};
    for (const control of controls()) {
      if (control.value) values[control.name] = control.value;
    }
    return values;
  }

  function writeFilters(values) {
    for (const control of controls()) {
      control.value = values[control.name] || '';
    }
  }

  function filtersFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const values = {};
    for (const control of controls()) {
      const value = params.get(control.name);
      if (value) values[control.name] = value;
    }
    return values;
  }

  function filtersToUrl(values) {
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const query = params.toString();
    window.history.replaceState(null, '', query ? `/cars?${query}` : '/cars');
  }

  function filterCars(values) {
    const query = (values.q || '').trim().toLowerCase();
    const minPrice = Number(values.minPrice) || 0;
    const maxPrice = Number(values.maxPrice) || 0;
    const minYear = Number(values.minYear) || 0;
    const maxYear = Number(values.maxYear) || 0;

    let list = allCars.filter((car) => {
      if (values.make && car.make !== values.make) return false;
      if (values.model && car.model !== values.model) return false;
      if (values.status && (car.status || 'available') !== values.status) return false;
      if (minPrice && Number(car.price) < minPrice) return false;
      if (maxPrice && Number(car.price) > maxPrice) return false;
      if (minYear && Number(car.year) < minYear) return false;
      if (maxYear && Number(car.year) > maxYear) return false;
      if (query) {
        const haystack = [car.title, car.make, car.model, car.variant, car.color, car.bodyType, car.registrationCity, car.year]
          .join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    const sorters = {
      newest: (a, b) => Number(b.year) - Number(a.year),
      oldest: (a, b) => Number(a.year) - Number(b.year),
      'price-asc': (a, b) => Number(a.price) - Number(b.price),
      'price-desc': (a, b) => Number(b.price) - Number(a.price),
      'mileage-asc': (a, b) => Number(a.mileage) - Number(b.mileage),
      name: (a, b) => String(a.title).localeCompare(String(b.title)),
    };
    if (sorters[values.sort]) list = [...list].sort(sorters[values.sort]);
    else list = [...list.filter((car) => car.featured), ...list.filter((car) => !car.featured)];
    return list;
  }

  function renderChips(values) {
    const holder = document.getElementById('activeFilters');
    if (!holder) return;
    const labels = {
      q: 'Search', make: 'Make', model: 'Model', minPrice: 'Min price', maxPrice: 'Max price',
      minYear: 'From year', maxYear: 'To year', status: 'Status', sort: 'Sort',
    };
    const entries = Object.entries(values).filter(([key]) => labels[key]);
    holder.innerHTML = entries.map(([key, value]) => {
      let shown = value;
      if (key === 'minPrice' || key === 'maxPrice') shown = R.formatPrice(value);
      if (key === 'status') shown = value === 'available' ? 'Available' : value === 'sold' ? 'Sold' : 'Booked';
      if (key === 'sort') shown = document.querySelector(`#filterForm [name="sort"] option[value="${value}"]`)?.textContent || value;
      return `<span class="chip-filter">${R.escapeHtml(labels[key])}: ${R.escapeHtml(shown)}
        <button type="button" data-clear="${key}" aria-label="Remove ${R.escapeHtml(labels[key])} filter">&times;</button></span>`;
    }).join('');
    holder.querySelectorAll('[data-clear]').forEach((button) => {
      button.addEventListener('click', () => {
        const control = document.querySelector(`#filterForm [name="${button.dataset.clear}"]`);
        if (control) control.value = '';
        apply();
      });
    });
  }

  function render() {
    const values = readFilters();
    const matches = filterCars(values);
    const grid = document.getElementById('carGrid');
    const empty = document.getElementById('emptyState');
    const more = document.getElementById('loadMore');
    const count = document.getElementById('inventoryCount');
    const summary = document.getElementById('resultSummary');

    const page = matches.slice(0, visible);
    grid.innerHTML = page.map((car, index) => R.carCard(car, { priority: index < 3 })).join('');
    R.observeReveals(grid);
    empty.hidden = matches.length > 0;
    more.hidden = matches.length <= visible;
    if (more.hidden) more.textContent = 'Load more cars';
    else more.textContent = `Load more cars (${matches.length - visible} left)`;

    count.textContent = matches.length
      ? `Showing ${page.length} of ${matches.length} cars`
      : 'No cars found';

    if (summary) {
      const available = matches.filter((car) => (car.status || 'available') === 'available').length;
      summary.textContent = matches.length
        ? `${available} available now out of ${matches.length} matching cars — updated live from the showroom.`
        : 'No cars match your search right now — try clearing a filter.';
    }
    renderChips(values);
  }

  function apply({ resetPage = true } = {}) {
    if (resetPage) visible = PAGE_SIZE;
    const values = readFilters();
    filtersToUrl(values);
    render();
  }

  function fillSelectors(data) {
    const make = document.getElementById('fMake');
    const model = document.getElementById('fModel');
    const minYear = document.getElementById('fMinYear');
    const maxYear = document.getElementById('fMaxYear');
    const facets = data.facets || [];
    const values = readFilters();

    make.insertAdjacentHTML('beforeend', facets.map((entry) =>
      `<option value="${R.escapeHtml(entry.make)}">${R.escapeHtml(entry.make)} (${entry.count})</option>`).join(''));

    const fillModels = () => {
      const facet = facets.find((entry) => entry.make === make.value);
      model.innerHTML = '<option value="">All models</option>' + (facet
        ? facet.models.map((entry) => `<option value="${R.escapeHtml(entry.model)}">${R.escapeHtml(entry.model)} (${entry.count})</option>`).join('')
        : '');
    };
    fillModels();

    const years = [...new Set(allCars.map((car) => Number(car.year)).filter(Boolean))].sort((a, b) => b - a);
    minYear.insertAdjacentHTML('beforeend', years.map((value) => `<option value="${value}">${value}</option>`).join(''));
    maxYear.insertAdjacentHTML('beforeend', years.map((value) => `<option value="${value}">${value}</option>`).join(''));

    writeFilters({ ...values });
    if (values.make) fillModels();
    make.addEventListener('change', () => {
      model.value = '';
      fillModels();
      apply();
    });
  }

  async function init() {
    const grid = document.getElementById('carGrid');
    try {
      const data = await R.loadData();
      allCars = data.cars;
      R.renderFooterSocial();
      fillSelectors(data);
      writeFilters(filtersFromUrl());
      apply();

      controls().forEach((control) => {
        const event = control.tagName === 'SELECT' ? 'change' : 'input';
        let timer = null;
        control.addEventListener(event, () => {
          if (event === 'input') {
            clearTimeout(timer);
            timer = setTimeout(() => apply(), 260);
          } else {
            apply();
          }
        });
      });

      const formElement = form();
      formElement?.addEventListener('submit', (event) => { event.preventDefault(); apply(); });

      document.getElementById('clearFilters')?.addEventListener('click', () => {
        writeFilters({});
        document.getElementById('fModel').innerHTML = '<option value="">All models</option>';
        apply();
      });

      document.getElementById('loadMore')?.addEventListener('click', () => {
        visible += PAGE_SIZE;
        render();
      });

      const toggle = document.getElementById('filtersToggle');
      const panel = document.getElementById('filterPanel');
      toggle?.addEventListener('click', () => {
        const open = panel.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
        if (open) R.scrollToEl(panel);
      });

      R.startPolling(() => { loadCarsOnly(); });
    } catch (error) {
      grid.innerHTML = '<p class="empty-state"><strong>Could not load the inventory.</strong><span>Please refresh the page or call the showroom.</span></p>';
    }
  }

  async function loadCarsOnly() {
    try {
      const data = await R.api('/api/cars');
      allCars = data.cars;
      apply({ resetPage: false });
    } catch { /* keep the current list */ }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
