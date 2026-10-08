'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourcePath = path.join(__dirname, '../app/src/main/assets/work-schedule.js');
const work = require(sourcePath);
const NOW = Date.parse('2026-10-08T07:30:00Z'); // 08:30 in the rota's Europe/London time zone.
const CLIENT = '11111111-2222-3333-4444-555555555555';
const rota = [{date: '2026-10-08', start: '08:00', end: '17:00', label: 'Teaching', location: 'Golden Jubilee', tutorialRoom: 'Tutorial 2', simulation: 'Clinical skills'}, {date: '2026-10-09', start: '09:00', end: '18:00', location: 'Hospital'}];
const config = extra => ({...work.DEFAULT_CONFIG, columnMapping: {...work.DEFAULT_CONFIG.columnMapping}, clientId: CLIENT, workbookLink: 'https://example.sharepoint.com/:x:/s/Example/IEXAMPLE?e=test', ...extra});
const summary = extra => ({uid: 'al', coupleId: 'us', date: '2026-10-08', start: '08:00', end: '17:00', timeZone: 'Europe/London', enabled: true, ...extra});
function setup(extra = {}) {
  const calls = [], controller = work.createController({now: () => NOW, call(method, payload) { calls.push({method, payload}); return extra.call ? extra.call(method, payload) : true; }, status: extra.status});
  controller.onIdentity({uid: 'al', coupleId: 'us'});
  const state = {uid: 'al', coupleId: 'us', configured: true, connected: true, canConfigure: true, canShare: true, paired: true, config: config(), shifts: rota, updatedAt: NOW, ...extra.state};
  if (extra.accept !== false) assert.equal(controller.accept(state), true);
  return {controller, calls, state};
}

