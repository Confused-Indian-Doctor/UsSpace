/* Read-only Samsung Health import. This module never writes to a shared projection. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsHealthSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FIELDS = ['steps', 'sleep', 'hr', 'kcal', 'spo2', 'weight', 'workout'];
  const LIMITS = {steps: [0, 10000000], sleep: [0, 48], hr: [20, 250], kcal: [0, 100000], spo2: [50, 100], weight: [1, 600]};
  const own = (x, key) => Object.prototype.hasOwnProperty.call(x || {}, key);
  function localDay(now = new Date()) {return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');}
  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number), date = new Date(Date.UTC(y, m - 1, d));
    return y >= 1900 && y <= 2200 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }
  function validValue(key, value) {
    if (key === 'workout') return typeof value === 'string' && value.length <= 240;
    return typeof value === 'number' && Number.isFinite(value) && value >= LIMITS[key][0] && value <= LIMITS[key][1];
  }
  function mergeSnapshot(previous, incoming) {
    if (!incoming || !validDay(incoming.date)) return {changed: false, fields: [], entry: previous || null};
    let cleared=false;
    if(previous&&Array.isArray(incoming.deletedFields)&&String(previous.source||'').includes('Samsung')){const copy={...previous,fieldTimes:{...previous.fieldTimes},fieldSources:{...previous.fieldSources},availableFields:[...(previous.availableFields||[])]};for(const key of incoming.deletedFields)if(FIELDS.includes(key)&&incoming.fieldStates?.[key]==='no_data'&&String(previous.fieldSources?.[key]||previous.source||'').includes('Samsung')){delete copy[key];delete copy.fieldTimes[key];delete copy.fieldSources[key];copy.availableFields=copy.availableFields.filter(x=>x!==key);cleared=true;}previous=copy;}
    const declared = Array.isArray(incoming.availableFields) ? incoming.availableFields : FIELDS.filter(key => own(incoming, key) && (key === 'workout' ? !!incoming[key] : incoming[key] > 0));
    const fields = FIELDS.filter(key => declared.includes(key) && validValue(key, incoming[key]));
    if (!fields.length) return {changed: cleared, fields, entry: previous || null};
    const entry = Object.assign({}, previous || {}, {date: incoming.date, source: 'Samsung Health via Health Connect'});
    const available = new Set(Array.isArray(entry.availableFields) ? entry.availableFields : FIELDS.filter(key => own(entry, key) && validValue(key, entry[key]) && entry[key] !== 0 && entry[key] !== ''));
    entry.fieldTimes = Object.assign({}, entry.fieldTimes || {});
    entry.fieldSources=Object.assign({},Object.fromEntries(FIELDS.filter(k=>own(previous,k)).map(k=>[k,previous.source||'Manual entry'])),previous?.fieldSources||{});
    fields.forEach(key => {
      entry[key] = incoming[key]; entry.fieldSources[key]='Samsung Health via Health Connect'; available.add(key);
      const time = incoming.fieldTimes?.[key];
      if (typeof time === 'string' && time.length <= 64 && Number.isFinite(Date.parse(time))) entry.fieldTimes[key] = time;
    });
    entry.availableFields = FIELDS.filter(key => available.has(key));
    if (fields.includes('hr')) entry.hrType = incoming.hrType === 'recent' ? 'recent' : 'resting';
    if (fields.includes('kcal')) entry.kcalType = incoming.kcalType === 'total' ? 'total' : 'active';
    if(fields.includes('workout')&&Number.isFinite(incoming.workoutCount)&&Number.isFinite(incoming.workoutMinutes)){entry.workoutCount=incoming.workoutCount;entry.workoutMinutes=incoming.workoutMinutes;}
    return {changed: true, fields, entry};
  }
  function createController(deps) {
    let details = {}, fieldStates = {};
    const read = () => deps.getState(), bridge = () => {try {return deps.bridge();} catch (_) {return null;}};
    const uid = () => String(read().sync?.uid || '');
    const scoped = x => x && (own(x, 'uid') ? String(x.uid || '') === uid() : !uid());
    const health = () => {const s = read(); s.health ||= {}; s.health.share = false; return s.health;};
    const element = id => deps.document?.getElementById(id);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const messages = {
      checking: 'Checking Health Connect…', disconnected: 'Choose which readings UsSpace may read',
      connected: 'Read access granted — ready to sync', partial: 'Some readings are available; the rest stay unchanged',
      ready: 'Samsung Health readings imported privately', no_data: 'No Samsung Health readings found yet',
      requesting: 'Waiting for Health Connect permission…', permissions: 'Allow read access to the readings you want',
      permission_denied: 'Read access is not granted; manual logging still works', syncing: 'Reading Samsung Health…',
      unsupported: 'This Samsung Health connection needs Android 14 or newer',
      web_only: 'Health Connect is available in the installed Android app', error: 'Could not read Health Connect. Your saved readings are unchanged.'
    };
    function renderStatus() {
      const h = health(), state = h.hcState || 'checking', busy = ['syncing', 'requesting'].includes(state);
      const txt = element('hcStatusText'), dot = element('hcDot'), sync = element('hcSyncBtn'), connect = element('hcConnectBtn');
      if (txt) txt.textContent = details.message || messages[state] || 'Check Health Connect read access';
      if (dot) dot.className = 'hcDot' + (busy ? ' syncing' : ['connected', 'ready', 'partial'].includes(state) ? ' connected' : '');
      if (sync) sync.disabled = busy || !details.connected;
      if (connect) {connect.disabled = busy || state === 'unsupported' || state === 'web_only'; connect.textContent = details.connected ? 'Manage read access' : 'Allow read access';}
      const info = element('hcDetails');
      if (info) {
        const grants = Number.isInteger(details.grantedCount) ? details.grantedCount + ' of ' + details.totalPermissions + ' read permissions allowed. ' : '';
        info.textContent = grants + (details.samsungInstalled === false ? 'Samsung Health is not installed or available. ' : '') + 'Samsung Health must be allowed to write to Health Connect. UsSpace only reads from it.';
      }
    }
    function receiveStatus(x) {
      if (!scoped(x)) return;
      details = Object.assign({}, x);
      if (x.state) health().hcState = x.state;
      renderStatus();
    }
    function receiveState(state) {health().hcState = state; details.message = ''; renderStatus();}
    function init() {
      const b = bridge();
      if (!b) {details = {connected: false}; receiveState('web_only'); return;}
      try {receiveStatus(JSON.parse(b.status())); if (typeof b.refresh === 'function') b.refresh();}
      catch (_) {receiveState('error');}
    }
    function receiveSnapshot(x) {
      if (!scoped(x)) return;
      const s = read(), h = health();
      fieldStates = Object.fromEntries(FIELDS.filter(key => ['ready', 'no_data', 'permission_denied', 'error'].includes(x.fieldStates?.[key])).map(key => [key, x.fieldStates[key]]));
      const previous = (s.healthHistory || []).find(entry => entry.date === x.date), result = mergeSnapshot(previous, x);
      h.lastCheck = new Date().toISOString(); h.hcState = x.state || (result.changed ? 'ready' : 'no_data');
      details.message = '';
      if (result.changed) {
        s.healthHistory = (s.healthHistory || []).filter(entry => entry.date !== x.date);
        s.healthHistory.unshift(result.entry); h.lastSync = x.syncedAt || h.lastCheck;
      }
      deps.save(); deps.render();
      deps.toast(result.changed ? (h.hcState === 'partial' ? 'Available Samsung Health readings imported; other values kept' : 'Samsung Health imported privately ✓') : h.hcState === 'error' ? 'Health Connect could not be read. Saved readings kept.' : 'No Samsung Health readings yet. Check its Health Connect sharing.');
    }
    function invoke(method) {
      const b = bridge(); if (!b || typeof b[method] !== 'function') {deps.toast('Open this in the latest UsSpace Android app'); return;}
      try {b[method]();} catch (_) {receiveState('error');}
    }
    function render() {
      const history = (read().healthHistory || []).filter(x => validDay(x.date)).slice().sort((a, b) => b.date.localeCompare(a.date)), current = history[0];
      const labels = [['steps', '👟', 'Steps', ''], ['sleep', '😴', 'Sleep', ' h'], ['hr', '❤️', current?.hrType === 'recent' ? 'Heart rate' : 'Resting HR', ' bpm'], ['kcal', '🔥', current?.kcalType === 'total' ? 'Calories burned' : 'Active calories', ''], ['spo2', '🫁', 'SpO₂', '%'], ['weight', '⚖️', 'Weight', ' kg']];
      const grid = element('healthStats');
      if (grid) grid.innerHTML = labels.map(([key, icon, label, unit]) => {
        const exists = current && validValue(key, current[key]) && (current[key] > 0 || current.availableFields?.includes(key));
        const value = exists ? (key === 'steps' || key === 'kcal' ? Math.round(current[key]).toLocaleString() : current[key]) + unit : '—';
        const issue = {permission_denied: 'Read access not allowed', no_data: 'No new Samsung reading', error: 'Could not refresh this reading'}[fieldStates[key]];
        const recorded = current?.fieldTimes?.[key], stamp = recorded && Number.isFinite(Date.parse(recorded)) ? new Date(recorded).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : '';
        return '<div class="healthstat"><div>' + icon + ' <span class="small">' + esc(label) + '</span></div><b>' + esc(value) + '</b>' + (issue || stamp ? '<div class="small">' + esc(issue || 'Recorded ' + stamp + ' · ' + (current.fieldSources?.[key]||current.source||'Unknown source')) + '</div>' : '') + '</div>';
      }).join('');
      const list = element('healthHistory');
      if (list) list.innerHTML = history.length ? history.slice(0, 10).map(x => '<div class="healthHistory"><b>' + esc(x.date) + '</b><div class="small">' + esc(x.source || 'Manual') + '</div><div>' + FIELDS.filter(key => validValue(key, x[key]) && (x[key] !== 0 && x[key] !== '' || x.availableFields?.includes(key))).map(key => esc(key + ': ' + x[key])).join(' · ') + '</div>' + (x.note ? '<div class="small">' + esc(x.note) + '</div>' : '') + '</div>').join('') : '<div class="empty">No health snapshots yet. Allow Samsung Health to write to Health Connect, then grant UsSpace read access.</div>';
      const source = element('healthSourceLine');
      if (source) source.textContent = current ? (current.source || 'Manual') + ' · ' + current.date + (health().lastSync ? ' · last import ' + new Date(health().lastSync).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '') : 'No readings imported. Saved data is never replaced by missing readings.';
      renderStatus();
    }
    return {init, render, renderStatus, receiveState, receiveStatus, receiveSnapshot,
      connect: () => invoke(details.connected ? 'openHealthConnectSettings' : 'requestPermissions'), sync: () => invoke('sync'),
      openSettings: () => invoke('openHealthConnectSettings'), openSamsung: () => invoke('openSamsungHealth'), openAppSettings: () => invoke('openAppSettings')};
  }
  return {FIELDS, localDay, validDay, validValue, mergeSnapshot, createController};
});
