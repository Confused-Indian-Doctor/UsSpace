'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sourcePath = path.join(__dirname, '../app/src/main/assets/us-plans.js');
const plans = require(sourcePath);
const NOW = Date.parse('2026-10-07T18:00:00Z');
const JPEG = 'data:image/jpeg;base64,aGVsbG8=';
function setup(options = {}) {
  let m = {uid: 'al', coupleId: 'us', members: [{uid: 'al', name: 'Al'}, {uid: 'yashika', name: 'Yashika'}], bucket: [], jar: [], hearts: {}, ...options.model};
  let sequence = 0;
  const calls = [], memories = [];
  const controller = plans.createController({get: () => m, now: () => NOW, random: () => options.random ?? 0, id: () => `id${++sequence}`,
    mutate(kind, id, fields) { calls.push({kind, id, fields: {...fields}}); return options.accept ? options.accept(kind, id, fields) : true; },
    pickPhoto: options.pickPhoto || (async () => JPEG), prefillMemory: fields => memories.push(fields)});
  controller.sync();
  return {controller, calls, memories, model: () => m, setModel: value => { m = value; }};
}
const item = overrides => ({id: 'trip', title: 'A mountain sunrise', category: 'Travel', location: 'Coorg', targetDate: '', priority: 'Normal', notes: 'Take it slowly', photoId: 'dream_photo', state: 'Dreaming', completedDate: '', completedPhotoId: '', suggestedBy: 'al', suggestedName: 'Al', createdAt: '2026-10-01T10:00:00Z', ...overrides});

test('new bucket payload contains every supported field and no spoofable author metadata', () => {
  const {controller: c, calls} = setup();
  c.openBucket(); c.edit('title', '  Dinner by the sea  '); c.edit('category', 'Date'); c.edit('location', 'Kochi');
  c.edit('targetDate', '2026-12-10'); c.edit('priority', 'High'); c.edit('notes', 'Our favourite food'); c.edit('state', 'Booked');
  c.edit('suggestedBy', 'someone_else');
  assert.equal(c.saveBucket(), true);
  assert.deepEqual(calls, [{kind: 'bucket', id: 'bucket_id1', fields: {title: 'Dinner by the sea', category: 'Date', location: 'Kochi', targetDate: '2026-12-10', priority: 'High', notes: 'Our favourite food', photoId: '', state: 'Booked', completedDate: '', completedPhotoId: ''}}]);
});

test('editing sends only changed fields while preserving a partner’s concurrent edits', () => {
  const initial = item(), {controller: c, calls, setModel, model} = setup({model: {bucket: [initial]}});
  c.openBucket('trip'); c.edit('notes', 'Bring a blanket');
  setModel({...model(), bucket: [{...initial, location: 'Wayanad', priority: 'High'}]});
  c.sync(); assert.equal(c.saveBucket(), true);
  assert.deepEqual(calls, [{kind: 'bucket', id: 'trip', fields: {notes: 'Bring a blanket'}}]);
});

test('unchanged edits do not produce writes or overwrite timestamps', () => {
  const {controller: c, calls} = setup({model: {bucket: [item()]}});
  c.openBucket('trip'); assert.equal(c.saveBucket(), true); assert.deepEqual(calls, []);
});

test('field lengths, enums and calendar dates reject invalid input before mutation', () => {
  for (const [field, value] of [['title', 'x'.repeat(161)], ['location', 'x'.repeat(241)], ['notes', 'x'.repeat(4001)], ['targetDate', '2026-02-30'], ['completedDate', '2026-13-01'], ['category', 'Private health'], ['state', 'Secret'], ['priority', 'Urgent']]) {
    const {controller: c, calls} = setup(); c.openBucket(); c.edit('title', 'A little dream'); c.edit(field, value);
    assert.equal(c.saveBucket(), false, field); assert.ok(c.view().error, field); assert.deepEqual(calls, [], field);
  }
});