test('default source is empty and private, requiring the existing link to be pasted after sign-in', () => {
  const c = work.createController({now: () => NOW});
  assert.equal(c.view().config.workbookLink, '');
  assert.equal(work.WORKBOOK_LINK, '');
  assert.equal(work.DEFAULT_CONFIG.workbookLink, '');
  const production = fs.readFileSync(sourcePath, 'utf8') + fs.readFileSync(path.join(__dirname, '../app/src/main/java/app/usspace/couple/v012/WorkScheduleBridge.java'), 'utf8');
  assert.doesNotMatch(production, /https:\/\/[^\s'"]+\.sharepoint\.com\/:x:\/s\/[^\s'"]+/);
  assert.doesNotMatch(production, /[?&]email=[^\s'"]+/);
  assert.equal(c.view().config.person, 'Alameen Ashraf');
  assert.equal(c.view().sharing, false);
  assert.deepEqual(c.view().today, []);
  assert.equal(c.view().config.clientId, '');
});

test('setup rejects an email address as client ID and requires a real public client registration', () => {
  const {controller: c, calls} = setup(); c.openSetup(); c.edit('clientId', 'al@example.com');
  assert.equal(c.save(), false); assert.match(c.view().localError, /email address is not a client ID/); assert.deepEqual(calls, []);
});

test('configuration payload includes known read-only source fields and never forwards tokens or secrets', () => {
  const value = work.normalizeConfig(config({clientId: ` ${CLIENT} `, clientSecret: 'NEVER', accessToken: 'NEVER', rawWorkbook: [['secret']], driveId: 'b!driver', itemId: '01BOOK'}));
  assert.equal(value.clientId, CLIENT);
  assert.equal(value.driveId, 'b!driver'); assert.equal(value.itemId, '01BOOK');
  assert.deepEqual(Object.keys(value).sort(), ['clientId', 'columnMapping', 'driveId', 'itemId', 'person', 'tenant', 'workbookLink', 'worksheet', 'zone'].sort());
  assert.ok(!JSON.stringify(value).includes('NEVER'));
});

test('configuration validates SharePoint HTTPS host, tenant, time zone and optional Graph IDs', () => {
  for (const change of [{workbookLink: 'http://example.sharepoint.com/rota'}, {workbookLink: 'https://example.sharepoint.com.attacker.example/rota'}, {workbookLink: 'https://password@example.sharepoint.com/rota'}, {workbookLink: 'https://example.sharepoint.com:9999/rota'}, {tenant: '../other'}, {tenant: 'consumers'}, {tenant: 'company.example'}, {person: 'x'.repeat(161)}, {worksheet: 'x'.repeat(161)}, {zone: 'Invalid/Zone'}, {person: ''}, {driveId: 'drive'}, {driveId: 'bad/id', itemId: 'id'}, {driveId: 'd', itemId: 'x'.repeat(241)}, {columnMapping: {start: 1000}}, {columnMapping: {date: 1.5}}]) assert.throws(() => work.normalizeConfig(config(change)), JSON.stringify(change));
  assert.equal(work.normalizeConfig(config({tenant: 'example.onmicrosoft.com'})).tenant, 'example.onmicrosoft.com');
});

test('UI column numbers convert from Excel one-based positions to the native zero-based contract', () => {
  const {controller: c, calls} = setup(); c.openSetup(); c.edit('column:date', '1'); c.edit('column:person', '2'); c.edit('column:start', '5'); c.edit('column:end', ''); c.edit('column:simulation', '120');
  assert.equal(c.save(), true);
  assert.equal(calls[0].method, 'configure');
  const fields = JSON.parse(calls[0].payload);
  assert.equal(fields.columnMapping.date, 0); assert.equal(fields.columnMapping.person, 1); assert.equal(fields.columnMapping.start, 4); assert.equal(fields.columnMapping.end, -1); assert.equal(fields.columnMapping.simulation, 119);
});

test('invalid column numbers retain the editor and never invoke the native bridge', () => {
  for (const number of ['0', '121', '1.5', 'word', '-1']) {
    const {controller: c, calls} = setup(); c.openSetup(); c.edit('column:start', number);
    assert.equal(c.save(), false, number); assert.equal(c.view().setupOpen, true); assert.deepEqual(calls, [], number);
  }
});

test('cancelled setup stays local and sends nothing', () => {
  const {controller: c, calls} = setup(); c.openSetup(); c.edit('worksheet', 'Private sheet'); c.edit('clientId', CLIENT); c.cancelSetup();
  assert.equal(c.view().draft, null); assert.equal(c.view().setupOpen, false); assert.deepEqual(calls, []);
});

test('native updates do not discard an unsaved setup draft', () => {
  const {controller: c, state} = setup(); c.openSetup(); c.edit('worksheet', 'My edited sheet');
  c.accept({...state, busy: true, config: config({worksheet: 'Cloud value'})});
  assert.equal(c.view().draft.worksheet, 'My edited sheet'); assert.equal(c.view().busy, true);
});

test('a UID change clears private shifts, setup and sharing immediately and rejects previous-account callbacks', () => {
  const {controller: c, state} = setup({state: {sharing: true, summary: summary()}}); c.openSetup(); c.edit('worksheet', 'Private');
  c.onIdentity({uid: 'yashika', coupleId: 'us'});
  assert.deepEqual(c.view().today, []); assert.equal(c.view().draft, null); assert.equal(c.view().summary, null); assert.equal(c.view().sharing, false);
  assert.equal(c.accept(state), false); assert.deepEqual(c.view().today, []);
});

test('a couple change clears old partner data and rejects late callbacks from the previous couple', () => {
  const {controller: c, state} = setup({state: {partnerSummary: summary({uid: 'yashika'})}});
  assert.ok(c.view().partnerText); c.onIdentity({uid: 'al', coupleId: 'new-couple'});
  assert.equal(c.view().partnerSummary, null); assert.equal(c.view().partnerText, ''); assert.equal(c.accept(state), false);
});

test('signed-out state cannot load or invoke the Microsoft reader', () => {
  const {controller: c, calls, state} = setup(); c.onIdentity({uid: '', coupleId: ''});
  assert.equal(c.accept(state), false); assert.equal(c.refresh(), false); assert.equal(c.setSharing(true), false); assert.deepEqual(calls, []);
  assert.deepEqual(c.view().today, []);
});

test('signed-out Microsoft setup instructions are read-only and do not expose private setup fields', () => {
  const {controller: c, calls} = setup(); c.onIdentity({uid: '', coupleId: ''});
  assert.match(work.markup(c.view()), /Microsoft setup instructions/);
  assert.equal(c.openInstructions(), true);
  const rendered = work.markup(c.view());
  assert.match(rendered, /Sign in with Google before saving connection settings or connecting Microsoft/);
  assert.match(rendered, /app\.usspace\.couple\.v012:\/\/oauth2redirect/); assert.match(rendered, /Files.Read.All/); assert.match(rendered, /User.Read/);
  assert.doesNotMatch(rendered, /<input|<form|data-work-action="connect"|data-work-field/);
  assert.deepEqual(calls, []);
  c.closeInstructions(); assert.equal(c.view().instructionsOpen, false);
});

test('identity changes clear read-only instructions, and signed-out setup edits remain hidden', () => {
  const c = work.createController({now: () => NOW}); c.openInstructions(); c.openSetup(); c.edit('worksheet', 'Hidden draft');
  assert.doesNotMatch(work.markup(c.view()), /Hidden draft|data-work-field/);
  c.onIdentity({uid: 'al', coupleId: 'us'});
  assert.equal(c.view().instructionsOpen, false); assert.equal(c.view().draft, null); assert.equal(c.openInstructions(), false);
});

test('malformed bridge replies do not replace a verified private state', () => {
  const {controller: c} = setup();
  for (const data of ['{', 'null', '[]', null, {uid: 'someone', coupleId: 'us'}, {uid: 'al', coupleId: 'elsewhere'}, {uid: 'al'}]) assert.equal(c.accept(data), false);
  assert.equal(c.view().today[0].start, '08:00');
});

test('native state strips OAuth tokens, raw workbook values and cloud-ineligible summary details', () => {
  const {controller: c} = setup({state: {accessToken: 'NEVER', refreshToken: 'NEVER', rawWorkbook: [['NEVER']], config: {...config(), secret: 'NEVER'}, shifts: [{...rota[0], privateSpreadsheetCell: 'NEVER'}], summary: summary({location: 'NEVER', tutorialRoom: 'NEVER', simulation: 'NEVER', workbookLink: 'NEVER'})}});
  const v = c.view(); assert.ok(!JSON.stringify(v).includes('NEVER'));
  assert.deepEqual(Object.keys(v.summary).sort(), ['uid', 'coupleId', 'date', 'start', 'end', 'timeZone', 'enabled'].sort());
});

test('malformed shifts never produce invented times or impossible dates', () => {
  const shifts = work.cleanShifts([{date: '2026-02-30', start: '08:00'}, {date: '2026-10-08', start: '25:00', end: '17:61'}, {date: '2026-10-08', start: 8, end: '17:00'}, {date: '2026-10-09', start: '08:00', end: '17:00'}]);
  assert.equal(shifts.length, 3); assert.equal(shifts[0].start, ''); assert.equal(shifts[0].end, ''); assert.equal(shifts[1].start, '');
  assert.match(work.markup(setup({state: {shifts}}).controller.view()), /Times not listed in the rota/);
});

test('today and the weekly view follow the rota time zone, not the phone or UTC date', () => {
  assert.equal(work.dateAt(Date.parse('2026-10-07T23:30:00Z'), 'Europe/London'), '2026-10-08');
  assert.equal(work.dateAt(Date.parse('2026-10-08T01:00:00Z'), 'America/New_York'), '2026-10-07');
  const {controller: c} = setup(); const v = c.view();
  assert.equal(v.date, '2026-10-08'); assert.equal(v.today.length, 1);
  assert.equal(v.week.length, 7); assert.equal(v.week[0].date, '2026-10-05'); assert.equal(v.week[6].date, '2026-10-11');
  assert.equal(v.week.filter(day => day.today).length, 1); assert.equal(v.week[3].shifts[0].tutorialRoom, 'Tutorial 2');
});

test('Sunday weekly view uses the Monday of the same week across month/year boundaries', () => {
  const week = work.weekly([], '2027-01-03');
  assert.equal(week[0].date, '2026-12-28'); assert.equal(week[6].date, '2027-01-03');
});

test('partner summary is opt-in, eligibility checked, and sends only a boolean native command', () => {
  const {controller: c, calls} = setup(); assert.equal(c.view().sharing, false);
  assert.equal(c.setSharing(true), true); assert.deepEqual(calls, [{method: 'setSharing', payload: true}]);
  assert.equal(c.view().sharing, false, 'wait for the native persistence result, rather than claiming a successful share');
});

test('sharing is unavailable without pairing, a connection, or complete eligible shift times', () => {
  for (const state of [{paired: false}, {connected: false}, {canShare: false}]) {
    const {controller: c, calls} = setup({state}); assert.equal(c.setSharing(true), false); assert.deepEqual(calls, []);
  }
  const {controller: c, calls} = setup(); c.onIdentity({uid: 'al', coupleId: ''}); assert.equal(c.setSharing(true), false); assert.deepEqual(calls, []);
});

test('an enabled summary can always be turned off even if today’s shift is no longer eligible', () => {
  const {controller: c, calls} = setup({state: {sharing: true, canShare: false, connected: false}});
  assert.equal(c.setSharing(false), true); assert.deepEqual(calls, [{method: 'setSharing', payload: false}]);
  assert.doesNotMatch(work.markup(c.view()), /data-work-sharing checked disabled/);
});

test('pending summary removal and cloud sync errors remain visible until native confirms completion', () => {
  const message = 'Removing the shared work summary; reconnect if your phone is offline.';
  const {controller: c, state} = setup({state: {sharingError: message}});
  assert.equal(c.view().sharingError, message); assert.match(work.markup(c.view()), /Removing the shared work summary/);
  c.accept({...state, sharingError: ''}); assert.doesNotMatch(work.markup(c.view()), /Removing the shared work summary/);
});

test('source overrides and supported OneDrive links follow the same native validation limits', () => {
  for (const link of ['https://1drv.ms/x/s!Workbook', 'https://onedrive.live.com/view.aspx?resid=book']) assert.equal(work.normalizeConfig(config({workbookLink: link})).workbookLink, link);
  assert.equal(work.normalizeConfig(config({person: 'p'.repeat(160), worksheet: 'w'.repeat(160), columnMapping: {simulation: 119}})).columnMapping.simulation, 119);
  for (const date of ['1999-12-31', '2101-01-01']) assert.equal(work.validDate(date), false);
  assert.throws(() => work.normalizeConfig(config({driveId: 'drive with spaces', itemId: 'id'})));
});

test('summary labels distinguish upcoming, active and ended work, without exposing workplace details', () => {
  assert.equal(work.summaryText(summary(), Date.parse('2026-10-08T06:30:00Z')), 'Kuttu starts at 08:00');
  assert.equal(work.summaryText(summary(), NOW), 'Kuttu is working until 17:00');
  assert.equal(work.summaryText(summary(), Date.parse('2026-10-08T16:00:00Z')), 'Kuttu’s shift ended at 17:00');
  assert.equal(work.summaryText(summary(), Date.parse('2026-10-09T08:00:00Z')), '');
});

test('overnight summaries remain relevant until the actual following-day finish and expire afterwards', () => {
  const s = summary({start: '20:00', end: '08:00'});
  assert.equal(work.summaryText(s, Date.parse('2026-10-08T20:00:00Z')), 'Kuttu is working until 08:00 tomorrow');
  assert.equal(work.summaryText(s, Date.parse('2026-10-09T05:00:00Z')), 'Kuttu is working until 08:00');
  assert.equal(work.summaryText(s, Date.parse('2026-10-09T08:00:00Z')), '');
});

test('partner summary rejects disabled, wrong-scope, own-account and incomplete documents', () => {
  const scope = {uid: 'al', coupleId: 'us'};
  for (const invalid of [summary(), summary({uid: 'yashika', enabled: false}), summary({uid: 'yashika', coupleId: 'other'}), summary({uid: 'yashika', start: ''}), summary({uid: 'yashika', date: '2026-02-30'}), summary({uid: 'yashika', timeZone: 'bad'})]) assert.equal(work.cleanSummary(invalid, scope, true), null);
  assert.equal(work.cleanSummary(summary({uid: 'yashika'}), scope, true).uid, 'yashika');
});

test('unconnected screens use placeholders, never sample shifts, and cached reads are identified', () => {
  const {controller: c} = setup({state: {connected: false, configured: false, shifts: [], updatedAt: ''}});
  const rendered = work.markup(c.view());
  assert.match(rendered, /Connect and refresh your rota/); assert.match(rendered, /seven-day view appears after the workbook is read/); assert.doesNotMatch(rendered, /08:00|17:00|Golden Jubilee/);
  assert.equal(work.compactMarkup(c.view()), '');
  const cached = setup({state: {offline: true}}).controller.view(); assert.match(work.markup(cached), /cached shift/); assert.match(work.compactMarkup(cached), /cached rota/);
});

test('today details include location, tutorial room and simulation; partner cards contain only summary times', () => {
  const {controller: c} = setup({state: {partnerSummary: summary({uid: 'yashika', location: 'Secret location', tutorialRoom: 'Secret room'})}});
  const own = work.compactMarkup(c.view()), partner = work.partnerMarkup(c.view());
  assert.match(own, /Golden Jubilee/); assert.match(own, /Tutorial 2/); assert.match(own, /Clinical skills/);
  assert.match(partner, /Kuttu is working until 17:00/); assert.doesNotMatch(partner, /Secret|Golden Jubilee|Tutorial|Clinical/);
});

test('rota and configuration strings are escaped before rendering into the WebView', () => {
  const {controller: c} = setup({state: {shifts: [{...rota[0], location: '<img src=x onerror=bad()>', tutorialRoom: '"<script>bad()</script>', simulation: '& secret'}], error: '<script>bad()</script>'}});
  assert.doesNotMatch(work.markup(c.view()), /<script>|<img src=x/); assert.match(work.markup(c.view()), /&lt;img/);
  c.openSetup(); c.edit('worksheet', '"><script>bad()</script>'); assert.match(work.markup(c.view()), /&quot;&gt;&lt;script&gt;/);
});

test('bridge absence or failure leaves the private editor intact and reports a useful error', () => {
  const {controller: c, calls} = setup({call: () => false}); c.openSetup(); c.edit('worksheet', 'My worksheet');
  assert.equal(c.save(), false); assert.equal(c.view().draft.worksheet, 'My worksheet'); assert.match(c.view().localError, /Android app/); assert.equal(calls.length, 1);
});

test('refresh, disconnect and clear cache call the native reader rather than fetching or storing raw workbook data in JavaScript', () => {
  const {controller: c, calls} = setup(); c.refresh(); c.disconnect(); c.clearCache();
  assert.deepEqual(calls, [{method: 'refresh', payload: undefined}, {method: 'disconnect', payload: undefined}, {method: 'clearCache', payload: undefined}]);
  const source = fs.readFileSync(sourcePath, 'utf8'); assert.doesNotMatch(source, /localStorage|sessionStorage|\bfetch\s*\(|XMLHttpRequest/);
});

test('in-app setup documents the exact registered OAuth redirect and read-only Graph permissions', () => {
  const {controller: c} = setup(); c.openSetup();
  const rendered = work.markup(c.view()); assert.match(rendered, /app\.usspace\.couple\.v012:\/\/oauth2redirect/); assert.match(rendered, /Files.Read.All/); assert.match(rendered, /User.Read/); assert.doesNotMatch(rendered, /Files.ReadWrite|client secret/i);
  assert.match(rendered, /Graph drive ID/); assert.match(rendered, /Graph workbook item ID/);
});

test('browser identity handling asks native for state and clears a previous partner summary on sign out', () => {
  const summaries = [], root = {document: {getElementById() { return null; }}, AndroidWorkSchedule: {status() { return JSON.stringify({uid: 'al', coupleId: 'us', config: config(), partnerSummary: summary({uid: 'yashika'})}); }}};
  const context = vm.createContext({...root, console, Intl, Date, URL, module: undefined}); vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context);
  context.UsWorkSchedule.init({onSummary: value => summaries.push(value)}); context.UsWorkSchedule.onIdentity({uid: 'al', coupleId: 'us'});
  assert.equal(summaries[0].partner.uid, 'yashika'); context.UsWorkSchedule.onIdentity({uid: '', coupleId: ''}); assert.equal(summaries.at(-1).partner, null);
  assert.equal(context.UsWorkSchedule.onNativeState({uid: 'al', coupleId: 'us', partnerSummary: summary({uid: 'yashika'})}), false);
});
