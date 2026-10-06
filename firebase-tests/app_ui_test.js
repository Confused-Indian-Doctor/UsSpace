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
    textContent: '', innerHTML: '', value: '', checked: false, disabled: false, style: {}, dataset: {},
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    click() { if (!this.disabled) this.onclick?.(); },
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
// Keep the real parent hierarchy: a child is invisible when an ancestor is hidden.
// Bind actual HTML event attributes instead of copied test handlers.
const domStack = [];
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
for (const match of html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>|<(\/?)([a-z][\w:-]*)\b([^>]*)>/gi)) {
  if (!match[2]) continue;
  const tag = match[2].toLowerCase();
  if (match[1]) {
    const open = domStack.findLastIndex(node => node.tag === tag);
    if (open >= 0) domStack.length = open;
    continue;
  }
  const id = match[3].match(/\bid="([^"]+)"/)?.[1];
  const target = id ? element(id) : {style: {}};
  target.parentElement = domStack.at(-1)?.target || null;
  for (const attribute of match[3].matchAll(/([^\s=/>]+)="([^"]*)"/g)) {
    if (!id) continue;
    target.setAttribute(attribute[1], attribute[2]);
    if (attribute[1] === 'style') {
      for (const declaration of attribute[2].split(';')) {
        const [name, value] = declaration.split(':');
        if (name && value) target.style[name.trim()] = value.trim();
      }
    }
  }
  const onclick = id && target.getAttribute('onclick');
  if (onclick) target.onclick = () => vm.runInContext(onclick, context, {filename: `onclick:${id}`});
  if (!voidTags.has(tag) && !match[3].endsWith('/')) domStack.push({tag, target});
}
function visible(target) {
  for (let node = target; node; node = node.parentElement) if (node.style.display === 'none') return false;
  return true;
}
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const source = match[1].match(/\bsrc="([^"]+)"/)?.[1];
  const script = source ? fs.readFileSync(path.join(assets, source), 'utf8') : match[2];
  vm.runInContext(script, context, {filename: source || 'index.html'});
}
const run = source => vm.runInContext(source, context);
let signInCalls = 0;
context.UsAuth = {
  status: () => JSON.stringify({signedIn: false, signingIn: false, authState: 'signed_out', error: ''}),
  signIn() { signInCalls++; },
};
run('initCloudSync()');
const signInButton = elements.get('googleSignInBtn');
assert.ok(signInButton?.onclick, 'sign-in button must bind its production click handler');
assert.equal(signInButton.getAttribute('type'), 'button');
assert.equal(element('signInStatus').getAttribute('role'), 'status');
assert.equal(element('syncError').getAttribute('role'), 'alert');
assert.equal(signInButton.disabled, false);
signInButton.click();
assert.equal(signInCalls, 1, 'actual button launches the native Google account chooser');
assert.equal(signInButton.disabled, true);
assert.equal(signInButton.getAttribute('aria-busy'), 'true');
assert.match(signInButton.textContent, /Opening Google Sign-In/);
assert.match(element('signInStatus').textContent, /account chooser/);
assert.equal(element('syncSignedOut').style.display, 'block');
signInButton.click();
signInButton.onclick();
assert.equal(signInCalls, 1, 'disabled button and handler both guard duplicate launches');
run("onUsSyncState({signedIn:false,paired:false,state:'local'})");
assert.equal(signInButton.disabled, true, 'Firestore status must not clear an active auth request');
context.signInFailure = 'Add a Google account in Android Settings, then try again.';
run("onUsAuthState({signedIn:false,signingIn:false,authState:'signed_out',error:signInFailure})");
assert.equal(signInButton.disabled, false);
assert.equal(signInButton.getAttribute('aria-busy'), 'false');
assert.equal(element('syncError').textContent, context.signInFailure);
assert.match(signInButton.textContent, /Try Google Sign-In again/);
signInButton.click();
assert.equal(signInCalls, 2, 'credential failure permits another attempt');
assert.equal(element('syncError').textContent, '');
assert.equal(signInButton.disabled, true);
run("onUsAuthState({signedIn:true,signingIn:false,authState:'signed_in',uid:'test-user',name:'Test Person',email:'test@example.com',error:''})");
assert.equal(signInButton.disabled, false);
assert.equal(element('syncSignedOut').style.display, 'none');
assert.equal(element('syncSignedIn').style.display, 'block');
assert.equal(element('syncUnpaired').style.display, 'block');
assert.match(element('syncAccount').textContent, /test@example.com/);
signInButton.onclick();
assert.equal(signInCalls, 2, 'signed-in account cannot start another chooser');
run("state.sync.state='live';onUsAuthState({signedIn:true,signingIn:false,authState:'signed_in',error:''})");
assert.equal(run('state.sync.state'), 'live', 'auth publication preserves Firestore live/offline state');
run("onUsAuthState({signedIn:false,signingIn:false,authState:'signed_out',error:''})");
context.UsAuth.signIn = () => { signInCalls++; throw new Error('native launch failure'); };
signInButton.click();
assert.equal(signInCalls, 3);
assert.equal(signInButton.disabled, false, 'synchronous bridge failure permits retry');
assert.match(element('syncError').textContent, /Close and reopen UsSpace/);
assert.match(signInButton.textContent, /Try Google Sign-In again/);
delete context.UsAuth;
signInButton.click();
assert.equal(signInButton.disabled, false);
assert.match(element('syncError').textContent, /Install the latest APK/);
context.UsAuth = {};
signInButton.click();
assert.equal(signInButton.disabled, false, 'missing native method must not leave a busy button');
assert.match(element('syncError').textContent, /Install the latest APK/);
context.UsAuth = {
  status: () => JSON.stringify({signedIn: false, signingIn: true, authState: 'signing_in', error: ''}),
  signIn() { signInCalls++; },
};
run('initCloudSync()');
assert.equal(signInButton.disabled, true, 'restored page reflects an active native chooser');
run("onUsAuthState({signedIn:false,signingIn:false,authState:'signed_out',error:''})");
assert.equal(signInButton.disabled, false);
console.log('GOOGLE_SIGNIN_UI_TEST_OK (actual onclick, progress, duplicate guard, actionable failure, retry and account controls)');
run("onUsAuthState({signedIn:true,signingIn:false,uid:'creator-user',name:'Creator',error:''})");
context.inviteExpires = Date.now() + 14 * 60 * 1000;
run("onUsSyncState({signedIn:true,paired:true,coupleId:'creator-space',memberCount:1,awaitingPartner:true,isCreator:true,pairCode:'654321',pairCodeExpiresAt:inviteExpires,state:'live',newSpace:true,justPaired:true})");
assert.equal(element('syncUnpaired').style.display, 'none');
assert.equal(visible(element('createdCodeBox')), true, 'creator code must be visible despite paired=true');
assert.equal(element('createdPairCode').textContent, '654321');
assert.match(element('pairCodeHelp').textContent, /generated code/);
assert.match(element('pairInviteStatus').textContent, /own Google account/);
assert.equal(element('syncBadge').textContent, 'Waiting for partner', 'one member must not claim two-phone realtime');
assert.equal(element('syncPairStatus').textContent, 'Waiting for your partner');
assert.equal(JSON.parse(entries.get('usspace_v01')).sync.invitation.code, '654321');
assert.equal(JSON.parse(entries.get('usspace_v01')).sync.invitation.expiresAt, context.inviteExpires);
run('state=JSON.parse(localStorage.getItem(K));renderSync()');
assert.equal(visible(element('createdCodeBox')), true, 'valid scoped invitation survives page restoration');
let newCodeCalls = 0;
context.UsSync = {createPair() { newCodeCalls++; }};
element('newPairCodeBtn').click();
assert.equal(newCodeCalls, 1, 'creator can request another invitation through the actual button');
element('newPairCodeBtn').onclick();
assert.equal(newCodeCalls, 1, 'pending invitation guard blocks duplicate launches');
assert.equal(element('createdPairCode').textContent, '654321', 'old invitation stays visible while replacement is pending');
assert.equal(element('newPairCodeBtn').disabled, true);
run("onUsSyncState({signedIn:true,paired:true,coupleId:'creator-space',memberCount:1,isCreator:true,pairCode:'987654',pairCodeExpiresAt:inviteExpires,state:'live'})");
assert.equal(element('createdPairCode').textContent, '987654');
context.UsSync.createPair = () => { throw new Error('native pairing launch failure'); };
element('newPairCodeBtn').click();
assert.equal(run('state.sync.state'), 'live', 'bridge failure restores prior sync phase');
assert.equal(element('newPairCodeBtn').disabled, false, 'failed invitation launch must permit retry');
assert.equal(element('createPairBtn').disabled, false);
assert.match(element('syncError').textContent, /Close and reopen UsSpace/);
context.UsSync.createPair = () => { newCodeCalls++; };
element('newPairCodeBtn').click();
assert.equal(newCodeCalls, 2, 'invitation retry launches after synchronous failure');
assert.equal(element('newPairCodeBtn').disabled, true);
run("onUsSyncState({signedIn:true,paired:true,coupleId:'creator-space',memberCount:1,isCreator:true,pairCode:'987654',pairCodeExpiresAt:inviteExpires,state:'live',error:''})");
delete context.UsSync;
element('newPairCodeBtn').click();
assert.equal(element('newPairCodeBtn').disabled, false, 'missing pairing bridge cannot leave the button busy');
assert.match(element('syncError').textContent, /Install the latest APK/);
context.UsSync = {};
element('newPairCodeBtn').click();
assert.equal(element('newPairCodeBtn').disabled, false, 'missing native method permits retry');
assert.match(element('syncError').textContent, /Install the latest APK/);

