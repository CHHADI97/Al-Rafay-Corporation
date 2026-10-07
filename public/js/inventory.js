/** Inventory page: filtering, sorting, pagination and URL state. */
import { api, on, state, t } from './core.js';
import { brandLabel } from './i18n.js';
import { carCardHtml, escapeHtml, formatNumber, icons, priceChip, skeletonCards } from './templates.js';

const PAGE_SIZE = 12;
const $ = (selector, root = document) => root.querySelector(selector);

const defaults = {
  q: '', brand: [], model: [], fuel: [], transmission: [], bodyType: [], status: [],
  minPrice: '', maxPrice: '', minYear: '', maxYear: '', sort: 'newest', page: 1,
};

let filters = { ...defaults };
let visible = PAGE_SIZE;

function readUrl() {
  const params = new URLSearchParams(location.search);
  const list = (key) => params.getAll(key).flatMap((value) => value.split(',')).filter(Boolean);
  filters = {
    q: params.get('q') || '',
    brand: list('brand'),
    model: list('model'),
    fuel: list('fuel'),
    transmission: list('transmission'),
    bodyType: list('bodyType'),
    status: list('status'),
    minPrice: params.get('minPrice') || '',
    maxPrice: params.get('maxPrice') || '',
    minYear: params.get('minYear') || '',
    maxYear: params.get('maxYear') || '',
    sort: params.get('sort') || 'newest',
  };
  visible = PAGE_SIZE;
}

function writeUrl() {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  for (const key of ['brand', 'model', 'fuel', 'transmission', 'bodyType', 'status']) {
    if (filters[key].length) params.set(key, filters[key].join(','));
  }
  for (const key of ['minPrice', 'maxPrice', 'minYear', 'maxYear']) {
    if (filters[key]) params.set(key, filters[key]);
  }
  if (filters.sort && filters.sort !== 'newest') params.set('sort', filters.sort);
  const query = params.toString();
  history.replaceState(null, '', query ? `/cars?${query}` : '/cars');
}

function matches(car) {
  if (filters.q) {
    const haystack = [car.titleEn, car.titleUr, car.brand, car.model, car.variant, car.colorEn, car.colorUr, car.year]
      .join(' ').toLowerCase();
    if (!haystack.includes(filters.q.toLowerCase())) return false;
  }
  if (filters.brand.length && !filters.brand.includes(car.brand)) return false;
  if (filters.model.length && !filters.model.includes(car.model)) return false;
  if (filters.fuel.length && !filters.fuel.includes(car.fuel)) return false;
  if (filters.transmission.length && !filters.transmission.includes(car.transmission)) return false;
  if (filters.bodyType.length && !filters.bodyType.includes(car.bodyType)) return false;
  if (filters.status.length && !filters.status.includes(car.status)) return false;
  if (filters.minPrice && car.price < Number(filters.minPrice)) return false;
  if (filters.maxPrice && car.price > Number(filters.maxPrice)) return false;
  if (filters.minYear && car.year < Number(filters.minYear)) return false;
  if (filters.maxYear && car.year > Number(filters.maxYear)) return false;
  return true;
}

function sortCars(cars) {
  const list = [...cars];
  switch (filters.sort) {
    case 'price-asc': return list.sort((a, b) => a.price - b.price);
    case 'price-desc': return list.sort((a, b) => b.price - a.price);
    case 'year-desc': return list.sort((a, b) => b.year - a.year);
    case 'mileage-asc': return list.sort((a, b) => a.mileageKm - b.mileageKm);
    case 'featured': return list.sort((a, b) => Number(b.featured) - Number(a.featured));
    default: return list;
  }
}

function countBy(cars, key) {
  const map = new Map();
  for (const car of cars) map.set(car[key], (map.get(car[key]) || 0) + 1);
  return map;
}

function checkboxGroup({ title, name, options, counts, selected }) {
  if (!options.length) return '';
  return `<div class="filters__group">
    <p class="filters__legend">${escapeHtml(title)}</p>
    <div class="check-list">
      ${options.map((option) => `
        <label class="check">
          <input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(option.value)}" ${selected.includes(option.value) ? 'checked' : ''} />
          <span>${escapeHtml(option.label)}</span>
          <span class="check__count">${counts?.get(option.value) ?? 0}</span>
        </label>`).join('')}
    </div>
  </div>`;
}

