'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const navigation = require('../app/src/main/assets/navigation.js');
const letters = require('../app/src/main/assets/us-letters.js');
const plans = require('../app/src/main/assets/us-plans.js');
const work = require('../app/src/main/assets/work-schedule.js');

function fixture(route = 'home', options = {}) {
  let active = route;
  const overlays = [], navigated = [], closed = [];
  const doc = {
    querySelector() { return active ? {id: active} : null; },
    querySelectorAll() { return overlays.filter(node => node.tagName === 'DIALOG' ? node.open : node.shown); },
    getElementById(id) { return overlays.find(node => node.id === id); }
  };
  function overlay(id, zIndex = 50, kind = 'DIV') {
    const node = {id, tagName: kind, shown: true, open: true, style: {zIndex: String(zIndex)}, getAttribute() { return null; }};
    node.classList = {remove(name) { if (name === 'show') node.shown = false; }};
    node.close = () => { node.open = false; closed.push(id); };
    overlays.push(node); return node;
  }
  const deps = {document: doc, getStyle: node => node.style,
    navigate(id) { navigated.push(id); active = id; },
    closeModal(id) { doc.getElementById(id).shown = false; closed.push(id); }, ...options};
  const controller = navigation.createController(deps);
  return {controller, deps, doc, overlay, navigated, closed, route: () => active, setRoute: value => { active = value; }};
}

