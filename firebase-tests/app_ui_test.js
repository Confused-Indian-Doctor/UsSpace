const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');

// Run every bundled script in document order with the actual UI functions.
const assets = path.join(__dirname, '../app/src/main/assets');
const html = fs.readFileSync(path.join(assets, 'index.html'), 'utf8');
const entries = new Map();
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    textContent: '', innerHTML: '', value: '', checked: false, style: {}, dataset: {},
    classList: {add() {}, remove() {}, toggle() {}},
  });
  return elements.get(id);
}
const context = vm.createContext({
  document: {getElementById: id => elements.get(id) || null, querySelectorAll: () => [], querySelector: element},
  localStorage: {getItem: key => entries.get(key) || null, setItem: (key, value) => entries.set(key, value)},
  crypto: {randomUUID}, location: {hash: ''}, setTimeout: () => 1, clearTimeout() {},
  scrollTo() {}, confirm: () => false, console,
});
context.window = context;
for (const match of html.matchAll(/\bid="([^"]+)"/g)) context[match[1]] = element(match[1]);
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const source = match[1].match(/\bsrc="([^"]+)"/)?.[1];
  const script = source ? fs.readFileSync(path.join(assets, source), 'utf8') : match[2];
  vm.runInContext(script, context, {filename: source || 'index.html'});
}
const run = source => vm.runInContext(source, context);
run("go('learn');setLearner('al');setLearnTab('course')");
assert.match(element('learnPanel').innerHTML, /Kannada beginner course/);
run("setLearnTab('alphabet')");
assert.match(element('learnPanel').innerHTML, /ಕನ್ನಡ/);
run("setLearner('yashika');setLearnTab('course')");
assert.match(element('learnPanel').innerHTML, /Malayalam beginner course/);
run("setLearnTab('alphabet')");
assert.match(element('learnPanel').innerHTML, /മലയാളം/);
for (const tab of ['today', 'phrases', 'quiz', 'review', 'date', 'progress']) {
  run(`setLearnTab(${JSON.stringify(tab)})`);
  assert.ok(element('learnPanel').innerHTML.length > 50, `${tab} panel must render`);
}
const before = run('state.notes.length');
run('sendLove()');
assert.equal(run('state.notes.length'), before + 1);
assert.match(run('state.notes[0].text'), /sent you a little love/);
run("state.goals.push({id:'private-test',title:'PRIVATE_GOAL_SECRET',level:'Private'})");
run("nudge('private-test')");
assert.equal(run('state.notes.length'), before + 1, 'private goals must never be sent as nudges');
assert.doesNotMatch(run('JSON.stringify(sharedCommonProjection())'), /PRIVATE_GOAL_SECRET/);
run("state.goals.push({id:'shared-test',title:'Read together',level:'Visible',value:0,target:3});nudge('shared-test')");
assert.equal(run('state.notes.length'), before + 2);
assert.match(run('state.notes[0].text'), /Read together/);
const ids = run('Array.from({length:100},()=>newEntityId())');
assert.equal(new Set(ids).size, 100, 'shared entries require distinct IDs');
run("state.goals=[{id:'uuid-goal',title:'A \\\"quoted\\\" goal',level:'Visible',value:0,target:3}];renderGoals();bumpGoal('uuid-goal',1)");
assert.equal(run('state.goals[0].value'), 1, 'new string IDs remain editable');
assert.match(element('goalList').innerHTML, /&quot;uuid-goal&quot;/);
assert.equal(run('getCycleModel()'), null, 'empty Cycle tracker must render safely');
run("state.cycle={lastPeriod:'2026-10-01',cycleLength:28,periodLength:5,note:'CYCLE_PRIVATE_SECRET',showHome:false}");
assert.equal(run("getCycleModel(new Date('2026-10-14T12:00:00Z')).day"), 14);
assert.equal(run("isoDate(getCycleModel(new Date('2026-10-14T12:00:00Z')).nextPeriod)"), '2026-10-29');
assert.equal(run("getCycleModel(new Date('2026-09-30T12:00:00Z'))"), null);
run('renderCycle();renderHome()');
assert.doesNotMatch(run('JSON.stringify(sharedCommonProjection())'), /CYCLE_PRIVATE_SECRET/);
assert.equal(element('homeCycle').textContent, 'Private tracker');
run("state.cycle.lastPeriod='2026-02-30'");
assert.equal(run('getCycleModel()'), null, 'invalid stored dates must not break rendering');
console.log('APP_UI_TEST_OK (all bundled scripts, course panels, actual shared actions and private goals)');
