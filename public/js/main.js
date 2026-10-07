/**
 * Front-end entry point. Boots the shared runtime, then loads the module that
 * belongs to the current page (body[data-page]).
 */
import {
  boot, emit, fillFooterExtras, initAccordions, initCounters, initEnquiryButtons,
  initParallax, observeReveals, on, t,
} from './core.js';

const page = document.body.dataset.page || 'home';

/**
 * Which module renders which page. The shell filenames and the module
 * filenames do not have to match — `body[data-page]` is the contract.
 */
const PAGE_MODULES = {
  home: () => import('./home.js'),
  cars: () => import('./inventory.js'),
  car: () => import('./car.js'),
  contact: () => import('./contact.js'),
};

/** Runs the animation helpers again after a page module re-renders markup. */
function afterRender(root = document) {
  observeReveals(root);
  initCounters(root);
  initAccordions(root);
  initEnquiryButtons(root);
  fillFooterExtras();
}

document.documentElement.classList.add('js');

async function start() {
  try {
    await boot();
    afterRender();
    document.body.classList.add('is-ready');
  } catch (error) {
    console.error('Boot failed', error);
  }

  const load = PAGE_MODULES[page];
  if (!load) return;

  try {
    if (page === 'car') {
      const module = await load();
      const ok = await module.initPage();
      const { renderPage } = module;
      if (!ok) {
        const root = document.querySelector('#car-root');
        if (root) root.innerHTML = `<div class="empty-state"><p>${t('common.error')}</p><a class="btn btn-primary" href="/cars">${t('nav.cars')}</a></div>`;
        return;
      }
      on('lang', async () => {
        renderPage();
        afterRender();
      });
      return;
    }

    const module = await load();
    if (typeof module.init === 'function') module.init();
    else if (typeof module.render === 'function') {
      await module.render();
      afterRender();
      on('lang', async () => {
        await module.render();
        afterRender();
      });
    }
  } catch (error) {
    console.error('Page module failed', error);
  }
}

start();
