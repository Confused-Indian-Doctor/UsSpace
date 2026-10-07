const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const comfortPath = path.join(__dirname, '../app/src/main/assets/comfort.js');
const {PHRASES, REMINDERS, PhraseDeck, isRisk, displayPhrase, normalisePhone, createSession} = require(comfortPath);
function fixture(extra) {
  const values = new Map(), calls = {links: [], messages: [], memories: 0, changes: 0};
  const tasks = new Map(); let next = 1;
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  const options = {
    storage, random: () => .25,
    setTimeout(callback, delay) { const id = next++; tasks.set(id, {callback, delay}); return id; },
    clearTimeout(id) { tasks.delete(id); },
    onChange() { calls.changes++; },
    openLink(url) { calls.links.push(url); }, messageAl(mood) { calls.messages.push(mood); }, memory() { calls.memories++; },
    ...(extra || {})
  };
  const session = createSession(options);
  function tick() { const [id, task] = tasks.entries().next().value || []; if (!task) return false; tasks.delete(id); task.callback(); return task.delay; }
  return {session, values, tasks, calls, storage, options, tick};
}

test('six curated categories retain all 48 requested phrases', () => {
  assert.equal(Object.keys(PHRASES).length, 6);
  assert.equal(Object.values(PHRASES).flat().length, 48);
  for (const bank of Object.values(PHRASES)) assert.equal(new Set(bank).size, 8);
  assert.ok(PHRASES.reassurance.includes('Still you. Still me. Still us.'));
  assert.ok(PHRASES.miss.includes('Different places, same sky, still us.'));
  assert.match(displayPhrase(PHRASES.anxious[2]), /^If you’re somewhere safe/);
  assert.equal(displayPhrase(PHRASES.sad[0]), PHRASES.sad[0]);
  assert.ok(REMINDERS.includes('You do not have to solve everything tonight.'));
});

test('shuffle draws every phrase once per round, without a boundary repetition', () => {
  let random = 0;
  const deck = new PhraseDeck({}, () => { random = (random + .137) % 1; return random; });
  for (const [name, bank] of Object.entries(PHRASES)) {
    let prior = '';
    for (let round = 0; round < 10; round++) {
      const selected = [];
      for (let i = 0; i < bank.length; i++) {
        const phrase = deck.draw(name, bank);
        assert.notEqual(phrase, prior, name + ' must not repeat immediately');
        selected.push(phrase); prior = phrase;
      }
      assert.equal(new Set(selected).size, bank.length);
    }
  }
});

test('saved shuffle history prevents immediate repetition after reopening', () => {
  const f = fixture(); f.session.setScope({uid: 'yashika', coupleId: 'us'});
  f.session.setMood('sad'); const first = f.session.snapshot().phrase;
  const reopened = createSession(f.options); reopened.setScope({uid: 'yashika', coupleId: 'us'}); reopened.setMood('sad');
  assert.notEqual(reopened.snapshot().phrase, first);
  assert.equal(reopened.snapshot().privateText, '');
  assert.equal(reopened.snapshot().unsafe, false);
});

test('malformed shuffle data and unusable RNG cannot select invalid phrases', () => {
  const history = {sad: {last: 2000, remaining: [null, -1, 1, 1, 2000, '2']}};
  const deck = new PhraseDeck(history, () => NaN);
  for (let i = 0; i < 30; i++) assert.ok(PHRASES.sad.includes(deck.draw('sad', PHRASES.sad)));
});

test('moods and free text never send a message or enter persisted content', () => {
  const f = fixture(); f.session.setScope({uid: 'yashika', coupleId: 'us'});
  f.session.setMood('sad'); f.session.text('My private sentence about my day.'); f.session.setMode('remind'); f.session.reminder();
  assert.deepEqual(f.calls.messages, []); assert.deepEqual(f.calls.links, []);
  for (const value of f.values.values()) {
    const stored = JSON.parse(value);
    assert.deepEqual(Object.keys(stored).sort(), ['contacts', 'country', 'history']);
    assert.equal(value.includes('My private sentence'), false);
    assert.equal(Object.hasOwn(stored, 'mood'), false);
    assert.equal(Object.hasOwn(stored, 'privateText'), false);
  }
  f.session.message(); assert.deepEqual(f.calls.messages, ['sad'], 'only an explicit action opens the root composer');
});

