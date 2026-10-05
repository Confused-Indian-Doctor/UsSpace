const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the shipped app's initialization and projections, not a copied function.
const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'embedded app script missing');
new vm.Script(script); // Check all embedded JavaScript syntax without a browser.
const initializationEnd = script.indexOf('const NAV_GROUP=');
assert.ok(initializationEnd > 0, 'app initialization boundary missing');
const context = vm.createContext({localStorage: {getItem: () => null}});
vm.runInContext(script.slice(0, initializationEnd), context);
assert.equal(vm.runInContext('state.health.share', context), false);
assert.equal(vm.runInContext('state.cycle.showHome', context), false);

context.fixture = {
  settings: {you: 'Me', status: 'Available', visit: '2026-10-20'},
  life: {watchTitle: 'Shared show'}, duties: [{id: 1}],
  goals: [{id: 1, level: 'Private'}, {id: 2, level: 'Visible'}],
  notes: [{id: 3}], memories: [{id: 4}], checkins: [{id: 5}],
  learn: {progress: {al: {xp: 2}}},
  health: {lastSync: 'HEALTH_SECRET'},
  healthHistory: [{steps: 123, note: 'HEALTH_HISTORY_SECRET'}],
  cycle: {lastPeriod: 'CYCLE_SECRET'}
};
vm.runInContext('state = fixture', context);
const project = expression => JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
const common = project('sharedCommonProjection()');
const profile = project('myProfileProjection()');
for (const payload of [common, profile]) {
  for (const forbidden of ['health', 'healthHistory', 'cycle']) {
    assert.equal(Object.hasOwn(payload, forbidden), false, `privacy leak: ${forbidden}`);
  }
  assert.doesNotMatch(JSON.stringify(payload), /HEALTH_SECRET|HEALTH_HISTORY_SECRET|CYCLE_SECRET/);
}
assert.deepEqual(common.goals, [{id: 2, level: 'Visible'}]);
assert.deepEqual(common.learn.progress, {al: {xp: 2}});
assert.equal(common.visit, '2026-10-20');
assert.equal(profile.life.watchTitle, 'Shared show');
assert.deepEqual(profile.checkins, [{id: 5}]);
context.fixture.checkins = Array.from({length: 35}, (_, id) => ({id}));
assert.equal(project('myProfileProjection()').checkins.length, 30);
console.log('PRIVACY_PAYLOAD_TEST_OK (shipped app projections and private defaults)');
