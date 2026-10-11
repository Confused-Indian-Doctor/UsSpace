/* Android Back follows app sections, rather than WebView URL history. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createController(deps) {
    const doc = deps.document, handlers = new Map();
    let handling = false;
    function activeScreen() {
      const active = doc.querySelector('.screen.active');
      return active && active.id ? active.id : 'home';
    }
    function topOverlay() {
      const candidates = Array.from(doc.querySelectorAll('.modal.show, dialog[open]'))
        .filter(node => !node.hidden && node.getAttribute?.('aria-hidden') !== 'true');
      let top = null, topZ = -Infinity;
      candidates.forEach(node => {
        const style = deps.getStyle ? deps.getStyle(node) : node.style;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')) return;
        const parsed = Number.parseFloat(style && style.zIndex);
        const z = Number.isFinite(parsed) ? parsed : 50;
        // Later DOM siblings win when their stacking levels match.
        if (z >= topZ) { top = node; topZ = z; }
      });
      return top;
    }
    function closeOverlay(node) {
      if (String(node.tagName || '').toLowerCase() === 'dialog') {
        if (typeof node.close === 'function') node.close();
        else node.open = false;
      } else if (deps.closeModal && node.id) deps.closeModal(node.id);
      else node.classList.remove('show');
    }
    function handleBack() {
      // A module render can synchronously trigger callbacks. One press handles one layer.
      if (handling) return true;
      handling = true;
      try {
        const overlay = topOverlay();
        if (overlay) { closeOverlay(overlay); return true; }
        const screen = activeScreen();
        if (screen === 'home') return false;
        const handler = handlers.get(screen);
        if (handler && handler() === true) return true;
        if (deps.nestedBack && deps.nestedBack(screen) === true) return true;
        deps.navigate('home');
        return true;
      } finally { handling = false; }
    }
    function registerBackHandler(screen, handler) {
      if (typeof screen !== 'string' || !/^[a-z][a-z0-9_-]{0,79}$/i.test(screen) || typeof handler !== 'function') throw new TypeError('A section and synchronous Back handler are required.');
      handlers.set(screen, handler);
      return () => { if (handlers.get(screen) === handler) handlers.delete(screen); };
    }
    return {handleBack, activeScreen, registerBackHandler};
  }
  function mount(root) {
    root.UsNavigation = createController({
      document: root.document,
      getStyle: typeof root.getComputedStyle === 'function' ? node => root.getComputedStyle(node) : null,
      closeModal(id) { if (typeof root.closeM === 'function') root.closeM(id); else root.document.getElementById(id)?.classList.remove('show'); },
      navigate(id) { if (typeof root.go === 'function') root.go(id); },
      nestedBack(screen) {
        if (screen === 'letters') return root.UsLetters?.handleBack?.() === true;
        if (screen === 'bucket') return root.UsPlans?.handleBack?.() === true;
        if (screen === 'work-schedule') return root.UsWorkSchedule?.handleBack?.() === true;
        if (screen === 'learn') return typeof root.handleLearningBack === 'function' && root.handleLearningBack() === true;
        return false;
      }
    });
    return root.UsNavigation;
  }
  return {createController, mount};
});
