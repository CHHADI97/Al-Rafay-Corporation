/* Contact & Order page: directions/call data, delivery details, the basket-backed order form and WhatsApp hand-off. */
(() => {
  'use strict';

  const AFF = window.AFF;
  const { $, escapeHtml, formatPrice, state } = AFF;
  const params = new URLSearchParams(window.location.search);
  const form = $('#order-form-el');
  const MAX_ORDER_LINES = 25;
  let statusMessage = '';
  let statusIsError = false;

  const itemById = (id) => state.items.find((item) => item.id === id);
  const lineDetails = (line) => {
    const item = itemById(line.id);
    return {
      id: line.id,
      qty: line.qty,
      name: item?.name || line.name || 'Menu item',
      price: item && Number.isInteger(item.price) ? item.price : null,
      available: Boolean(item && item.available),
      known: Boolean(item),
    };
  };
  const basketDetails = () => AFF.basket.read().map(lineDetails);
  const orderType = () => form.querySelector('input[name="orderType"]:checked')?.value || 'delivery';
  const isDelivery = () => orderType() === 'delivery';

  // ---------- Delivery info ----------
  function renderDeliveryInfo() {
    const delivery = state.restaurant.delivery || {};
    const charge = Number.isInteger(delivery.charge) ? formatPrice(delivery.charge) : 'To be confirmed';
    $('#delivery-charge-text').textContent = charge;
    $('#delivery-eta-text').textContent = delivery.estimatedTime || 'Confirm on WhatsApp';
    const areas = String(delivery.areas || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const extras = [];
    if (areas.length) extras.push(`Areas: ${areas.join(', ')}.`);
    else extras.push('Delivery areas are confirmed on WhatsApp.');
    if (Number.isInteger(delivery.minimumOrder)) extras.push(`Minimum order: ${formatPrice(delivery.minimumOrder)}.`);
    if (delivery.note) extras.push(delivery.note);
    $('#delivery-areas-text').textContent = extras.join(' ');
  }

  // ---------- Items ----------
  function renderAddSelect() {
    const select = $('#add-item-select');
    const current = select.value;
    const options = state.items.filter((item) => item.available);
    select.innerHTML = '<option value="">Choose an item…</option>' + options.map((item) => {
      const price = Number.isInteger(item.price) ? formatPrice(item.price) : 'Price to be confirmed';
      return `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(price)}</option>`;
    }).join('');
    if (options.some((item) => item.id === current)) select.value = current;
  }

  function renderLines() {
    const container = $('#order-lines');
    const lines = basketDetails();
    $('#empty-basket').hidden = lines.length > 0;
    container.innerHTML = lines.map((line) => {
      const priceText = !line.known
        ? 'No longer on the menu'
        : !line.available
          ? 'Currently unavailable — please remove'
          : line.price !== null ? `${formatPrice(line.price)} each` : 'Price to be confirmed';
      const invalid = !line.known || !line.available;
      return `
        <div class="order-line" data-id="${escapeHtml(line.id)}">
          <div>
            <b>${escapeHtml(line.name)}</b>
            <small${invalid ? ' style="color:#a22a23;font-weight:600"' : ''}>${escapeHtml(priceText)}</small>
          </div>
          <div class="line-controls">
            <div class="qty-mini" role="group" aria-label="Quantity of ${escapeHtml(line.name)}">
              <button type="button" data-line-dec aria-label="Decrease quantity of ${escapeHtml(line.name)}">−</button>
              <output aria-live="polite">${line.qty}</output>
              <button type="button" data-line-inc aria-label="Increase quantity of ${escapeHtml(line.name)}"${line.qty >= AFF.MAX_QTY ? ' disabled' : ''}>+</button>
            </div>
            <button class="remove-btn" type="button" data-line-remove aria-label="Remove ${escapeHtml(line.name)} from your order">Remove</button>
          </div>
        </div>`;
    }).join('');
    renderTotals();
  }

  function renderTotals() {
    const lines = basketDetails();
    const allPriced = lines.length > 0 && lines.every((line) => line.available && line.price !== null);
    const subtotal = allPriced ? lines.reduce((sum, line) => sum + line.price * line.qty, 0) : 0;
    const delivery = state.restaurant.delivery || {};
    const deliveryCharge = Number.isInteger(delivery.charge) ? delivery.charge : null;
    const deliveryRow = !isDelivery()
      ? '<div><span>Delivery charge</span><strong>Not applicable (pickup)</strong></div>'
      : `<div><span>Delivery charge</span><strong>${deliveryCharge !== null ? escapeHtml(formatPrice(deliveryCharge)) : 'To be confirmed on WhatsApp'}</strong></div>`;
    let totalRow;
    if (allPriced) {
      const total = subtotal + (isDelivery() && deliveryCharge !== null ? deliveryCharge : 0);
      const label = isDelivery() && deliveryCharge === null ? 'Estimated total (before delivery charge)' : 'Estimated total';
      totalRow = `<div class="total-main"><span>${label}</span><strong>${escapeHtml(formatPrice(total))}</strong></div>`;
      $('#totals').innerHTML = `<div><span>Items subtotal</span><strong>${escapeHtml(formatPrice(subtotal))}</strong></div>${deliveryRow}${totalRow}`;
    } else {
      totalRow = '<div class="total-main"><span>Estimated total</span><strong>Confirmed on WhatsApp</strong></div>';
      $('#totals').innerHTML = `<div><span>Items</span><strong>Prices to be confirmed</strong></div>${deliveryRow}${totalRow}`;
    }
  }

  function clearErrors() {
    form.querySelectorAll('[aria-invalid="true"]').forEach((element) => element.removeAttribute('aria-invalid'));
    form.querySelectorAll('.error').forEach((element) => { element.textContent = ''; element.classList.remove('is-visible'); });
    const summary = $('#form-errors');
    summary.hidden = true;
    summary.innerHTML = '';
  }

  function setFieldError(fieldId, errorId, message) {
    const field = document.getElementById(fieldId);
    const error = document.getElementById(errorId);
    if (field) field.setAttribute('aria-invalid', 'true');
    if (error) { error.textContent = message; error.classList.add('is-visible'); }
  }

  function validate() {
    clearErrors();
    const problems = [];
    const lines = basketDetails();
    if (!lines.length) {
      $('#items-error').textContent = 'Please add at least one item to your order.';
      $('#items-error').classList.add('is-visible');
      problems.push({ id: 'add-item-select', text: 'Add at least one item to your order.' });
    } else if (lines.some((line) => !line.known || !line.available)) {
      $('#items-error').textContent = 'Some items are no longer available. Please remove them before sending.';
      $('#items-error').classList.add('is-visible');
      problems.push({ id: 'order-lines', text: 'Remove unavailable items from your order.' });
    }
    const name = $('#customer-name').value.trim();
    if (name.length < 2) {
      setFieldError('customer-name', 'customer-name-error', 'Please enter your name (at least 2 characters).');
      problems.push({ id: 'customer-name', text: 'Enter your name.' });
    } else if (!/\p{L}/u.test(name)) {
      setFieldError('customer-name', 'customer-name-error', 'Your name should include letters.');
      problems.push({ id: 'customer-name', text: 'Your name should include letters.' });
    }
    const phone = $('#customer-phone').value.trim();
    const phoneDigits = AFF.digitsOnly(phone);
    if (!phone) {
      setFieldError('customer-phone', 'customer-phone-error', 'Please enter a phone number so we can confirm your order.');
      problems.push({ id: 'customer-phone', text: 'Enter your phone number.' });
    } else if (!/^[0-9+()\-\s]+$/.test(phone) || phoneDigits.length < 10 || phoneDigits.length > 13) {
      setFieldError('customer-phone', 'customer-phone-error', 'Enter a valid phone number, for example 0301 5136842.');
      problems.push({ id: 'customer-phone', text: 'Enter a valid phone number.' });
    }
    const address = $('#customer-address').value.trim();
    if (isDelivery()) {
      if (address.length < 10) {
        setFieldError('customer-address', 'customer-address-error', 'Enter your full delivery address (house or street, and area).');
        problems.push({ id: 'customer-address', text: 'Enter your delivery address.' });
      }
    }
    if (problems.length) {
      const summary = $('#form-errors');
      summary.innerHTML = `<strong>Please fix the following before sending:</strong><ul>${problems.map((problem) => `<li><a href="#${problem.id}">${escapeHtml(problem.text)}</a></li>`).join('')}</ul>`;
      summary.hidden = false;
      return null;
    }
    return { name, phone, address, notes: $('#customer-notes').value.trim(), lines };
  }

  function buildMessage(details) {
    const delivery = isDelivery();
    const allPriced = details.lines.every((line) => line.available && line.price !== null);
    const subtotal = details.lines.reduce((sum, line) => sum + line.price * line.qty, 0);
    const deliveryCharge = Number.isInteger(state.restaurant.delivery?.charge) ? state.restaurant.delivery.charge : null;
    const itemLines = details.lines.map((line) => `- ${line.name} x ${line.qty}`);
    const totalLine = allPriced
      ? `Estimated total: ${formatPrice(subtotal + (delivery && deliveryCharge !== null ? deliveryCharge : 0))}${delivery && deliveryCharge === null ? ' (excluding delivery charge)' : ''}`
      : null;
    const lines = [
      'Assalam-o-Alaikum! I would like to order from Appetizer Fast Foods.',
      '',
      `Customer: ${details.name}`,
      `Phone: ${details.phone}`,
      'Items:',
      ...itemLines,
    ];
    if (totalLine) lines.push(totalLine);
    lines.push(`Order Type: ${delivery ? 'Home Delivery' : 'Pickup'}`);
    if (delivery) lines.push(`Delivery Address: ${details.address}`);
    lines.push(`Instructions: ${details.notes || 'None'}`);
    lines.push('');
    lines.push(delivery
      ? 'Please confirm the prices, delivery charges, and estimated delivery time.'
      : 'Please confirm the prices and estimated pickup time.');
    return lines.join('\n');
  }

  function setStatus(message, isError = false, link = '') {
    statusMessage = message;
    statusIsError = isError;
    const status = $('#order-status');
    status.className = isError ? 'form-status is-error' : (message ? 'form-status is-info' : '');
    status.innerHTML = message ? `${escapeHtml(message)}${link}` : '';
  }

  function submitOrder(event) {
    event.preventDefault();
    const details = validate();
    if (!details) {
      setStatus('Please fix the highlighted fields to continue.', true);
      $('#form-errors').focus();
      return;
    }
    const message = buildMessage(details);
    const url = AFF.whatsappHref(state.restaurant.whatsapp, message);
    const opened = window.open(url, '_blank', 'noopener');
    const link = ` <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open the WhatsApp message</a>`;
    setStatus(`WhatsApp is opening with your order message${opened ? '' : ' (if it did not open, use the link)'}. Your order is not confirmed until Naveed Ahmad replies on WhatsApp.`, false, link);
    AFF.showToast('Order message ready in WhatsApp.');
  }

  function handleLineClick(event) {
    const row = event.target.closest('.order-line');
    if (!row) return;
    const id = row.dataset.id;
    const current = AFF.basket.read().find((line) => line.id === id);
    if (!current) return;
    if (event.target.closest('[data-line-inc]')) AFF.basket.setQty(id, current.qty + 1);
    else if (event.target.closest('[data-line-dec]')) AFF.basket.setQty(id, Math.max(1, current.qty - 1));
    else if (event.target.closest('[data-line-remove]')) AFF.basket.remove(id);
    else return;
    renderLines();
  }

  function addItemFromSelect() {
    const id = $('#add-item-select').value;
    const item = itemById(id);
    const qty = Math.round(Number($('#add-item-qty').value));
    if (!item) {
      $('#items-error').textContent = 'Choose an item from the list first.';
      $('#items-error').classList.add('is-visible');
      $('#add-item-select').focus();
      return;
    }
    if (!Number.isFinite(qty) || qty < 1 || qty > AFF.MAX_QTY) {
      $('#items-error').textContent = `Quantity must be between 1 and ${AFF.MAX_QTY}.`;
      $('#items-error').classList.add('is-visible');
      $('#add-item-qty').focus();
      return;
    }
    if (AFF.basket.read().length >= MAX_ORDER_LINES && !AFF.basket.read().some((line) => line.id === id)) {
      $('#items-error').textContent = `An order can include up to ${MAX_ORDER_LINES} different items.`;
      $('#items-error').classList.add('is-visible');
      return;
    }
    AFF.basket.add(item, qty);
    $('#items-error').classList.remove('is-visible');
    $('#add-item-select').value = '';
    $('#add-item-qty').value = '1';
    renderLines();
  }

  function applyAddedFromUrl() {
    const id = params.get('added');
    if (!id) return;
    const qty = Math.round(Number(params.get('qty') || 1));
    const item = itemById(id);
    const existing = AFF.basket.read().find((line) => line.id === id);
    if (item && !existing) AFF.basket.add(item, Math.min(AFF.MAX_QTY, Math.max(1, qty)));
    const note = item ? `${item.name} is in your order. Review the quantity below, then send it on WhatsApp.` : 'The item was not found on the menu. Please add items from the list below.';
    setStatus(note, !item);
    // Remove the one-off parameters so refreshing the page does not add the item again.
    window.history.replaceState(null, '', `${window.location.pathname}#order-form`);
    renderLines();
    $('#order-form').scrollIntoView({ block: 'start' });
  }

  function setupForm() {
    form.addEventListener('submit', submitOrder);
    form.querySelectorAll('input[name="orderType"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const delivery = isDelivery();
        $('#address-field').hidden = !delivery;
        const address = $('#customer-address');
        address.required = delivery;
        if (!delivery) { address.removeAttribute('aria-invalid'); $('#customer-address-error').classList.remove('is-visible'); }
        renderTotals();
      });
    });
    $('#address-field').hidden = !isDelivery();
    $('#order-lines').addEventListener('click', handleLineClick);
    $('#add-item-button').addEventListener('click', addItemFromSelect);
    $('#add-item-qty').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addItemFromSelect(); } });
    $('#clear-order').addEventListener('click', () => {
      if (!AFF.basket.read().length) return;
      if (!window.confirm('Clear all items from your order?')) return;
      AFF.basket.clear();
      renderLines();
      setStatus('');
    });
    // Live validation once a field has been touched.
    ['customer-name', 'customer-phone', 'customer-address'].forEach((id) => {
      const field = document.getElementById(id);
      field.addEventListener('blur', () => { if (field.getAttribute('aria-invalid') === 'true') validate(); });
      field.addEventListener('input', () => {
        if (field.getAttribute('aria-invalid') === 'true') {
          field.removeAttribute('aria-invalid');
          const error = document.getElementById(`${id}-error`);
          if (error) { error.textContent = ''; error.classList.remove('is-visible'); }
        }
      });
    });
    document.addEventListener('aff:basket', renderLines);
  }

  function init() {
    setupForm();
    renderLines();
    renderDeliveryInfo();
    renderAddSelect();
    AFF.loadPublicData().then((data) => {
      if (!data.loaded) setStatus('We could not load the latest menu details. Call or WhatsApp us to place your order.', true);
      renderDeliveryInfo();
      renderAddSelect();
      // The "Order This Item" handoff needs the menu data to look up the item name, so it runs after loading.
      applyAddedFromUrl();
      renderLines();
    });
  }

  init();
})();
