/**
 * Admin dashboard.
 *
 *  • Supabase configured  → Google sign-in through Supabase Auth. The access
 *    token is sent with every request and row level security decides.
 *  • No Supabase          → offline demo mode with a local password.
 *
 * Everything on the website (cars, photos, prices, contact details, map, logo,
 * admin email) is editable from here.
 */
const root = document.getElementById('admin-root');
const NONCE = document.querySelector('meta[name="csp-nonce"]')?.content || '';

const state = {
  mode: 'demo',
  config: null,
  site: null,
  me: null,
  cars: [],
  messages: [],
  overview: null,
  view: 'dashboard',
  editing: null,
  carQuery: '',
  carFilter: 'all',
  listTab: 'owners',
  busy: false,
  supabase: null,
};

/* --------------------------------------------------------------- helpers --- */
const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const icon = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>',
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 16.5h14M4.5 16.5V12l2-5h11l2 5v4.5"/><circle cx="7.5" cy="17.8" r="1.6"/><circle cx="16.5" cy="17.8" r="1.6"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.8-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.8 1.8l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21.4 11a2 2 0 1 1 0 4Z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8.5" r="3.5"/><path d="M2.8 20a6.5 6.5 0 0 1 12.4 0M16 5.2a3.5 3.5 0 0 1 0 6.6M17.5 20a6.4 6.4 0 0 0-2-4.6"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/><path d="M8 7.5h8M8 11h5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20h4L20 8l-4-4L4 16Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m12 4 2.4 5 5.5.8-4 3.9.9 5.5-4.8-2.6-4.8 2.6.9-5.5-4-3.9 5.5-.8Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4.5 12.5 9 17l10.5-10.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M15 12H4M8 8l-4 4 4 4M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  google: '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v8.1h12.5c-.3 2.1-1.6 5.2-4.6 7.3l7.6 5.9c4.5-4.2 6.6-10.3 6.6-17.2Z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.4 0 20.1 0 24s1 7.6 2.6 10.8l7.8-6.1Z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.6-5.8l-7.6-5.9c-2 1.4-4.8 2.4-8 2.4-6.4 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48Z"/></svg>',
};

function toast(message, type = 'info') {
  const stack = document.querySelector('.toast-stack');
  const node = document.createElement('div');
  node.className = `toast${type === 'error' ? ' toast--error' : ''}`;
  node.textContent = message;
  stack.append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .3s ease';
    setTimeout(() => node.remove(), 320);
  }, 3200);
}

/* ------------------------------------------------------------- supabase --- */
async function getSupabase() {
  if (state.supabase) return state.supabase;
  if (!state.config?.supabase) return null;
  if (!window.supabase) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/js/vendor/supabase.js';
      script.nonce = NONCE;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load the Supabase client'));
      document.head.append(script);
    });
  }
  state.supabase = window.supabase.createClient(state.config.supabase.url, state.config.supabase.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  return state.supabase;
}

async function accessToken() {
  if (state.config?.mode !== 'supabase') return null;
  const client = await getSupabase();
  const { data } = await client.auth.getSession();
  return data.session?.access_token || null;
}

