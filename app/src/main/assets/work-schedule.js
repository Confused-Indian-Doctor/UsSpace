/* Private Microsoft Graph rota reader. Native owns Microsoft tokens and cache. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const WORKBOOK_LINK = '';
  const COLUMNS = ['date', 'person', 'start', 'end', 'location', 'tutorialRoom', 'simulation', 'shift'];
  const COLUMN_LABELS = {date: 'Date', person: 'Person', start: 'Start time', end: 'End time', location: 'Location', tutorialRoom: 'Tutorial room', simulation: 'Simulation', shift: 'Shift label'};
  const DEFAULT_CONFIG = {clientId: '', tenant: 'common', workbookLink: WORKBOOK_LINK, driveId: '', itemId: '', worksheet: '', person: 'Alameen Ashraf', zone: 'Europe/London', columnMapping: Object.fromEntries(COLUMNS.map(key => [key, -1]))};
  const text = v => typeof v === 'string' ? v : '';
  const html = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const blankConfig = () => ({...DEFAULT_CONFIG, columnMapping: {...DEFAULT_CONFIG.columnMapping}});
  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100 && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
  }
  function validTime(value) { return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
  function validZone(value) {
    if (!value || value.length > 100) return false;
    try { new Intl.DateTimeFormat('en-GB', {timeZone: value}).format(0); return true; } catch (_) { return false; }
  }
  function dateAt(now, zone) {
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone: validZone(zone) ? zone : DEFAULT_CONFIG.zone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(now));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  function timeAt(now, zone) {
    return new Intl.DateTimeFormat('en-GB', {timeZone: validZone(zone) ? zone : DEFAULT_CONFIG.zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(now));
  }
  function shiftDate(date, days) { return new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10); }
  function dateLabel(date, options) {
    return new Intl.DateTimeFormat('en-GB', {timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', ...(options || {})}).format(new Date(date + 'T12:00:00Z'));
  }
  function safeConfig(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const conf = blankConfig();
    for (const key of ['clientId', 'tenant', 'workbookLink', 'driveId', 'itemId', 'worksheet', 'person', 'zone']) if (typeof source[key] === 'string') conf[key] = source[key].slice(0, key === 'workbookLink' ? 4096 : ['worksheet', 'person'].includes(key) ? 160 : 250);
    COLUMNS.forEach(key => { const index = source.columnMapping && source.columnMapping[key]; if (Number.isInteger(index) && index >= -1 && index < 120) conf.columnMapping[key] = index; });
    if (!validZone(conf.zone)) conf.zone = DEFAULT_CONFIG.zone;
    return conf;
  }
  function normalizeConfig(value) {
    const source = value && typeof value === 'object' ? value : {};
    const conf = blankConfig();
    for (const key of ['clientId', 'tenant', 'workbookLink', 'driveId', 'itemId', 'worksheet', 'person', 'zone']) conf[key] = text(source[key] === undefined ? conf[key] : source[key]).trim();
    if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(conf.clientId)) throw new Error('Enter the application (client) ID from your Microsoft app registration. Your email address is not a client ID.');
    conf.tenant = conf.tenant.toLowerCase();
    if (!/^(?:common|organizations|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}|[a-z\d.-]{1,180}\.onmicrosoft\.com)$/.test(conf.tenant)) throw new Error('Use common, organizations, a tenant ID, or your organisation’s onmicrosoft.com domain.');
    let link;
    try { link = new URL(conf.workbookLink); } catch (_) { throw new Error('Enter the HTTPS SharePoint sharing link to your Excel rota.'); }
    if (link.protocol !== 'https:' || link.username || link.password || link.port || !(link.hostname.toLowerCase().endsWith('.sharepoint.com') || ['1drv.ms', 'onedrive.live.com'].includes(link.hostname.toLowerCase())) || conf.workbookLink.length > 4096) throw new Error('Use an HTTPS Excel sharing link hosted on SharePoint or OneDrive.');
    if (Boolean(conf.driveId) !== Boolean(conf.itemId) || [conf.driveId, conf.itemId].some(id => id.length > 240 || !/^[A-Za-z0-9!_.,~-]*$/.test(id))) throw new Error('For an optional Graph source override, enter both the drive ID and item ID, up to 240 characters each.');
    if (conf.worksheet.length > 160 || conf.person.length > 160 || !conf.person) throw new Error('Enter the worksheet and person names used in your rota, up to 160 characters each.');
    if (!validZone(conf.zone)) throw new Error('Enter a valid time zone, such as Europe/London.');
    for (const key of COLUMNS) {
      const index = source.columnMapping && source.columnMapping[key] !== undefined ? source.columnMapping[key] : -1;
      if (!Number.isInteger(index) || index < -1 || index > 119) throw new Error('Column numbers must be between 1 and 120, or left blank for automatic detection.');
      conf.columnMapping[key] = index;
    }
    return conf;
  }
  function cleanShifts(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 1500).filter(row => row && typeof row === 'object' && validDate(text(row.date))).map(row => ({date: row.date, start: validTime(row.start) ? row.start : '', end: validTime(row.end) ? row.end : '', location: text(row.location).slice(0, 300), tutorialRoom: text(row.tutorialRoom).slice(0, 300), simulation: text(row.simulation).slice(0, 300), label: text(row.label).slice(0, 300)})).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  }
  function cleanSummary(value, scope, partner) {
    if (!value || value.enabled !== true || !text(value.uid) || !scope.uid || !scope.coupleId || value.coupleId !== scope.coupleId || (partner ? value.uid === scope.uid : value.uid !== scope.uid) || !validDate(value.date) || !validTime(value.start) || !validTime(value.end) || !validZone(value.timeZone)) return null;
    return {uid: value.uid, coupleId: value.coupleId, date: value.date, start: value.start, end: value.end, timeZone: value.timeZone, enabled: true};
  }
  function summaryText(summary, now, nickname) {
    if (!summary || !validDate(summary.date) || !validTime(summary.start) || !validTime(summary.end) || !validZone(summary.timeZone)) return '';
    const date = dateAt(now, summary.timeZone), current = timeAt(now, summary.timeZone), name = nickname || 'Kuttu';
    const overnight = summary.end <= summary.start;
    if (summary.date === date) {
      if (current < summary.start) return `${name} starts at ${summary.start}`;
      if (overnight || current < summary.end) return `${name} is working until ${summary.end}${overnight ? ' tomorrow' : ''}`;
      return `${name}’s shift ended at ${summary.end}`;
    }
    if (overnight && shiftDate(summary.date, 1) === date && current < summary.end) return `${name} is working until ${summary.end}`;
    return '';
  }
  function weekly(shifts, date) {
    const weekday = new Date(date + 'T12:00:00Z').getUTCDay(), monday = shiftDate(date, -(weekday === 0 ? 6 : weekday - 1));
    return Array.from({length: 7}, (_, index) => { const day = shiftDate(monday, index); return {date: day, today: day === date, shifts: shifts.filter(row => row.date === day)}; });
  }
  function createController(deps) {
    deps = deps || {};
    const now = deps.now || Date.now;
    let identity = {uid: '', coupleId: ''}, state = null, draft = null, setupOpen = false, mappingOpen = false, instructionsOpen = false, error = '', notice = '';
    function reset() { state = null; draft = null; setupOpen = false; mappingOpen = false; instructionsOpen = false; error = ''; notice = ''; }
    function onIdentity(value) {
      const next = {uid: text(value && value.uid), coupleId: text(value && value.coupleId)};
      if (next.uid !== identity.uid || next.coupleId !== identity.coupleId) reset();
      identity = next; return view();
    }
    function accept(value) {
      let input = value;
      if (typeof input === 'string') { try { input = JSON.parse(input); } catch (_) { return false; } }
      if (!input || !identity.uid || input.uid !== identity.uid || text(input.coupleId) !== identity.coupleId) return false;
      state = {uid: identity.uid, coupleId: identity.coupleId, configured: input.configured === true, connected: input.connected === true, busy: input.busy === true, needsSetup: input.needsSetup === true, canConfigure: input.canConfigure !== false, canShare: input.canShare === true, paired: input.paired === true, config: safeConfig(input.config), shifts: cleanShifts(input.shifts), sharingError: text(input.sharingError).slice(0, 1500), warning: text(input.warning).slice(0, 1500), error: text(input.error).slice(0, 1500), updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : text(input.updatedAt), sharing: input.sharing === true, offline: input.offline === true, summary: cleanSummary(input.summary, identity, false), partnerSummary: cleanSummary(input.partnerSummary, identity, true)};
      notice = ''; return true;
    }
    function invoke(method, payload) {
      if (!identity.uid) { error = 'Sign in with Google before connecting your private work schedule.'; return false; }
      try {
        if (!deps.call || deps.call(method, payload) === false) throw new Error('The Microsoft rota reader is available in the Android app.');
        error = ''; return true;
      } catch (e) { error = e && e.message ? e.message : 'This could not be completed. Please try again.'; return false; }
    }
    function readStatus() {
      try { const value = deps.status && deps.status(); return value ? accept(value) : false; } catch (_) { return false; }
    }
    function openSetup() { draft = safeConfig(state && state.config); setupOpen = true; error = ''; return draft; }
    function edit(key, value) {
      if (!draft) return;
      if (['clientId', 'tenant', 'workbookLink', 'driveId', 'itemId', 'worksheet', 'person', 'zone'].includes(key)) draft[key] = text(value);
      if (key.startsWith('column:') && COLUMNS.includes(key.slice(7))) {
        const raw = String(value).trim(); draft.columnMapping[key.slice(7)] = raw === '' ? -1 : (/^\d+$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 120 ? Number(raw) - 1 : NaN);
      }
    }
    function save() {
      try {
        const conf = normalizeConfig(draft);
        if (!invoke('configure', JSON.stringify(conf))) return false;
        draft = null; setupOpen = false; notice = 'Saving connection settings…'; return true;
      } catch (e) { error = e.message; return false; }
    }
    function connect() {
      if (!state || !state.configured || state.needsSetup) { openSetup(); error = 'Register the Microsoft app and save its client ID before connecting.'; return false; }
      return invoke('connect');
    }
    function setSharing(enabled) {
      if (enabled && !view().sharingEligible) { error = 'Pair your phones and load a shift with a start and end time before sharing a summary.'; return false; }
      return invoke('setSharing', !!enabled);
    }
    function view() {
      const conf = draft || (state && state.config) || blankConfig(), date = dateAt(now(), conf.zone);
      const s = state || {configured: false, connected: false, busy: false, needsSetup: true, shifts: [], sharingError: '', warning: '', error: '', sharing: false, offline: false, canConfigure: !!identity.uid, canShare: false, paired: false, updatedAt: '', summary: null, partnerSummary: null};
      const shifts = s.shifts || [];
      return {...s, identity: {...identity}, config: safeConfig(conf), draft: draft ? {...draft, columnMapping: {...draft.columnMapping}} : null, setupOpen, mappingOpen, instructionsOpen, localError: error, notice, date, now: now(), today: shifts.filter(row => row.date === date), week: weekly(shifts, date), partnerText: summaryText(s.partnerSummary, now()), summaryText: summaryText(s.summary, now()), sharingEligible: !!identity.uid && !!identity.coupleId && s.paired && s.canShare && s.connected && shifts.some(row => row.date === date && row.start && row.end)};
    }
    return {onIdentity, accept, readStatus, openInstructions() { if (identity.uid) return false; instructionsOpen = true; return true; }, closeInstructions() { instructionsOpen = false; }, openSetup, edit, save, connect, setSharing, view, cancelSetup() { draft = null; setupOpen = false; error = ''; }, toggleMapping() { mappingOpen = !mappingOpen; }, refresh: () => invoke('refresh'), disconnect: () => invoke('disconnect'), clearCache: () => invoke('clearCache')};
  }
  function lastSync(value) {
    const date = typeof value === 'number' ? new Date(value) : new Date(text(value));
    if (!value || !Number.isFinite(date.getTime())) return '';
    return date.toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
  }
  function shiftMarkup(shift, compact) {
    const time = shift.start && shift.end ? `${shift.start}–${shift.end}${shift.end <= shift.start ? ' · next day' : ''}` : shift.start ? `Starts ${shift.start} · end time not listed` : shift.end ? `Until ${shift.end} · start time not listed` : 'Times not listed in the rota';
    return `<div class="work-shift${compact ? ' work-shift-compact' : ''}"><p class="work-time">${html(time)}</p>${shift.label ? `<p class="work-label">${html(shift.label)}</p>` : ''}${shift.location ? `<p class="work-detail"><span>Location</span> ${html(shift.location)}</p>` : ''}${shift.tutorialRoom ? `<p class="work-detail"><span>Tutorial room</span> ${html(shift.tutorialRoom)}</p>` : ''}${shift.simulation ? `<p class="work-detail"><span>Simulation</span> ${html(shift.simulation)}</p>` : ''}</div>`;
  }
  function microsoftInstructions(expanded) {
    return `<details class="work-registration" ${expanded ? 'open' : ''}><summary>First, register the Microsoft app</summary><ol><li>Open Microsoft Entra → App registrations → New registration.</li><li>Choose organisational accounts and personal Microsoft accounts.</li><li>Enable public client flows and add the Mobile and desktop redirect URI <code>app.usspace.couple.v012://oauth2redirect</code>.</li><li>Add delegated Microsoft Graph permissions <code>Files.Read.All</code> and <code>User.Read</code>, then copy the application (client) ID below.</li></ol><p class="work-copy">Your rota’s email invitation gives workbook access; a client ID is still needed. Your SharePoint organisation may require its administrator’s consent. Full instructions are in WORK_SCHEDULE_SETUP.md.</p></details>`;
  }
  function setupMarkup(v) {
    const c = v.draft || v.config;
    const field = (key, label, value, extra) => `<label for="work-${key}">${label}</label><input class="field" id="work-${key}" data-work-field="${key}" value="${html(value)}" ${extra || ''}>`;
    return `<form class="card work-setup" id="work-setup-form"><h3>Connect your Excel rota</h3><p class="work-copy">UsSpace reads your workbook through Microsoft Graph. Sign in to Microsoft with the account that already has access to the rota.</p>${microsoftInstructions(false)}${field('clientId', 'Microsoft application (client) ID', c.clientId, 'placeholder="Paste the application ID" autocomplete="off" maxlength="36"')}${field('tenant', 'Microsoft tenant', c.tenant, 'placeholder="common" autocomplete="off" maxlength="250"')}<p class="work-hint">Use common unless your organisation gives you a tenant ID.</p>${field('workbookLink', 'SharePoint Excel sharing link', c.workbookLink, 'type="url" autocomplete="off" maxlength="4096"')}<details class="work-registration"><summary>Graph source override (optional)</summary><p class="work-hint">If the sharing link cannot be resolved, provide both Microsoft Graph IDs for the same workbook. Leave both blank to use your sharing link.</p>${field('driveId', 'Graph drive ID', c.driveId, 'autocomplete="off" maxlength="240"')}${field('itemId', 'Graph workbook item ID', c.itemId, 'autocomplete="off" maxlength="240"')}</details>${field('worksheet', 'Worksheet name (optional)', c.worksheet, 'placeholder="Leave blank to choose the first worksheet" maxlength="160"')}${field('person', 'Your name as written in the rota', c.person, 'maxlength="160"')}${field('zone', 'Rota time zone', c.zone, 'placeholder="Europe/London" maxlength="100"')}<button class="btn work-mapping-toggle" type="button" data-work-action="mapping" aria-expanded="${v.mappingOpen}">Column mapping (optional)</button>${v.mappingOpen ? `<div class="work-mapping"><p class="work-hint">Leave blank for automatic header detection. Otherwise enter Excel column numbers: A = 1, B = 2. This reads existing rows; it does not edit the workbook.</p><div class="work-grid">${COLUMNS.map(key => `<div>${field('column:' + key, COLUMN_LABELS[key], c.columnMapping[key] < 0 ? '' : c.columnMapping[key] + 1, 'type="number" min="1" max="120" inputmode="numeric"')}</div>`).join('')}</div></div>` : ''}<p class="work-privacy">Microsoft credentials and rota cache stay in this signed-in account’s private Android storage. No workbook is embedded or copied to Firestore.</p><div class="work-actions"><button class="btn primary" type="submit" ${v.busy ? 'disabled' : ''}>Save connection settings</button><button class="btn" type="button" data-work-action="cancel-setup">Cancel</button></div></form>`;
  }
  function markup(v) {
    const signedIn = !!v.identity.uid, error = v.localError || v.error;
    const status = !signedIn ? 'Sign in first' : v.busy ? 'Updating rota…' : v.offline ? 'Cached rota · offline' : v.connected ? 'Microsoft connected' : v.updatedAt ? 'Cached rota · Microsoft disconnected' : v.configured ? 'Ready to connect' : 'Setup needed';
    const ownTime = v.today.find(shift => shift.start && shift.end);
    const preview = ownTime ? summaryText({date: ownTime.date, start: ownTime.start, end: ownTime.end, timeZone: v.config.zone}, v.now) : '';
    const loaded = !!v.updatedAt;
    return `<div class="work-heading"><button type="button" class="btn" data-work-action="back">← Life</button><h2>Work Schedule</h2><p>Your rota, with a little room for us.</p></div><div class="work-status-row"><span class="work-status-chip">${html(status)}</span>${lastSync(v.updatedAt) ? `<span class="work-hint">Last read ${html(lastSync(v.updatedAt))}</span>` : ''}</div><p class="work-privacy">Your full rota, location, tutorial room and simulation details stay private. A partner sees only a shift-time summary if you turn it on. Health and Cycle sharing stay off by default.</p>${error ? `<p class="work-feedback work-error" role="alert">${html(error)}</p>` : ''}${v.sharingError ? `<p class="work-feedback work-error" role="alert">${html(v.sharingError)}</p>` : ''}${v.warning ? `<p class="work-feedback" role="status">${html(v.warning)}</p>` : ''}${v.notice ? `<p class="work-feedback" role="status">${html(v.notice)}</p>` : ''}${!signedIn ? '<div class="card work-empty"><h3>Your private work day</h3><p>Sign in with Google first, then connect Microsoft to read your existing Excel rota.</p><button type="button" class="btn" data-work-action="instructions">Microsoft setup instructions</button></div>' : ''}${!signedIn && v.instructionsOpen ? `<section class="card work-instructions"><h3>Microsoft setup instructions</h3><p class="work-copy">You can prepare your app registration now. Sign in with Google before saving connection settings or connecting Microsoft. These instructions do not access your rota.</p>${microsoftInstructions(true)}<button type="button" class="btn" data-work-action="close-instructions">Close instructions</button></section>` : ''}${signedIn && v.setupOpen ? setupMarkup(v) : signedIn ? `<div class="work-actions work-connect-actions">${v.connected ? `<button class="btn primary" data-work-action="refresh" ${v.busy ? 'disabled' : ''}>Refresh rota</button><button class="btn" data-work-action="disconnect" ${v.busy ? 'disabled' : ''}>Disconnect Microsoft</button>` : `<button class="btn primary" data-work-action="connect" ${v.busy ? 'disabled' : ''}>Connect Microsoft</button>`}<button class="btn" data-work-action="setup" ${v.busy ? 'disabled' : ''}>${v.configured ? 'Connection settings' : 'Set up Microsoft'}</button></div>` : ''}${signedIn && !v.setupOpen ? `<section class="card work-today" aria-labelledby="work-today-title"><div class="work-card-heading"><h3 id="work-today-title">Today’s shift</h3><span>${html(dateLabel(v.date))}</span></div>${v.today.length ? v.today.map(shift => shiftMarkup(shift, false)).join('') : `<p class="work-empty-copy">${loaded ? 'No shift is listed for today in the last rota read.' : 'Connect and refresh your rota to see today’s shift.'}</p>`}<p class="work-hint">Times shown in ${html(v.config.zone)}.${v.offline ? ' Check the rota before relying on a cached shift.' : ''}</p></section><section class="card work-week" aria-labelledby="work-week-title"><div class="work-card-heading"><h3 id="work-week-title">This week</h3><span>${html(dateLabel(v.week[0].date, {weekday: undefined, month: 'short'}))}–${html(dateLabel(v.week[6].date, {weekday: undefined, month: 'short'}))}</span></div>${loaded ? `<div class="work-week-list">${v.week.map(day => `<div class="work-day${day.today ? ' work-day-today' : ''}"><div class="work-day-date"><b>${html(dateLabel(day.date, {month: undefined}))}</b>${day.today ? '<span>Today</span>' : ''}</div><div>${day.shifts.length ? day.shifts.map(shift => shiftMarkup(shift, true)).join('') : '<p class="work-unlisted">No shift listed</p>'}</div></div>`).join('')}</div>` : '<p class="work-empty-copy">Your seven-day view appears after the workbook is read.</p>'}</section><section class="card work-sharing"><h3>A little update for your person</h3><label class="work-check" for="work-sharing"><input id="work-sharing" type="checkbox" data-work-sharing ${v.sharing ? 'checked' : ''} ${!v.sharing && !v.sharingEligible ? 'disabled' : ''}><span><b>Share today’s shift times</b><small>Off by default. Only the date, start/end time and time zone are shared.</small></span></label>${preview ? `<p class="work-summary-preview">${html(preview)}</p>` : '<p class="work-hint">A preview appears when today’s shift has both start and end times.</p>'}<p class="work-hint">${!v.identity.coupleId ? 'Pair your two phones before turning this on.' : !v.sharingEligible && !v.sharing ? 'Read today’s complete shift times to enable this option.' : 'Turning this off removes the partner-facing summary. Your full rota is never shared.'}</p></section>${v.partnerText ? `<section class="card work-partner"><h3>Your person’s shared update</h3><p>${html(v.partnerText)}</p><span class="work-hint">${html(v.partnerSummary.timeZone)}</span></section>` : ''}${v.updatedAt ? '<button type="button" class="btn work-cache-clear" data-work-action="clear-cache">Clear private cached rota</button>' : ''}` : ''}`;
  }
  function compactMarkup(v) {
    if (!v.identity.uid || (!v.configured && !v.connected && !v.today.length)) return '';
    return `<section class="card work-today work-today-compact"><div class="work-card-heading"><h3>Today’s shift</h3><button type="button" class="btn" data-work-open>View rota</button></div>${v.today.length ? v.today.map(shift => shiftMarkup(shift, true)).join('') : `<p class="work-empty-copy">${v.updatedAt ? 'No shift is listed for today in the last rota read.' : 'Connect and refresh your rota to see today’s shift.'}</p>`}<p class="work-hint">Private · ${html(v.config.zone)}${v.offline ? ' · cached rota' : ''}</p></section>`;
  }
  function partnerMarkup(v) {
    if (!v.partnerText) return '';
    return `<section class="card work-partner"><h3>Your person’s shared update</h3><p>${html(v.partnerText)}</p><span class="work-hint">${html(v.partnerSummary.timeZone)}</span></section>`;
  }
  function mount(root) {
    let options = {}, controller;
    function getController() {
      if (!controller) controller = createController({status() { const bridge = root.AndroidWorkSchedule; return bridge && typeof bridge.status === 'function' ? bridge.status() : null; }, call(method, payload) { const bridge = root.AndroidWorkSchedule; if (!bridge || typeof bridge[method] !== 'function') return false; if (payload === undefined) bridge[method](); else bridge[method](payload); return true; }});
      return controller;
    }
    function render() {
      const target = root.document.getElementById('workScheduleView') || root.document.getElementById('workSchedule');
      const v = getController().view();
      const todayTarget = root.document.getElementById('todayWorkSchedule'), partnerTarget = root.document.getElementById('partnerWorkSummary');
      if (todayTarget) { todayTarget.innerHTML = compactMarkup(v); todayTarget.querySelectorAll('[data-work-open]').forEach(button => button.addEventListener('click', () => { if (options.navigate) options.navigate('work-schedule'); })); }
      if (partnerTarget) partnerTarget.innerHTML = partnerMarkup(v);
      if (!target) return;
      const active = root.document.activeElement, focusId = active && target.contains(active) ? active.id : '';
      const selection = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
      target.innerHTML = markup(v);
      target.querySelectorAll('[data-work-field]').forEach(input => input.addEventListener('input', () => getController().edit(input.dataset.workField, input.value)));
      target.querySelectorAll('[data-work-action]').forEach(button => button.addEventListener('click', () => {
        const c = getController();
        switch (button.dataset.workAction) {
          case 'back': if (options.navigate) options.navigate('life'); break;
          case 'setup': c.openSetup(); break;
          case 'instructions': c.openInstructions(); break;
          case 'close-instructions': c.closeInstructions(); break;
          case 'cancel-setup': c.cancelSetup(); break;
          case 'mapping': c.toggleMapping(); break;
          case 'connect': c.connect(); break;
          case 'refresh': c.refresh(); break;
          case 'disconnect': c.disconnect(); break;
          case 'clear-cache': c.clearCache(); break;
        }
        render();
      }));
      const form = target.querySelector('#work-setup-form');
      if (form) form.addEventListener('submit', event => { event.preventDefault(); getController().save(); render(); });
      const sharing = target.querySelector('[data-work-sharing]');
      if (sharing) sharing.addEventListener('change', () => { getController().setSharing(sharing.checked); render(); });
      if (focusId) { const next = root.document.getElementById(focusId); if (next && target.contains(next)) { next.focus({preventScroll: true}); if (selection && typeof next.setSelectionRange === 'function' && next.type !== 'number') next.setSelectionRange(selection[0], selection[1]); } }
    }
    root.UsWorkSchedule = {
      init(value) { options = value || {}; getController(); render(); },
      render,
      onIdentity(value) { getController().onIdentity(value); getController().readStatus(); render(); const v = getController().view(); if (options.onSummary) options.onSummary({own: v.summary, partner: v.partnerSummary, partnerText: v.partnerText}); },
      onNativeState(value) { if (!getController().accept(value)) return false; render(); const v = getController().view(); if (options.onSummary) options.onSummary({own: v.summary, partner: v.partnerSummary, partnerText: v.partnerText}); return true; },
      refresh() { getController().readStatus(); render(); },
      summaryText
    };
  }
  return {WORKBOOK_LINK, DEFAULT_CONFIG, COLUMNS, normalizeConfig, safeConfig, cleanShifts, cleanSummary, validDate, validTime, validZone, dateAt, timeAt, weekly, summaryText, createController, markup, compactMarkup, partnerMarkup, mount};
});