function renderFilters(pool) {
  const host = $('#filters-body');
  if (!host) return;
  const brandCounts = countBy(pool, 'brand');
  const brands = [...brandCounts.keys()].sort((a, b) => brandCounts.get(b) - brandCounts.get(a));
  const models = [...new Set(pool.filter((car) => !filters.brand.length || filters.brand.includes(car.brand)).map((car) => car.model))].sort();
  const modelCounts = countBy(pool, 'model');
  const fuels = [...new Set(pool.map((car) => car.fuel))];
  const transmissions = [...new Set(pool.map((car) => car.transmission))];
  const bodies = [...new Set(pool.map((car) => car.bodyType))];
  const years = pool.map((car) => car.year);
  const prices = pool.map((car) => car.price);

  host.innerHTML = [
    checkboxGroup({
      title: t('inventory.company'), name: 'brand', counts: brandCounts, selected: filters.brand,
      options: brands.map((brand) => ({ value: brand, label: brandLabel(state.lang, brand) })),
    }),
    models.length > 1 ? checkboxGroup({
      title: t('inventory.model'), name: 'model', counts: modelCounts, selected: filters.model,
      options: models.map((model) => ({ value: model, label: model })),
    }) : '',
    `<div class="filters__group">
      <p class="filters__legend">${escapeHtml(t('inventory.priceRange'))}</p>
      <div class="range-row">
        <input class="select" style="flex:1" type="number" inputmode="numeric" name="minPrice" placeholder="${escapeHtml(priceChip(Math.min(...prices), state.lang))}" value="${escapeHtml(filters.minPrice)}" />
        <span>—</span>
        <input class="select" style="flex:1" type="number" inputmode="numeric" name="maxPrice" placeholder="${escapeHtml(priceChip(Math.max(...prices), state.lang))}" value="${escapeHtml(filters.maxPrice)}" />
      </div>
      <div class="pill-row" style="margin-top:10px">
        <button class="chip chip--crimson chip-remove" type="button" data-price-range="0-2000000">&lt; 20 Lac</button>
        <button class="chip chip--crimson chip-remove" type="button" data-price-range="2000000-4000000">20 – 40 Lac</button>
        <button class="chip chip--crimson chip-remove" type="button" data-price-range="4000000-8000000">40 – 80 Lac</button>
        <button class="chip chip--crimson chip-remove" type="button" data-price-range="8000000-25000000">80 Lac +</button>
      </div>
    </div>`,
    `<div class="filters__group">
      <p class="filters__legend">${escapeHtml(t('inventory.yearRange'))}</p>
      <div class="range-row">
        <input class="select" style="flex:1" type="number" inputmode="numeric" name="minYear" placeholder="${Math.min(...years)}" value="${escapeHtml(filters.minYear)}" />
        <span>—</span>
        <input class="select" style="flex:1" type="number" inputmode="numeric" name="maxYear" placeholder="${Math.max(...years)}" value="${escapeHtml(filters.maxYear)}" />
      </div>
    </div>`,
    checkboxGroup({
      title: t('inventory.fuelType'), name: 'fuel', counts: countBy(pool, 'fuel'), selected: filters.fuel,
      options: fuels.map((fuel) => ({ value: fuel, label: t(`fuel.${fuel}`) })),
    }),
    checkboxGroup({
      title: t('inventory.gearbox'), name: 'transmission', counts: countBy(pool, 'transmission'), selected: filters.transmission,
      options: transmissions.map((value) => ({ value, label: t(`transmission.${value}`) })),
    }),
    checkboxGroup({
      title: t('inventory.bodyType'), name: 'bodyType', counts: countBy(pool, 'bodyType'), selected: filters.bodyType,
      options: bodies.map((value) => ({ value, label: t(`body.${value}`) })),
    }),
    checkboxGroup({
      title: t('inventory.statusFilter'), name: 'status', counts: countBy(pool, 'status'), selected: filters.status,
      options: [
        { value: 'available', label: t('common.available') },
        { value: 'sold', label: t('common.sold') },
      ],
    }),
  ].join('');
}

function activeChips() {
  const host = $('#active-filters');
  if (!host) return;
  const chips = [];
  if (filters.q) chips.push({ key: 'q', label: `“${filters.q}”` });
  for (const key of ['brand', 'model', 'fuel', 'transmission', 'bodyType', 'status']) {
    for (const value of filters[key]) {
      const label = key === 'brand' ? brandLabel(state.lang, value)
        : key === 'fuel' ? t(`fuel.${value}`)
          : key === 'transmission' ? t(`transmission.${value}`)
            : key === 'bodyType' ? t(`body.${value}`)
              : key === 'status' ? (value === 'available' ? t('common.available') : t('common.sold'))
                : value;
      chips.push({ key, value, label });
    }
  }
  if (filters.minPrice || filters.maxPrice) {
    chips.push({ key: 'price', label: `${filters.minPrice ? priceChip(filters.minPrice, state.lang) : '0'} – ${filters.maxPrice ? priceChip(filters.maxPrice, state.lang) : '∞'}` });
  }
  if (filters.minYear || filters.maxYear) {
    chips.push({ key: 'year', label: `${filters.minYear || '…'} – ${filters.maxYear || '…'}` });
  }
  host.innerHTML = chips.map((chip) => `
    <span class="chip chip--crimson">${escapeHtml(chip.label)}
      <button class="chip-remove" type="button" data-remove="${escapeHtml(chip.key)}" data-value="${escapeHtml(chip.value || '')}" aria-label="${escapeHtml(t('common.remove'))}">${icons.close}</button>
    </span>`).join('');
  if (chips.length) {
    host.innerHTML += `<button class="chip chip--muted chip-remove" type="button" data-clear="1">${icons.close}${escapeHtml(t('inventory.clearAll'))}</button>`;
  }
}