context.sharedForTest = JSON.parse(run('JSON.stringify(sharedCommonProjection())'));
run("state.partnerRemote={name:'Former partner'};onUsSyncState({signedIn:true,paired:true,coupleId:'creator-space',memberCount:1,isCreator:true,state:'live',error:''})");
assert.equal(run('state.partnerRemote'), null, 'authoritative one-member state clears stale partner cache');
run("onUsSharedSnapshot({coupleId:'creator-space',ready:true,exists:true,fromCache:false,common:sharedForTest,profiles:{'creator-user':{name:'Creator'},'former-partner':{name:'Former partner'}}})");
assert.equal(visible(element('createdCodeBox')), true, 'stale former-partner profile cannot hide a new one-member invitation');
assert.equal(element('createdPairCode').textContent, '987654');
assert.equal(element('syncBadge').textContent, 'Waiting for partner');
assert.equal(run('state.partnerRemote'), null, 'one-member rooms ignore leftover partner profiles');
run('state.sync.memberCount=0');
run("onUsSharedSnapshot({coupleId:'creator-space',ready:true,exists:true,fromCache:false,common:sharedForTest,profiles:{'creator-user':{name:'Creator'},'partner-user':{name:'Partner'}}})");
assert.equal(visible(element('createdCodeBox')), false, 'actual partner profile clears the invitation');
assert.equal(run('state.sync.invitation'), undefined);
run("onUsSyncState({signedIn:true,paired:true,coupleId:'creator-space',memberCount:2,awaitingPartner:false,isCreator:true,state:'live'})");
assert.equal(visible(element('newCodeBox')), false);
assert.equal(element('syncPairStatus').textContent, 'Connected to our UsSpace ✓');
assert.equal(element('syncBadge').textContent, 'Realtime', 'two joined members and live data may show realtime');
run("onUsSyncState({signedIn:true,paired:false,coupleId:'',memberCount:0})");
run("onUsSyncState({signedIn:true,paired:true,coupleId:'expiry-space',memberCount:1,isCreator:true,pairCode:'456789',pairCodeExpiresAt:inviteExpires,state:'live'})");
run('state.sync.invitation.expiresAt=Date.now()-1;renderSync()');
assert.equal(visible(element('createdCodeBox')), false, 'expired invitation cannot remain visible');
assert.equal(element('createdPairCode').textContent, '------');
assert.equal(run('state.sync.invitation'), undefined);
assert.match(element('pairInviteStatus').textContent, /expired/);
run("onUsSyncState({signedIn:true,paired:true,coupleId:'expiry-space',memberCount:1,isCreator:true,pairCode:'111222',pairCodeExpiresAt:inviteExpires,state:'live'})");
run("onUsAuthState({signedIn:true,signingIn:false,uid:'another-user',error:''})");
assert.equal(visible(element('createdCodeBox')), false, 'invitation cannot leak across account switches');
assert.equal(run('state.sync.invitation'), undefined);
run("onUsSyncState({signedIn:true,paired:true,coupleId:'disconnect-space',memberCount:1,isCreator:true,pairCode:'333444',pairCodeExpiresAt:inviteExpires,state:'live'})");
assert.equal(visible(element('createdCodeBox')), true);
run("onUsSyncState({signedIn:true,paired:false,coupleId:'',memberCount:0})");
assert.equal(visible(element('createdCodeBox')), false, 'disconnect clears the invitation');
assert.equal(run('state.sync.invitation'), undefined);
run("onUsAuthState({signedIn:false,signingIn:false,error:''})");
delete context.UsSync;
console.log('PAIRING_INVITATION_UI_TEST_OK (visible generated code, one-member status, persistence, regeneration, joined partner, expiry and account scope)');
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