for (const route of ['checkin', 'us', 'life', 'comfort', 'bucket', 'jar', 'letters', 'goals', 'notes', 'memories', 'calendar', 'health', 'cycle', 'learn', 'work-schedule', 'relationship-timeline']) {
  test(`Android Back from the ${route} section returns Home, then lets Android exit`, () => {
    const f = fixture(route);
    assert.equal(f.controller.handleBack(), true);
    assert.equal(f.route(), 'home'); assert.deepEqual(f.navigated, ['home']);
    assert.equal(f.controller.handleBack(), false);
    assert.deepEqual(f.navigated, ['home'], 'Home Back must not navigate Home again');
  });
}
test('Home Back allows normal Android exit without calling navigate', () => {
  const f = fixture(); assert.equal(f.controller.handleBack(), false); assert.deepEqual(f.navigated, []);
});
test('Settings closes first, preserves Today, and the next press returns Home', () => {
  const f = fixture('checkin'); f.overlay('settingsModal');
  assert.equal(f.controller.handleBack(), true); assert.equal(f.route(), 'checkin');
  assert.deepEqual(f.closed, ['settingsModal']); assert.deepEqual(f.navigated, []);
  assert.equal(f.controller.handleBack(), true); assert.equal(f.route(), 'home');
});
test('a modal opened from Home closes before Home Back exits', () => {
  const f = fixture(); f.overlay('memoryModal');
  assert.equal(f.controller.handleBack(), true); assert.equal(f.route(), 'home');
  assert.equal(f.controller.handleBack(), false); assert.deepEqual(f.navigated, []);
});
test('the uppermost modal closes using existing cleanup, one layer per press', () => {
  const f = fixture('us'); f.overlay('noteModal', 50); f.overlay('memoryModal', 60); f.overlay('settingsModal', 50);
  f.controller.handleBack(); assert.deepEqual(f.closed, ['memoryModal']);
  f.controller.handleBack(); assert.deepEqual(f.closed, ['memoryModal', 'settingsModal']);
  f.controller.handleBack(); assert.deepEqual(f.closed, ['memoryModal', 'settingsModal', 'noteModal']);
  assert.equal(f.route(), 'us'); assert.deepEqual(f.navigated, []);
});
test('a browser dialog closes before section navigation', () => {
  const f = fixture('bucket'); const dialog = f.overlay('confirmDialog', 75, 'DIALOG');
  assert.equal(f.controller.handleBack(), true); assert.equal(dialog.open, false);
  assert.deepEqual(f.closed, ['confirmDialog']); assert.equal(f.route(), 'bucket');
});
test('hidden overlays do not trap Android Back', () => {
  const f = fixture('life'); f.overlay('hiddenModal').hidden = true;
  f.controller.handleBack(); assert.deepEqual(f.closed, []); assert.equal(f.route(), 'home');
});
test('a stale modal hidden by CSS does not close instead of the visible modal', () => {
  const f = fixture('memories'); f.overlay('memoryModal', 50);
  f.overlay('staleModal', 100).style.display = 'none';
  f.overlay('staleDrawer', 100).style.visibility = 'hidden';
  f.controller.handleBack(); assert.deepEqual(f.closed, ['memoryModal']); assert.equal(f.route(), 'memories');
  f.controller.handleBack(); assert.equal(f.route(), 'home');
});
test('a registered nested page pops first and unregistering cannot remove a newer handler', () => {
  const f = fixture('relationship-timeline'); let first = 0, second = 0;
  const removeOld = f.controller.registerBackHandler('relationship-timeline', () => { first++; return true; });
  const removeNew = f.controller.registerBackHandler('relationship-timeline', () => { second++; return true; });
  removeOld(); assert.equal(f.controller.handleBack(), true); assert.equal(first, 0); assert.equal(second, 1);
  assert.equal(f.route(), 'relationship-timeline'); removeNew();
  f.controller.handleBack(); assert.equal(f.route(), 'home');
});
test('modal closing takes priority over an internal page stack', () => {
  let popped = 0; const f = fixture('letters', {nestedBack() { popped++; return true; }});
  f.overlay('alMessageModal'); f.controller.handleBack(); assert.equal(popped, 0);
  f.controller.handleBack(); assert.equal(popped, 1); assert.equal(f.route(), 'letters');
});
test('a reentrant callback consumes no second layer or navigation', () => {
  let calls = 0; const f = fixture('bucket');
  f.controller.registerBackHandler('bucket', () => { calls++; assert.equal(f.controller.handleBack(), true); return true; });
  assert.equal(f.controller.handleBack(), true); assert.equal(calls, 1); assert.deepEqual(f.navigated, []);
});
test('route changes are read from the active screen rather than an old navigation cache', () => {
  const f = fixture(); f.setRoute('work-schedule'); f.controller.handleBack(); assert.equal(f.route(), 'home');
  f.setRoute('comfort'); f.controller.handleBack(); assert.deepEqual(f.navigated, ['home', 'home']);
});
test('only a strict true from a nested handler consumes Back', () => {
  const f = fixture('letters', {nestedBack: () => 'true'}); f.controller.handleBack(); assert.equal(f.route(), 'home');
});
test('mounted navigation invokes only the current section’s explicit nested API', () => {
  const f = fixture('letters'); const calls = [];
  const root = {document: f.doc, closeM: f.deps.closeModal, go: f.deps.navigate,
    UsLetters: {handleBack: () => { calls.push('letters'); return true; }},
    UsPlans: {handleBack: () => { calls.push('bucket'); return true; }},
    UsWorkSchedule: {handleBack: () => { calls.push('work'); return true; }},
    handleLearningBack: () => { calls.push('learn'); return true; }};
  const mounted = navigation.mount(root); assert.equal(root.UsNavigation, mounted);
  for (const route of ['letters', 'bucket', 'work-schedule', 'learn']) { f.setRoute(route); assert.equal(mounted.handleBack(), true); assert.equal(f.route(), route); }
  assert.deepEqual(calls, ['letters', 'bucket', 'work', 'learn']);
  f.setRoute('comfort'); mounted.handleBack(); assert.equal(f.route(), 'home');
  assert.deepEqual(calls, ['letters', 'bucket', 'work', 'learn']);
});

