/* Admin panel: session-based sign-in, menu CRUD with photo uploads, restaurant and delivery settings. */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const formatPrice = (amount) => `Rs ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(Number(amount) || 0)}`;
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const PLACEHOLDER = '/assets/img/food/placeholder.svg';

  let csrfToken = '';
  let data = { site: {}, items: [], categories: [] };
  let editingId = null;
  let pendingFile = null;
  let removePhoto = false;
  let previewUrl = '';
  let toastTimer = 0;

  async function request(url, options = {}) {
    const headers = new Headers(options.headers || {});
    let body = options.body;
    if (body && typeof body !== 'string') {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    } else if (body) {
      headers.set('Content-Type', 'application/json');
    }
    const method = (options.method || 'GET').toUpperCase();
    if (url.startsWith('/api/admin/') && !['GET', 'HEAD'].includes(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken);
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, method, body, headers });
    let payload = {};
    if ((response.headers.get('content-type') || '').includes('application/json')) {
      try { payload = await response.json(); } catch { payload = {}; }
    }
    if (!response.ok) {
      if (response.status === 401 && url.startsWith('/api/admin/') && !url.includes('/login') && !url.includes('/password')) {
        csrfToken = '';
        showLogin('Your session has ended. Please sign in again.');
      }
      throw Object.assign(new Error(payload.error || 'Something went wrong. Please try again.'), { status: response.status });
    }
    return payload;
  }

  function toast(message, isError = false) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.toggle('is-error', isError);
    element.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => element.classList.remove('is-visible'), 3600);
  }
  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle('is-error', isError);
  }
  function setFieldError(id, message) {
    const field = document.getElementById(id);
    const error = document.getElementById(`${id}-error`);
    if (field) field.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (error) error.textContent = message || '';
  }

  // ---------- Views ----------
  function showLogin(message = '') {
    $('#dashboard').hidden = true;
    $('#login-view').hidden = false;
    setStatus($('#login-status'), message, Boolean(message));
    $('#login-password').value = '';
    $('#login-password').focus();
  }
  function showDashboard() {
    $('#login-view').hidden = true;
    $('#dashboard').hidden = false;
    renderAll();
  }

  function setTab(name, { focus = false } = {}) {
    $$('[role="tab"]').forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    $$('.admin-panel').forEach((panel) => {
      const active = panel.id === `panel-${name}`;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
  }

  // ---------- Rendering ----------
  function renderAll() {
    renderStats();
    renderItems();
    fillSiteForms();
    renderCategoryOptions();
  }

  function renderStats() {
    const items = data.items;
    const available = items.filter((item) => item.available).length;
    const priced = items.filter((item) => Number.isInteger(item.price)).length;
    const onMenu = items.filter((item) => item.published !== false).length;
    $('#admin-stats').innerHTML = [
      ['Menu items', items.length],
      ['Available now', available],
      ['Unavailable', items.length - available],
      ['With price set', priced],
    ].map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('') + `<span class="visually-hidden">${onMenu} items shown on the menu</span>`;
  }

  function renderItems() {
    const container = $('#admin-items');
    if (!data.items.length) {
      container.innerHTML = '<p class="admin-notice">No menu items yet. Use “Add menu item” to create the first one.</p>';
      return;
    }
    container.innerHTML = data.items.map((item) => {
      const price = Number.isInteger(item.price) ? formatPrice(item.price) : 'Price to be confirmed';
      return `
        <div class="admin-row" data-id="${escapeHtml(item.id)}">
          <img src="${escapeHtml(item.image || PLACEHOLDER)}" alt="" width="72" height="56" loading="lazy">
          <div class="row-name">
            <b>${escapeHtml(item.name)}</b>
            <small>${escapeHtml(item.category)}${item.featured ? ' · Popular' : ''}</small>
          </div>
          <div class="row-price"><span class="${Number.isInteger(item.price) ? '' : 'muted'}">${escapeHtml(price)}</span></div>
          <div class="row-visibility">
            <label class="inline"><input type="checkbox" data-toggle="available"${item.available ? ' checked' : ''}> Available</label>
            <label class="inline"><input type="checkbox" data-toggle="published"${item.published !== false ? ' checked' : ''}> On menu</label>
          </div>
          <div class="row-actions">
            <button class="btn btn-small btn-dark" type="button" data-edit>Edit</button>
            <button class="btn btn-small danger" type="button" data-delete aria-label="Delete ${escapeHtml(item.name)}">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  function renderCategoryOptions() {
    const select = $('#item-category');
    const current = select.value;
    select.innerHTML = data.categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    if (current) select.value = current;
  }

  function fillSiteForms() {
    const site = data.site || {};
    const restaurantForm = $('#restaurant-form');
    for (const field of ['tagline', 'heroDescription', 'about', 'contactPerson', 'city', 'phone', 'whatsapp', 'location', 'mapsQuery']) {
      const input = restaurantForm.elements.namedItem(field);
      if (input) input.value = site[field] || '';
    }
    const delivery = site.delivery || {};
    const deliveryForm = $('#delivery-form');
    deliveryForm.elements.namedItem('available').checked = delivery.available !== false;
    deliveryForm.elements.namedItem('charge').value = Number.isInteger(delivery.charge) ? delivery.charge : '';
    deliveryForm.elements.namedItem('minimumOrder').value = Number.isInteger(delivery.minimumOrder) ? delivery.minimumOrder : '';
    deliveryForm.elements.namedItem('estimatedTime').value = delivery.estimatedTime || '';
    deliveryForm.elements.namedItem('areas').value = delivery.areas || '';
    deliveryForm.elements.namedItem('note').value = delivery.note || '';
  }

  // ---------- Session ----------
  async function init() {
    setupEvents();
    try {
      const session = await request('/api/admin/session');
      if (!session.ok) { showLogin(); return; }
      csrfToken = session.csrfToken;
      await loadData();
      showDashboard();
    } catch {
      showLogin();
    }
  }

  async function loadData() {
    data = await request('/api/admin/data');
  }

  async function handleLogin(event) {
    event.preventDefault();
    const password = $('#login-password').value;
    if (!password) {
      setStatus($('#login-status'), 'Please enter the admin password.', true);
      $('#login-password').focus();
      return;
    }
    const button = $('#login-submit');
    button.disabled = true;
    setStatus($('#login-status'), 'Signing in…');
    try {
      const result = await request('/api/admin/login', { method: 'POST', body: { password } });
      csrfToken = result.csrfToken;
      $('#login-password').value = '';
      await loadData();
      setStatus($('#login-status'), '');
      showDashboard();
      setTab('menu', { focus: false });
    } catch (error) {
      setStatus($('#login-status'), error.message, true);
      $('#login-password').select();
    } finally {
      button.disabled = false;
    }
  }

  async function handleLogout() {
    try { await request('/api/admin/logout', { method: 'POST' }); } catch { /* session may already be gone */ }
    csrfToken = '';
    showLogin('You have signed out.');
  }

  // ---------- Menu items ----------
  function openItemDialog(item = null) {
    editingId = item ? item.id : null;
    pendingFile = null;
    removePhoto = false;
    const form = $('#item-form');
    form.reset();
    renderCategoryOptions();
    form.elements.namedItem('id').value = item ? item.id : '';
    $('#item-dialog-title').textContent = item ? `Edit ${item.name}` : 'Add menu item';
    if (item) {
      form.elements.namedItem('name').value = item.name || '';
      form.elements.namedItem('category').value = item.category || data.categories[0] || '';
      form.elements.namedItem('price').value = Number.isInteger(item.price) ? item.price : '';
      form.elements.namedItem('sortOrder').value = Number.isInteger(item.sortOrder) ? item.sortOrder : '';
      form.elements.namedItem('description').value = item.description || '';
      form.elements.namedItem('available').checked = item.available !== false;
      form.elements.namedItem('published').checked = item.published !== false;
      form.elements.namedItem('featured').checked = item.featured === true;
    } else {
      form.elements.namedItem('category').value = data.categories[0] || '';
      form.elements.namedItem('available').checked = true;
      form.elements.namedItem('published').checked = true;
    }
    $('#item-image-preview').src = item?.image || PLACEHOLDER;
    $('#item-photo-state').textContent = item ? 'Current photo shown. Choose a new file to replace it.' : 'No photo yet. The placeholder is shown until you upload one.';
    setStatus($('#item-form-status'), '');
    $$('#item-form [aria-invalid]').forEach((element) => element.setAttribute('aria-invalid', 'false'));
    setFieldError('item-name', '');
    const dialog = $('#item-dialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    form.elements.namedItem('name').focus();
  }

  function closeItemDialog() {
    const dialog = $('#item-dialog');
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; }
    pendingFile = null;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('The photo could not be read. Please try another file.'));
      reader.readAsDataURL(file);
    });
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      pendingFile = null;
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setStatus($('#item-form-status'), 'Please choose a JPEG, PNG or WebP photo.', true);
      event.target.value = '';
      pendingFile = null;
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus($('#item-form-status'), 'Please choose a photo smaller than 5 MB.', true);
      event.target.value = '';
      pendingFile = null;
      return;
    }
    pendingFile = file;
    removePhoto = false;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    $('#item-image-preview').src = previewUrl;
    $('#item-photo-state').textContent = `New photo selected: ${file.name}. It uploads when you save.`;
    setStatus($('#item-form-status'), '');
  }

  function handleRemovePhoto() {
    pendingFile = null;
    removePhoto = true;
    $('#item-file').value = '';
    $('#item-image-preview').src = PLACEHOLDER;
    $('#item-photo-state').textContent = 'The photo will be removed when you save, and the placeholder will show instead.';
  }

  async function saveItem(event) {
    event.preventDefault();
    const form = $('#item-form');
    const name = form.elements.namedItem('name').value.trim();
    const category = form.elements.namedItem('category').value;
    setFieldError('item-name', '');
    if (name.length < 2) {
      setFieldError('item-name', 'Enter the item name (at least 2 characters).');
      form.elements.namedItem('name').focus();
      return;
    }
    const priceRaw = form.elements.namedItem('price').value.trim();
    const sortRaw = form.elements.namedItem('sortOrder').value.trim();
    const payload = {
      name,
      category,
      description: form.elements.namedItem('description').value.trim(),
      price: priceRaw === '' ? null : Number(priceRaw),
      available: form.elements.namedItem('available').checked,
      published: form.elements.namedItem('published').checked,
      featured: form.elements.namedItem('featured').checked,
    };
    if (payload.price !== null && (!Number.isInteger(payload.price) || payload.price < 0)) {
      setStatus($('#item-form-status'), 'Enter the price as a whole number of rupees, or leave it blank.', true);
      form.elements.namedItem('price').focus();
      return;
    }
    if (sortRaw !== '') payload.sortOrder = Number(sortRaw);
    const button = $('#item-save');
    button.disabled = true;
    try {
      setStatus($('#item-form-status'), 'Saving…');
      if (pendingFile) {
        const dataUrl = await readFileAsDataUrl(pendingFile);
        const uploaded = await request('/api/admin/upload', { method: 'POST', body: { dataUrl } });
        payload.image = uploaded.image;
      } else if (removePhoto) {
        payload.image = '';
      }
      if (editingId) {
        await request(`/api/admin/items/${encodeURIComponent(editingId)}`, { method: 'PUT', body: payload });
      } else {
        await request('/api/admin/items', { method: 'POST', body: payload });
      }
      await loadData();
      renderAll();
      closeItemDialog();
      toast(editingId ? 'Menu item updated.' : 'Menu item added.');
    } catch (error) {
      setStatus($('#item-form-status'), error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function toggleItem(input) {
    const row = input.closest('.admin-row');
    const item = data.items.find((entry) => entry.id === row.dataset.id);
    if (!item) return;
    const field = input.dataset.toggle;
    const previous = item[field] !== false;
    input.disabled = true;
    try {
      await request(`/api/admin/items/${encodeURIComponent(item.id)}`, { method: 'PUT', body: { [field]: input.checked } });
      item[field] = input.checked;
      renderStats();
      toast(`${item.name} ${field === 'available' ? (input.checked ? 'is available' : 'is marked unavailable') : (input.checked ? 'is on the menu' : 'is hidden from the menu')}.`);
    } catch (error) {
      input.checked = previous;
      toast(error.message, true);
    } finally {
      input.disabled = false;
    }
  }

  async function deleteItem(row) {
    const item = data.items.find((entry) => entry.id === row.dataset.id);
    if (!item) return;
    if (!window.confirm(`Delete “${item.name}” from the menu? This cannot be undone.`)) return;
    try {
      await request(`/api/admin/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      await loadData();
      renderAll();
      toast('Menu item deleted.');
    } catch (error) {
      toast(error.message, true);
    }
  }

  // ---------- Settings ----------
  async function saveRestaurant(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = $('#restaurant-status');
    const body = Object.fromEntries(['tagline', 'heroDescription', 'about', 'contactPerson', 'city', 'phone', 'whatsapp', 'location', 'mapsQuery'].map((key) => [key, form.elements.namedItem(key).value.trim()]));
    ['contactPerson', 'phone', 'whatsapp', 'location'].forEach((key) => setFieldError(`site-${key === 'contactPerson' ? 'contact' : key}`, ''));
    if (!body.contactPerson) setFieldError('site-contact', 'Enter the contact person’s name.');
    if (AFFDigits(body.phone).length < 7) setFieldError('site-phone', 'Enter a valid phone number.');
    if (AFFDigits(body.whatsapp).length < 7) setFieldError('site-whatsapp', 'Enter a valid WhatsApp number.');
    if (!body.location) setFieldError('site-location', 'Enter the restaurant location.');
    if (!body.contactPerson || AFFDigits(body.phone).length < 7 || AFFDigits(body.whatsapp).length < 7 || !body.location) {
      setStatus(status, 'Please fix the highlighted fields.', true);
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    try {
      setStatus(status, 'Saving…');
      data = await request('/api/admin/site', { method: 'PUT', body });
      fillSiteForms();
      setStatus(status, 'Saved. The website now shows these details.');
      toast('Restaurant details saved.');
    } catch (error) {
      setStatus(status, error.message, true);
    }
  }

  async function saveDelivery(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = $('#delivery-status-msg');
    const numberOrNull = (value) => (value.trim() === '' ? null : Number(value));
    const charge = numberOrNull(form.elements.namedItem('charge').value);
    const minimumOrder = numberOrNull(form.elements.namedItem('minimumOrder').value);
    if ((charge !== null && (!Number.isInteger(charge) || charge < 0)) || (minimumOrder !== null && (!Number.isInteger(minimumOrder) || minimumOrder < 0))) {
      setStatus(status, 'Enter delivery amounts as whole rupees, or leave them blank.', true);
      return;
    }
    const body = {
      delivery: {
        available: form.elements.namedItem('available').checked,
        charge,
        minimumOrder,
        estimatedTime: form.elements.namedItem('estimatedTime').value.trim(),
        areas: form.elements.namedItem('areas').value.trim(),
        note: form.elements.namedItem('note').value.trim(),
      },
    };
    try {
      setStatus(status, 'Saving…');
      data = await request('/api/admin/site', { method: 'PUT', body });
      fillSiteForms();
      setStatus(status, 'Saved. Customers now see these delivery details.');
      toast('Delivery settings saved.');
    } catch (error) {
      setStatus(status, error.message, true);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = $('#password-status');
    const currentPassword = form.elements.namedItem('currentPassword').value;
    const newPassword = form.elements.namedItem('newPassword').value;
    const confirmPassword = form.elements.namedItem('confirmPassword').value;
    if (newPassword.length < 12) { setStatus(status, 'Choose a new password of at least 12 characters.', true); return; }
    if (newPassword !== confirmPassword) { setStatus(status, 'The new passwords do not match.', true); return; }
    try {
      const result = await request('/api/admin/password', { method: 'POST', body: { currentPassword, newPassword } });
      csrfToken = result.csrfToken;
      form.reset();
      setStatus(status, 'Password updated. Keep it somewhere safe.');
      toast('Password updated.');
    } catch (error) {
      setStatus(status, error.message, true);
    }
  }

  function AFFDigits(value = '') { return String(value).replace(/\D/g, ''); }

  // ---------- Events ----------
  function setupEvents() {
    $('#login-form').addEventListener('submit', handleLogin);
    $('#logout-button').addEventListener('click', handleLogout);
    $('#add-item-button').addEventListener('click', () => openItemDialog(null));
    $('#admin-items').addEventListener('click', (event) => {
      const row = event.target.closest('.admin-row');
      if (!row) return;
      if (event.target.closest('[data-edit]')) {
        const item = data.items.find((entry) => entry.id === row.dataset.id);
        if (item) openItemDialog(item);
      } else if (event.target.closest('[data-delete]')) {
        deleteItem(row);
      }
    });
    $('#admin-items').addEventListener('change', (event) => {
      if (event.target.matches('[data-toggle]')) toggleItem(event.target);
    });
    $('#item-form').addEventListener('submit', saveItem);
    $('#item-file').addEventListener('change', handleFileChange);
    $('#item-remove-photo').addEventListener('click', handleRemovePhoto);
    $('#item-cancel').addEventListener('click', closeItemDialog);
    $('#item-dialog-close').addEventListener('click', closeItemDialog);
    $('#item-dialog').addEventListener('close', () => { if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; } });
    $('#restaurant-form').addEventListener('submit', saveRestaurant);
    $('#delivery-form').addEventListener('submit', saveDelivery);
    $('#password-form').addEventListener('submit', changePassword);
    $$('[role="tab"]').forEach((tab) => {
      tab.addEventListener('click', () => setTab(tab.dataset.tab));
      tab.addEventListener('keydown', (event) => {
        const tabs = $$('[role="tab"]');
        const index = tabs.indexOf(tab);
        let next = null;
        if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
        if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
        if (event.key === 'Home') next = tabs[0];
        if (event.key === 'End') next = tabs[tabs.length - 1];
        if (next) {
          event.preventDefault();
          setTab(next.dataset.tab, { focus: true });
        }
      });
    });
  }

  init();
})();