/* -------------------------------------------------------------- api ------- */
async function api(path, { method = 'GET', body, formData } = {}) {
  const token = await accessToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    method,
    headers,
    body: formData ? formData : body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function loadData() {
  const [overview, cars, messages, site, adminSettings] = await Promise.all([
    api('/api/admin/overview'),
    api('/api/admin/cars'),
    api('/api/admin/messages'),
    api('/api/site'),
    api('/api/admin/settings'),
  ]);
  state.overview = overview;
  state.cars = cars.cars || [];
  state.messages = messages.messages || [];
  state.site = { ...site, settings: { ...site.settings, ...(adminSettings.settings || {}) } };
}

/** Reloads only the editable content (settings, owners, lists). */
async function loadSite() {
  const [site, adminSettings] = await Promise.all([api('/api/site'), api('/api/admin/settings')]);
  state.site = { ...site, settings: { ...site.settings, ...(adminSettings.settings || {}) } };
}

/* --------------------------------------------------------------- views ---- */
function loginView() {
  const supabaseMode = state.config?.mode === 'supabase';
  return `<div class="login">
    <div class="login__card">
      <img class="login__logo" src="/assets/img/logo-placeholder.svg" alt="97 Group" width="74" height="74" />
      <h1>Al Rafay admin panel</h1>
      <p>${supabaseMode
        ? 'Sign in with the owner Google account. Only the email saved in Settings → Access can open this panel.'
        : 'Offline demo mode — sign in with the demo password, then connect Supabase to switch to Google sign-in.'}</p>
      ${supabaseMode
        ? `<button class="login__google" type="button" data-action="google-signin">${icon.google}<span>Continue with Google</span></button>`
        : `<form data-demo-login>
            <div class="field" style="margin-top:16px">
              <label for="demo-password">Dashboard password</label>
              <input id="demo-password" name="password" type="password" autocomplete="current-password" required />
            </div>
            <button class="btn btn-primary btn-block" type="submit">Sign in</button>
          </form>
          <p class="login__hint">The default demo password is <code>alrafay123</code> — change it with the <code>DEMO_ADMIN_PASSWORD</code> environment variable.</p>`}
      <p class="login__hint"><a href="/">← Back to the website</a></p>
    </div>
  </div>`;
}

function sidebarView() {
  const badge = state.overview?.messages?.unread || 0;
  const links = [
    ['dashboard', 'Dashboard', icon.dashboard],
    ['cars', 'Cars', icon.car],
    ['messages', 'Enquiries', icon.mail, badge],
    ['content', 'Owners & sections', icon.users],
    ['settings', 'Site settings', icon.settings],
    ['guide', 'Setup guide', icon.book],
  ];
  return `<aside class="sidebar" id="admin-sidebar">
    <div class="sidebar__brand">
      <img src="${esc(state.site?.settings?.logoUrl || '/assets/img/logo-placeholder.svg')}" alt="97 Group" />
      <span>
        <strong>${esc(state.site?.settings?.shortName || 'Al Rafay')} admin</strong>
        <span>${state.mode === 'supabase' ? 'Google sign-in' : 'Demo mode'}</span>
      </span>
    </div>
    ${links.map(([key, label, svg, count]) => `
      <button class="side-link${state.view === key ? ' is-active' : ''}" type="button" data-action="nav" data-view="${key}">
        ${svg}<span>${label}</span>${count ? `<span class="side-link__badge">${count}</span>` : ''}
      </button>`).join('')}
    <div class="sidebar__foot">
      <a class="btn btn-outline btn-sm" href="/" target="_blank" rel="noopener">${icon.eye} View website</a>
      <button class="btn btn-ghost btn-sm" type="button" data-action="signout">${icon.logout} Sign out</button>
      ${state.me?.email ? `<span style="font-size:.76rem;color:var(--slate-400);word-break:break-all">${esc(state.me.email)}</span>` : ''}
    </div>
  </aside>`;
}

function dashboardView() {
  const overview = state.overview || { cars: {}, messages: {} };
  const cars = overview.cars || {};
  return `
    <div class="stat-grid">
      ${[['Total cars', cars.total], ['Available', cars.available], ['Sold', cars.sold], ['Featured', cars.featured], ['Photos', cars.photos], ['New enquiries', overview.messages?.unread]]
        .map(([label, value]) => `<div class="stat-card"><div class="stat-card__value">${Number(value || 0)}</div><div class="stat-card__label">${label}</div></div>`).join('')}
    </div>
    <div class="card">
      <div class="card__head">
        <div><h2>Latest enquiries</h2><p>Messages sent from the website contact form.</p></div>
        <div class="card__actions"><button class="btn btn-outline btn-sm" type="button" data-action="nav" data-view="messages">Open inbox</button></div>
      </div>
      ${(overview.recentMessages || []).length ? (overview.recentMessages || []).map(messageRow).join('') : '<div class="empty">No enquiries yet.</div>'}
    </div>
    <div class="card">
      <div class="card__head">
        <div><h2>Quick actions</h2><p>Everything on the website comes from this dashboard.</p></div>
      </div>
      <div class="toolbar" style="margin:0">
        <button class="btn btn-primary" type="button" data-action="car-new">${icon.plus} Add a car</button>
        <button class="btn btn-outline" type="button" data-action="nav" data-view="settings">${icon.settings} Site settings</button>
        <button class="btn btn-outline" type="button" data-action="nav" data-view="content">${icon.users} Owners &amp; sections</button>
      </div>
      ${state.mode !== 'supabase' ? '<div class="note note--warn" style="margin-top:16px">This installation is running in <strong>offline demo mode</strong> (data is kept in the <code>storage/</code> folder). Add <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> to go live with Google sign-in and cloud storage.</div>' : ''}
    </div>`;
}

function carsView() {
  const query = state.carQuery.toLowerCase();
  const cars = state.cars.filter((car) => {
    if (state.carFilter === 'available' && car.status !== 'available') return false;
    if (state.carFilter === 'sold' && car.status !== 'sold') return false;
    if (state.carFilter === 'featured' && !car.featured) return false;
    if (!query) return true;
    return [car.titleEn, car.titleUr, car.brand, car.model, car.slug].join(' ').toLowerCase().includes(query);
  });
  return `
    <div class="card">
      <div class="card__head">
        <div><h2>Inventory (${state.cars.length})</h2><p>Add cars, change prices, upload photos and mark cars as sold.</p></div>
        <div class="card__actions"><button class="btn btn-primary btn-sm" type="button" data-action="car-new">${icon.plus} Add car</button></div>
      </div>
      <div class="toolbar">
        <input type="search" placeholder="Search cars…" value="${esc(state.carQuery)}" data-input="car-query" />
        <select data-input="car-filter" aria-label="Filter cars">
          ${[['all', 'All cars'], ['available', 'Available'], ['sold', 'Sold'], ['featured', 'Featured']]
            .map(([value, label]) => `<option value="${value}"${state.carFilter === value ? ' selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      <div class="list">
        ${cars.length ? cars.map(carRow).join('') : '<div class="empty">No cars match this search.</div>'}
      </div>
    </div>`;
}

function carRow(car) {
  const cover = car.images?.[0]?.url || '/assets/img/placeholder-car.svg';
  return `<div class="row">
    <img class="row__thumb" src="${esc(cover)}" alt="" loading="lazy" />
    <div>
      <p class="row__title">${esc(car.titleEn)} <span style="color:var(--slate-400);font-weight:500">${esc(car.year)}</span></p>
      <div class="row__meta">
        <span>PKR ${Number(car.price).toLocaleString('en-PK')}</span>
        <span>· ${Number(car.mileageKm).toLocaleString('en-PK')} km</span>
        <span>· ${esc(car.brand)} ${esc(car.model)}</span>
        <span>· ${car.images?.length || 0} photos</span>
      </div>
      <div class="row__meta" style="margin-top:6px">
        <span class="pill ${car.status === 'sold' ? 'pill--sold' : 'pill--ok'}">${car.status === 'sold' ? 'Sold' : 'Available'}</span>
        ${car.featured ? '<span class="pill pill--featured">Featured</span>' : ''}
        ${car.published === false ? '<span class="pill">Hidden</span>' : ''}
      </div>
    </div>
    <div class="row__actions">
      <button class="icon-btn${car.featured ? ' is-on' : ''}" type="button" title="Feature on home page" data-action="car-toggle" data-slug="${esc(car.slug)}" data-field="featured">${icon.star}</button>
      <button class="icon-btn" type="button" title="${car.status === 'sold' ? 'Mark available' : 'Mark sold'}" data-action="car-toggle" data-slug="${esc(car.slug)}" data-field="status">${icon.check}</button>
      <button class="icon-btn" type="button" title="Edit" data-action="car-edit" data-slug="${esc(car.slug)}">${icon.edit}</button>
      <button class="icon-btn" type="button" title="Delete" data-action="car-delete" data-slug="${esc(car.slug)}">${icon.trash}</button>
    </div>
  </div>`;
}

function option(value, current, label) {
  return `<option value="${esc(value)}"${String(current) === String(value) ? ' selected' : ''}>${esc(label)}</option>`;
}

function editorView() {
  const car = state.editing;
  const isNew = !car.slug || car.__new;
  return `
    <div class="card">
      <div class="card__head">
        <div>
          <h2>${isNew ? 'Add a new car' : `Edit: ${esc(car.titleEn)}`}</h2>
          <p>Fill in both languages so the website reads well in English and Urdu.</p>
        </div>
        <div class="card__actions">
          <button class="btn btn-ghost btn-sm" type="button" data-action="car-cancel">${isNew ? 'Cancel' : '← Back to all cars'}</button>
          <button class="btn btn-primary btn-sm" type="button" data-action="car-save" data-new="${isNew ? '1' : '0'}">Save car</button>
        </div>
      </div>

      <form data-car-form>
        <p class="section-title">Basic details</p>
        <div class="field-row">
          <div class="field"><label>Title (English)</label><input name="titleEn" value="${esc(car.titleEn)}" required /></div>
          <div class="field field--ur"><label>عنوان (اردو)</label><input name="titleUr" value="${esc(car.titleUr)}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Company / brand</label><input name="brand" value="${esc(car.brand)}" list="brand-list" required /></div>
          <div class="field"><label>Model</label><input name="model" value="${esc(car.model)}" required /></div>
          <div class="field"><label>Variant</label><input name="variant" value="${esc(car.variant)}" placeholder="VXL AGS" /></div>
        </div>
        <datalist id="brand-list">
          ${[...new Set(['Suzuki', 'Toyota', 'Honda', 'Kia', 'Hyundai', 'MG', 'Daihatsu', 'Nissan', 'Mitsubishi', 'United', 'Changan', 'Haval', ...state.cars.map((item) => item.brand)])]
            .map((brand) => `<option value="${esc(brand)}"></option>`).join('')}
        </datalist>
        <div class="field-row">
          <div class="field"><label>Model year</label><input name="year" type="number" min="1950" max="2100" value="${esc(car.year)}" required /></div>
          <div class="field"><label>Price (PKR)</label><input name="price" type="number" min="0" step="1000" value="${esc(car.price)}" required /></div>
          <div class="field"><label>Mileage (km)</label><input name="mileageKm" type="number" min="0" value="${esc(car.mileageKm)}" /></div>
          <div class="field"><label>Engine (cc)</label><input name="engineCc" type="number" min="0" max="20000" value="${esc(car.engineCc)}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Fuel</label><select name="fuel">
            ${['petrol', 'diesel', 'hybrid', 'electric', 'cng'].map((value) => option(value, car.fuel, value[0].toUpperCase() + value.slice(1))).join('')}
          </select></div>
          <div class="field"><label>Transmission</label><select name="transmission">
            ${['manual', 'automatic'].map((value) => option(value, car.transmission, value === 'manual' ? 'Manual' : 'Automatic')).join('')}
          </select></div>
          <div class="field"><label>Body type</label><select name="bodyType">
            ${['hatchback', 'sedan', 'suv', 'crossover', 'van', 'pickup', 'coupe'].map((value) => option(value, car.bodyType, value[0].toUpperCase() + value.slice(1))).join('')}
          </select></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Colour (English)</label><input name="colorEn" value="${esc(car.colorEn)}" /></div>
          <div class="field field--ur"><label>رنگ (اردو)</label><input name="colorUr" value="${esc(car.colorUr)}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Registered city (English)</label><input name="registeredCityEn" value="${esc(car.registeredCityEn)}" placeholder="Islamabad" /></div>
          <div class="field field--ur"><label>رجسٹریشن شہر (اردو)</label><input name="registeredCityUr" value="${esc(car.registeredCityUr)}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Condition (English)</label><input name="conditionEn" value="${esc(car.conditionEn)}" placeholder="Excellent" /></div>
          <div class="field field--ur"><label>حالت (اردو)</label><input name="conditionUr" value="${esc(car.conditionUr)}" /></div>
        </div>

        <p class="section-title">Description</p>
        <div class="field"><label>Description (English)</label><textarea name="descriptionEn">${esc(car.descriptionEn)}</textarea></div>
        <div class="field field--ur"><label>تفصیل (اردو)</label><textarea name="descriptionUr">${esc(car.descriptionUr)}</textarea></div>

        <p class="section-title">Publishing</p>
        <div class="field-row">
          <div class="field"><label>Status</label><select name="status">
            ${option('available', car.status, 'Available')}
            ${option('sold', car.status, 'Sold')}
          </select></div>
          <div class="field"><label>Web address (optional)</label><input name="slug" value="${esc(car.slug || '')}" placeholder="suzuki-alto-vxr-2022" /><span class="hint">Leave empty to generate one automatically.</span></div>
        </div>
        <div class="field-row">
          <label class="check-field"><input type="checkbox" name="featured" ${car.featured ? 'checked' : ''} /> Feature on the home page</label>
          <label class="check-field"><input type="checkbox" name="published" ${car.published === false ? '' : 'checked'} /> Show on the website</label>
        </div>
      </form>
    </div>

    <div class="card">
      <div class="card__head">
        <div><h2>Photos</h2><p>${isNew ? 'Save the car first, then upload its photos.' : 'The first photo is used as the cover image.'}</p></div>
      </div>
      ${isNew ? '<div class="note">Photos can be uploaded as soon as the car has been saved.</div>' : `
        ${car.images?.length ? `<div class="image-grid">${car.images.map((image, index) => `
          <div class="image-tile">
            <img src="${esc(image.url)}" alt="" loading="lazy" />
            ${index === 0 ? '<span class="image-tile__cover">Cover</span>' : ''}
            <div class="image-tile__bar">
              <button type="button" data-action="image-move" data-slug="${esc(car.slug)}" data-id="${esc(image.id)}" data-dir="-1" ${index === 0 ? 'disabled' : ''}>◀</button>
              <button type="button" data-action="image-move" data-slug="${esc(car.slug)}" data-id="${esc(image.id)}" data-dir="1" ${index === car.images.length - 1 ? 'disabled' : ''}>▶</button>
              <button type="button" data-action="image-delete" data-slug="${esc(car.slug)}" data-id="${esc(image.id)}">✕</button>
            </div>
          </div>`).join('')}</div>` : '<div class="note">No photos yet.</div>'}
        <label class="dropzone" data-dropzone style="display:block;margin-top:16px">
          ${icon.upload}
          <p style="margin:8px 0 0">Tap to choose photos (up to 12 at once, JPG or PNG)</p>
          <input type="file" accept="image/*" multiple data-input="image-upload" data-slug="${esc(car.slug)}" />
        </label>
        <div class="upload-list" data-upload-list></div>`}
    </div>`;
}

const settingsFields = [
  ['businessNameEn', 'Business name (English)'],
  ['businessNameUr', 'Business name (Urdu)', true],
  ['shortName', 'Short name'],
  ['taglineEn', 'Tagline (English)'],
  ['taglineUr', 'Tagline (Urdu)', true],
  ['heroTitleEn', 'Hero headline (English)'],
  ['heroTitleUr', 'ہیرو عنوان (اردو)', true],
  ['heroSubtitleEn', 'Hero subtitle (English)', false, 'textarea'],
  ['heroSubtitleUr', 'ہیرو ذیلی متن (اردو)', true, 'textarea'],
  ['aboutEn', 'About us (English)', false, 'textarea'],
  ['aboutUr', 'ہمارے بارے میں (اردو)', true, 'textarea'],
  ['addressEn', 'Address (English)'],
  ['addressUr', 'پتہ (اردو)', true],
  ['addressShortEn', 'Short address (English)'],
  ['addressShortUr', 'مختصر پتہ (اردو)', true],
  ['cityEn', 'City (English)'],
  ['cityUr', 'شہر (اردو)', true],
  ['hoursEn', 'Opening hours (English)'],
  ['hoursUr', 'اوقاتِ کار (اردو)', true],
  ['whatsappNumber', 'WhatsApp number (with country code, e.g. 923155521697)', false, 'text', 'Enable the Facebook, Instagram or YouTube boxes to show them in the footer.'],
  ['email', 'Email address'],
  ['facebookUrl', 'Facebook page URL'],
  ['instagramUrl', 'Instagram URL'],
  ['youtubeUrl', 'YouTube channel URL'],
  ['footerNoteEn', 'Footer note (English)', false, 'textarea'],
  ['footerNoteUr', 'فوٹر نوٹ (اردو)', true, 'textarea'],
];

function settingsView() {
  const settings = state.site?.settings || {};
  return `
    <div class="card">
      <div class="card__head">
        <div><h2>Business details</h2><p>These texts appear across the website.</p></div>
        <div class="card__actions"><button class="btn btn-primary btn-sm" type="button" data-action="settings-save">Save settings</button></div>
      </div>
      <form data-settings-form>
        ${settingsFields.map(([key, label, urdu, type = 'text']) => `
          <div class="field${urdu ? ' field--ur' : ''}">
            <label for="set-${key}">${esc(label)}</label>
            ${type === 'textarea'
              ? `<textarea id="set-${key}" name="${key}">${esc(settings[key] || '')}</textarea>`
              : `<input id="set-${key}" name="${key}" value="${esc(settings[key] || '')}" />`}
          </div>`).join('')}
      </form>
    </div>

    <div class="card">
      <div class="card__head">
        <div><h2>Google Map</h2><p>Paste a Google Maps share link, or the whole embed code from Google Maps → Share → Embed a map.</p></div>
      </div>
      <form data-map-form>
        <div class="field">
          <label for="mapEmbedType">What are you pasting?</label>
          <select id="mapEmbedType" name="mapEmbedType">
            <option value="src"${(settings.mapEmbedType || 'src') === 'src' ? ' selected' : ''}>A map link / iframe URL</option>
            <option value="html"${settings.mapEmbedType === 'html' ? ' selected' : ''}>The full embed code (HTML)</option>
          </select>
        </div>
        <div class="field">
          <label for="mapEmbedUrl">Embed / map URL</label>
          <textarea id="mapEmbedUrl" name="mapEmbedUrl" placeholder="https://www.google.com/maps?q=Thanda+Pani+Lethrar+Road+Islamabad&amp;output=embed">${esc(settings.mapEmbedUrl || '')}</textarea>
        </div>
        <div class="field">
          <label for="mapLink">Directions link (used by the “Open in Google Maps” buttons)</label>
          <input id="mapLink" name="mapLink" value="${esc(settings.mapLink || '')}" />
        </div>
        <button class="btn btn-primary btn-sm" type="button" data-action="settings-save" data-form="map-form">Save map settings</button>
      </form>
    </div>

    <div class="card">
      <div class="card__head">
        <div><h2>Logo</h2><p>Upload the final “97 Group” logo. Until then the placeholder badge is shown.</p></div>
      </div>
      <div class="field-row">
        <div>
          <div class="image-tile" style="max-width:200px">
            <img src="${esc(settings.logoUrl || '/assets/img/logo-placeholder.svg')}" alt="Current logo" />
          </div>
          <label class="btn btn-outline btn-sm" style="margin-top:10px;display:inline-flex">
            ${icon.upload} Upload logo
            <input type="file" accept="image/*" data-input="logo-upload" data-which="logo" style="display:none" />
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card__head">
        <div>
          <h2>Access (admin email)</h2>
          <p>Only this Google account can open the dashboard. Change it here whenever you like.</p>
        </div>
      </div>
      <form data-access-form>
        <div class="field">
          <label for="adminEmail">Administrator Gmail address</label>
          <input id="adminEmail" name="adminEmail" type="email" value="${esc(settings.adminEmail || '')}" placeholder="you@gmail.com" />
          <span class="hint">After saving, only this address can sign in — every other Google account is refused.</span>
        </div>
        <div class="field">
          <label for="creditsEn">Footer credit (English)</label>
          <input id="creditsEn" name="creditsEn" value="${esc(settings.creditsEn || 'Website designed by Abdul Hadi')}" />
        </div>
        <div class="field field--ur">
          <label for="creditsUr">فوٹر کریڈٹ (اردو)</label>
          <input id="creditsUr" name="creditsUr" value="${esc(settings.creditsUr || 'ویب سائٹ ڈیزائن: عبدالہادی')}" />
        </div>
        <button class="btn btn-primary btn-sm" type="button" data-action="settings-save" data-form="access-form">Save access settings</button>
      </form>
    </div>`;
}

function contentView() {
  const tabs = [['owners', 'Owners'], ['stats', 'Counters'], ['whyUs', 'Why choose us'], ['faqs', 'FAQ']];
  const data = {
    owners: state.site?.owners || [],
    stats: state.site?.stats || [],
    whyUs: state.site?.whyUs || [],
    faqs: state.site?.faqs || [],
  }[state.listTab] || [];
  return `
    <div class="card">
      <div class="card__head">
        <div><h2>Page sections</h2><p>Owners, counters, “why us” cards and the FAQ — all editable.</p></div>
        <div class="card__actions">
          <button class="btn btn-outline btn-sm" type="button" data-action="list-add">${icon.plus} Add row</button>
          <button class="btn btn-primary btn-sm" type="button" data-action="list-save">Save</button>
        </div>
      </div>
      <div class="toolbar">
        ${tabs.map(([key, label]) => `<button class="btn ${state.listTab === key ? 'btn-primary' : 'btn-outline'} btn-sm" type="button" data-action="list-tab" data-tab="${key}">${label}</button>`).join('')}
      </div>
      <form data-list-form data-table="${state.listTab}">
        ${data.length ? data.map((row, index) => listRow(state.listTab, row, index)).join('') : `<div class="empty">Nothing here yet — press “Add row”.</div>`}
      </form>
    </div>`;
}

function listRow(table, row, index) {
  const field = (name, label, value, { urdu = false, type = 'text' } = {}) => `
    <div class="field${urdu ? ' field--ur' : ''}">
      <label>${esc(label)}</label>
      ${type === 'textarea'
        ? `<textarea name="${name}">${esc(value || '')}</textarea>`
        : `<input name="${name}" type="${type}" value="${esc(value || '')}" />`}
    </div>`;
  const head = (title) => `<div class="card__head" style="margin:0 0 10px">
      <div><h2 style="font-size:.98rem">${esc(title)}</h2></div>
      <div class="card__actions"><button class="icon-btn" type="button" data-action="list-remove" data-index="${index}" title="Remove">${icon.trash}</button></div>
    </div>`;
  if (table === 'owners') {
    return `<div class="card" style="background:var(--slate-50)">${head(row.nameEn || 'Owner')}
      <div class="field-row">
        ${field('nameEn', 'Name (English)', row.nameEn)}
        ${field('nameUr', 'نام (اردو)', row.nameUr, { urdu: true })}
      </div>
      <div class="field-row">
        ${field('roleEn', 'Role (English)', row.roleEn)}
        ${field('roleUr', 'عہدہ (اردو)', row.roleUr, { urdu: true })}
      </div>
      <div class="field-row">
        ${field('phone', 'Phone (0315 5521697)', row.phone)}
        ${field('whatsapp', 'WhatsApp (923155521697)', row.whatsapp)}
        <label class="check-field"><input type="checkbox" name="showOnSite" ${row.showOnSite === false ? '' : 'checked'} /> Show on the website</label>
      </div>
    </div>`;
  }
  if (table === 'stats') {
    return `<div class="card" style="background:var(--slate-50)">${head(row.labelEn || 'Counter')}
      <div class="field-row">
        ${field('value', 'Number', row.value, { type: 'number' })}
        ${field('suffix', 'Suffix (e.g. + or %)', row.suffix)}
      </div>
      <div class="field-row">
        ${field('labelEn', 'Label (English)', row.labelEn)}
        ${field('labelUr', 'لیبل (اردو)', row.labelUr, { urdu: true })}
      </div>
    </div>`;
  }
  if (table === 'whyUs') {
    return `<div class="card" style="background:var(--slate-50)">${head(row.titleEn || 'Reason')}
      <div class="field-row">
        <div class="field"><label>Icon</label><select name="icon">
          ${['shield', 'tag', 'file', 'wrench', 'star', 'clock'].map((value) => option(value, row.icon, value)).join('')}
        </select></div>
      </div>
      <div class="field-row">
        ${field('titleEn', 'Title (English)', row.titleEn)}
        ${field('titleUr', 'عنوان (اردو)', row.titleUr, { urdu: true })}
      </div>
      <div class="field-row">
        ${field('bodyEn', 'Text (English)', row.bodyEn, { type: 'textarea' })}
        ${field('bodyUr', 'متن (اردو)', row.bodyUr, { urdu: true, type: 'textarea' })}
      </div>
    </div>`;
  }
  return `<div class="card" style="background:var(--slate-50)">${head(row.questionEn || 'Question')}
    <div class="field-row">
      ${field('questionEn', 'Question (English)', row.questionEn)}
      ${field('questionUr', 'سوال (اردو)', row.questionUr, { urdu: true })}
    </div>
    <div class="field-row">
      ${field('answerEn', 'Answer (English)', row.answerEn, { type: 'textarea' })}
      ${field('answerUr', 'جواب (اردو)', row.answerUr, { urdu: true, type: 'textarea' })}
    </div>
  </div>`;
}

function messageRow(message) {
  return `<div class="message${message.status === 'new' ? ' is-new' : ''}" style="margin-bottom:10px">
    <div class="message__head">
      <span class="message__name">${esc(message.name)}</span>
      <span class="pill ${message.status === 'new' ? 'pill--new' : ''}">${esc(message.status)}</span>
      ${message.carSlug ? `<span class="pill">${esc(message.carSlug)}</span>` : ''}
      <span class="message__meta" style="margin-inline-start:auto">${new Date(message.createdAt).toLocaleString('en-PK')}</span>
    </div>
    <p class="message__body">${esc(message.body)}</p>
    <div class="message__meta">
      <a href="tel:${esc(message.phone)}">${esc(message.phone)}</a>
      ${message.email ? `<a href="mailto:${esc(message.email)}">${esc(message.email)}</a>` : ''}
      ${message.subject ? `<span>${esc(message.subject)}</span>` : ''}
      <span style="margin-inline-start:auto;display:flex;gap:6px">
        <a class="btn btn-sm btn-whatsapp" style="background:#1faa59" href="https://wa.me/${esc(String(message.phone).replace(/\D/g, '').replace(/^0/, '92'))}" target="_blank" rel="noopener">WhatsApp</a>
        <button class="btn btn-sm btn-outline" type="button" data-action="message-status" data-id="${esc(message.id)}" data-status="read">Mark read</button>
        <button class="btn btn-sm btn-outline" type="button" data-action="message-status" data-id="${esc(message.id)}" data-status="done">Done</button>
        <button class="btn btn-sm btn-danger" type="button" data-action="message-delete" data-id="${esc(message.id)}">Delete</button>
      </span>
    </div>
  </div>`;
}

function messagesView() {
  return `<div class="card">
    <div class="card__head">
      <div><h2>Enquiries (${state.messages.length})</h2><p>Messages sent through the website contact form.</p></div>
    </div>
    ${state.messages.length ? state.messages.map(messageRow).join('') : '<div class="empty">No enquiries yet.</div>'}
  </div>`;
}

function guideView() {
  const supabase = state.mode === 'supabase';
  return `<div class="card guide">
    <h2>How this website works</h2>
    <p>Everything you see on the public website — cars, prices, photos, phone numbers, owners, the map and the logo — is stored ${supabase ? 'in your Supabase project' : 'in the local <code>storage/</code> folder'} and edited from this dashboard. There is no code editing involved.</p>

    <h3>1. Daily tasks</h3>
    <ol>
      <li><strong>Add a car:</strong> Cars → “Add car” → fill the form → Save → upload photos.</li>
      <li><strong>Sold a car:</strong> Cars → the ✓ button marks it sold (it stays on the site with a “Sold” label) — or delete it.</li>
      <li><strong>Feature a car:</strong> press the ★ button so it appears in “Featured cars” and in the hero.</li>
      <li><strong>Change a price:</strong> open the car, edit the price, save.</li>
    </ol>

    <h3>2. ${supabase ? 'Google sign-in' : 'Going live with Supabase (Google sign-in)'}</h3>
    ${supabase ? `
      <p>The dashboard is connected to Supabase. Only the Gmail address in <strong>Site settings → Access</strong> can sign in. Change that address whenever the admin email changes, and sign in again with the new account.</p>` : `
      <ol>
        <li>Create a free project at <code>supabase.com</code>.</li>
        <li>In the Supabase dashboard open <strong>SQL Editor</strong> and run the file <code>supabase/schema.sql</code> from this project. It creates every table, the security rules and the photo storage bucket.</li>
        <li>Open <strong>Authentication → Providers → Google</strong> and enable Google. Paste your Google OAuth client id and secret (created in the Google Cloud console) and add your website URL to the allowed redirect URLs.</li>
        <li>Copy <strong>Project URL</strong> and the <strong>anon public key</strong> (Settings → API), then put them in the <code>.env</code> file of this project as <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> and restart the server.</li>
        <li>Run <code>npm run seed</code> once to load the current inventory into Supabase.</li>
        <li>Sign in here with Google. The first account that signs in becomes the administrator; afterwards only the address in <strong>Site settings → Access</strong> is allowed.</li>
      </ol>
      <div class="note note--warn">Tip: change the admin email to your own Gmail address in <strong>Site settings → Access</strong> before sharing the website, then sign in again with that account.</div>`}

    <h3>3. Photos</h3>
    <p>Uploaded photos are optimised automatically (resized to 1600px and compressed) so pages stay fast on mobile data. The first photo of every car is the cover image; use the ◀ ▶ buttons to reorder.</p>

    <h3>4. Enquiries</h3>
    <p>Every contact-form message arrives in <strong>Enquiries</strong> with the customer's name, phone and message. Reply by tapping the phone number or the WhatsApp button.</p>

    <h3>5. Security notes</h3>
    <ul>
      <li>The dashboard is never indexed by search engines.</li>
      <li>Only signed-in, allow-listed accounts can change anything; the public website can only read.</li>
      <li>Keep the <code>.env</code> file private — it holds the Supabase keys.</li>
    </ul>
  </div>`;
}

/* --------------------------------------------------------------- render --- */
function render() {
  if (!state.me) {
    root.innerHTML = loginView();
    return;
  }
  const titles = {
    dashboard: ['Dashboard', 'Everything at a glance'],
    cars: ['Cars', 'Your live inventory'],
    editor: [state.editing?.__new ? 'Add car' : 'Edit car', state.editing?.__new ? 'Fill in the details, then save to add photos' : 'Changes appear on the website immediately'],
    messages: ['Enquiries', 'Messages from the website'],
    content: ['Owners & sections', 'Owners, counters, why-us and FAQ'],
    settings: ['Site settings', 'Business details, map, logo and access'],
    guide: ['Setup guide', 'How to run the website'],
  };
  const [title, subtitle] = titles[state.view] || titles.dashboard;
  const view = state.view === 'editor'
    ? editorView()
    : state.view === 'cars' ? carsView()
      : state.view === 'messages' ? messagesView()
        : state.view === 'content' ? contentView()
          : state.view === 'settings' ? settingsView()
            : state.view === 'guide' ? guideView()
              : dashboardView();

  root.innerHTML = `<div class="admin">
    ${sidebarView()}
    <div class="scrim" data-action="close-menu"></div>
    <main class="admin__main">
      <div class="admin__topbar">
        <button class="icon-btn menu-btn" type="button" data-action="open-menu" aria-label="Menu">${icon.menu}</button>
        <div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
        <div class="admin__topbar-actions">
          ${state.view === 'cars' ? `<button class="btn btn-primary btn-sm" type="button" data-action="car-new">${icon.plus} Add car</button>` : ''}
          ${state.view === 'messages' ? `<button class="btn btn-outline btn-sm" type="button" data-action="refresh">Refresh</button>` : ''}
          <a class="btn btn-outline btn-sm" href="/" target="_blank" rel="noopener">View site</a>
        </div>
      </div>
      ${view}
    </main>
  </div>
  <nav class="mobile-nav">
    ${[['dashboard', 'Home', icon.dashboard], ['cars', 'Cars', icon.car], ['messages', 'Inbox', icon.mail], ['content', 'Sections', icon.users], ['settings', 'Settings', icon.settings]]
      .map(([key, label, svg]) => `<button type="button" class="${state.view === key ? 'is-active' : ''}" data-action="nav" data-view="${key}">${svg}<span>${label}</span></button>`).join('')}
  </nav>`;
}

/* -------------------------------------------------------------- actions --- */
const blankCar = () => ({
  __new: true, slug: '', titleEn: '', titleUr: '', brand: 'Suzuki', model: '', variant: '',
  year: new Date().getFullYear(), price: 0, mileageKm: 0, fuel: 'petrol', transmission: 'manual',
  engineCc: 1000, colorEn: '', colorUr: '', bodyType: 'hatchback', registeredCityEn: 'Islamabad',
  registeredCityUr: 'اسلام آباد', conditionEn: 'Excellent', conditionUr: 'بہت اچھی',
  descriptionEn: '', descriptionUr: '', status: 'available', featured: false, published: true,
  images: [],
});

function formToCar(form, car) {
  const data = new FormData(form);
  const next = { ...car };
  for (const [key, value] of data.entries()) {
    if (key === 'sortOrder') continue;
    next[key] = value;
  }
  next.featured = form.querySelector('[name="featured"]')?.checked || false;
  next.published = form.querySelector('[name="published"]')?.checked ?? true;
  for (const key of ['year', 'price', 'mileageKm', 'engineCc']) next[key] = Number(next[key]) || 0;
  return next;
}

async function withBusy(label, task) {
  if (state.busy) return;
  state.busy = true;
  try {
    await task();
  } catch (error) {
    console.error(error);
    toast(error.payload?.fields ? `${error.message} (${error.payload.fields.join(', ')})` : error.message, 'error');
  } finally {
    state.busy = false;
    if (label) toast(label);
  }
}

async function saveCar(isNew, form) {
  const car = formToCar(form, state.editing || {});
  const payload = { ...car };
  delete payload.__new;
  delete payload.images;
  delete payload.id;
  const slug = state.editing?.slug;
  const result = isNew || !slug
    ? await api('/api/admin/cars', { method: 'POST', body: payload })
    : await api(`/api/admin/cars/${encodeURIComponent(slug)}`, { method: 'PUT', body: payload });
  const cars = await api('/api/admin/cars');
  state.cars = cars.cars || [];
  state.overview = await api('/api/admin/overview');
  state.editing = state.cars.find((item) => item.slug === (result.car?.slug || payload.slug)) || null;
  state.view = state.editing ? 'editor' : 'cars';
}

async function uploadFiles(slug, files) {
  const list = document.querySelector('[data-upload-list]');
  const formData = new FormData();
  [...files].slice(0, 12).forEach((file) => formData.append('images', file));
  if (list) list.innerHTML = `Uploading ${Math.min(files.length, 12)} photo(s)…`;
  const response = await api(`/api/admin/cars/${encodeURIComponent(slug)}/images`, { method: 'POST', formData });
  const cars = await api('/api/admin/cars');
  state.cars = cars.cars || [];
  state.overview = await api('/api/admin/overview');
  state.editing = state.cars.find((item) => item.slug === slug) || state.editing;
  render();
  toast(`${response.images?.length || 0} photo(s) uploaded`);
}

/* --------------------------------------------------------- event binding --- */
document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const slug = target.dataset.slug;

  if (action === 'google-signin') {
    const client = await getSupabase();
    await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/admin` },
    });
    return;
  }
  if (action === 'signout') {
    if (state.mode === 'supabase') {
      const client = await getSupabase();
      await client.auth.signOut();
    } else {
      await api('/api/admin/session', { method: 'DELETE' });
    }
    state.me = null;
    render();
    return;
  }
  if (action === 'nav') {
    state.view = target.dataset.view;
    state.editing = null;
    document.getElementById('admin-sidebar')?.classList.remove('is-open');
    render();
    return;
  }
  if (action === 'open-menu') { document.getElementById('admin-sidebar')?.classList.add('is-open'); document.querySelector('.scrim')?.classList.add('is-open'); return; }
  if (action === 'close-menu') { document.getElementById('admin-sidebar')?.classList.remove('is-open'); document.querySelector('.scrim')?.classList.remove('is-open'); return; }
  if (action === 'refresh') { await withBusy('Refreshed', async () => { await loadData(); render(); }); return; }
  if (action === 'car-new') { state.editing = blankCar(); state.view = 'editor'; render(); return; }
  if (action === 'car-edit') { state.editing = state.cars.find((car) => car.slug === slug) || null; state.view = 'editor'; render(); return; }
  if (action === 'car-cancel') { state.editing = null; state.view = 'cars'; render(); return; }
  if (action === 'car-save') {
    const form = document.querySelector('[data-car-form]');
    if (!form.reportValidity()) return;
    await withBusy('Car saved', () => saveCar(target.dataset.new === '1', form));
    render();
    return;
  }
  if (action === 'car-toggle') {
    const car = state.cars.find((item) => item.slug === slug);
    if (!car) return;
    const field = target.dataset.field;
    const body = field === 'featured'
      ? { featured: !car.featured }
      : { status: car.status === 'sold' ? 'available' : 'sold' };
    await withBusy(null, async () => {
      await api(`/api/admin/cars/${encodeURIComponent(slug)}`, { method: 'PUT', body });
      state.cars = (await api('/api/admin/cars')).cars || [];
      state.overview = await api('/api/admin/overview');
      render();
    });
    return;
  }
  if (action === 'car-delete') {
    const car = state.cars.find((item) => item.slug === slug);
    if (!confirm(`Delete “${car?.titleEn || slug}” and all of its photos?`)) return;
    await withBusy('Car deleted', async () => {
      await api(`/api/admin/cars/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      state.cars = (await api('/api/admin/cars')).cars || [];
      state.overview = await api('/api/admin/overview');
      render();
    });
    return;
  }
  if (action === 'image-delete') {
    if (!confirm('Delete this photo?')) return;
    await withBusy('Photo deleted', async () => {
      await api(`/api/admin/cars/${encodeURIComponent(slug)}/images/${encodeURIComponent(target.dataset.id)}`, { method: 'DELETE' });
      state.cars = (await api('/api/admin/cars')).cars || [];
      state.editing = state.cars.find((item) => item.slug === slug) || null;
      render();
    });
    return;
  }
  if (action === 'image-move') {
    const car = state.cars.find((item) => item.slug === slug);
    if (!car) return;
    const ids = (car.images || []).map((image) => image.id);
    const from = ids.indexOf(target.dataset.id);
    const to = from + Number(target.dataset.dir);
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await withBusy(null, async () => {
      await api(`/api/admin/cars/${encodeURIComponent(slug)}/images/order`, { method: 'POST', body: { ids } });
      state.cars = (await api('/api/admin/cars')).cars || [];
      state.editing = state.cars.find((item) => item.slug === slug) || null;
      render();
    });
    return;
  }
  if (action === 'settings-save') {
    const formName = target.dataset.form;
    const form = formName ? document.querySelector(`[data-${formName}]`) : document.querySelector('[data-settings-form]');
    const payload = Object.fromEntries(new FormData(form).entries());
    if (!formName) {
      const access = document.querySelector('[data-access-form]');
      if (access) Object.assign(payload, Object.fromEntries(new FormData(access).entries()));
    }
    await withBusy('Settings saved', async () => {
      await api('/api/admin/settings', { method: 'PUT', body: payload });
      await loadSite();
      render();
      if (payload.adminEmail) state.me = { ...state.me, email: payload.adminEmail };
    });
    return;
  }
  if (action === 'list-tab') { state.listTab = target.dataset.tab; render(); return; }
  if (action === 'list-add') {
    const form = document.querySelector('[data-list-form]');
    const rows = readListForm(form);
    rows.push({});
    state.site = { ...state.site, [state.listTab]: rows };
    render();
    return;
  }
  if (action === 'list-remove') {
    const form = document.querySelector('[data-list-form]');
    const rows = readListForm(form);
    rows.splice(Number(target.dataset.index), 1);
    state.site = { ...state.site, [state.listTab]: rows };
    render();
    return;
  }
  if (action === 'list-save') {
    const form = document.querySelector('[data-list-form]');
    const rows = readListForm(form);
    await withBusy('Section saved', async () => {
      await api(`/api/admin/lists/${state.listTab}`, { method: 'PUT', body: { rows } });
      await loadSite();
      render();
    });
    return;
  }
  if (action === 'message-status') {
    await withBusy(null, async () => {
      await api(`/api/admin/messages/${encodeURIComponent(target.dataset.id)}`, { method: 'PATCH', body: { status: target.dataset.status } });
      state.messages = (await api('/api/admin/messages')).messages || [];
      state.overview = await api('/api/admin/overview');
      render();
    });
    return;
  }
  if (action === 'message-delete') {
    if (!confirm('Delete this enquiry?')) return;
    await withBusy('Enquiry deleted', async () => {
      await api(`/api/admin/messages/${encodeURIComponent(target.dataset.id)}`, { method: 'DELETE' });
      state.messages = (await api('/api/admin/messages')).messages || [];
      state.overview = await api('/api/admin/overview');
      render();
    });
  }
});

function readListForm(form) {
  if (!form) return [];
  const cards = [...form.querySelectorAll(':scope > .card')];
  return cards.map((card) => {
    const row = {};
    for (const input of card.querySelectorAll('input, select, textarea')) {
      if (!input.name) continue;
      row[input.name] = input.type === 'checkbox' ? input.checked : input.value;
    }
    return row;
  });
}

document.addEventListener('change', async (event) => {
  const input = event.target;
  if (input.dataset.input === 'car-filter') { state.carFilter = input.value; render(); return; }
  if (input.dataset.input === 'image-upload') {
    const files = [...(input.files || [])];
    if (!files.length) return;
    await withBusy(null, () => uploadFiles(input.dataset.slug, files));
    return;
  }
  if (input.dataset.input === 'logo-upload') {
    const file = input.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('logo', file);
    formData.append('which', input.dataset.which || 'logo');
    await withBusy('Logo updated', async () => {
      await api('/api/admin/logo', { method: 'POST', formData });
      await loadSite();
      render();
    });
  }
});

document.addEventListener('input', (event) => {
  if (event.target.dataset.input === 'car-query') {
    state.carQuery = event.target.value;
    const positions = event.target.selectionStart;
    render();
    const next = document.querySelector('[data-input="car-query"]');
    if (next) {
      next.focus();
      next.setSelectionRange(positions, positions);
    }
  }
});

document.addEventListener('submit', async (event) => {
  if (!event.target.matches('[data-demo-login]')) return;
  event.preventDefault();
  const password = new FormData(event.target).get('password');
  try {
    await api('/api/admin/session', { method: 'POST', body: { password } });
    await start();
    toast('Signed in');
  } catch (error) {
    toast(error.message === 'bad-password' ? 'Wrong password' : error.message, 'error');
  }
});

/* drag & drop uploads */
document.addEventListener('dragover', (event) => {
  const zone = event.target.closest('[data-dropzone]');
  if (!zone) return;
  event.preventDefault();
  zone.classList.add('is-over');
});
document.addEventListener('dragleave', (event) => {
  event.target.closest('[data-dropzone]')?.classList.remove('is-over');
});
document.addEventListener('drop', async (event) => {
  const zone = event.target.closest('[data-dropzone]');
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove('is-over');
  const input = zone.querySelector('[data-input="image-upload"]');
  const files = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith('image/'));
  if (!files.length || !input) return;
  await withBusy(null, () => uploadFiles(input.dataset.slug, files));
});

/* ----------------------------------------------------------------- start --- */
let authListenerBound = false;

function bindAuthListener(client) {
  if (!client || authListenerBound || state.mode !== 'supabase') return;
  authListenerBound = true;
  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      state.me = null;
      render();
      return;
    }
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && !state.me) start();
  });
}

async function start() {
  state.config = await api('/api/config');
  state.mode = state.config.mode;
  bindAuthListener(await getSupabase().catch(() => null));
  const session = await api('/api/admin/session').catch(() => null);

  if (session?.mode === 'supabase' && session.authenticated && session.allowed === false) {
    state.me = null;
    root.innerHTML = `<div class="login"><div class="login__card">
      <img class="login__logo" src="/assets/img/logo-placeholder.svg" alt="97 Group" />
      <h1>Access denied</h1>
      <p>The Google account <strong>${esc(session.email || '')}</strong> is not the administrator of this website.</p>
      <p class="login__hint"><a href="/">← Back to the website</a></p>
    </div></div>`;
    return;
  }

  if (session?.authenticated) {
    state.mode = session.mode || state.mode;
    state.me = { email: session.email || 'demo@local' };
    try {
      await loadData();
      state.view = state.view === 'editor' ? 'cars' : state.view;
      render();
      return;
    } catch (error) {
      if (error.status !== 401 && error.status !== 403) {
        toast(error.message, 'error');
      }
      state.me = null;
    }
  }
  render();
}

start().catch((error) => {
  console.error(error);
  root.innerHTML = `<div class="login"><div class="login__card"><h1>Dashboard unavailable</h1><p>${esc(error.message)}</p><p class="login__hint"><a href="/">← Back to the website</a></p></div></div>`;
});