function letterFixture(extra = {}) {
  const storage = new Map(), sent = [];
  const model = {uid: 'al', coupleId: 'us', ready: true, members: [{uid: 'al', name: 'Al'}, {uid: 'yashika', name: 'Yashika'}], roles: {alUid: 'al', yashikaUid: 'yashika'}, letters: [], drafts: [], ...extra};
  const controller = letters.createController({readSnapshot: () => model, mutate: (...args) => { sent.push(args); return true; }, storage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)}});
  return {controller, sent, storage};
}
test('Back cancels letter publication before closing the draft without publishing or losing saved words', () => {
  const f = letterFixture(), c = f.controller;
  c.edit('sad'); c.update('body', 'These are my private words.');
  assert.equal(c.requestPublish(), true); assert.ok(c.getView().confirmation);
  assert.equal(c.handleBack(), true); assert.equal(c.getView().confirmation, null); assert.ok(c.getView().draft);
  assert.equal(c.handleBack(), true); assert.equal(c.getView().draft, null); assert.equal(c.handleBack(), false);
  c.edit('sad'); assert.equal(c.getView().draft.body, 'These are my private words.');
  assert.deepEqual(f.sent, []); assert.ok(f.storage.size);
});
test('Back from a revealed letter returns envelopes and does not write a read receipt or shared document', () => {
  const f = letterFixture({uid: 'yashika', letters: [{id: 'sad', category: 'sad', title: 'For you', body: 'Only our words', authorUid: 'al', recipientUid: 'yashika'}]});
  assert.equal(f.controller.openLetter('sad'), true); assert.ok(f.controller.getView().opened);
  assert.equal(f.controller.handleBack(), true); assert.equal(f.controller.getView().opened, null);
  assert.equal(f.controller.handleBack(), false); assert.deepEqual(f.sent, []);
});
test('Back dismisses role confirmation without assigning the couple roles', () => {
  const f = letterFixture({roles: null}); assert.equal(f.controller.chooseRole('al'), true);
  assert.equal(f.controller.handleBack(), true); assert.equal(f.controller.getView().roleChoice, null);
  assert.equal(f.controller.handleBack(), false); assert.deepEqual(f.sent, []);
});
test('Back cancels a bucket editor and invalidates an in-flight photo before returning to the list', async () => {
  let resolvePhoto; const sent = [], model = {uid: 'al', coupleId: 'us', members: [{uid: 'al'}], bucket: [], jar: []};
  const c = plans.createController({get: () => model, id: () => 'new', mutate: (...args) => { sent.push(args); return true; }, pickPhoto: () => new Promise(resolve => { resolvePhoto = resolve; })});
  c.openBucket(); c.edit('title', 'A private unfinished dream');
  const photo = c.pick({size: 100, type: 'image/jpeg'}, 'photoId');
  assert.equal(c.view().editor.busy, true); assert.equal(c.handleBack(), true); assert.equal(c.view().editor, null);
  resolvePhoto('data:image/jpeg;base64,aGVsbG8='); assert.equal(await photo, false);
  assert.equal(c.view().editor, null); assert.equal(c.handleBack(), false); assert.deepEqual(sent, []);
});
test('Back from Work column mapping closes the immediate panel then setup, without saving or connecting', () => {
  const sent = [], c = work.createController({call: (...args) => { sent.push(args); return true; }});
  c.onIdentity({uid: 'al', coupleId: 'us'}); c.openSetup(); c.edit('worksheet', 'Private unfinished setup'); c.toggleMapping();
  assert.equal(c.handleBack(), true); assert.equal(c.view().mappingOpen, false); assert.equal(c.view().setupOpen, true);
  assert.equal(c.handleBack(), true); assert.equal(c.view().setupOpen, false); assert.equal(c.view().draft, null);
  assert.equal(c.handleBack(), false); assert.deepEqual(sent, []);
});
test('Back closes the signed-out Microsoft instructions before leaving Work Schedule', () => {
  const c = work.createController(); c.openInstructions(); assert.equal(c.view().instructionsOpen, true);
  assert.equal(c.handleBack(), true); assert.equal(c.view().instructionsOpen, false); assert.equal(c.handleBack(), false);
});
test('the actual learning UI pops a checkpoint to the lesson, then to all units, preserving course progress', () => {
  const context = {document: {getElementById: () => null}, state: {learn: {profile: 'al', tab: 'course', unit: 'first', progress: {}}}, save() {}, toast() {}};
  context.window = context;
  context.USSPACE_COURSES = {al: {units: [{id: 'first', phrases: [{id: 'hello', n: 'Hi', r: 'Hi', e: 'Hello'}]}], phrases: [{id: 'hello', n: 'Hi', r: 'Hi', e: 'Hello'}]}};
  vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/src/main/assets/learning.js'), 'utf8'), context);
  context.startCheckpoint('first'); assert.equal(context.state.learn.tab, 'quiz');
  assert.equal(context.handleLearningBack(), true); assert.equal(context.state.learn.tab, 'course'); assert.equal(context.state.learn.unit, 'first');
  assert.equal(context.handleLearningBack(), true); assert.equal(context.state.learn.unit, '');
  assert.equal(context.handleLearningBack(), false);
  context.state.learn.tab = 'review'; assert.equal(context.handleLearningBack(), true); assert.equal(context.state.learn.tab, 'course');
  assert.equal(context.handleLearningBack(), false);
});
