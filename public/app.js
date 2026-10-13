(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const escapeHtml = (v='') => String(v).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  const cleanDigits = (v='') => String(v).replace(/\D/g,'');
  const phoneHref = (phone='') => {
    let n = cleanDigits(phone);
    if (n.startsWith('00')) n = n.slice(2);
    if (n.startsWith('0')) n = `92${n.slice(1)}`;
    else if (n && !n.startsWith('92')) n = `92${n}`;
    return n ? `+${n}` : '';
  };
  const whatsappHref = (phone='', msg='') => {
    const n = phoneHref(phone).replace(/\D/g,'');
    return n ? `https://wa.me/${n}?text=${encodeURIComponent(msg)}` : '#contact';
  };
  const formatPrice = (p) => {
    if (p === null || p === undefined || p === '') return null;
    const n = Number(p);
    if (!Number.isFinite(n)) return null;
    return `Rs ${new Intl.NumberFormat('en-PK').format(n)}`;
  };

  let publicMenu = [];
  let publicSite = {};
  let publicGallery = [];
  let csrfToken = '';
  let adminData = null;
  let selectedCategory = '';
  let toastTimer = 0;
  let revealObserver;
  let pendingOrderItem = null;

  const waIconSvg = '<span class="wa-icon" aria-hidden="true"></span>';

  async function request(url, options={}) {
    const headers = new Headers(options.headers||{});
    const isForm = options.body instanceof FormData;
    if (options.body && !isForm && typeof options.body !== 'string') {
      headers.set('Content-Type','application/json');
      options = {...options, body: JSON.stringify(options.body)};
    }
    if (!isForm && typeof options.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
    if (url.startsWith('/api/admin/') && !['GET','HEAD'].includes((options.method||'GET').toUpperCase()) && csrfToken) headers.set('X-CSRF-Token', csrfToken);
    const res = await fetch(url, {credentials:'same-origin', cache:'no-store', ...options, headers});
    let payload={};
    const type=res.headers.get('content-type')||'';
    if (type.includes('application/json')) { try{payload=await res.json()}catch{payload={}} }
    if (!res.ok) {
      if (res.status===401 && url.startsWith('/api/admin/')) csrfToken='';
      throw Object.assign(new Error(payload.error||'Something went wrong.'), {status:res.status});
    }
    return payload;
  }
  function showToast(msg, isError=false){ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.toggle('is-error',isError); t.classList.add('is-visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('is-visible'),3800);}
  function setStatus(el, msg, isError=false){ if(!el) return; el.textContent=msg; el.classList.toggle('is-error',isError); }

  function initMotion(){
    if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      revealObserver = new IntersectionObserver(entries=>{ entries.forEach(e=>{ if(!e.isIntersecting) return; e.target.classList.add('is-visible'); revealObserver.unobserve(e.target);});},{threshold:.12, rootMargin:'0px 0px -30px 0px'});
      $$('.reveal').forEach(el=>revealObserver.observe(el));
      $$('.menu-card, .popular-card, .why-card, .gallery-item').forEach(el=>{ el.classList.add('reveal'); revealObserver.observe(el);});
    } else {
      $$('.reveal').forEach(el=>el.classList.add('is-visible'));
    }
    const progress=$('#scroll-progress');
    let ticking=false;
    window.addEventListener('scroll',()=>{ if(ticking) return; ticking=true; requestAnimationFrame(()=>{ const range=document.documentElement.scrollHeight - window.innerHeight; if(progress) progress.style.width=`${range>0?Math.min(100,(window.scrollY/range)*100):0}%`; ticking=false;});},{passive:true});
    const menuBtn=$('#mobile-menu-toggle'), nav=$('#primary-nav');
    menuBtn?.addEventListener('click',()=>{ const open=menuBtn.getAttribute('aria-expanded')==='true'; menuBtn.setAttribute('aria-expanded', String(!open)); nav?.classList.toggle('is-open', !open);});
    $$('.nav-link').forEach(a=>a.addEventListener('click',()=>{ nav?.classList.remove('is-open'); menuBtn?.setAttribute('aria-expanded','false');}));
    document.addEventListener('keydown', e=>{ if(e.key==='Escape' && nav?.classList.contains('is-open')){ nav.classList.remove('is-open'); menuBtn?.setAttribute('aria-expanded','false'); }});
    // active nav on scroll
    const sections = ['home','menu','about','gallery','contact'].map(id=>document.getElementById(id)).filter(Boolean);
    const navLinks = $$('.nav-link');
    if ('IntersectionObserver' in window) {
      const navObs = new IntersectionObserver(entries=>{ entries.forEach(entry=>{ if(entry.isIntersecting){ navLinks.forEach(a=>a.classList.toggle('is-current', a.getAttribute('href')===`#${entry.target.id}`)); }});},{rootMargin:'-45% 0px -45% 0px', threshold:0});
      sections.forEach(s=>navObs.observe(s));
    }
  }

  function whatsappMessageFor(item, qty=1){
    return `Assalam-o-Alaikum! I would like to order from Appetizer Fast Foods. Item: ${item.name}. Quantity: ${qty}. Please confirm the price and availability.`;
  }

  function renderMenuCard(item, index){
    const price = formatPrice(item.price);
    const priceHtml = price ? `<span class="menu-price">${escapeHtml(price)}<small>PKR</small></span>` : `<span class="menu-price is-placeholder">Price to be confirmed</span>`;
    const available = item.available !== false && item.published !== false;
    const badgeAvail = available ? '' : '<span class="menu-badge unavailable">Unavailable</span>';
    const catBadge = `<span class="menu-badge category">${escapeHtml(item.category)}</span>`;
    const featuredBadge = item.featured ? '<span class="menu-badge featured">★ Popular</span>' : '';
    const waMsg = whatsappMessageFor(item, 1);
    const waHref = whatsappHref(publicSite.whatsapp || publicSite.phone, waMsg);
    const qtyBtn = available ? `<button class="btn btn-whatsapp" type="button" data-order="${escapeHtml(item.id)}">${waIconSvg}<span>Order Now</span></button>` : `<button class="btn btn-quiet" type="button" disabled>Unavailable</button>`;
    return `<article class="menu-card ${available?'':'is-unavailable'}" style="--card-index:${index}" data-category="${escapeHtml(item.category)}">
      <div class="menu-image">
        <img src="${escapeHtml(item.image||'/assets/img/zinger.jpg')}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async" onerror="this.src='/assets/img/zinger.jpg'">
        <div class="menu-badges"><span>${featuredBadge}${badgeAvail}</span>${catBadge}</div>
      </div>
      <div class="menu-content">
        <p class="menu-category">${escapeHtml(item.category)}</p>
        <h3>${escapeHtml(item.name)}</h3>
        <p class="menu-desc">${escapeHtml(item.description||'Delicious and freshly prepared.')}</p>
        <div class="menu-price-row">${priceHtml}<span style="font-size:11px;color:var(--muted);">${available?'✔ Available':'○ Check availability'}</span></div>
        <div class="menu-actions">
          ${qtyBtn}
          <a class="btn btn-outline" href="${waHref}" target="_blank" rel="noopener noreferrer" aria-label="Quick WhatsApp for ${escapeHtml(item.name)}">WhatsApp</a>
        </div>
      </div>
    </article>`;
  }

  function renderPopular(){
    const grid=$('#popular-grid');
    if(!grid) return;
    const featured = publicMenu.filter(m=>m.featured && m.published!==false && m.available!==false).slice(0,4);
    const list = featured.length ? featured : publicMenu.slice(0,4);
    if(!list.length){ grid.innerHTML='<div class="inquiry-empty"><span>🍽️</span><h3>Menu coming soon.</h3><p>We are updating our dishes — please check back or WhatsApp us.</p></div>'; return; }
    grid.innerHTML = list.map((item,i)=> renderMenuCard(item,i)).join('');
    if(revealObserver) $$('.menu-card',grid).forEach(el=>revealObserver.observe(el));
  }

  function applyMenuFilters(){
    const grid=$('#menu-grid');
    const count=$('#menu-count');
    const empty=$('#empty-menu');
    if(!grid) return;
    const filtered = selectedCategory ? publicMenu.filter(m=>m.category===selectedCategory && m.published!==false) : publicMenu.filter(m=>m.published!==false);
    grid.innerHTML = filtered.map((item,i)=> renderMenuCard(item,i)).join('');
    if(count) count.textContent = `Showing ${filtered.length} of ${publicMenu.filter(m=>m.published!==false).length} items`;
    if(empty) empty.hidden = filtered.length!==0;
    grid.hidden = filtered.length===0;
    if(revealObserver) $$('.menu-card',grid).forEach(el=>revealObserver.observe(el));
  }

  function renderGallery(){
    const grid=$('#gallery-grid');
    if(!grid) return;
    if(!publicGallery.length){
      grid.innerHTML = publicMenu.slice(0,6).map(item=> `<button class="gallery-item" type="button" data-gallery-index="${escapeHtml(item.id)}"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy"><span class="gallery-caption">${escapeHtml(item.name)}</span></button>`).join('');
    } else {
      grid.innerHTML = publicGallery.map(g=> `<button class="gallery-item" type="button" data-gallery-src="${escapeHtml(g.image)}" data-gallery-alt="${escapeHtml(g.alt)}"><img src="${escapeHtml(g.image)}" alt="${escapeHtml(g.alt)}" loading="lazy"><span class="gallery-caption">${escapeHtml(g.alt)}</span></button>`).join('');
    }
    if(revealObserver) $$('.gallery-item',grid).forEach(el=>revealObserver.observe(el));
  }

  function updatePublicSite(){
    const setText=(sel,txt)=>{ const el=$(sel); if(el) el.textContent=txt||''; };
    const setAttr=(sel,attr,val)=>{ const el=$(sel); if(el) el.setAttribute(attr,val); };
    setText('#hero-tagline', publicSite.tagline || 'Fresh Bites. Great Taste. Refresh Your Day!');
    setText('#hero-description', publicSite.heroDescription || 'Your favorite burgers, shawarma, snacks, and refreshing drinks — all in one place.');
    setText('#about-text', publicSite.about);
    setText('#contact-location', publicSite.location || 'Lehtrar Road, Nilore, Islamabad, Pakistan');
    setText('#contact-city', publicSite.city || 'Nilore, Islamabad');
    setText('#contact-person-name', publicSite.contactPerson || 'Naveed Ahmad');
    setText('#opening-hours-text', publicSite.openingHours || 'Open daily — Timings to be confirmed. Please WhatsApp us to confirm availability.');
    setText('#topbar-hours', publicSite.openingHours ? publicSite.openingHours.split('—')[0].trim() : 'Open daily — WhatsApp to confirm');
    const phone = publicSite.phone || '+923015136842';
    const wa = publicSite.whatsapp || phone;
    const telHref = phoneHref(phone);
    const waGeneral = `Assalam-o-Alaikum! I would like to enquire about Appetizer Fast Foods.`;
    const waOrder = `Assalam-o-Alaikum! I would like to order from Appetizer Fast Foods. Please share the menu and availability.`;
    const waFloating = `Assalam-o-Alaikum! I would like to order from Appetizer Fast Foods. Please confirm price and availability.`;
    const contactPhoneLink=$('#contact-phone-link');
    if(contactPhoneLink){ contactPhoneLink.textContent = phone; contactPhoneLink.href = `tel:${telHref}`; }
    const callNow=$('#call-now'); if(callNow) callNow.href = `tel:${telHref}`;
    const waUs=$('#whatsapp-us'); if(waUs) waUs.href = whatsappHref(wa, waGeneral);
    const heroWa=$('#hero-whatsapp'); if(heroWa) heroWa.href = whatsappHref(wa, waOrder);
    const floatingWa=$('#floating-whatsapp'); if(floatingWa) floatingWa.href = whatsappHref(wa, waFloating);
    // header cta whatsapp? already static but update
    const headerCta = $('.header-cta');
    if(headerCta) headerCta.href = whatsappHref(wa, waOrder);
    const footerWa = $('.footer-wa');
    if(footerWa) footerWa.href = whatsappHref(wa, waGeneral);
    const mapQuery = encodeURIComponent(publicSite.location || 'Appetizer Fast Foods Nilore Islamabad Lehtrar Road');
    const mapEmbed=$('#map-embed'); if(mapEmbed) mapEmbed.src=`https://www.google.com/maps?q=${mapQuery}&output=embed`;
    const directions=$('#directions-link'); if(directions) directions.href=`https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  }

  function initMenuInteractions(){
    $$('.category-tab').forEach(btn=> btn.addEventListener('click',()=>{
      selectedCategory = btn.dataset.category||'';
      $$('.category-tab').forEach(b=>b.classList.toggle('is-active', b===btn));
      applyMenuFilters();
    }));
    $('#clear-filter')?.addEventListener('click',()=>{
      selectedCategory='';
      $$('.category-tab').forEach(b=>b.classList.toggle('is-active', b.dataset.category===''));
      applyMenuFilters();
    });
    // order delegation
    $('#menu-grid')?.addEventListener('click', e=>{
      const btn=e.target.closest('[data-order]');
      if(btn) openQtyDialog(btn.dataset.order);
    });
    $('#popular-grid')?.addEventListener('click', e=>{
      const btn=e.target.closest('[data-order]');
      if(btn) openQtyDialog(btn.dataset.order);
    });
    // gallery lightbox
    $('#gallery-grid')?.addEventListener('click', e=>{
      const btn=e.target.closest('.gallery-item');
      if(!btn) return;
      const src = btn.dataset.gallerySrc || btn.querySelector('img')?.src;
      const alt = btn.dataset.galleryAlt || btn.querySelector('img')?.alt || '';
      const dialog=$('#gallery-lightbox'), img=$('#lightbox-image'), cap=$('#lightbox-caption');
      if(!dialog||!img) return;
      img.src=src; img.alt=alt; if(cap) cap.textContent=alt;
      if(!dialog.open) dialog.showModal();
    });
    $('#gallery-lightbox .lightbox-close')?.addEventListener('click',()=> $('#gallery-lightbox')?.close());
    $('#gallery-lightbox')?.addEventListener('click', e=>{ if(e.target===e.currentTarget) e.currentTarget.close(); });
    // qty dialog
    const qtyDialog=$('#qty-dialog');
    $('#qty-close')?.addEventListener('click',()=> qtyDialog?.close());
    qtyDialog?.addEventListener('click', e=>{ if(e.target===qtyDialog) qtyDialog.close(); });
    $('#qty-minus')?.addEventListener('click',()=>{ const inp=$('#qty-input'); if(inp) inp.value=Math.max(1, Number(inp.value)-1); });
    $('#qty-plus')?.addEventListener('click',()=>{ const inp=$('#qty-input'); if(inp) inp.value=Math.min(20, Number(inp.value)+1); });
    $('#qty-input')?.addEventListener('input', e=>{ let v=Number(e.target.value); if(!Number.isFinite(v)) v=1; v=Math.max(1,Math.min(20,v)); e.target.value=v; });
    $('#qty-form')?.addEventListener('submit', e=>{
      e.preventDefault();
      if(!pendingOrderItem) return;
      const qty = Math.max(1,Math.min(20, Number($('#qty-input').value)||1));
      const msg = whatsappMessageFor(pendingOrderItem, qty);
      const href = whatsappHref(publicSite.whatsapp||publicSite.phone, msg);
      qtyDialog?.close();
      window.open(href,'_blank','noopener');
      showToast(`Opening WhatsApp for ${pendingOrderItem.name} × ${qty}`);
    });
  }

  function openQtyDialog(id){
    const item = publicMenu.find(m=>m.id===id);
    if(!item) return;
    pendingOrderItem = item;
    $('#qty-product-name').textContent = item.name;
    $('#qty-input').value = '1';
    $('#qty-title').textContent = `Order ${item.name}`;
    const dlg=$('#qty-dialog');
    if(dlg && !dlg.open) dlg.showModal();
  }

  function initContactForm(){
    const form=$('#contact-form');
    form?.addEventListener('submit', async e=>{
      e.preventDefault();
      const status=$('#contact-status');
      status?.classList.remove('is-visible','is-error');
      const btn = form.querySelector('button[type="submit"]');
      if(!form.reportValidity()) return;
      const data=Object.fromEntries(new FormData(form).entries());
      if(btn){ btn.disabled=true; const s=btn.querySelector('span:first-child'); if(s) s.textContent='Sending…';}
      try{
        const res=await request('/api/contact',{method:'POST', body:data});
        form.reset();
        if(status){ status.textContent=res.message||'Thanks — your message has been sent.'; status.classList.add('is-visible');}
        showToast('Message sent. We will reply soon.');
      }catch(err){
        if(status){ status.textContent=err.message||'Could not send message.'; status.classList.add('is-visible','is-error');}
        showToast(err.message,true);
      }finally{
        if(btn){ btn.disabled=false; const s=btn.querySelector('span:first-child'); if(s) s.textContent='Send Message';}
      }
    });
  }

  async function loadPublicData(){
    const data=await request('/api/public');
    publicMenu = Array.isArray(data.menu)?data.menu:[];
    publicSite = data.site||{};
    publicGallery = Array.isArray(data.gallery)?data.gallery:[];
    updatePublicSite();
    renderPopular();
    applyMenuFilters();
    renderGallery();
  }

  // Admin -----------------------------------------------------------------
  const panelTitles={overview:'Overview', menu:'Menu', gallery:'Gallery', inquiries:'Your inbox', business:'Business details', security:'Security'};
  function setAdminView(view){
    if(!panelTitles[view]) return;
    $$('.admin-nav-button').forEach(b=>b.classList.toggle('is-active', b.dataset.adminView===view));
    $$('.admin-panel-view').forEach(p=>p.classList.toggle('is-visible', p.dataset.adminPanel===view));
    const t=$('#admin-page-title'); if(t) t.innerHTML=`${escapeHtml(panelTitles[view])}<span>.</span>`;
    if(window.innerWidth<641) window.scrollTo({top:0,behavior:'smooth'});
  }
  function updateAdminCounters(){
    if(!adminData) return;
    const live = adminData.menu.filter(m=>m.published!==false).length;
    const featured = adminData.menu.filter(m=>m.featured).length;
    const unread = adminData.inquiries.filter(m=>!m.read).length;
    const set=(sel,val)=>{ const el=$(sel); if(el) el.textContent=String(val).padStart(2,'0'); };
    set('#overview-menu-count', live);
    set('#overview-featured-count', featured);
    set('#overview-inquiry-count', unread);
    const navMenu=$('#admin-nav-menu-count'); if(navMenu) navMenu.textContent=String(adminData.menu.length);
    const navGallery=$('#admin-nav-gallery-count'); if(navGallery) navGallery.textContent=String(adminData.gallery.length);
    const navInbox=$('#admin-nav-inquiry-count'); if(navInbox) navInbox.textContent=String(unread);
    const badge=$('#inbox-count-badge'); if(badge) badge.textContent=`${String(unread).padStart(2,'0')} NEW`;
  }
  function renderAdminMenu(){
    const container=$('#admin-menu-list');
    if(!container||!adminData) return;
    if(!adminData.menu.length){ container.innerHTML='<div class="inquiry-empty"><span>🍽️</span><h3>Your menu is empty.</h3><p>Add your first dish to start building your menu.</p></div>'; return; }
    container.innerHTML = adminData.menu.map(item=>{
      const price = formatPrice(item.price);
      const priceHtml = price ? escapeHtml(price) : '<span style="color:var(--orange)">To be confirmed</span>';
      const status = item.available===false ? '<span class="visibility-tag is-unavailable"><i></i>Unavailable</span>' : item.published===false ? '<span class="visibility-tag is-unavailable"><i></i>Hidden</span>' : '<span class="visibility-tag is-available"><i></i>Available</span>';
      return `<div class="admin-menu-row"><span class="admin-menu-primary"><img src="${escapeHtml(item.image||'/assets/img/zinger.jpg')}" alt="" loading="lazy"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)}${item.featured?' · ★ Featured':''}</small></span></span><span class="admin-menu-price ${price?'':'is-placeholder'}">${priceHtml}</span>${status}<span class="admin-row-actions"><button type="button" data-menu-action="edit" data-id="${escapeHtml(item.id)}" aria-label="Edit ${escapeHtml(item.name)}">✎</button><button class="delete-menu" type="button" data-menu-action="delete" data-id="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.name)}">×</button></span></div>`;
    }).join('');
  }
  function renderOverview(){
    const recent=$('#overview-recent-menu');
    if(!recent||!adminData) return;
    const sorted = adminData.menu.slice(0,3);
    if(!sorted.length){ recent.innerHTML='<div class="inquiry-empty"><span>🍽️</span><h3>Ready for your first dish.</h3><p>Use “Add menu item” to get started.</p></div>'; return; }
    recent.innerHTML = sorted.map(item=>{
      const price = formatPrice(item.price);
      return `<div class="recent-menu-row"><img src="${escapeHtml(item.image||'/assets/img/zinger.jpg')}" alt="" loading="lazy"><span><strong class="recent-menu-title">${escapeHtml(item.name)}</strong><small class="recent-menu-subtitle">${escapeHtml(item.category)} · ${item.available===false?'Unavailable':'Available'}</small></span><span class="recent-menu-price">${price?escapeHtml(price):'TBC'}</span></div>`;
    }).join('');
  }
  function formatDate(v){
    const d=new Date(v); if(Number.isNaN(d.getTime())) return 'Just now';
    return new Intl.DateTimeFormat('en-PK',{dateStyle:'medium', timeStyle:'short'}).format(d);
  }
  function renderInquiries(){
    const container=$('#admin-inquiry-list');
    if(!container||!adminData) return;
    if(!adminData.inquiries.length){ container.innerHTML='<div class="inquiry-empty"><span>✉</span><h3>Your inbox is clear.</h3><p>New messages from visitors will appear here.</p></div>'; return; }
    container.innerHTML = adminData.inquiries.map(item=> {
      const tel=phoneHref(item.phone);
      const wa=whatsappHref(item.phone, `Hello ${item.name}, thank you for contacting Appetizer Fast Foods.`);
      return `<article class="inquiry-card ${item.read?'':'is-unread'}"><div><div class="inquiry-head"><strong>${escapeHtml(item.name)}</strong><time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(formatDate(item.createdAt))}${item.read?'':' · NEW'}</time></div><p>${escapeHtml(item.message)}</p><span class="inquiry-links"><a href="tel:${escapeHtml(tel)}">☎ ${escapeHtml(item.phone)}</a>${item.email?`<a href="mailto:${escapeHtml(item.email)}">✉ ${escapeHtml(item.email)}</a>`:''}</span></div><span class="inquiry-actions">${item.read?'':`<button type="button" data-inquiry-action="read" data-id="${escapeHtml(item.id)}">Mark read</button>`}<a href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a><button type="button" data-inquiry-action="delete" data-id="${escapeHtml(item.id)}">Delete</button></span></article>`;
    }).join('');
  }
  function renderGalleryAdmin(){
    const grid=$('#admin-gallery-grid');
    if(!grid||!adminData) return;
    if(!adminData.gallery.length){ grid.innerHTML='<div class="inquiry-empty" style="grid-column:1/-1"><span>🖼️</span><h3>No gallery photos yet.</h3><p>Add photos of your best dishes to inspire customers.</p></div>'; return; }
    grid.innerHTML = adminData.gallery.map(item=> `<div class="gallery-admin-card"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.alt)}" loading="lazy"><div class="gallery-admin-card-inner"><p>${escapeHtml(item.alt)}</p><button type="button" data-gallery-delete="${escapeHtml(item.id)}" aria-label="Delete gallery image">×</button></div></div>`).join('');
  }
  function renderAdminData(){
    updateAdminCounters();
    renderAdminMenu();
    renderOverview();
    renderInquiries();
    renderGalleryAdmin();
    const form=$('#site-settings-form');
    if(form && adminData.site){
      for(const [key,val] of Object.entries(adminData.site)){
        const input=form.elements.namedItem(key);
        if(input) input.value=val||'';
      }
    }
  }
  async function refreshAdminData(){
    adminData=await request('/api/admin/data');
    renderAdminData();
  }
  async function setAdminVisibility(showDashboard){
    $('#admin-login-page')?.toggleAttribute('hidden', !showDashboard ? false : true);
    // Actually we need login hidden when dashboard shown
    if(showDashboard){
      $('#admin-login-page')?.setAttribute('hidden','');
      $('#admin-layout')?.removeAttribute('hidden');
    } else {
      $('#admin-login-page')?.removeAttribute('hidden');
      $('#admin-layout')?.setAttribute('hidden','');
    }
    if(!showDashboard){ setStatus($('#login-status'), ''); return; }
    const today=$('#admin-today'); if(today) today.textContent=`TODAY · ${new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric'}).format(new Date()).toUpperCase()} · NILORE`;
    try{ await refreshAdminData(); }catch(err){ if(err.status===401){ csrfToken=''; setAdminVisibility(false); return;} showToast(err.message,true); }
  }
  async function initAdminScreen(){
    $('#site-shell')?.setAttribute('hidden','');
    const screen=$('#admin-screen'); screen?.removeAttribute('hidden');
    document.title='Owner Dashboard | Appetizer Fast Foods';
    try{
      const state=await request('/api/admin/session');
      csrfToken=state.csrfToken||'';
      await setAdminVisibility(Boolean(state.authenticated));
    }catch{
      setAdminVisibility(false);
      setStatus($('#login-status'),'Could not connect to the dashboard. Refresh and try again.',true);
    }
    $('#login-form')?.addEventListener('submit', async e=>{
      e.preventDefault();
      const form=e.currentTarget, pw=form.elements.namedItem('password').value;
      const submit=form.querySelector('button[type="submit"]');
      setStatus($('#login-status'),'');
      if(submit){ submit.disabled=true; const s=submit.querySelector('span:first-child'); if(s) s.textContent='Checking…';}
      try{
        const res=await request('/api/admin/login',{method:'POST', body:{password:pw}});
        csrfToken=res.csrfToken||'';
        form.reset(); setStatus($('#login-status'),''); await setAdminVisibility(true);
      }catch(err){ setStatus($('#login-status'),err.message,true); form.elements.namedItem('password').focus();}
      finally{ if(submit){ submit.disabled=false; const s=submit.querySelector('span:first-child'); if(s) s.textContent='Sign in securely';}}
    });
    $('#password-toggle')?.addEventListener('click', e=>{
      const inp=$('#owner-password'); const show=inp.type==='password'; inp.type=show?'text':'password'; e.currentTarget.textContent=show?'HIDE':'SHOW';
    });
    $('#admin-nav')?.addEventListener('click', e=>{ const btn=e.target.closest('[data-admin-view]'); if(btn) setAdminView(btn.dataset.adminView);});
    $$('.admin-main [data-admin-view]').forEach(b=> b.addEventListener('click',()=> setAdminView(b.dataset.adminView)));
    $('#admin-add-menu')?.addEventListener('click',()=> openMenuForm());
    $('#admin-add-menu-2')?.addEventListener('click',()=> openMenuForm());
    $('.admin-quick-add')?.addEventListener('click',()=> openMenuForm());
    $('#admin-add-gallery')?.addEventListener('click',()=> openGalleryForm());
    $('#admin-logout')?.addEventListener('click', signOut);
    $('#admin-logout-mobile')?.addEventListener('click', signOut);
    $('#admin-menu-list')?.addEventListener('click', e=>{
      const btn=e.target.closest('[data-menu-action]'); if(!btn) return;
      const item=adminData?.menu.find(i=>i.id===btn.dataset.id);
      if(!item) return;
      if(btn.dataset.menuAction==='edit') openMenuForm(item);
      if(btn.dataset.menuAction==='delete') deleteMenu(item);
    });
    $('#admin-gallery-grid')?.addEventListener('click', e=>{
      const btn=e.target.closest('[data-gallery-delete]'); if(!btn) return;
      deleteGallery(btn.dataset.galleryDelete);
    });
    $('#admin-inquiry-list')?.addEventListener('click', handleInquiryAction);
    $('#site-settings-form')?.addEventListener('submit', saveSiteSettings);
    $('#change-password-form')?.addEventListener('submit', changePassword);
    $('#admin-menu-form')?.addEventListener('submit', saveMenu);
    $('#cancel-menu-form')?.addEventListener('click', closeMenuForm);
    $('#menu-form-dialog .admin-modal-close')?.addEventListener('click', closeMenuForm);
    $('#menu-form-dialog')?.addEventListener('click', e=>{ if(e.target===e.currentTarget) closeMenuForm();});
    $('#admin-menu-form input[name="imageFile"]')?.addEventListener('change', e=>{ const f=e.currentTarget.files?.[0]; $('#current-image-name').textContent=f?`${f.name} · ${new Intl.NumberFormat().format(f.size)} bytes`:'No photo chosen yet';});
    $('#admin-gallery-form')?.addEventListener('submit', saveGallery);
    $('#cancel-gallery-form')?.addEventListener('click', closeGalleryForm);
    $('#gallery-form-dialog .admin-modal-close')?.addEventListener('click', closeGalleryForm);
    $('#gallery-form-dialog')?.addEventListener('click', e=>{ if(e.target===e.currentTarget) closeGalleryForm();});
    $('#admin-gallery-form input[name="galleryFile"]')?.addEventListener('change', e=>{ const f=e.currentTarget.files?.[0]; $('#current-gallery-name').textContent=f?`${f.name} · ${new Intl.NumberFormat().format(f.size)} bytes`:'No photo chosen yet';});
  }
  async function signOut(){
    try{ await request('/api/admin/logout',{method:'POST', body:{}});}catch{}
    csrfToken=''; adminData=null;
    $('#admin-layout')?.setAttribute('hidden','');
    $('#admin-login-page')?.removeAttribute('hidden');
    setStatus($('#login-status'),'You have been signed out.');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  async function saveSiteSettings(e){
    e.preventDefault();
    const form=e.currentTarget, btn=form.querySelector('button[type="submit"]');
    if(!form.reportValidity()) return;
    const fields=['tagline','city','heroDescription','about','contactPerson','phone','whatsapp','location','openingHours'];
    const data=Object.fromEntries(fields.map(k=>[k, form.elements.namedItem(k).value.trim()]));
    if(btn) btn.disabled=true;
    try{
      const res=await request('/api/admin/site',{method:'PUT', body:data});
      adminData.site=res.site; publicSite=res.site; updatePublicSite();
      showToast('Business details saved.');
      setStatus($('#dashboard-status'),'Business details saved.');
    }catch(err){ showToast(err.message,true);}
    finally{ if(btn) btn.disabled=false;}
  }
  function openMenuForm(item=null){
    const dlg=$('#menu-form-dialog'), form=$('#admin-menu-form');
    if(!dlg||!form) return;
    form.reset();
    form.elements.namedItem('id').value=item?.id||'';
    form.elements.namedItem('name').value=item?.name||'';
    form.elements.namedItem('category').value=item?.category||'Burgers';
    form.elements.namedItem('price').value=item?.price??'';
    form.elements.namedItem('description').value=item?.description||'';
    form.elements.namedItem('featured').checked=item?.featured===true;
    form.elements.namedItem('available').checked=item?.available!==false;
    form.elements.namedItem('published').checked=item?.published!==false;
    form.dataset.currentImage=item?.image||'';
    $('#current-image-name').textContent=item?.image?`Current photo · ${item.image.split('/').pop()}`:'No photo chosen yet';
    $('#menu-form-heading').innerHTML=`${item?'Edit menu item':'Add menu item'}<span>.</span>`;
    $('#menu-form-submit-label').textContent=item?'Save changes':'Save dish';
    setStatus($('#menu-form-status'),'');
    if(!dlg.open) dlg.showModal();
  }
  function closeMenuForm(){ const dlg=$('#menu-form-dialog'); if(dlg?.open) dlg.close(); setStatus($('#menu-form-status'),''); }
  async function fileAsDataUrl(file){
    return new Promise((res,rej)=>{ const r=new FileReader(); r.onerror=()=>rej(new Error('Could not read photo.')); r.onload=()=>res(r.result); r.readAsDataURL(file);});
  }
  async function saveMenu(e){
    e.preventDefault();
    const form=e.currentTarget;
    if(!form.reportValidity()) return;
    const fields=['name','category','price','description'];
    const data=Object.fromEntries(fields.map(k=>[k, form.elements.namedItem(k).value.trim()]));
    data.price = data.price===''?null:Number(data.price);
    data.featured=form.elements.namedItem('featured').checked;
    data.available=form.elements.namedItem('available').checked;
    data.published=form.elements.namedItem('published').checked;
    const id=form.elements.namedItem('id').value;
    const file=form.elements.namedItem('imageFile').files?.[0];
    const status=$('#menu-form-status'), btn=form.querySelector('button[type="submit"]');
    setStatus(status,'');
    if(btn){ btn.disabled=true; $('#menu-form-submit-label').textContent=file?'Uploading…':'Saving…';}
    try{
      data.image=form.dataset.currentImage||'/assets/img/zinger.jpg';
      if(file){
        if(file.size>5*1024*1024) throw new Error('Choose a photo smaller than 5 MB.');
        if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose JPEG, PNG or WebP.');
        const up=await request('/api/admin/upload',{method:'POST', body:{dataUrl:await fileAsDataUrl(file)}});
        data.image=up.image;
      }
      if(id) data.id=id;
      const saved=await request(id?`/api/admin/menu/${encodeURIComponent(id)}`:'/api/admin/menu',{method:id?'PUT':'POST', body:data});
      if(!adminData) adminData={menu:[],gallery:[],inquiries:[],site:{}};
      if(id) adminData.menu=adminData.menu.map(m=>m.id===id?saved.item:m);
      else adminData.menu.unshift(saved.item);
      renderAdminData();
      closeMenuForm(); setAdminView('menu');
      showToast(id?'Dish updated.':'Dish added.');
      // refresh public menu if on public side? reload public data
      loadPublicData().catch(()=>{});
    }catch(err){ setStatus(status,err.message,true);}
    finally{ if(btn){ btn.disabled=false; $('#menu-form-submit-label').textContent=id?'Save changes':'Save dish';}}
  }
  async function deleteMenu(item){
    if(!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try{
      await request(`/api/admin/menu/${encodeURIComponent(item.id)}`,{method:'DELETE'});
      adminData.menu=adminData.menu.filter(m=>m.id!==item.id);
      renderAdminData(); showToast('Dish deleted.');
      loadPublicData().catch(()=>{});
    }catch(err){ showToast(err.message,true);}
  }
  function openGalleryForm(){
    const dlg=$('#gallery-form-dialog'), form=$('#admin-gallery-form');
    form.reset();
    form.elements.namedItem('galleryId').value='';
    $('#current-gallery-name').textContent='No photo chosen yet';
    setStatus($('#gallery-form-status'),'');
    if(!dlg.open) dlg.showModal();
  }
  function closeGalleryForm(){ const dlg=$('#gallery-form-dialog'); if(dlg?.open) dlg.close(); }
  async function saveGallery(e){
    e.preventDefault();
    const form=e.currentTarget;
    const file=form.elements.namedItem('galleryFile').files?.[0];
    const alt=form.elements.namedItem('alt').value.trim()||'Delicious food from Appetizer Fast Foods';
    const status=$('#gallery-form-status'), btn=form.querySelector('button[type="submit"]');
    if(!file){ setStatus(status,'Please choose a photo.',true); return; }
    if(file.size>5*1024*1024){ setStatus(status,'Choose a photo smaller than 5 MB.',true); return; }
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){ setStatus(status,'Choose JPEG, PNG or WebP.',true); return; }
    if(btn) btn.disabled=true;
    try{
      const up=await request('/api/admin/upload',{method:'POST', body:{dataUrl:await fileAsDataUrl(file)}});
      const saved=await request('/api/admin/gallery',{method:'POST', body:{image:up.image, alt}});
      adminData.gallery.unshift(saved.item);
      renderAdminData(); closeGalleryForm(); showToast('Gallery photo added.');
      loadPublicData().catch(()=>{});
    }catch(err){ setStatus(status,err.message,true);}
    finally{ if(btn) btn.disabled=false;}
  }
  async function deleteGallery(id){
    if(!confirm('Delete this gallery photo?')) return;
    try{
      await request(`/api/admin/gallery/${encodeURIComponent(id)}`,{method:'DELETE'});
      adminData.gallery=adminData.gallery.filter(g=>g.id!==id);
      renderGalleryAdmin(); updateAdminCounters();
      showToast('Gallery photo deleted.');
      loadPublicData().catch(()=>{});
    }catch(err){ showToast(err.message,true);}
  }
  async function handleInquiryAction(e){
    const btn=e.target.closest('[data-inquiry-action]');
    if(!btn) return;
    const id=btn.dataset.id;
    try{
      if(btn.dataset.inquiryAction==='read') await request(`/api/admin/inquiries/${encodeURIComponent(id)}`,{method:'PATCH', body:{}});
      else if(btn.dataset.inquiryAction==='delete'){ if(!confirm('Delete this message?')) return; await request(`/api/admin/inquiries/${encodeURIComponent(id)}`,{method:'DELETE'});}
      await refreshAdminData(); showToast(btn.dataset.inquiryAction==='read'?'Marked as read.':'Message deleted.');
    }catch(err){ showToast(err.message,true);}
  }
  async function changePassword(e){
    e.preventDefault();
    const form=e.currentTarget;
    if(!form.reportValidity()) return;
    const currentPassword=form.elements.namedItem('currentPassword').value;
    const newPassword=form.elements.namedItem('newPassword').value;
    const confirmation=form.elements.namedItem('confirmPassword').value;
    if(newPassword.length<12){ setStatus($('#password-status'),'Choose at least 12 characters.',true); return; }
    if(newPassword!==confirmation){ setStatus($('#password-status'),'Passwords do not match.',true); return; }
    const btn=form.querySelector('button[type="submit"]'); if(btn) btn.disabled=true;
    try{
      const res=await request('/api/admin/password',{method:'POST', body:{currentPassword,newPassword}});
      csrfToken=res.csrfToken||'';
      form.reset(); setStatus($('#password-status'),'Password changed. You remain signed in.');
      showToast('Password updated.');
    }catch(err){ setStatus($('#password-status'),err.message,true);}
    finally{ if(btn) btn.disabled=false;}
  }
  function startAdmin(){ initAdminScreen(); }
  function startPublic(){
    initMotion();
    initMenuInteractions();
    initContactForm();
    const yr=$('#copyright-year'); if(yr) yr.textContent=String(new Date().getFullYear());
    loadPublicData().catch(err=>{
      showToast(`Could not load menu. ${err.message}`,true);
      const grid=$('#menu-grid'); if(grid) grid.innerHTML='<div class="inquiry-empty"><span>🍽️</span><h3>We are preparing the menu.</h3><p>Refresh in a moment or WhatsApp us.</p></div>';
    });
  }
  if(/^\/admin\/?$/.test(location.pathname)) startAdmin();
  else startPublic();
})();