test('category and state filters intersect without changing source items', () => {
  const items = [item(), item({id: 'food', category: 'Food', state: 'Planning'}), item({id: 'planned-trip', state: 'Planning'})];
  const {controller: c, model} = setup({model: {bucket: items}});
  c.setFilters('Travel', 'Planning'); assert.deepEqual(c.view().items.map(x => x.id), ['planned-trip']);
  c.setFilters('', 'Planning'); assert.deepEqual(c.view().items.map(x => x.id), ['food', 'planned-trip']);
  c.setFilters('not-a-category', 'not-a-state'); assert.equal(c.view().items.length, 3); assert.deepEqual(model().bucket, items);
});

test('Start planning and completion are narrow patches, and Memory requires an explicit action', () => {
  const {controller: c, calls, memories} = setup({model: {bucket: [item()]}});
  assert.equal(c.changeState('trip', 'Planning'), true);
  assert.deepEqual(calls[0], {kind: 'bucket', id: 'trip', fields: {state: 'Planning'}});
  assert.equal(c.changeState('trip', 'Done'), true);
  assert.deepEqual(calls[1], {kind: 'bucket', id: 'trip', fields: {state: 'Done', completedDate: '2026-10-07'}});
  assert.deepEqual(memories, []);
  assert.equal(c.turnMemory('trip'), true);
  assert.deepEqual(memories, [{title: 'A mountain sunrise', date: '2026-10-07', location: 'Coorg', photoId: 'dream_photo', text: 'Take it slowly'}]);
  assert.equal(calls.length, 2, 'prefill opens the existing editor without silently writing a Memory');
});

test('Done form defaults completion date and prefers completed photo when prefilling', () => {
  const {controller: c, calls, memories} = setup();
  c.openBucket(); c.edit('title', 'Our first hike'); c.edit('state', 'Done'); c.edit('photoId', 'before'); c.edit('completedPhotoId', 'after'); c.edit('location', 'The hills');
  assert.equal(c.saveBucket(), true); assert.equal(calls[0].fields.completedDate, '2026-10-07');
  assert.equal(c.turnMemory(calls[0].id), true); assert.equal(memories[0].photoId, 'after');
});

test('a completed date is preserved rather than silently replaced with today', () => {
  const {controller: c, calls, memories} = setup({model: {bucket: [item({state: 'Done', completedDate: '2026-10-03', completedPhotoId: 'finished'})]}});
  c.changeState('trip', 'Done'); assert.equal(calls[0].fields.completedDate, '2026-10-03');
  c.turnMemory('trip'); assert.equal(memories[0].date, '2026-10-03');
});

test('photo selection and cancellation never send private bytes', async () => {
  const {controller: c, calls} = setup(); c.openBucket(); c.edit('title', 'A day out');
  assert.equal(await c.pick({size: 700, type: 'image/jpeg'}, 'photoId'), true);
  assert.deepEqual(calls, []); assert.equal(c.view().editor.photos.photoId.data, JPEG);
  c.cancel(); assert.equal(c.view().editor, null); assert.deepEqual(calls, []);
});

test('Save queues compressed photo separately and only stores a reference in the bucket', async () => {
  const {controller: c, calls} = setup(); c.openBucket(); c.edit('title', 'A day out');
  await c.pick({size: 700, type: 'image/jpeg'}, 'photoId'); assert.equal(c.saveBucket(), true);
  assert.equal(calls.length, 2); assert.deepEqual(calls[0], {kind: 'photo', id: 'photo_id2', fields: {data: JPEG}});
  assert.equal(calls[1].kind, 'bucket'); assert.equal(calls[1].fields.photoId, 'photo_id2');
  assert.ok(!JSON.stringify(calls[1].fields).includes('base64'));
});