function renderResults(pool) {
  const grid = $('#inventory-grid');
  const count = $('#result-count');
  const more = $('#load-more');
  if (!grid) return;
  const filtered = sortCars(pool.filter(matches));
  const slice = filtered.slice(0, visible);
  if (count) {
    count.innerHTML = t('inventory.showing', { count: `<strong>${formatNumber(slice.length)}</strong>`, total: `<strong>${formatNumber(filtered.length)}</strong>` });
  }
  grid.innerHTML = slice.length
    ? slice.map((car) => carCardHtml(car, state.lang)).join('')
    : `<div class="empty-state">${icons.car}<p>${escapeHtml(t('common.noResults'))}</p><button class="btn btn-outline" type="button" data-clear="1">${escapeHtml(t('common.reset'))}</button></div>`;
  if (more) {
    more.hidden = filtered.length <= slice.length;
    more.textContent = t('inventory.loadMore');
  }
}

function render() {
  const pool = state.cars;
  renderFilters(pool);
  activeChips();
  renderResults(pool);
}

function updateFilters(patch, { rerenderFilters = false } = {}) {
  filters = { ...filters, ...patch };
  visible = PAGE_SIZE;
  writeUrl();
  if (rerenderFilters) renderFilters(state.cars);
  activeChips();
  renderResults(state.cars);
}

function toggleValue(key, value, checked) {
  const set = new Set(filters[key]);
  if (checked) set.add(value); else set.delete(value);
  updateFilters({ [key]: [...set] }, { rerenderFilters: key === 'brand' });
}

function bindUi() {
  const filtersBody = $('#filters-body');
  filtersBody?.addEventListener('change', (event) => {
    const input = event.target;
    if (input.type === 'checkbox') {
      toggleValue(input.name, input.value, input.checked);
      return;
    }
    if (input.name === 'minPrice' || input.name === 'maxPrice' || input.name === 'minYear' || input.name === 'maxYear') {
      updateFilters({ [input.name]: input.value });
    }
  });
  filtersBody?.addEventListener('click', (event) => {
    const range = event.target.closest('[data-price-range]');
    if (!range) return;
    const [min, max] = range.dataset.priceRange.split('-');
    updateFilters({ minPrice: min === '0' ? '' : min, maxPrice: max });
  });

  const search = $('#inventory-search');
  let debounce = 0;
  search?.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => updateFilters({ q: search.value.trim() }), 220);
  });

  const sort = $('#inventory-sort');
  sort?.addEventListener('change', () => updateFilters({ sort: sort.value }));

  const toggle = $('#filters-toggle');
  toggle?.addEventListener('click', () => {
    const panel = $('#filters');
    panel?.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(panel?.classList.contains('is-open')));
  });

  const more = $('#load-more');
  more?.addEventListener('click', () => {
    visible += PAGE_SIZE;
    renderResults(state.cars);
    if (typeof more.focus === 'function') more.focus();
  });

  document.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      const key = remove.dataset.remove;
      const value = remove.dataset.value;
      if (key === 'q') updateFilters({ q: '' });
      else if (key === 'price') updateFilters({ minPrice: '', maxPrice: '' });
      else if (key === 'year') updateFilters({ minYear: '', maxYear: '' });
      else if (value) toggleValue(key, value, false);
      return;
    }
    const clear = event.target.closest('[data-clear]');
    if (clear) {
      filters = { ...defaults, sort: filters.sort };
      visible = PAGE_SIZE;
      writeUrl();
      render();
      const search = $('#inventory-search');
      if (search) search.value = '';
    }
  });
}

export async function renderPage() {
  const grid = $('#inventory-grid');
  if (grid && !state.cars.length) grid.innerHTML = skeletonCards(6);
  if (!state.cars.length) {
    const payload = await api.get('/api/cars').catch(() => ({ cars: [] }));
    state.cars = payload.cars || [];
  }
  readUrl();
  const search = $('#inventory-search');
  if (search) search.value = filters.q;
  const sort = $('#inventory-sort');
  if (sort) sort.value = filters.sort;
  render();
}

export function init() {
  bindUi();
  on('lang', () => {
    render();
    const sort = $('#inventory-sort');
    if (sort) sort.value = filters.sort;
  });
  renderPage().catch((error) => console.error(error));
}
