/* Account-private appearance and notification controls. Health, Cycle and moods never enter this document. */
(function (root, factory) {
  'use strict';
  const exported = factory();
  if (typeof module === 'object' && module.exports) module.exports = exported;
  else {
    root.UsPreferences = exported.create({ window: root, document: root.document });
    root.onUsPreferencesState = payload => root.UsPreferences.onNativeState(payload);
    root.UsPreferences.bootstrap();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const categories = ['pings', 'notes', 'status', 'goals', 'bucket', 'memories', 'calendar'];
  const labels = { pings: 'Pings & little love', notes: 'Notes & appreciation', status: 'Status changes', goals: 'Shared goals', bucket: 'Bucket List updates', memories: 'New memories', calendar: 'Calendar changes' };
  const themeNames = { system: 'System', light: 'Light', dark: 'Dark' };
  const clone = x => JSON.parse(JSON.stringify(x));
  const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function validTime(value) { return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
  function validZone(value) {
    if (typeof value !== 'string' || value.length > 100 || !(value === 'UTC' || /^[A-Za-z_]+\/[A-Za-z0-9_+\-/]+$/.test(value))) return false;
    try { new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date(0)); return true; } catch (_) { return false; }
  }
  function deviceZone() { try { const zone = Intl.DateTimeFormat().resolvedOptions().timeZone; return validZone(zone) ? zone : 'UTC'; } catch (_) { return 'UTC'; } }
  function defaults(zone) {
    return { theme: 'system', notifications: { enabled: false, categories: Object.fromEntries(categories.map(k => [k, true])), quietHours: { enabled: false, start: '22:00', end: '07:00', timeZone: validZone(zone) ? zone : deviceZone() } } };
  }
  function normalize(raw, zone) {
    const result = defaults(zone);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
    if (Object.hasOwn(themeNames, raw.theme)) result.theme = raw.theme;
    const source = raw.notifications;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return result;
    if (typeof source.enabled === 'boolean') result.notifications.enabled = source.enabled;
    for (const key of categories) if (typeof source.categories?.[key] === 'boolean') result.notifications.categories[key] = source.categories[key];
    const quiet = source.quietHours;
    if (quiet && typeof quiet === 'object' && !Array.isArray(quiet)) {
      if (typeof quiet.enabled === 'boolean') result.notifications.quietHours.enabled = quiet.enabled;
      for (const key of ['start', 'end']) if (validTime(quiet[key])) result.notifications.quietHours[key] = quiet[key];
      if (validZone(quiet.timeZone)) result.notifications.quietHours.timeZone = quiet.timeZone;
    }
    return result;
  }
  function validatePatch(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.keys(raw).length || Object.keys(raw).length > 16) throw new Error('Choose a setting to update.');
    const patch = {};
    for (const [key, value] of Object.entries(raw)) {
      let valid = false;
      if (key === 'theme') valid = typeof value === 'string' && Object.hasOwn(themeNames, value);
      else if (key === 'notifications.enabled' || key === 'notifications.quietHours.enabled') valid = typeof value === 'boolean';
      else if (key === 'notifications.quietHours.start' || key === 'notifications.quietHours.end') valid = validTime(value);
      else if (key === 'notifications.quietHours.timeZone') valid = validZone(value);
      else if (key.startsWith('notifications.categories.')) valid = categories.includes(key.slice('notifications.categories.'.length)) && typeof value === 'boolean';
      if (!valid) throw new Error('That setting is not valid.');
      patch[key] = value;
    }
    return patch;
  }
  function apply(raw, patch, zone) {
    const result = normalize(raw, zone);
    for (const [key, value] of Object.entries(validatePatch(patch))) {
      const path = key.split('.');
      let target = result;
      for (let i = 0; i < path.length - 1; i++) target = target[path[i]];
      target[path[path.length - 1]] = value;
    }
    return result;
  }
  function resolvedTheme(theme, systemDark) { return theme === 'dark' || theme === 'system' && systemDark ? 'dark' : 'light'; }
  function quietNow(raw, date) {
    const q = normalize(raw).notifications.quietHours;
    if (!q.enabled) return false;
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: q.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date || new Date());
    const hour = Number(parts.find(p => p.type === 'hour').value), minute = Number(parts.find(p => p.type === 'minute').value);
    const minuteOf = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const now = hour * 60 + minute, start = minuteOf(q.start), end = minuteOf(q.end);
    return start === end || (start < end ? now >= start && now < end : now >= start || now < end);
  }
  function allows(raw, category, date) {
    const n = normalize(raw).notifications;
    return categories.includes(category) && n.enabled && n.categories[category] && !quietNow(raw, date);
  }
  function create(options) {
    options = options || {};
    const win = options.window || {}, doc = options.document || win.document;
    const storage = options.storage || win.localStorage;
    let settings = defaults(), uid = '', signedIn = false, syncState = 'local', error = '', permission = null, nativeSystemDark = null;
    let mounted = null, config = {}, media = null, initialized = false;
    function bridge() { try { return options.bridge || win.AndroidPreferences || null; } catch (_) { return null; } }
    function nativeStatus() {
      try { const native = bridge(); return native && typeof native.status === 'function' ? JSON.parse(native.status()) : null; } catch (_) { return null; }
    }
    function applyTheme() {
      // Android's fixed Light Activity theme can leave matchMedia stale while the phone is Dark.
      const dark = nativeSystemDark !== null ? nativeSystemDark : media ? !!media.matches : !!win.matchMedia?.('(prefers-color-scheme: dark)').matches;
      const theme = resolvedTheme(settings.theme, dark);
      if (doc?.documentElement) {
        doc.documentElement.setAttribute('data-theme', theme);
        doc.documentElement.setAttribute('data-theme-choice', settings.theme);
        doc.documentElement.style.colorScheme = theme;
        const meta = doc.querySelector?.('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'dark' ? '#171c2b' : '#fff8f7');
      }
      return theme;
    }
    function guest() {
      uid = ''; signedIn = false; settings = defaults(); syncState = 'local'; error = ''; permission = null; nativeSystemDark = null;
    }
    function accept(payload, verified) {
      if (!payload || typeof payload !== 'object') return false;
      const nextUid = payload.signedIn && typeof payload.uid === 'string' ? payload.uid : '';
      if (!verified) {
        const current = nativeStatus();
        const currentUid = current?.signedIn && typeof current.uid === 'string' ? current.uid : '';
        if (nextUid !== currentUid) return false;
      }
      if (nextUid !== uid) permission = null;
      uid = nextUid; signedIn = !!nextUid;
      nativeSystemDark = typeof payload.systemDark === 'boolean' ? payload.systemDark : null;
      settings = normalize(payload.preferences);
      if (!signedIn) settings.notifications.enabled = false;
      syncState = typeof payload.syncState === 'string' ? payload.syncState : 'local';
      error = typeof payload.error === 'string' ? payload.error : '';
      applyTheme(); render();
      return true;
    }
    function bootstrap() {
      if (!media && typeof win.matchMedia === 'function') {
        media = win.matchMedia('(prefers-color-scheme: dark)');
        if (typeof media.addEventListener === 'function') media.addEventListener('change', applyTheme);
        else if (typeof media.addListener === 'function') media.addListener(applyTheme);
      }
      const native = nativeStatus();
      if (native) accept(native, true);
      else {
        // Browser previews persist only a separate guest appearance, never an arbitrary user's settings.
        try { const raw = JSON.parse(storage?.getItem('usspace_preferences_guest_v014') || '{}'); settings = normalize(raw); settings.notifications.enabled = false; } catch (_) { settings = defaults(); }
        applyTheme();
      }
    }
    function onIdentity(state) {
      const native = nativeStatus();
      if (!state?.signedIn) {
        guest(); applyTheme(); render();
        // Only accept signed-out native guest data; stale cached auth from web storage cannot restore an account.
        if (native && !native.signedIn) accept(native, true);
      } else if (native?.signedIn && native.uid === state.uid) accept(native, true);
      else { guest(); applyTheme(); render(); }
    }
    function onNativeState(payload) { return accept(payload, false); }
    function update(patch) {
      try {
        patch = validatePatch(patch);
        if (!signedIn && patch['notifications.enabled'] === true) throw new Error('Sign in to turn on notifications for your account.');
        const native = bridge();
        if (native) {
          const status = nativeStatus();
          const actualUid = status?.signedIn ? status.uid : '';
          if (actualUid !== uid) { if (status) accept(status, true); throw new Error('Your account changed. Choose the setting again.'); }
          native.update(JSON.stringify(patch));
        } else {
          if (signedIn) throw new Error('Account settings need the installed UsSpace app.');
          const next = apply(settings, patch);
          next.notifications.enabled = false;
          storage?.setItem('usspace_preferences_guest_v014', JSON.stringify(next));
        }
        settings = apply(settings, patch);
        syncState = signedIn ? 'pending' : 'local'; error = '';
        applyTheme(); render();
        if (patch['notifications.enabled'] === true && typeof config.onNotificationEnable === 'function') config.onNotificationEnable();
        return true;
      } catch (failure) { error = failure.message || 'That setting could not be saved.'; render(); return false; }
    }
    function zoneOptions(current) {
      let zones;
      try { zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []; } catch (_) { zones = []; }
      const all = [...new Set([current, deviceZone(), 'UTC', 'Europe/London', 'Asia/Kolkata', 'America/New_York', 'Australia/Sydney', ...zones])].filter(validZone);
      return all.map(z => `<option value="${esc(z)}"${z === current ? ' selected' : ''}>${esc(z.replace(/_/g, ' '))}</option>`).join('');
    }
    function render() {
      if (!mounted && doc) mounted = typeof config.mount === 'string' ? doc.querySelector(config.mount) : config.mount || doc.getElementById('preferencesSettings');
      if (!mounted) return;
      const n = settings.notifications, q = n.quietHours;
      const saved = !signedIn ? 'Appearance stays on this phone. Sign in to save settings with your account.' : syncState === 'synced' ? 'Saved to your account.' : syncState === 'pending' ? 'Saved on this phone · syncing with your account.' : 'Saved on this phone.';
      let permissionHint = '';
      if (permission && n.enabled && permission.permissionGranted === false) permissionHint = '<p class="preferences-warning">Notifications are switched on here, but Android permission is off. Allow UsSpace notifications in your phone settings.</p>';
      mounted.innerHTML = `<section class="preferences-section" aria-labelledby="appearanceTitle"><h3 id="appearanceTitle">Appearance</h3><p class="sub">A little space that feels right, day or night.</p><div class="preferences-theme" role="group" aria-label="Theme">${Object.keys(themeNames).map(theme => `<button type="button" class="preferences-theme-choice" data-theme-choice="${theme}" aria-pressed="${settings.theme === theme}">${themeNames[theme]}</button>`).join('')}</div><p class="small">System follows your phone’s appearance.</p></section><section class="preferences-section" aria-labelledby="notificationsTitle"><h3 id="notificationsTitle">Notifications</h3><p class="sub">Choose which shared moments can reach you.</p><label class="preferences-switch"><span><strong>Allow notifications</strong><small>Off until you choose to turn them on.</small></span><input type="checkbox" data-pref="notifications.enabled"${n.enabled ? ' checked' : ''}${signedIn ? '' : ' disabled'}></label>${!signedIn ? '<p class="small">Sign in first to receive updates from your paired space.</p>' : ''}${permissionHint}<div class="preferences-categories">${categories.map(key => `<label class="preferences-switch"><span>${esc(labels[key])}</span><input type="checkbox" data-pref="notifications.categories.${key}"${n.categories[key] ? ' checked' : ''}></label>`).join('')}</div><div class="preferences-quiet"><label class="preferences-switch"><span><strong>Quiet hours</strong><small>Keep notifications silent during these hours.</small></span><input type="checkbox" data-pref="notifications.quietHours.enabled"${q.enabled ? ' checked' : ''}></label><div class="preferences-times"><label>From<input type="time" class="field" data-pref="notifications.quietHours.start" value="${esc(q.start)}"></label><label>Until<input type="time" class="field" data-pref="notifications.quietHours.end" value="${esc(q.end)}"></label></div><label class="preferences-zone">Time zone<select class="field" data-pref="notifications.quietHours.timeZone">${zoneOptions(q.timeZone)}</select></label><p class="small">Quiet hours can run overnight. Matching start and end times keep the whole day quiet.</p></div><p class="preferences-privacy small">Health, Cycle, private goals, and private comfort moods never generate partner notifications. Notification text keeps the details inside UsSpace.</p></section><p class="preferences-save small" role="status" aria-live="polite">${esc(error || saved)}</p>`;
    }
    function init(opts) {
      config = Object.assign({}, config, opts || {});
      mounted = null;
      render();
      if (mounted && !mounted.__usPreferencesBound) {
        mounted.__usPreferencesBound = true;
        mounted.addEventListener('click', event => {
          const button = event.target.closest?.('[data-theme-choice]');
          if (button && mounted.contains(button)) update({ theme: button.getAttribute('data-theme-choice') });
        });
        mounted.addEventListener('change', event => {
          const element = event.target, key = element?.getAttribute?.('data-pref');
          if (key) update({ [key]: element.type === 'checkbox' ? !!element.checked : element.value });
        });
      }
      if (!initialized) { bootstrap(); initialized = true; }
      try { bridge()?.refresh(); } catch (_) { }
      return api;
    }
    function onPermissionState(value) { permission = value && typeof value === 'object' ? clone(value) : null; render(); }
    const api = { init, render, bootstrap, applyTheme, onIdentity, onNativeState, onPermissionState, update, get: () => ({ uid, signedIn, preferences: clone(settings), syncState, error, systemDark: nativeSystemDark }) };
    return api;
  }
  return { categories, defaults, normalize, validatePatch, apply, resolvedTheme, quietNow, allows, validTime, validZone, create };
});