test('both dream and completed attachments are submitted only on Save', async () => {
  const {controller: c, calls} = setup(); c.openBucket(); c.edit('title', 'Our trip'); c.edit('state', 'Done');
  await c.pick({size: 1000, type: 'image/png'}, 'photoId');
  await c.pick({size: 1000, type: 'image/png'}, 'completedPhotoId');
  assert.equal(calls.length, 0); assert.equal(c.saveBucket(), true);
  assert.deepEqual(calls.map(call => call.kind), ['photo', 'photo', 'bucket']);
  assert.equal(calls[2].fields.photoId, calls[0].id); assert.equal(calls[2].fields.completedPhotoId, calls[1].id);
});

test('photo source limit, compressed limit, MIME and external URI fail safely', async () => {
  for (const fixture of [
    {file: {size: plans.MAX_SOURCE + 1, type: 'image/png'}, data: JPEG},
    {file: {size: 10, type: 'application/pdf'}, data: JPEG},
    {file: {size: 10, type: 'image/png'}, data: 'data:image/jpeg;base64,' + 'a'.repeat(plans.MAX_PHOTO)},
    {file: {size: 10, type: 'image/png'}, data: 'https://example.com/private.jpg'},
    {file: {size: 10, type: 'image/png'}, data: 'data:image/svg+xml;base64,PHN2Zz4='}
  ]) {
    const {controller: c, calls} = setup({pickPhoto: async () => fixture.data}); c.openBucket();
    assert.equal(await c.pick(fixture.file, 'photoId'), false); assert.ok(c.view().error); assert.equal(c.view().editor.busy, false); assert.deepEqual(calls, []);
  }
});

test('picker rejection remains actionable and preserves the form for retry', async () => {
  const {controller: c, calls} = setup({pickPhoto: async () => { throw new Error('Image cannot be opened. Choose another.'); }});
  c.openBucket(); c.edit('title', 'Keep this title'); assert.equal(await c.pick({size: 20, type: 'image/jpeg'}, 'photoId'), false);
  assert.equal(c.view().editor.values.title, 'Keep this title'); assert.match(c.view().error, /Choose another/); assert.deepEqual(calls, []);
});

test('a late photo result cannot cross account scope or reopen a cancelled form', async () => {
  let resolve;
  const {controller: c, calls, setModel, model} = setup({pickPhoto: () => new Promise(done => { resolve = done; })});
  c.openBucket(); const task = c.pick({size: 20, type: 'image/jpeg'}, 'photoId');
  setModel({...model(), uid: 'yashika', coupleId: 'new-space'}); c.sync(); resolve(JPEG);
  assert.equal(await task, false); assert.equal(c.view().editor, null); assert.deepEqual(calls, []);
});

test('an invalid replacement selection does not leave an old picker busy forever', async () => {
  let resolve;
  const {controller: c} = setup({pickPhoto: () => new Promise(done => { resolve = done; })});
  c.openBucket(); const old = c.pick({size: 20, type: 'image/jpeg'}, 'photoId');
  assert.equal(c.view().editor.busy, true);
  assert.equal(await c.pick({size: plans.MAX_SOURCE + 1, type: 'image/jpeg'}, 'photoId'), false);
  assert.equal(c.view().editor.busy, false); resolve(JPEG); assert.equal(await old, false);
});

test('a rejected bucket write preserves selected photo and retries without duplicating its accepted upload', async () => {
  let rejected = true;
  const {controller: c, calls} = setup({accept: kind => kind !== 'bucket' || !rejected});
  c.openBucket(); c.edit('title', 'Retry me'); await c.pick({size: 20, type: 'image/jpeg'}, 'photoId');
  assert.equal(c.saveBucket(), false); assert.ok(c.view().editor); rejected = false;
  assert.equal(c.saveBucket(), true); assert.deepEqual(calls.map(call => call.kind), ['photo', 'bucket', 'bucket']);
});

test('removing an existing photo sends an empty reference, not a deletion or other field overwrite', () => {
  const {controller: c, calls} = setup({model: {bucket: [item()]}}); c.openBucket('trip'); c.clearPhoto('photoId'); c.saveBucket();
  assert.deepEqual(calls, [{kind: 'bucket', id: 'trip', fields: {photoId: ''}}]);
});