test('account changes and logout stop timers and conceal private contacts/text/moods', () => {
  const f = fixture(); f.session.setScope({uid: 'yashika', coupleId: 'us'});
  f.session.saveContacts({alPhone: '+91 1234567890', trustedName: 'Friend', trustedPhone: '+1 2025550111'});
  f.session.setMood('sad'); f.session.text('Only account one should see this');
  f.session.setMode('ground'); f.session.startBreathing(); assert.equal(f.tasks.size, 1);
  f.session.setScope({uid: 'al', coupleId: 'us'});
  assert.equal(f.tasks.size, 0); assert.equal(f.session.snapshot().contacts.alPhone, '');
  assert.equal(f.session.snapshot().mood, ''); assert.equal(f.session.snapshot().privateText, '');
  f.session.setScope({}); assert.equal(f.session.snapshot().contacts.alPhone, '');
  f.session.setScope({uid: 'yashika', coupleId: 'us'}); assert.equal(f.session.snapshot().contacts.alPhone, '+911234567890');
  assert.equal(f.session.snapshot().privateText, '', 'ephemeral free text does not return');
});

test('couple change clears ephemeral state without transferring it to the new couple', () => {
  const f = fixture(); f.session.setScope({uid: 'yashika', coupleId: 'old'}); f.session.setMood('sleep'); f.session.text('private');
  f.session.setMode('ground'); f.session.startBreathing();
  f.session.setScope({uid: 'yashika', coupleId: 'new'});
  assert.equal(f.tasks.size, 0); assert.equal(f.session.snapshot().mood, ''); assert.equal(f.session.snapshot().privateText, '');
});

test('clear risk expressions open safety, while ordinary and clear denial text do not', () => {
  for (const text of [
    'I feel unsafe', 'I don’t feel safe', 'I am not safe', 'I am in immediate danger', 'I feel suicidal',
    'I might hurt myself tonight', 'I am hurting myself', 'I might do something to myself', 'I want to kill myself', 'I want to die', 'I wish I were dead',
    'I am thinking of ending it all', 'I want to end my life', 'self-harm', 'someone is hurting me',
    "I can't keep myself safe", "I don't want to live", 'I am going to overdose'
  ]) assert.equal(isRisk(text), true, text);
  for (const text of ['I miss you', 'I am sad and anxious', 'I am not suicidal', "I don't want to hurt myself", 'I do not want to die', 'I am not in danger']) assert.equal(isRisk(text), false, text);
});

test('risk immediately stops breathing and blocks cute-flow actions until explicit return', () => {
  const f = fixture(); f.session.setMode('ground'); f.session.startBreathing();
  const obsolete = [...f.tasks.values()][0].callback;
  f.session.text('I might harm myself');
  assert.equal(f.session.snapshot().unsafe, true); assert.equal(f.session.snapshot().privateText, ''); assert.equal(f.tasks.size, 0);
  assert.equal(f.session.setMood('sad'), false); assert.equal(f.session.setMode('voice'), false);
  assert.equal(f.session.startBreathing(), false); f.session.memory(); assert.equal(f.calls.memories, 0);
  obsolete(); assert.equal(f.tasks.size, 0, 'already queued obsolete phase cannot restart a stopped timer');
  f.session.message(); assert.deepEqual(f.calls.messages, [undefined], 'safety composer never passes private mood/text');
  f.session.safeAgain(); assert.equal(f.session.snapshot().unsafe, false); assert.equal(f.session.snapshot().mood, '');
});

