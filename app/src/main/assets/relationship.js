/* Relationship dates use civil calendar days. Health, Cycle and comfort moods never enter this module. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) {
    root.UsRelationship = api.create({window: root, document: root.document});
    root.onUsRelationshipState = payload => root.UsRelationship.onNativeState(payload);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DEFAULT_START = '2023-03-25', DAY = 86400000;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const text = value => typeof value === 'string' ? value : '';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  function leap(year) { return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0); }
  function monthDays(year, month) { return [31, leap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] || 0; }
  function iso(year, month, day) { return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'); }
  function parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
    if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > monthDays(year, month)) return null;
    return {year, month, day, iso: value};
  }
  function parseInput(value) {
    if (typeof value !== 'string') return null;
    const input = value.trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(input)) return null;
    const result = iso(Number(input.slice(6, 10)), Number(input.slice(3, 5)), Number(input.slice(0, 2)));
    return parseDate(result) ? result : null;
  }
  function inputDate(value) { const date = parseDate(value); return date ? String(date.day).padStart(2, '0') + '/' + String(date.month).padStart(2, '0') + '/' + date.year : ''; }
  function formatDate(value) { const date = parseDate(value); return date ? date.day + ' ' + MONTHS[date.month - 1] + ' ' + date.year : ''; }
  function localDate(value) {
    if (typeof value === 'string') return parseDate(value) ? value : null;
    const date = value instanceof Date ? value : new Date(value === undefined ? Date.now() : value);
    if (!Number.isFinite(date.getTime())) return null;
    const result = iso(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return parseDate(result) ? result : null;
  }
  function ordinal(value) { const date = typeof value === 'string' ? parseDate(value) : value; return date ? Date.UTC(date.year, date.month - 1, date.day) / DAY : null; }
  function calendarAnchor(value, years, months) {
    const date = parseDate(value);
    if (!date || !Number.isInteger(years) || !Number.isInteger(months)) return null;
    const index = date.year * 12 + date.month - 1 + years * 12 + months;
    const year = Math.floor(index / 12), month = index - year * 12 + 1;
    return year >= 1900 && year <= 2200 ? iso(year, month, Math.min(date.day, monthDays(year, month))) : null;
  }
  function shiftDate(value, days) {
    if (!parseDate(value) || !Number.isInteger(days)) return null;
    const date = new Date((ordinal(value) + days) * DAY);
    const result = iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    return parseDate(result) ? result : null;
  }
  // Each calendar anchor uses the original day, clamped only in the target month.
  // A 29 February anniversary falls on 28 February in non-leap years.
  function elapsed(startDate, today) {
    const start = parseDate(startDate), end = parseDate(localDate(today));
    if (!start || !end) return null;
    const rawDays = ordinal(end) - ordinal(start);
    if (rawDays < 0) return {startDate: start.iso, today: end.iso, totalDays: 0, years: 0, months: 0, days: 0, future: true, startsIn: -rawDays};
    let years = end.year - start.year;
    if (ordinal(calendarAnchor(start.iso, years, 0)) > ordinal(end)) years--;
    let months = (end.year - start.year) * 12 + end.month - start.month - years * 12;
    if (ordinal(calendarAnchor(start.iso, years, months)) > ordinal(end)) months--;
    const anchor = calendarAnchor(start.iso, years, months);
    return {startDate: start.iso, today: end.iso, totalDays: rawDays, years, months, days: ordinal(end) - ordinal(anchor), future: false, startsIn: 0};
  }
  function milestone(value) {
    if (!value || value.future) return null;
    const anniversary = value.years > 0 && calendarAnchor(value.startDate, value.years, 0) === value.today;
    const roundDays = value.totalDays === 100 || value.totalDays >= 500 && value.totalDays % 500 === 0;
    if (!anniversary && !roundDays) return null;
    const roundYear = anniversary && value.years % 5 === 0;
    const messages = [];
    if (anniversary) messages.push(roundYear ? value.years + ' years of us ❤️' : 'Another year of us ❤️');
    if (roundDays) messages.push(value.totalDays + ' days together ❤️');
    return {anniversary, roundDays, roundYear, years: value.years, totalDays: value.totalDays, messages, copy: messages.join(' · ')};
  }
  function breakdown(value) { return value ? value.years + ' ' + (value.years === 1 ? 'year' : 'years') + ' · ' + value.months + ' ' + (value.months === 1 ? 'month' : 'months') + ' · ' + value.days + ' ' + (value.days === 1 ? 'day' : 'days') : ''; }
  function timelineEntries(startDate, today, source, extras) {
    const duration = elapsed(startDate, today);
    if (!duration) return [];
    const entries = [{id: 'relationship-start', date: startDate, kind: 'Beginning', title: 'Our beginning', detail: 'The first day of us.', route: ''}];
    // Bound rendering while preserving our beginning and the most recent anniversaries.
    for (let year = Math.max(1, duration.years - 29); year <= duration.years; year++) {
      const date = calendarAnchor(startDate, year, 0);
      if (date) entries.push({id: 'anniversary-' + year, date, kind: 'Anniversary', title: year + ' ' + (year === 1 ? 'year' : 'years') + ' together', detail: year % 5 === 0 ? year + ' years of us ❤️' : 'Another year of us ❤️', route: ''});
    }
    const data = source && typeof source === 'object' ? source : {};
    for (const memory of Array.isArray(data.memories) ? data.memories : []) {
      const date = text(memory?.date).slice(0, 10), title = text(memory?.title).slice(0, 160);
      if (parseDate(date) && title) entries.push({id: 'memory-' + text(String(memory.id || '')), date, kind: 'Memory', title, detail: text(memory.place).slice(0, 240), route: 'memories'});
    }
    for (const trip of Array.isArray(data.duties) ? data.duties : []) {
      const title = text(trip?.title).slice(0, 160), date = text(trip?.date);
      if (trip?.type === 'Trip' && title && parseDate(date)) entries.push({id: 'trip-' + text(String(trip.id || '')), date, kind: 'Trip', title, detail: text(trip.place).slice(0, 240), route: 'calendar'});
    }
    for (const item of Array.isArray(extras?.bucket) ? extras.bucket : []) {
      const title = text(item?.title).slice(0, 160), date = text(item?.completedDate);
      if (item?.state === 'Done' && title && parseDate(date)) entries.push({id: 'bucket-' + text(String(item.id || '')), date, kind: 'Bucket List moment', title, detail: text(item.location).slice(0, 240), route: 'bucket'});
    }
    entries.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    const shown = entries.slice(0, 160);
    if (!shown.some(entry => entry.id === 'relationship-start')) {
      shown[159] = entries.find(entry => entry.id === 'relationship-start');
      shown.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    }
    return shown;
  }
  function create(options) {
    options = options || {};
    const win = options.window || {}, doc = options.document || win.document;
    const now = options.now || (() => new Date());
    const storage = options.storage || win.localStorage;
    let config = {}, model = {uid: '', coupleId: '', signedIn: false, paired: false, startDate: DEFAULT_START, syncState: 'local', error: ''};
    let draft = inputDate(DEFAULT_START), dirty = false, editorError = '', awaitingSave = null, timer = null, started = false, unSubscribe = null;
    const listeners = [];
    const element = id => doc?.getElementById?.(id) || null;
    function bridge() { try { return options.bridge || win.AndroidRelationship || null; } catch (_) { return null; } }
    function nativeStatus() { try { const native = bridge(); const result = native?.status?.(); return typeof result === 'string' ? JSON.parse(result) : result || null; } catch (_) { return null; } }
    function scope(value) { return (value?.signedIn && text(value.uid) ? text(value.uid) : '') + ':' + (value?.signedIn && value?.paired ? text(value.coupleId) : ''); }
    function normalized(value) {
      const uid = value?.signedIn ? text(value.uid) : '', coupleId = uid && value?.paired ? text(value.coupleId) : '';
      return {uid, coupleId, signedIn: !!uid, paired: !!coupleId, startDate: parseDate(value?.startDate) ? value.startDate : DEFAULT_START, syncState: ['local', 'cached', 'connecting', 'pending', 'syncing', 'synced', 'error'].includes(value?.syncState) ? value.syncState : 'local', error: text(value?.error).slice(0, 500)};
    }
    function accept(value) {
      const next = normalized(value);
      let savedDate = '';
      if (scope(next) !== scope(model)) { dirty = false; editorError = ''; awaitingSave = null; }
      if (awaitingSave && scope(next) === awaitingSave.scope) {
        if (next.startDate === awaitingSave.date) { savedDate = next.startDate; dirty = false; editorError = ''; awaitingSave = null; }
        else if (next.error) { editorError = next.error; awaitingSave = null; }
      }
      model = next;
      if (!dirty) draft = inputDate(model.startDate);
      render();
      if (savedDate) { try { config.onSaved?.(savedDate); } catch (_) {} }
      return true;
    }
    function guest() {
      let startDate = DEFAULT_START;
      try { const cached = storage?.getItem?.('usspace_relationship_guest_v015'); if (parseDate(cached)) startDate = cached; } catch (_) {}
      return accept({startDate, signedIn: false, syncState: 'local'});
    }
    function onNativeState(payload) {
      if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch (_) { return false; } }
      const current = nativeStatus();
      if (!current || !payload || scope(payload) !== scope(current)) return false;
      // The status is the current native account and document; a delayed callback cannot restore an old value.
      return accept(current);
    }
    function onIdentity(identity) {
      const current = nativeStatus();
      if (current && (identity?.signedIn ? current.signedIn && current.uid === identity.uid && (!identity.paired || current.coupleId === identity.coupleId) : !current.signedIn)) return accept(current);
      return guest();
    }
    function refresh() {
      const current = nativeStatus();
      if (current) accept(current);
      else if (!model.signedIn) guest();
      try { bridge()?.refresh?.(); } catch (_) {}
    }
    function updateStartDate(input) {
      const date = parseInput(input);
      if (!date) { editorError = 'Enter a real date as DD/MM/YYYY, between 1900 and 2200.'; renderSettings(); return false; }
      try {
        const native = bridge(), current = nativeStatus();
        if (native) {
          if (!current || scope(current) !== scope(model)) { if (current) accept(current); throw new Error('Your account changed. Choose the date again.'); }
          if (typeof native.updateStartDate !== 'function') throw new Error('The relationship date could not be saved. Try again.');
          awaitingSave = {scope: scope(current), date};
          draft = inputDate(date); dirty = true; editorError = '';
          const accepted = native.updateStartDate(date);
          if (accepted === false) throw new Error('The relationship date could not be saved. Try again.');
          const saved = nativeStatus();
          if (saved && scope(saved) === scope(current) && (saved.startDate === date || saved.error && saved.error !== current.error)) accept(saved);
          else renderSettings();
        } else {
          if (model.signedIn) throw new Error('Relationship sync needs the installed UsSpace app.');
          if (!storage?.setItem) throw new Error('This phone could not save the relationship date.');
          storage.setItem('usspace_relationship_guest_v015', date);
          dirty = false; editorError = ''; accept({startDate: date, syncState: 'local'});
          try { config.onSaved?.(date); } catch (_) {}
        }
        return true;
      } catch (failure) { awaitingSave = null; editorError = failure.message || 'The relationship date could not be saved. Try again.'; renderSettings(); return false; }
    }
    function liveValue() { return elapsed(model.startDate, now()); }
    function counterNumber(value) { return value.totalDays.toLocaleString('en-GB'); }
    function renderHome() {
      const target = element('homeTogether'), value = liveValue();
      if (!target || !value) return;
      const special = milestone(value), number = counterNumber(value);
      const status = value.future ? ' Starts soon. ' + value.startsIn + ' days to go.' : special ? ' ' + special.copy + '.' : '';
      target.innerHTML = `<button id="togetherForCard" type="button" class="relationship-together${special ? ' is-milestone' : ''}" aria-label="Together for ${esc(number)} days. Since ${esc(formatDate(model.startDate))}. ${esc(breakdown(value))}.${esc(status)} Open relationship timeline"><span class="relationship-together-top"><span class="relationship-title">Together for</span><span class="relationship-heart" aria-hidden="true">♡</span></span><span class="relationship-dayline"><strong class="relationship-days">${esc(number)}</strong><span class="relationship-days-label">days <span aria-hidden="true">❤️</span></span></span><span class="relationship-since">Since ${esc(formatDate(model.startDate))}</span><span class="relationship-breakdown">${esc(breakdown(value))}</span>${value.future ? '<span class="relationship-milestone">Starts soon · ' + esc(value.startsIn) + ' ' + (value.startsIn === 1 ? 'day' : 'days') + ' to go</span>' : special ? '<span class="relationship-milestone">' + esc(special.copy) + '</span>' : '<span class="relationship-optional">Different places. Same sky. Still us.</span>'}<span class="relationship-open">Our timeline <span aria-hidden="true">↗</span></span></button>`;
      const button = target.querySelector?.('#togetherForCard');
      if (button) button.onclick = () => config.navigate?.('relationship-timeline');
    }
    function saveMessage() {
      if (awaitingSave) return 'Saving your relationship date…';
      if (model.error) return model.error;
      if (!model.paired) return 'Saved on this phone. Pair your accounts to share your relationship date.';
      if (model.syncState === 'synced') return 'Shared privately with your paired account.';
      if (model.syncState === 'pending' || model.syncState === 'syncing') return 'Saved on this phone; waiting to sync with your paired account.';
      return 'Your relationship date is saved. Connect to sync your paired space.';
    }
    function renderSettings() {
      const target = element('relationshipSettings');
      if (!target) return;
      if (!target.__usRelationshipBound) {
        target.innerHTML = '<section class="relationship-settings" aria-labelledby="relationshipSettingsTitle"><h3 id="relationshipSettingsTitle">Relationship</h3><p class="sub">The first day of us, remembered together.</p><label for="relationshipStartInput" class="relationship-input-label">Relationship start date</label><input id="relationshipStartInput" class="field relationship-date-input" type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/YYYY" aria-describedby="relationshipDateHelp relationshipDateStatus"><p id="relationshipDateHelp" class="small">Day / month / year · for example, 25/03/2023</p><button type="button" id="relationshipSaveDate" class="btn soft">Save relationship date</button><p id="relationshipDateStatus" class="relationship-save-status small" role="status" aria-live="polite"></p></section>';
        const input = target.querySelector?.('#relationshipStartInput'), save = target.querySelector?.('#relationshipSaveDate');
        if (input) input.oninput = () => { draft = input.value; dirty = true; editorError = ''; awaitingSave = null; const status = element('relationshipDateStatus'); if (status) status.textContent = 'Save to update your relationship date.'; };
        if (save) save.onclick = () => updateStartDate(input ? input.value : draft);
        target.__usRelationshipBound = true;
      }
      const input = element('relationshipStartInput'), status = element('relationshipDateStatus');
      if (input && (doc?.activeElement !== input || !dirty)) input.value = draft;
      if (input) input.setAttribute?.('aria-invalid', editorError ? 'true' : 'false');
      if (status) { status.textContent = editorError || saveMessage(); status.setAttribute?.('role', editorError || !awaitingSave && model.error ? 'alert' : 'status'); }
    }
    function safeSources() {
      let source = {};
      try { source = config.getState?.() || {}; } catch (_) {}
      const shared = source.sync || {};
      const sameScope = model.paired && shared.signedIn && shared.uid === model.uid && shared.coupleId === model.coupleId;
      const localGuest = !model.signedIn && !shared.signedIn && !shared.uid;
      if (!sameScope && !localGuest) source = {};
      let extras = {};
      try { extras = config.getExtras?.() || win.UsExtras?.get?.() || {}; } catch (_) {}
      if (!model.paired || extras.uid !== model.uid || extras.coupleId !== model.coupleId) extras = {};
      return {source, extras};
    }
    function renderTimeline() {
      const target = element('relationshipTimeline'), value = liveValue();
      if (!target || !value) return;
      const {source, extras} = safeSources(), entries = timelineEntries(model.startDate, value.today, source, extras);
      const next = calendarAnchor(model.startDate, value.years + 1, 0);
      const nextText = !value.future && next ? '<p class="small relationship-next-anniversary">Next anniversary · ' + esc(formatDate(next)) + '</p>' : '';
      target.innerHTML = `<div class="relationship-timeline-heading"><span class="eyebrow">Still us ❤️</span><h2>Our relationship timeline</h2><p class="sub">The days, places and little moments that make our story.</p></div><div class="relationship-timeline-summary"><strong>${esc(counterNumber(value))} days together</strong><span>${esc(breakdown(value))}</span>${nextText}</div><ol class="relationship-timeline-list">${entries.map(entry => '<li class="relationship-timeline-entry"><span class="relationship-timeline-dot" aria-hidden="true">' + (entry.kind === 'Anniversary' || entry.kind === 'Beginning' ? '♥' : '•') + '</span><div class="relationship-timeline-content"><div class="relationship-timeline-meta"><time datetime="' + esc(entry.date) + '">' + esc(formatDate(entry.date)) + '</time><span>' + esc(entry.kind) + '</span></div><h3>' + esc(entry.title) + '</h3>' + (entry.detail ? '<p>' + esc(entry.detail) + '</p>' : '') + (entry.route ? '<button type="button" class="relationship-timeline-link" data-relationship-route="' + esc(entry.route) + '">Open ' + esc(entry.route === 'bucket' ? 'Bucket List' : entry.route === 'calendar' ? 'calendar' : 'memories') + ' <span aria-hidden="true">↗</span></button>' : '') + '</div></li>').join('')}</ol><p class="relationship-timeline-footer small">Add memories, trips and completed Bucket List moments to keep your story growing.</p>`;
      for (const button of target.querySelectorAll?.('[data-relationship-route]') || []) button.onclick = () => {
        const route = button.getAttribute('data-relationship-route');
        if (['memories', 'calendar', 'bucket'].includes(route)) config.navigate?.(route);
      };
    }
    function render() { renderHome(); renderSettings(); renderTimeline(); }
    function scheduleRollover() {
      if (timer !== null) win.clearTimeout?.(timer);
      const current = now(), date = current instanceof Date ? current : new Date(current);
      if (!Number.isFinite(date.getTime())) return;
      const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      // Checking at least once a minute also handles a changed device date or time zone.
      const delay = Math.max(50, Math.min(60000, midnight.getTime() - date.getTime() + 25));
      if (typeof win.setTimeout === 'function') timer = win.setTimeout(() => { timer = null; render(); scheduleRollover(); }, delay);
    }
    function resumed() { render(); scheduleRollover(); }
    function listen(target, name, fn) { if (target?.addEventListener) { target.addEventListener(name, fn); listeners.push([target, name, fn]); } }
    function init(value) {
      config = value || {};
      if (!started) {
        started = true;
        listen(win, 'focus', resumed); listen(win, 'pageshow', resumed);
        listen(doc, 'visibilitychange', () => { if (!doc.hidden) resumed(); });
        try { unSubscribe = win.UsExtras?.subscribe?.(() => renderTimeline()) || null; } catch (_) {}
        refresh(); scheduleRollover();
      }
      render();
    }
    function close() {
      if (timer !== null) win.clearTimeout?.(timer); timer = null;
      for (const [target, name, fn] of listeners.splice(0)) target.removeEventListener?.(name, fn);
      unSubscribe?.(); unSubscribe = null; started = false;
    }
    return {init, render, refresh, onIdentity, onNativeState, updateStartDate, get: () => Object.assign({}, model), value: liveValue, close};
  }
  return {DEFAULT_START, leap, monthDays, parseDate, parseInput, inputDate, formatDate, localDate, ordinal, calendarAnchor, shiftDate, elapsed, milestone, breakdown, timelineEntries, create};
});