test('either partner can add a short note; frontend never supplies an author or timestamp', () => {
  for (const uid of ['al', 'yashika']) {
    const {controller: c, calls} = setup({model: {uid}}); c.setJarText('  I loved your thoughtful call.  '); assert.equal(c.addNote(), true);
    assert.deepEqual(calls, [{kind: 'jar', id: 'jar_id1', fields: {text: 'I loved your thoughtful call.'}}]); assert.equal(c.view().jarText, '');
  }
});

test('empty and oversized notes do not write; bridge failure keeps the unsaved appreciation', () => {
  const {controller: c, calls} = setup({accept: () => false});
  c.setJarText('   '); assert.equal(c.addNote(), false); c.setJarText('x'.repeat(1501)); assert.equal(c.addNote(), false); assert.deepEqual(calls, []);
  c.setJarText('Keep my note'); assert.equal(c.addNote(), false); assert.equal(c.view().jarText, 'Keep my note');
});

test('heart toggle uses the signed-in UID and changes only that actor’s active flag', () => {
  const note = {id: 'n1', text: 'Thank you', authorUid: 'yashika'}, {controller: c, calls, setModel, model} = setup({model: {jar: [note], hearts: {n1: ['yashika']}}});
  c.heart('n1'); assert.deepEqual(calls[0], {kind: 'heart', id: 'n1', fields: {active: true}});
  setModel({...model(), hearts: {n1: ['yashika', 'al']}}); c.heart('n1');
  assert.deepEqual(calls[1], {kind: 'heart', id: 'n1', fields: {active: false}}); assert.deepEqual(model().hearts.n1, ['yashika', 'al']);
  assert.equal(c.heart('missing'), false); assert.equal(calls.length, 2);
});

test('old-note selection is stable through renders, prefers old notes and avoids immediate repetition', () => {
  const notes = [{id: 'recent', createdAt: '2026-10-07T17:00:00Z'}, {id: 'old1', createdAt: '2026-10-01T10:00:00Z'}, {id: 'old2', createdAt: '2026-10-02T10:00:00Z'}];
  const {controller: c, setModel, model} = setup({model: {jar: notes}});
  assert.equal(c.view().selectedId, 'old1'); for (let i = 0; i < 10; i++) assert.equal(c.view().selectedId, 'old1');
  c.anotherNote(); assert.equal(c.view().selectedId, 'old2'); c.anotherNote(); assert.equal(c.view().selectedId, 'old1');
  setModel({...model(), jar: notes.filter(note => note.id !== 'old1')}); assert.equal(c.view().selectedId, 'old2');
});

test('attribution handles actual elapsed days, today, future clocks and absent dates', () => {
  assert.equal(plans.attribution({authorName: 'Al', createdAt: '2026-10-05T18:00:00Z'}, NOW), 'Al wrote this 2 days ago');
  assert.equal(plans.attribution({authorName: 'Yashika', createdAt: '2026-10-06T18:00:00Z'}, NOW), 'Yashika wrote this 1 day ago');
  assert.equal(plans.attribution({authorName: 'Al', createdAt: '2026-10-08T18:00:00Z'}, NOW), 'Al wrote this today');
  assert.equal(plans.attribution({}, NOW), 'Your person wrote this a while ago');
});

test('sign-out and re-pairing clear unsaved text, photos, memory offers, filters and note selection', async () => {
  const {controller: c, calls, model, setModel} = setup({model: {bucket: [item()], jar: [{id: 'old', createdAt: '2026-10-01T10:00:00Z'}]}});
  c.changeState('trip', 'Done'); c.openBucket('trip'); c.edit('title', 'Personal draft'); await c.pick({size: 100, type: 'image/jpeg'}, 'photoId'); c.setJarText('Private unfinished note'); c.setFilters('Travel', 'Done');
  setModel({...model(), uid: '', coupleId: '', bucket: [], jar: []}); const v = c.view();
  assert.equal(v.editor, null); assert.equal(v.jarText, ''); assert.equal(v.offer, null); assert.equal(v.categoryFilter, ''); assert.equal(v.stateFilter, ''); assert.equal(v.selectedId, '');
  assert.equal(c.addNote(), false); assert.match(c.view().error, /Sign in and pair/); assert.equal(calls.length, 1);
});