test('breathing is four optional gentle rounds and timers stop on pause/mode change', () => {
  const f = fixture(); assert.equal(f.session.startBreathing(), false);
  f.session.setMode('ground'); assert.equal(f.session.startBreathing(), true);
  assert.equal(f.session.snapshot().breathPhase, 'in'); assert.equal(f.tick(), 4000); assert.equal(f.session.snapshot().breathPhase, 'out');
  assert.equal(f.tick(), 6000); assert.equal(f.session.snapshot().breathRound, 2);
  f.session.stop(); assert.equal(f.tasks.size, 0); assert.equal(f.session.snapshot().breathing, false);
  f.session.startBreathing(); f.session.setMode('comfort'); assert.equal(f.tasks.size, 0);
  f.session.setMode('ground'); f.session.startBreathing(); const durations = [];
  while (f.tasks.size) durations.push(f.tick());
  assert.deepEqual(durations, [4000, 6000, 4000, 6000, 4000, 6000, 4000, 6000]);
  assert.equal(f.session.snapshot().breathing, false); assert.match(f.session.snapshot().notice, /quiet breaths/);
});

test('grounding advances bounded senses with optional restart', () => {
  const f = fixture(); f.session.setMode('ground');
  f.session.step(-1); assert.equal(f.session.snapshot().groundStep, 0);
  for (let i = 0; i < 9; i++) f.session.step(1);
  assert.equal(f.session.snapshot().groundStep, 4);
  f.session.step(-4); assert.equal(f.session.snapshot().groundStep, 0);
});

test('real contact actions use only validated local telephone numbers and never automatic sends', () => {
  const f = fixture(); f.session.setScope({uid: 'yashika'});
  assert.equal(f.session.saveContacts({alPhone: 'javascript:alert(1)'}), false);
  assert.equal(f.session.saveContacts({alPhone: '+91 (123) 456-7890', trustedName: 'Mum', trustedPhone: '+44 20 1234 5678'}), true);
  assert.deepEqual(f.calls.links, []);
  f.session.unsafe(); f.session.contact('al'); f.session.contact('trusted');
  assert.deepEqual(f.calls.links, ['tel:+911234567890', 'tel:+442012345678']); assert.deepEqual(f.calls.messages, []);
  assert.equal(normalisePhone('https://secret.example'), ''); assert.equal(normalisePhone('+1;123'), '');
  f.session.setCountry('india'); f.session.emergency('emergency'); f.session.emergency('crisis');
  assert.deepEqual(f.calls.links.slice(-2), ['tel:112', 'tel:14416']);
  f.session.setCountry('other'); f.session.emergency('crisis'); assert.equal(f.calls.links.at(-1), 'https://findahelpline.com/');
});

test('missing contact offers an explicit composer or local settings without claiming contact', () => {
  const f = fixture(); f.session.unsafe(); f.session.contact('al'); assert.deepEqual(f.calls.messages, [undefined]);
  assert.equal(f.session.contact('trusted'), false); assert.equal(f.session.snapshot().contactsOpen, true);
  assert.match(f.session.snapshot().notice, /Add a trusted person/); assert.deepEqual(f.calls.links, []);
});

