/* ==========================================================================
   admin.js — dashboard logic: Google sign-in, inventory CRUD, photo uploads,
   enquiries, business settings and access control.
   ========================================================================== */
(function () {
  'use strict';
  const R = window.Rafay;
  const { escapeHtml: esc, toast, prettyPhone, international, waLink, statusMeta, observeReveals } = R;

  const state = {
    session: null,
    csrf: '',
    config: {},
    overview: null,
    cars: [],
    site: null,
    inquiries: [],
    editingId: null,
    images: [],
    options: { fuels: [], transmissions: [], statuses: [], bodyTypes: [] },
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  /* ------------------------------------------------------------------ api */
  async function request(path, { method = 'GET', body } = {}) {
    const headers = { Accept: 'application/json' };
    if (method !== 'GET' && state.csrf) headers['x-csrf-token'] = state.csrf;
    const options = { method, headers, credentials: 'same-origin' };
    if (body instanceof FormData) options.body = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    const text = await response.text();
    let data = {};
    if (text) { try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; } }
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function note(element, message, kind = '') {
    if (!element) return;
    element.textContent = message;
    element.className = `form-note${kind ? ` is-${kind}` : ''}`;
  }

  /* --------------------------------------------------------- sign-in flow */
  async function initLogin() {
    try {
      state.config = await request('/api/auth/config');
    } catch {
      state.config = {};
    }
    const status = $('loginStatus');
    $('storageBadge').textContent = state.config.storage === 'supabase' ? 'Supabase' : 'Local storage';

    // Google button
    if (state.config.googleReady) {
      $('googleBlock').hidden = false;
      await loadGoogleScript();
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: state.config.googleClientId,
          callback: onGoogleCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        window.google.accounts.id.renderButton($('gsiButton'), {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          logo_alignment: 'left',
          width: 300,
        });
      } else {
        $('googleBlock').innerHTML = '<p class="login__hint">Google sign-in could not load. Check the network connection, or use the password below.</p>';
      }
    }

    if (state.config.setupRequired) {
      $('setupForm').hidden = false;
      status.className = 'login__status';
      status.innerHTML = 'No administrator Gmail is configured yet. Use the one-time setup token from the server log to add the owner account.';
    } else if (!state.config.googleReady) {
      status.className = 'login__status is-error';
      status.innerHTML = 'Google sign-in is not configured on this server yet. Set <code>GOOGLE_CLIENT_ID</code> (and <code>GOOGLE_CLIENT_SECRET</code>) in the environment, or sign in with the emergency password.';
    } else {
      status.className = 'login__status is-ok';
      status.textContent = `${state.config.adminCount} approved administrator ${state.config.adminCount === 1 ? 'account' : 'accounts'}. Sign in with Google.`;
    }

    if (state.config.passwordEnabled) $('passwordForm').hidden = false;

    $('setupForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.target.querySelector('button');
      button.disabled = true;
      try {
        const data = await request('/api/auth/setup', {
          method: 'POST',
          body: { token: $('setupToken').value.trim(), email: $('setupEmail').value.trim() },
        });
        state.session = data.session;
        state.csrf = data.session.csrf;
        toast('Owner account saved. Welcome!', 'ok');
        showApp();
      } catch (error) {
        note($('setupNote'), error.message, 'error');
      } finally {
        button.disabled = false;
      }
    });

    $('passwordForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.target.querySelector('button');
      button.disabled = true;
      try {
        const data = await request('/api/auth/password', { method: 'POST', body: { password: $('adminPassword').value } });
        state.session = data.session;
        state.csrf = data.session.csrf;
        showApp();
      } catch (error) {
        note($('passwordNote'), error.message, 'error');
      } finally {
        button.disabled = false;
      }
    });
  }

  function loadGoogleScript() {
    return new Promise((resolve) => {
      if (window.google?.accounts?.id) return resolve();
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }

  async function onGoogleCredential(response) {
    const status = $('loginStatus');
    try {
      const data = await request('/api/auth/google', {
        method: 'POST',
        body: { credential: response.credential, setupToken: $('setupToken')?.value?.trim() || '' },
      });
      state.session = data.session;
      state.csrf = data.session.csrf;
      showApp();
    } catch (error) {
      status.className = 'login__status is-error';
      status.textContent = error.status === 403
        ? `${error.message} Ask the owner to add this address in Admin → Access.`
        : error.message;
    }
  }

  async function signOut() {
    try { await request('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    state.session = null;
    state.csrf = '';
    $('appView').hidden = true;
    $('loginView').hidden = false;
    toast('Signed out.');
  }

  /* ------------------------------------------------------------- app boot */
  async function boot() {
    await initLogin();
    try {
      const { session } = await request('/api/auth/session');
      if (session) {
        state.session = session;
        state.csrf = session.csrf;
        showApp();
        return;
      }
    } catch { /* stay on the login screen */ }
    $('loginView').hidden = false;
  }

  async function showApp() {
    $('loginView').hidden = true;
    $('appView').hidden = false;
    $('userChip').textContent = state.session?.email || '';
    $('userChip').title = `${state.session?.name || ''} · signed in with ${state.session?.method || 'google'}`;
    bindTabs();
    await Promise.all([loadOverview(), loadCars(), loadSite(), loadMessages(), loadAccess()]);
  }

  function bindTabs() {
    if (bindTabs.done) return;
    bindTabs.done = true;
    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => showTab(tab.dataset.tab));
    });
    $$('[data-goto]').forEach((button) => {
      button.addEventListener('click', () => showTab(button.dataset.goto));
    });
    $$('[data-new-car]').forEach((button) => {
      button.addEventListener('click', () => { showTab('editor'); resetEditor(); });
    });
    $('signOut').addEventListener('click', signOut);
    $('newCarBtn').addEventListener('click', () => resetEditor());
    $('addCarBtn').addEventListener('click', () => { showTab('editor'); resetEditor(); });
  }

  function showTab(name) {
    $$('.tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === name));
    $$('.panel').forEach((panel) => panel.classList.toggle('is-active', panel.id === `panel-${name}`));
    if (name === 'messages') loadMessages();
    if (name === 'cars') loadCars();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ------------------------------------------------------------ dashboard */
  async function loadOverview() {
    try {
      const data = await request('/api/admin/overview');
      state.overview = data;
      state.options = data.options;
      fillSelect($('cFuel'), data.options.fuels);
      fillSelect($('cTransmission'), data.options.transmissions);
      fillSelect($('cStatus'), data.options.statuses, { labels: { available: 'Available', sold: 'Sold', reserved: 'Booked' } });
      fillSelect($('cBody'), data.options.bodyTypes);
      $('storageBadge').textContent = data.storage === 'supabase' ? 'Supabase' : 'Local storage';

      const stats = data.stats;
      $('statGrid').innerHTML = [
        ['Cars listed', stats.total],
        ['Available', stats.available],
        ['Sold', stats.sold],
        ['Featured', stats.featured],
        ['Unread messages', stats.unread],
        ['Stock value', R.formatPrice(stats.portfolio)],
      ].map(([label, value]) => `
        <div class="stat-card">
          <p class="stat-card__value">${typeof value === 'number' ? value.toLocaleString('en-PK') : esc(value)}</p>
          <span class="stat-card__label">${esc(label)}</span>
        </div>`).join('');

      const badge = $('unreadCount');
      badge.hidden = !stats.unread;
      badge.textContent = stats.unread;

      const recent = [...state.cars].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6);
      $('recentList').innerHTML = recent.map((car) => `
        <li><span>${esc(car.title)}</span><strong>${R.formatPrice(car.price)}</strong></li>`).join('') || '<li>No cars yet.</li>';
      observeReveals(document);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function fillSelect(select, values, { labels = {}, selected = '' } = {}) {
    if (!select) return;
    select.innerHTML = (values || []).map((value) =>
      `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(labels[value] || value)}</option>`).join('');
  }

  /* -------------------------------------------------------------- inventory */
  async function loadCars() {
    try {
      const data = await request('/api/cars');
      state.cars = data.cars;
      const makes = [...new Set(state.cars.map((car) => car.make))].sort();
      const filter = $('carMakeFilter');
      const current = filter.value;
      filter.innerHTML = '<option value="">All makes</option>' + makes.map((make) => `<option value="${esc(make)}">${esc(make)}</option>`).join('');
      filter.value = current;
      renderCarTable();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderCarTable() {
    const query = ($('carSearch').value || '').toLowerCase().trim();
    const status = $('carStatusFilter').value;
    const make = $('carMakeFilter').value;
    const sort = $('carSort').value;

    let list = state.cars.filter((car) => {
      if (status && (car.status || 'available') !== status) return false;
      if (make && car.make !== make) return false;
      if (query) {
        const haystack = [car.title, car.make, car.model, car.variant, car.id, car.registrationCity].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    const sorters = {
      newest: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
      'price-desc': (a, b) => Number(b.price) - Number(a.price),
      'price-asc': (a, b) => Number(a.price) - Number(b.price),
      title: (a, b) => String(a.title).localeCompare(String(b.title)),
    };
    list = [...list].sort(sorters[sort] || sorters.newest);

    const body = $('carTableBody');
    body.innerHTML = list.map((car) => {
      const meta = statusMeta(car);
      const cover = car.images?.[0] || '/assets/img/showroom.jpg';
      return `
        <tr data-id="${esc(car.id)}">
          <td>
            <div class="car-cell">
              <img src="${esc(cover)}" alt="" loading="lazy">
              <span>
                <strong>${esc(car.title)}</strong>
                <small>${esc([car.make, car.model, car.variant].filter(Boolean).join(' '))} · ${esc(car.id)}</small>
              </span>
            </div>
          </td>
          <td data-label="Price"><strong>${R.formatPrice(car.price)}</strong><br><small class="muted">${R.formatAmount(car.price)}</small></td>
          <td data-label="Year / km">${esc(car.year)} · ${R.formatMileage(car.mileage)}</td>
          <td data-label="Status"><span class="status-pill status-pill--${esc(meta.key)}">${esc(meta.label)}</span>${car.featured ? '<br><small class="muted">Featured</small>' : ''}</td>
          <td data-label="Photos">${(car.images || []).length}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn--outline" type="button" data-edit="${esc(car.id)}">Edit</button>
              <button class="btn btn--outline" type="button" data-duplicate="${esc(car.id)}">Copy</button>
              <button class="btn btn--danger" type="button" data-delete="${esc(car.id)}">Delete</button>
            </div>
          </td>
        </tr>`;
    }).join('');
    $('carsEmpty').hidden = list.length > 0;

    $$('[data-edit]', body).forEach((button) => button.addEventListener('click', () => editCar(button.dataset.edit)));
    $$('[data-duplicate]', body).forEach((button) => button.addEventListener('click', async () => {
      try {
        await request(`/api/admin/cars/${encodeURIComponent(button.dataset.duplicate)}/duplicate`, { method: 'POST' });
        toast('Car duplicated — edit it and save.', 'ok');
        await loadCars();
        await loadOverview();
      } catch (error) { toast(error.message, 'error'); }
    }));
    $$('[data-delete]', body).forEach((button) => button.addEventListener('click', async () => {
      const car = state.cars.find((entry) => entry.id === button.dataset.delete);
      if (!car) return;
      if (!window.confirm(`Delete “${car.title}” and its photos? This cannot be undone.`)) return;
      try {
        await request(`/api/admin/cars/${encodeURIComponent(car.id)}`, { method: 'DELETE' });
        toast('Car deleted.', 'ok');
        if (state.editingId === car.id) resetEditor();
        await loadCars();
        await loadOverview();
      } catch (error) { toast(error.message, 'error'); }
    }));
  }

  /* ----------------------------------------------------------- car editor */
  function setValue(id, value) {
    const node = $(id);
    if (!node) return;
    if (node.type === 'checkbox') node.checked = Boolean(value);
    else node.value = value === undefined || value === null ? '' : value;
  }

  function resetEditor() {
    state.editingId = null;
    state.images = [];
    $('carForm').reset();
    setValue('cYear', new Date().getFullYear());
    setValue('cStatus', 'available');
    setValue('cFuel', 'Petrol');
    setValue('cTransmission', 'Manual');
    setValue('cBody', 'Hatchback');
    setValue('cFeatured', false);
    $('editorTitle').textContent = 'Add a car';
    $('deleteCar').hidden = true;
    $('cancelEdit').hidden = true;
    note($('carFormNote'), '');
    renderImages();
  }

  function editCar(id) {
    const car = state.cars.find((entry) => entry.id === id);
    if (!car) return;
    state.editingId = car.id;
    state.images = [...(car.images || [])];
    showTab('editor');
    $('editorTitle').textContent = `Edit: ${car.title}`;
    setValue('cMake', car.make);
    setValue('cModel', car.model);
    setValue('cVariant', car.variant);
    setValue('cYear', car.year);
    setValue('cPrice', car.price);
    setValue('cMileage', car.mileage);
    setValue('cEngine', car.engine);
    setValue('cFuel', car.fuel);
    setValue('cTransmission', car.transmission);
    setValue('cBody', car.bodyType);
    setValue('cColor', car.color);
    setValue('cRegistrationCity', car.registrationCity);
    setValue('cDescription', car.description);
    setValue('cStatus', car.status || 'available');
    setValue('cFeatured', car.featured);
    $('deleteCar').hidden = false;
    $('cancelEdit').hidden = false;
    note($('carFormNote'), `Editing ${car.id}`);
    renderImages();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderImages() {
    const list = $('imageList');
    if (!list) return;
    if (!state.images.length) {
      list.innerHTML = '<p class="muted small">No photos yet — add at least one before saving.</p>';
      return;
    }
    list.innerHTML = state.images.map((url, index) => `
      <div class="image-item${index === 0 ? ' is-cover' : ''}" draggable="true" data-index="${index}">
        <img src="${esc(url)}" alt="" loading="lazy">
        <span class="image-item__meta">
          <strong>${index === 0 ? 'Cover photo' : `Photo ${index + 1}`}</strong>
          ${esc(url.replace(/^https?:\/\/[^/]+/, '').slice(0, 60))}
        </span>
        <span class="image-item__actions">
          <button class="btn btn--outline" type="button" data-move="-1" data-index="${index}" ${index === 0 ? 'disabled' : ''} title="Move up">↑</button>
          <button class="btn btn--outline" type="button" data-move="1" data-index="${index}" ${index === state.images.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
          <button class="btn btn--danger" type="button" data-remove="${index}" title="Remove">Remove</button>
        </span>
      </div>`).join('');

    $$('[data-remove]', list).forEach((button) => button.addEventListener('click', async () => {
      const index = Number(button.dataset.remove);
      const [removed] = state.images.splice(index, 1);
      renderImages();
      // Only delete the file itself once the car is saved without it.
      if (removed && !state.editingId) return;
    }));
    $$('[data-move]', list).forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const target = index + Number(button.dataset.move);
      if (target < 0 || target >= state.images.length) return;
      const [item] = state.images.splice(index, 1);
      state.images.splice(target, 0, item);
      renderImages();
    }));

    let dragIndex = null;
    $$('.image-item', list).forEach((item) => {
      item.addEventListener('dragstart', () => { dragIndex = Number(item.dataset.index); item.classList.add('is-dragging'); });
      item.addEventListener('dragend', () => item.classList.remove('is-dragging'));
      item.addEventListener('dragover', (event) => event.preventDefault());
      item.addEventListener('drop', (event) => {
        event.preventDefault();
        const dropIndex = Number(item.dataset.index);
        if (dragIndex === null || dragIndex === dropIndex) return;
        const [moved] = state.images.splice(dragIndex, 1);
        state.images.splice(dropIndex, 0, moved);
        dragIndex = null;
        renderImages();
      });
    });
  }

  async function compressImage(file) {
    // Only photos are resized: GIFs would lose their animation and small
    // WebP files are already light enough to upload untouched.
    if (!/^image\//.test(file.type)) return file;
    if (file.type === 'image/gif') return file;
    if (file.type === 'image/webp' && file.size < 600 * 1024) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const max = 1600;
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && file.size < 800 * 1024) return file;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
      if (!blob) return file;
      return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' });
    } catch {
      return file;
    }
  }

  async function uploadFiles(files) {
    const dropzone = $('dropzone');
    const list = [...files];
    if (!list.length) return;
    note($('carFormNote'), `Uploading ${list.length} photo${list.length === 1 ? '' : 's'}…`);
    for (const file of list) {
      try {
        const prepared = await compressImage(file);
        const formData = new FormData();
        formData.append('file', prepared, prepared.name);
        const data = await request('/api/admin/upload', { method: 'POST', body: formData });
        state.images.push(data.url);
        renderImages();
      } catch (error) {
        note($('carFormNote'), error.message, 'error');
        toast(error.message, 'error');
      }
    }
    note($('carFormNote'), 'Photos ready. Remember to save the car.');
    if (dropzone) dropzone.classList.remove('is-over');
  }

  function bindEditor() {
    const dropzone = $('dropzone');
    const fileInput = $('fileInput');
    $('browseBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => uploadFiles(fileInput.files));
    ['dragenter', 'dragover'].forEach((type) => dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach((type) => dropzone.addEventListener(type, () => dropzone.classList.remove('is-over')));
    dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      uploadFiles(event.dataTransfer?.files || []);
    });
    $('addImageUrl').addEventListener('click', () => {
      const input = $('imageUrl');
      const url = input.value.trim();
      if (!/^(https:\/\/|\/)/.test(url)) {
        toast('Paste a link starting with https:// or use the upload button.', 'error');
        return;
      }
      state.images.push(url);
      input.value = '';
      renderImages();
    });

    $('cancelEdit').addEventListener('click', () => { resetEditor(); showTab('cars'); });
    $('deleteCar').addEventListener('click', async () => {
      if (!state.editingId) return;
      if (!window.confirm('Delete this car and its photos?')) return;
      try {
        await request(`/api/admin/cars/${encodeURIComponent(state.editingId)}`, { method: 'DELETE' });
        toast('Car deleted.', 'ok');
        resetEditor();
        await loadCars();
        await loadOverview();
        showTab('cars');
      } catch (error) { toast(error.message, 'error'); }
    });

    $('carForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('saveCar');
      const payload = {
        make: $('cMake').value.trim(),
        model: $('cModel').value.trim(),
        variant: $('cVariant').value.trim(),
        year: $('cYear').value,
        price: $('cPrice').value,
        mileage: $('cMileage').value,
        engine: $('cEngine').value.trim(),
        fuel: $('cFuel').value,
        transmission: $('cTransmission').value,
        bodyType: $('cBody').value,
        color: $('cColor').value.trim(),
        registrationCity: $('cRegistrationCity').value.trim(),
        description: $('cDescription').value.trim(),
        status: $('cStatus').value,
        featured: $('cFeatured').checked,
        images: state.images,
      };
      button.disabled = true;
      note($('carFormNote'), 'Saving…');
      try {
        if (state.editingId) {
          await request(`/api/admin/cars/${encodeURIComponent(state.editingId)}`, { method: 'PUT', body: payload });
          toast('Car updated — live on the website now.', 'ok');
        } else {
          const data = await request('/api/admin/cars', { method: 'POST', body: payload });
          state.editingId = data.car.id;
          toast('Car published.', 'ok');
        }
        await loadCars();
        await loadOverview();
        showTab('cars');
      } catch (error) {
        note($('carFormNote'), error.message, 'error');
        toast(error.message, 'error');
      } finally {
        button.disabled = false;
      }
    });

    ['carSearch', 'carStatusFilter', 'carMakeFilter', 'carSort'].forEach((id) => {
      $(id).addEventListener('input', renderCarTable);
      $(id).addEventListener('change', renderCarTable);
    });
  }

  /* --------------------------------------------------------------- messages */
  async function loadMessages() {
    try {
      const data = await request('/api/admin/inquiries');
      state.inquiries = data.inquiries;
      renderMessages();
      const unread = state.inquiries.filter((entry) => !entry.read).length;
      const badge = $('unreadCount');
      badge.hidden = !unread;
      badge.textContent = unread;
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderMessages() {
    const inbox = $('inbox');
    if (!state.inquiries.length) {
      inbox.innerHTML = '';
      $('messagesEmpty').hidden = false;
      return;
    }
    $('messagesEmpty').hidden = true;
    inbox.innerHTML = state.inquiries.map((entry) => {
      const car = entry.carId ? state.cars.find((item) => item.id === entry.carId) : null;
      const when = new Date(entry.createdAt);
      return `
        <article class="message${entry.read ? '' : ' is-unread'}" data-id="${esc(entry.id)}">
          <div class="message__head">
            <span class="message__name">${esc(entry.name)}</span>
            <span class="message__meta">${esc(when.toLocaleString('en-PK'))}${entry.phone ? ` · ${esc(prettyPhone(entry.phone))}` : ''}</span>
          </div>
          ${car ? `<p class="message__car">About: ${esc(car.title)} (${esc(car.id)}) — ${R.formatPrice(car.price)}</p>` : entry.carId ? `<p class="message__car">About car: ${esc(entry.carId)}</p>` : ''}
          <p class="message__body">${esc(entry.message)}</p>
          <div class="message__actions">
            <a class="btn btn--primary btn--sm" href="tel:+${esc(international(entry.phone))}">Call ${esc(prettyPhone(entry.phone))}</a>
            <a class="btn btn--outline btn--sm" href="${waLink(entry.phone, `Assalam o Alaikum ${entry.name}, thank you for your message about our cars.`)}" target="_blank" rel="noopener">WhatsApp</a>
            ${entry.email ? `<a class="btn btn--outline btn--sm" href="mailto:${esc(entry.email)}">Email</a>` : ''}
            <button class="btn btn--outline btn--sm" type="button" data-toggle-read="${esc(entry.id)}">${entry.read ? 'Mark unread' : 'Mark read'}</button>
            <button class="btn btn--danger btn--sm" type="button" data-delete-message="${esc(entry.id)}">Delete</button>
          </div>
        </article>`;
    }).join('');

    $$('[data-toggle-read]', inbox).forEach((button) => button.addEventListener('click', async () => {
      const entry = state.inquiries.find((item) => item.id === button.dataset.toggleRead);
      try {
        await request(`/api/admin/inquiries/${encodeURIComponent(entry.id)}`, { method: 'PATCH', body: { read: !entry.read } });
        await loadMessages();
      } catch (error) { toast(error.message, 'error'); }
    }));
    $$('[data-delete-message]', inbox).forEach((button) => button.addEventListener('click', async () => {
      if (!window.confirm('Delete this message?')) return;
      try {
        await request(`/api/admin/inquiries/${encodeURIComponent(button.dataset.deleteMessage)}`, { method: 'DELETE' });
        await loadMessages();
      } catch (error) { toast(error.message, 'error'); }
    }));
  }

  /* --------------------------------------------------------------- settings */
  async function loadSite() {
    try {
      const data = await request('/api/site');
      state.site = data.site;
      renderSiteForm(data.site);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderSiteForm(site) {
    $('sBusinessName').value = site.businessName || '';
    $('sShortName').value = site.shortName || '';
    $('sLogoText').value = site.logoText || '';
    $('sEstablished').value = site.establishedYear || '';
    $('sTagline').value = site.tagline || '';
    $('sHeadline').value = site.headline || '';
    $('sHeroDescription').value = site.heroDescription || '';
    $('sAbout').value = site.about || '';
    $('sAddress').value = site.address || '';
    $('sCity').value = site.city || '';
    $('sHours').value = site.businessHours || '';
    $('sPhones').value = (site.phones || []).join(', ');
    $('sWhatsapp').value = site.whatsappNumber || '';
    $('sEmail').value = site.email || '';
    $('sMapEmbed').value = site.mapEmbed || '';
    $('sMapLink').value = site.mapLink || '';
    $('sFooterCredit').value = site.footerCredit || '';
    $('sFacebook').value = site.social?.facebook || '';
    $('sInstagram').value = site.social?.instagram || '';
    $('sYoutube').value = site.social?.youtube || '';
    $('sTiktok').value = site.social?.tiktok || '';
    $('sSeoTitle').value = site.seo?.title || '';
    $('sSeoDescription').value = site.seo?.description || '';
    $('sSeoKeywords').value = site.seo?.keywords || '';
    $('sLogoImage').value = site.logoImage || '';
    $('logoNote').textContent = site.logoNote || '';
    renderLogoPreview(site.logoImage || '');
    renderRepeat('ownersEditor', site.owners || []);
    renderRepeat('statsEditor', site.stats || []);
    renderRepeat('whyEditor', site.whyChooseUs || []);
  }

  function renderLogoPreview(url) {
    const preview = $('logoPreview');
    if (!preview) return;
    preview.innerHTML = url
      ? `<img src="${esc(url)}" alt="Current logo">`
      : '<span>97 GROUP</span>';
  }

  /* ------------------------------------------------------------ repeat rows */
  const repeatTemplates = {
    owners: (row = {}) => `
      <div class="field-row">
        <div class="field"><label>Name</label><input data-key="name" value="${esc(row.name || '')}" maxlength="80"></div>
        <div class="field"><label>Role</label><input data-key="role" value="${esc(row.role || 'Owner')}" maxlength="60"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Phone (03xx…)</label><input data-key="phone" value="${esc(row.phone || '')}" maxlength="20"></div>
        <div class="field"><label>WhatsApp (923xx…)</label><input data-key="whatsapp" value="${esc(row.whatsapp || '')}" maxlength="20"></div>
      </div>`,
    stats: (row = {}) => `
      <div class="field-row">
        <div class="field"><label>Number</label><input data-key="value" type="number" min="0" value="${esc(row.value ?? '')}"></div>
        <div class="field"><label>Suffix</label><input data-key="suffix" value="${esc(row.suffix || '')}" maxlength="4" placeholder="+"></div>
      </div>
      <div class="field"><label>Label</label><input data-key="label" value="${esc(row.label || '')}" maxlength="60" placeholder="Cars delivered"></div>`,
    whyChooseUs: (row = {}) => `
      <div class="field-row">
        <div class="field">
          <label>Icon</label>
          <select data-key="icon">
            ${['shield', 'rupee', 'file', 'handshake', 'swap', 'pin', 'star', 'car'].map((name) =>
              `<option value="${name}"${row.icon === name ? ' selected' : ''}>${name}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Title</label><input data-key="title" value="${esc(row.title || '')}" maxlength="80"></div>
      </div>
      <div class="field"><label>Text</label><textarea data-key="text" rows="2" maxlength="400">${esc(row.text || '')}</textarea></div>`,
  };

  function renderRepeat(containerId, rows) {
    const holder = $(containerId);
    if (!holder) return;
    const kind = containerId === 'ownersEditor' ? 'owners' : containerId === 'statsEditor' ? 'stats' : 'whyChooseUs';
    holder.dataset.kind = kind;
    holder.innerHTML = rows.map((row) => `
      <div class="repeat-row" data-kind="${kind}">
        <button class="repeat-row__remove" type="button" aria-label="Remove row">&times;</button>
        ${repeatTemplates[kind](row)}
      </div>`).join('');
    holder.querySelectorAll('.repeat-row__remove').forEach((button) => {
      button.addEventListener('click', () => button.closest('.repeat-row').remove());
    });
  }

  function collectRepeat(containerId, keys) {
    const holder = $(containerId);
    if (!holder) return [];
    return $$('.repeat-row', holder).map((row) => {
      const entry = {};
      keys.forEach((key) => {
        const input = row.querySelector(`[data-key="${key}"]`);
        entry[key] = input ? input.value.trim() : '';
      });
      return entry;
    });
  }

  function bindSettings() {
    $$('[data-add-row]').forEach((button) => button.addEventListener('click', () => {
      const kind = button.dataset.addRow;
      const holder = kind === 'owners' ? $('ownersEditor') : kind === 'stats' ? $('statsEditor') : $('whyEditor');
      const row = document.createElement('div');
      row.className = 'repeat-row';
      row.dataset.kind = kind;
      row.innerHTML = `<button class="repeat-row__remove" type="button" aria-label="Remove row">&times;</button>${repeatTemplates[kind]({})}`;
      row.querySelector('.repeat-row__remove').addEventListener('click', () => row.remove());
      holder.appendChild(row);
      row.querySelector('input')?.focus();
    }));

    $('logoBrowse').addEventListener('click', () => $('logoInput').click());
    $('logoInput').addEventListener('change', async () => {
      const file = $('logoInput').files[0];
      if (!file) return;
      try {
        const prepared = await compressImage(file);
        const formData = new FormData();
        formData.append('file', prepared, prepared.name);
        const data = await request('/api/admin/upload', { method: 'POST', body: formData });
        $('sLogoImage').value = data.url;
        renderLogoPreview(data.url);
        toast('Logo uploaded — press “Save settings” to publish it.', 'ok');
      } catch (error) { toast(error.message, 'error'); }
    });
    $('logoClear').addEventListener('click', () => {
      $('sLogoImage').value = '';
      renderLogoPreview('');
    });

    $('reloadSite').addEventListener('click', () => { loadSite(); toast('Settings reloaded.'); });

    $('siteForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        businessName: $('sBusinessName').value,
        shortName: $('sShortName').value,
        logoText: $('sLogoText').value,
        logoImage: $('sLogoImage').value,
        establishedYear: $('sEstablished').value,
        tagline: $('sTagline').value,
        headline: $('sHeadline').value,
        heroDescription: $('sHeroDescription').value,
        about: $('sAbout').value,
        address: $('sAddress').value,
        city: $('sCity').value,
        businessHours: $('sHours').value,
        phones: $('sPhones').value.split(',').map((value) => value.trim()).filter(Boolean),
        whatsappNumber: $('sWhatsapp').value,
        email: $('sEmail').value,
        mapEmbed: $('sMapEmbed').value,
        mapLink: $('sMapLink').value,
        footerCredit: $('sFooterCredit').value,
        social: {
          facebook: $('sFacebook').value,
          instagram: $('sInstagram').value,
          youtube: $('sYoutube').value,
          tiktok: $('sTiktok').value,
        },
        seo: {
          title: $('sSeoTitle').value,
          description: $('sSeoDescription').value,
          keywords: $('sSeoKeywords').value,
        },
        owners: collectRepeat('ownersEditor', ['name', 'role', 'phone', 'whatsapp']),
        stats: collectRepeat('statsEditor', ['value', 'suffix', 'label']),
        whyChooseUs: collectRepeat('whyEditor', ['icon', 'title', 'text']),
      };
      const button = event.target.querySelector('button[type="submit"]');
      button.disabled = true;
      note($('siteNote'), 'Saving…');
      try {
        const data = await request('/api/admin/site', { method: 'PUT', body: payload });
        state.site = data.site;
        note($('siteNote'), 'Saved. The website is updated.', 'ok');
        toast('Business settings saved.', 'ok');
      } catch (error) {
        note($('siteNote'), error.message, 'error');
        toast(error.message, 'error');
      } finally {
        button.disabled = false;
      }
    });
  }

  /* ----------------------------------------------------------------- access */
  async function loadAccess() {
    try {
      const data = await request('/api/admin/overview');
      renderEmailList(data.adminEmails);
      $('disablePassword').disabled = !data.passwordEnabled;
    } catch { /* overview already reported the error */ }
  }

  function renderEmailList(emails) {
    const list = $('emailList');
    if (!list) return;
    list.innerHTML = emails.map((email) => `
      <div class="email-row${email === state.session?.email ? ' is-me' : ''}">
        <span>${esc(email)}</span>
        ${emails.length > 1 ? `<button class="btn btn--danger btn--sm" type="button" data-remove-email="${esc(email)}">Remove</button>` : ''}
      </div>`).join('');
    $$('[data-remove-email]', list).forEach((button) => button.addEventListener('click', async () => {
      const remaining = emails.filter((email) => email !== button.dataset.removeEmail);
      await saveEmails(remaining);
    }));
  }

  async function saveEmails(emails) {
    try {
      const data = await request('/api/admin/access', { method: 'PUT', body: { emails } });
      renderEmailList(data.adminEmails);
      note($('accessNote'), 'Access list saved.', 'ok');
    } catch (error) {
      note($('accessNote'), error.message, 'error');
    }
  }

  function bindAccess() {
    $('addAdminEmail').addEventListener('click', async () => {
      const input = $('newAdminEmail');
      const email = input.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        note($('accessNote'), 'Enter a valid email address.', 'error');
        return;
      }
      const current = $$('#emailList .email-row span').map((node) => node.textContent.trim());
      if (current.includes(email)) {
        note($('accessNote'), 'That address is already allowed.', 'error');
        return;
      }
      await saveEmails([...current, email]);
      input.value = '';
    });

    $('savePassword').addEventListener('click', async () => {
      const value = $('newPassword').value;
      try {
        await request('/api/admin/password', { method: 'POST', body: { password: value } });
        $('newPassword').value = '';
        note($('passwordChangeNote'), 'Password updated. Keep it somewhere safe.', 'ok');
        $('disablePassword').disabled = false;
      } catch (error) {
        note($('passwordChangeNote'), error.message, 'error');
      }
    });

    $('disablePassword').addEventListener('click', async () => {
      if (!window.confirm('Disable password sign-in? Google sign-in will be the only way in.')) return;
      try {
        await request('/api/admin/password', { method: 'POST', body: { disable: true } });
        note($('passwordChangeNote'), 'Password sign-in disabled.', 'ok');
        $('disablePassword').disabled = true;
      } catch (error) {
        note($('passwordChangeNote'), error.message, 'error');
      }
    });

    $('refreshMessages').addEventListener('click', () => loadMessages());
  }

  /* ------------------------------------------------------------------- boot */
  document.addEventListener('DOMContentLoaded', () => {
    bindEditor();
    bindSettings();
    bindAccess();
    boot();
  });
})();