test('logged-out form stays local and cannot queue photos, bucket items or jar notes', async () => {
  const {controller: c, calls} = setup({model: {uid: '', coupleId: ''}}); c.openBucket(); c.edit('title', 'A dream'); await c.pick({size: 20, type: 'image/jpeg'}, 'photoId');
  assert.equal(c.saveBucket(), false); c.setJarText('A little appreciation'); assert.equal(c.addNote(), false); assert.deepEqual(calls, []);
});

test('browser event handlers create forms, submit actual payloads, escape content and wire filter/heart actions', () => {
  const calls = [], sections = {}, elements = {};
  for (const id of ['bucket', 'jar']) sections[id] = {id, innerHTML: '', handlers: {}, addEventListener(type, fn) { assert.ok(!this.handlers[type], 'listeners are registered once'); this.handlers[type] = fn; }};
  let m = {uid: 'al', coupleId: 'us', members: [{uid: 'al', name: 'Al'}], bucket: [item({title: '<script>attack</script>'})], jar: [{id: 'n1', text: '<img onerror="attack()">', authorName: 'Yashika', createdAt: '2026-10-01T10:00:00Z'}], hearts: {}};
  const context = {document: {activeElement: null, getElementById: id => sections[id] || elements[id] || null}, Date, Math, console,
    UsExtras: {get: () => m, mutate: (kind, id, fields) => { calls.push({kind, id, fields: {...fields}}); return true; }, photo: () => '', pickPhoto: async () => JPEG, subscribe: fn => { context.onSnapshot = fn; }},
    UsFeatures: {prefillMemory() {}}, newEntityId: () => 'testid'};
  vm.createContext(context); vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context); context.UsPlans.init(); context.UsPlans.init();
  assert.match(sections.bucket.innerHTML, /Our Bucket List/); assert.match(sections.jar.innerHTML, /Appreciation Jar/);
  assert.ok(sections.bucket.innerHTML.includes('&lt;script&gt;attack&lt;/script&gt;')); assert.ok(sections.jar.innerHTML.includes('&lt;img onerror=&quot;attack()&quot;&gt;'));
  const click = (section, data) => sections[section].handlers.click({target: {closest: () => ({dataset: data})}});
  const input = (section, id, value, data = {}) => sections[section].handlers.input({target: {id, value, dataset: data}});
  const submit = (section, form) => sections[section].handlers.submit({preventDefault() {}, target: {dataset: {form}}});
  click('bucket', {action: 'new'}); assert.match(sections.bucket.innerHTML, /What shall we dream of/);
  input('bucket', 'plans-title', 'A real submitted dream', {field: 'title'}); input('bucket', 'plans-category', 'Silly', {field: 'category'}); submit('bucket', 'bucket');
  assert.equal(calls[0].kind, 'bucket'); assert.equal(calls[0].fields.title, 'A real submitted dream'); assert.equal(calls[0].fields.category, 'Silly');
  input('jar', 'plans-jar-text', 'You made me smile.'); submit('jar', 'jar'); assert.deepEqual(JSON.parse(JSON.stringify(calls[1].fields)), {text: 'You made me smile.'});
  click('jar', {action: 'heart', id: 'n1'}); assert.deepEqual(JSON.parse(JSON.stringify(calls[2].fields)), {active: true});
  sections.bucket.handlers.change({target: {dataset: {filter: 'state'}, value: 'Done'}}); assert.match(sections.bucket.innerHTML, /No dreams match these filters/);
  m = {...m, uid: '', coupleId: '', bucket: [], jar: []}; context.onSnapshot(); assert.match(sections.jar.innerHTML, /Pair your two phones/); assert.match(sections.jar.innerHTML, /A jar for our little joys/);
});