function browserFixture() {
  const f = fixture(); const elements = new Map(), active = {uid: 'yashika', coupleId: 'us'};
  let dynamicIds = [], focused = ''; const subscribers = [];
  function element(id) {
    const node = {id, value: '', disabled: false, attributes: {}, focus() { focused = id; }, setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k] || null; }, querySelector() { return null; }, click() { if (!this.disabled) this.onclick?.(); }};
    elements.set(id, node); return node;
  }
  const container = element('comfort');
  Object.defineProperty(container, 'innerHTML', {set(value) {
    this.html = value; for (const id of dynamicIds) elements.delete(id); dynamicIds = [];
    for (const match of value.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
      const node = element(match[3]); dynamicIds.push(match[3]); node.disabled = /\bdisabled\b/.test(match[2]);
      node.value = match[2].match(/\bvalue="([^"]*)"/)?.[1] || '';
    }
  }, get() { return this.html || ''; }});
  const events = new Map();
  const context = vm.createContext({
    document: {hidden: false, getElementById: id => elements.get(id) || null, addEventListener: (name, fn) => events.set(name, fn)},
    localStorage: f.storage, setTimeout: f.options.setTimeout, clearTimeout: f.options.clearTimeout, addEventListener: (name, fn) => events.set(name, fn),
    UsExtras: {get: () => active, subscribe(fn) { subscribers.push(fn); }, openLink: f.options.openLink, mutate() { throw new Error('private comfort must not sync'); }},
    UsFeatures: {identity: () => active, messageAl: f.options.messageAl, memory: f.options.memory},
    location: {href: ''}, go() {}, console
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(comfortPath, 'utf8'), context, {filename: 'comfort.js'});
  context.UsComfort.init();
  const click = id => { const target = elements.get(id); assert.ok(target?.onclick, 'production handler bound: ' + id); target.click(); };
  return {...f, context, container, elements, active, events, subscribers, click, focused: () => focused};
}

test('production UI binds real mood, placeholder voice, grounding, safety and account reset handlers', () => {
  const f = browserFixture();
  f.click('comfortMood-sad'); assert.match(f.container.html, /From Al ❤️/);
  f.click('comfortVoice'); assert.match(f.container.html, /No recording has been added yet/);
  assert.equal(typeof f.context.speechSynthesis, 'undefined'); assert.deepEqual(f.calls.messages, []);
  f.click('comfortGround'); f.click('comfortBreathToggle'); assert.equal(f.tasks.size, 1);
  f.click('comfortNextSense'); assert.match(f.container.html, /things you can feel/);
  f.click('comfortUnsafe'); assert.equal(f.tasks.size, 0); assert.equal(f.container.getAttribute('data-safety'), 'true');
  assert.match(f.container.html, /Your safety comes first/); assert.doesNotMatch(f.container.html, /From Al ❤️/);
  assert.equal(f.focused(), 'comfortSafetyTitle'); assert.deepEqual(f.calls.messages, []);
  f.click('comfortContactAl'); assert.deepEqual(f.calls.messages, [undefined]);
  f.click('comfortSafeAgain'); f.click('comfortMood-reassurance');
  f.active.uid = 'al'; f.subscribers[0](); assert.doesNotMatch(f.container.html, /Still you\. Still me\. Still us\./);
  assert.match(f.container.html, /Choose what you need/);
});

test('production free-text risk and page hiding run the same timer cleanup', () => {
  const f = browserFixture(); f.click('comfortGround'); f.click('comfortBreathToggle');
  f.context.document.hidden = true; f.events.get('visibilitychange')(); assert.equal(f.tasks.size, 0);
  f.context.document.hidden = false; f.click('comfortBreathToggle'); assert.equal(f.tasks.size, 1);
  f.elements.get('comfortPrivateText').oninput({target: {value: 'I want to kill myself'}});
  assert.match(f.container.html, /Your safety comes first/); assert.equal(f.tasks.size, 0);
  assert.deepEqual(f.calls.messages, []); assert.deepEqual(f.calls.links, []);
  for (const content of f.values.values()) assert.equal(content.includes('kill myself'), false);
});

test('authenticated-but-unpaired UI uses authoritative identity, not anonymous extras scope', () => {
  const f = browserFixture();
  f.active.coupleId = ''; f.context.UsExtras.get = () => ({uid: '', coupleId: ''});
  f.context.UsComfort.render(); f.click('comfortMood-sad');
  assert.ok(f.values.has('usspace.comfort.v1.account:yashika'));
  assert.equal(f.values.has('usspace.comfort.v1.local-only'), false);
  f.active.uid = ''; f.context.UsComfort.render();
  assert.match(f.container.html, /Choose what you need/);
});
