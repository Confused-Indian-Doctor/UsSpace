/* Private, offline comfort. No mood, text, contact or read event enters the sync bridge. */
(function (root) {
  'use strict';
  const PHRASES = Object.freeze({
    sad: Object.freeze([
      'Hey love, you don’t have to be okay all the time.',
      'If I were there, I’d just hold you quietly.',
      'This day is heavy, but it won’t stay this heavy forever.',
      'Rest first; we can figure the rest out later.',
      'You are still deeply loved on your low days.',
      'You don’t need to explain everything right now. I’m here.',
      'Be gentle with yourself today, please.',
      'You’re allowed to have a difficult day without calling it a bad life.'
    ]),
    anxious: Object.freeze([
      'Breathe with me — slow in, hold, slow out.',
      'Nothing has to be solved all at once.',
      'You are safe in this moment.',
      'What is one tiny next step?',
      'Your fear is loud right now, but it is not your future.',
      'Let’s make the world smaller for a minute — just you, this room, this breath.',
      'You don’t have to believe every scary thought your mind gives you.',
      'One thing at a time, okay? I’m with you.'
    ]),
    miss: Object.freeze([
      'Different places, same sky, still us.',
      'Missing me means our love is real.',
      'I’m far away, not far from your heart.',
      'We are still walking toward the same future.',
      'One day this distance will just be part of our story.',
      'You’re still part of my ordinary day even when you’re miles away.',
      'We are not paused just because we are apart.',
      'Soon there’ll be another hello instead of another goodbye.'
    ]),
    overwhelmed: Object.freeze([
      'Pause, love. You do not need to do everything right now.',
      'Drink some water, loosen your shoulders, unclench your jaw.',
      'Pick one small thing; the rest can wait.',
      'You are not failing — you are overloaded.',
      'We will sort life out step by step.',
      'Today does not need to be productive to still count.',
      'You can put some of this down.',
      'Do the next kind thing for yourself, not the entire to-do list.'
    ]),
    sleep: Object.freeze([
      'No pressure to sleep yet; just rest.',
      'Put the whole world down for tonight.',
      'Imagine me beside you telling you it’s okay.',
      'You’ve done enough for today.',
      'Let your body soften; I’m with you.',
      'Nothing important needs to be solved at 2 a.m.',
      'Close your eyes. Tomorrow can wait.',
      'Just rest with me for a while, even if sleep takes time.'
    ]),
    reassurance: Object.freeze([
      'I choose you on hard days and easy days.',
      'You never have to earn my care.',
      'I am proud of the person you are.',
      'You matter to me more than you know.',
      'Inshallah, this difficult feeling will pass too.',
      'You are loved even when you are tired, messy, unsure, or quiet.',
      'You don’t have to be perfect to be deeply loved by me.',
      'Still you. Still me. Still us.'
    ])
  });
  const MOODS = Object.freeze([
    ['sad', 'Sad'], ['anxious', 'Anxious'], ['miss', 'Missing you'],
    ['overwhelmed', 'Overwhelmed'], ['sleep', 'Can’t sleep'], ['reassurance', 'Need reassurance']
  ]);
  const REMINDERS = Object.freeze([
    'If you’re safe right now, you can pause here.', 'One thing at a time.',
    'I am proud of you.', 'You are loved.', 'This feeling will pass.',
    'You do not have to solve everything tonight.'
  ]);
  const GROUNDING = Object.freeze([
    ['5', 'things you can see', 'Look around slowly. A colour, a shape, the light on a wall.'],
    ['4', 'things you can feel', 'Your feet on the floor, your sleeve, the chair supporting you.'],
    ['3', 'things you can hear', 'A nearby sound, a distant sound, even a quiet hum.'],
    ['2', 'things you can smell', 'Notice what is already around you. It’s okay to skip a sense.'],
    ['1', 'thing you can taste', 'Notice a taste, or take a small sip of water if you want.']
  ]);
  const COUNTRIES = Object.freeze({
    other: {name: 'Choose your country', emergency: '', crisis: '', label: ''},
    india: {name: 'India', emergency: '112', crisis: '14416', label: 'Tele-MANAS · 14416'},
    us: {name: 'United States', emergency: '911', crisis: '988', label: 'Suicide & Crisis Lifeline · 988'},
    uk: {name: 'United Kingdom', emergency: '999', crisis: '116123', label: 'Samaritans · 116 123'},
    australia: {name: 'Australia', emergency: '000', crisis: '131114', label: 'Lifeline · 13 11 14'}
  });
  function normalisePhone(value) {
    const text = String(value || '').trim();
    if (!text || !/^\+?[\d\s().-]+$/.test(text)) return '';
    const cleaned = text.replace(/[\s().-]/g, '');
    return /^\+?\d{3,18}$/.test(cleaned) ? cleaned : '';
  }
  function isRisk(text) {
    const value = String(text || '').slice(0, 1200).toLowerCase().replace(/[’‘]/g, "'");
    // Remove clear denials only. Ambiguous danger still opens the safety screen.
    const checked = value
      .replace(/\b(?:i am|i'm|im|i feel|i'm feeling|i am feeling) (?:not|never) (?:suicidal|unsafe|in danger)\b/g, '')
      .replace(/\bi (?:do not|don't|dont) (?:want|plan|intend) to (?:kill|hurt|harm) myself\b/g, '')
      .replace(/\bi (?:do not|don't|dont) want to (?:die|end my life)\b/g, '');
    return /\b(?:suicid\w*|self[ -]?harm\w*|unsafe|in (?:immediate )?danger)\b/.test(checked)
      || /\b(?:don'?t|do not|cannot|can't|not) feel safe\b/.test(checked)
      || /\b(?:i am|i'm|im|we are|we're) not safe\b/.test(checked)
      || /\b(?:kill(?:ing)?|hurt(?:ing)?|harm(?:ing)?|cut(?:ting)?|injur(?:e|ing)|shoot(?:ing)?|hang(?:ing)?|burn(?:ing)?|poison(?:ing)?) myself\b/.test(checked)
      || /\b(?:end(?:ing)?|tak(?:e|ing)) (?:my (?:own )?life|it all)\b/.test(checked)
      || /\b(?:want|wanna|wish|going|plan|ready|need) to die\b/.test(checked)
      || /\bi (?:do not|don't|dont|no longer) want to (?:live|be alive|be here anymore)\b/.test(checked)
      || /\bi (?:might|may|will|could) do something to myself\b/.test(checked)
      || /\b(?:can't|cannot|can not) (?:keep myself|stay) safe\b/.test(checked)
      || /\b(?:wish|rather) (?:i (?:was|were)|to be) dead\b/.test(checked)
      || /\b(?:might|may|will|gonna|want to|going to|plan to) (?:take (?:an? )?overdose|overdose)\b/.test(checked)
      || /\b(?:someone|he|she|they|my partner) (?:is|are|keeps?) (?:hurting|threatening|hitting|attacking) me\b/.test(checked)
      || /\bi (?:have|just|already) (?:taken (?:an? )?overdose|overdosed)\b/.test(checked);
  }
  function displayPhrase(phrase) {
    // A saved affectionate phrase cannot establish that a person's surroundings are safe.
    return phrase === 'You are safe in this moment.'
      ? 'If you’re somewhere safe, let yourself pause in this moment.' : phrase;
  }
  class PhraseDeck {
    constructor(history, random) { this.history = history || {}; this.random = random || Math.random; }
    draw(category, bank) {
      if (!Array.isArray(bank) || !bank.length) return '';
      const saved = this.history[category] || {};
      const last = Number.isInteger(saved.last) && saved.last >= 0 && saved.last < bank.length ? saved.last : -1;
      let remaining = Array.isArray(saved.remaining) ? [...new Set(saved.remaining)].filter(i => Number.isInteger(i) && i >= 0 && i < bank.length && i !== last) : [];
      if (!remaining.length) {
        remaining = bank.map((_, i) => i);
        for (let i = remaining.length - 1; i > 0; i--) {
          const raw = Number(this.random());
          const r = Number.isFinite(raw) ? Math.min(.999999, Math.max(0, raw)) : 0;
          const j = Math.floor(r * (i + 1));
          [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }
        if (remaining[0] === last && remaining.length > 1) [remaining[0], remaining[1]] = [remaining[1], remaining[0]];
      }
      const index = remaining.shift();
      this.history[category] = {last: index, remaining};
      return bank[index];
    }
  }
  function createSession(options) {
    const opts = options || {}, storage = opts.storage;
    const schedule = opts.setTimeout || setTimeout, cancel = opts.clearTimeout || clearTimeout;
    let scope = '', key = '', prefs, deck, timer = null, generation = 0;
    let state;
    const notify = () => { if (typeof opts.onChange === 'function') opts.onChange(); };
    const defaults = () => ({contacts: {alPhone: '', trustedName: '', trustedPhone: ''}, country: 'other', history: {}});
    const persist = () => { try { storage?.setItem(key, JSON.stringify(prefs)); } catch (_) {} };
    function halt() {
      generation++;
      if (timer !== null) cancel(timer);
      timer = null;
      if (state) { state.breathing = false; state.breathPhase = ''; state.breathRound = 0; }
    }
    function setScope(value, announce) {
      const uid = String(value?.uid || '').slice(0, 160), couple = String(value?.coupleId || '').slice(0, 160);
      const next = JSON.stringify([uid, couple]);
      if (next === scope) return false;
      halt(); scope = next;
      key = 'usspace.comfort.v1.' + (uid ? 'account:' + encodeURIComponent(uid) : 'local-only');
      prefs = defaults();
      try {
        const loaded = JSON.parse(storage?.getItem(key) || 'null');
        if (loaded && typeof loaded === 'object') {
          prefs.contacts = {
            alPhone: normalisePhone(loaded.contacts?.alPhone),
            trustedName: String(loaded.contacts?.trustedName || '').slice(0, 80),
            trustedPhone: normalisePhone(loaded.contacts?.trustedPhone)
          };
          if (Object.hasOwn(COUNTRIES, loaded.country)) prefs.country = loaded.country;
          if (loaded.history && typeof loaded.history === 'object') {
            for (const name of [...Object.keys(PHRASES), 'reminder']) {
              const h = loaded.history[name];
              if (h && typeof h === 'object') prefs.history[name] = {last: h.last, remaining: Array.isArray(h.remaining) ? h.remaining.slice(0, 8) : []};
            }
          }
        }
      } catch (_) {}
      deck = new PhraseDeck(prefs.history, opts.random);
      state = {mood: '', phrase: '', mode: 'comfort', reminder: '', unsafe: false, privateText: '', breathing: false, breathPhase: '', breathRound: 0, groundStep: 0, contactsOpen: false, contactError: '', notice: ''};
      if (announce !== false) notify();
      return true;
    }
    function snapshot() { return {...state, contacts: {...prefs.contacts}, country: prefs.country}; }
    function setMood(mood) {
      if (state.unsafe || !Object.hasOwn(PHRASES, mood)) return false;
      halt(); state.mood = mood; state.mode = 'comfort';
      state.phrase = displayPhrase(deck.draw(mood, PHRASES[mood])); persist(); notify(); return true;
    }
    function setMode(mode) {
      if (state.unsafe || !['comfort', 'ground', 'remind', 'voice'].includes(mode)) return false;
      halt(); state.mode = mode;
      if (mode === 'remind' && !state.reminder) { state.reminder = deck.draw('reminder', REMINDERS); persist(); }
      notify(); return true;
    }
    function unsafe() { halt(); state.unsafe = true; state.privateText = ''; state.notice = ''; notify(); }
    function text(value) {
      if (state.unsafe) return;
      state.privateText = String(value || '').slice(0, 1000);
      if (isRisk(state.privateText)) unsafe();
    }
    function safeAgain() { halt(); state.unsafe = false; state.privateText = ''; state.mood = ''; state.phrase = ''; state.mode = 'comfort'; notify(); }
    function another() { if (!state.unsafe && state.mood) return setMood(state.mood); return false; }
    function reminder() { if (state.unsafe) return false; state.reminder = deck.draw('reminder', REMINDERS); persist(); notify(); return true; }
    function startBreathing() {
      if (state.unsafe || state.mode !== 'ground') return false;
      halt(); const token = generation;
      state.breathing = true;
      function phase(index) {
        if (token !== generation || state.unsafe || !state.breathing) return;
        if (index >= 8) { halt(); state.notice = 'A few quiet breaths, just for you. You can rest here or try again.'; notify(); return; }
        state.breathPhase = index % 2 === 0 ? 'in' : 'out'; state.breathRound = Math.floor(index / 2) + 1; notify();
        timer = schedule(() => phase(index + 1), index % 2 === 0 ? 4000 : 6000);
      }
      phase(0); return true;
    }
    function stop() { const was = state?.breathing; halt(); if (was) notify(); }
    function step(direction) { if (state.unsafe) return; state.groundStep = Math.max(0, Math.min(4, state.groundStep + direction)); notify(); }
    function setCountry(country) { if (!Object.hasOwn(COUNTRIES, country)) return false; prefs.country = country; persist(); notify(); return true; }
    function saveContacts(values) {
      const input = values || {}, alPhone = normalisePhone(input.alPhone), trustedPhone = normalisePhone(input.trustedPhone);
      if ((String(input.alPhone || '').trim() && !alPhone) || (String(input.trustedPhone || '').trim() && !trustedPhone)) {
        state.contactError = 'Use a phone number with its country code, like +91… or +1…. No link is saved.'; notify(); return false;
      }
      prefs.contacts = {alPhone, trustedPhone, trustedName: String(input.trustedName || '').trim().slice(0, 80)};
      state.contactError = ''; state.contactsOpen = false; state.notice = 'Contacts saved on this phone only.'; persist(); notify(); return true;
    }
    function toggleContacts() { state.contactsOpen = !state.contactsOpen; state.contactError = ''; notify(); }
    function contact(kind) {
      const phone = kind === 'al' ? prefs.contacts.alPhone : prefs.contacts.trustedPhone;
      if (phone) { opts.openLink?.('tel:' + phone); return true; }
      if (kind === 'al') { opts.messageAl?.(); return true; }
      state.contactsOpen = true; state.notice = 'Add a trusted person’s phone number below, or contact them directly.'; notify(); return false;
    }
    function emergency(kind) {
      const number = COUNTRIES[prefs.country]?.[kind];
      if (!number) { opts.openLink?.('https://findahelpline.com/'); return; }
      opts.openLink?.('tel:' + number);
    }
    function message() { opts.messageAl?.(state.unsafe ? undefined : state.mood || undefined); }
    function memory() { if (!state.unsafe) opts.memory?.(); }
    setScope({}, false);
    return {setScope, snapshot, setMood, setMode, unsafe, text, safeAgain, another, reminder, startBreathing, stop, step, setCountry, saveContacts, toggleContacts, contact, emergency, message, memory};
  }
  const core = {PHRASES, MOODS, REMINDERS, GROUNDING, COUNTRIES, PhraseDeck, isRisk, normalisePhone, displayPhrase, createSession};
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (!root || !root.document) return;
  const doc = root.document;
  let container = null, initialized = false, session = null;
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  function link(url) {
    if (root.UsExtras?.openLink) root.UsExtras.openLink(url);
    else if (/^(?:tel:|sms:|https:\/\/)/.test(url)) root.location.href = url;
  }
  function button(id, label, classes, extra) { return '<button type="button" id="' + id + '" class="btn ' + (classes || '') + '" ' + (extra || '') + '>' + label + '</button>'; }
  function bind(id, handler, event) { const el = doc.getElementById(id); if (el) el[event || 'onclick'] = handler; }
  function contacts(s) {
    return '<details class="comfort-contact-settings"' + (s.contactsOpen ? ' open' : '') + '><summary id="comfortContactToggle">Local contact settings</summary><div class="small">Saved on this phone for this account. Never shared with your partner.</div>'
      + '<label class="label" for="comfortAlPhone">Al’s phone number</label><input id="comfortAlPhone" class="field" type="tel" autocomplete="off" maxlength="30" value="' + esc(s.contacts.alPhone) + '" placeholder="Include country code">'
      + '<label class="label" for="comfortTrustedName">Trusted person’s name</label><input id="comfortTrustedName" class="field" autocomplete="off" maxlength="80" value="' + esc(s.contacts.trustedName) + '">'
      + '<label class="label" for="comfortTrustedPhone">Trusted person’s phone number</label><input id="comfortTrustedPhone" class="field" type="tel" autocomplete="off" maxlength="30" value="' + esc(s.contacts.trustedPhone) + '" placeholder="Include country code">'
      + (s.contactError ? '<p class="comfort-error" role="alert">' + esc(s.contactError) + '</p>' : '')
      + button('comfortSaveContacts', 'Save contacts on this phone', 'soft full') + '</details>';
  }
  function renderSafety(s) {
    const c = COUNTRIES[s.country];
    return '<div class="comfort-safety" role="region" aria-labelledby="comfortSafetyTitle"><p class="eyebrow">Real support, right now</p><h2 id="comfortSafetyTitle" tabindex="-1">Your safety comes first</h2>'
      + '<p>If you might hurt yourself, someone is hurting you, or you’re in immediate danger, call your local emergency number now or go to the nearest emergency department.</p>'
      + '<p>If you can, move away from anything you could use to hurt yourself and get close to a trusted person. You do not have to face this alone.</p>'
      + '<div class="comfort-safety-actions">' + button('comfortContactAl', 'Contact Al', 'primary full')
      + button('comfortContactTrusted', s.contacts.trustedName ? 'Contact ' + esc(s.contacts.trustedName) : 'Contact a trusted person', 'full') + '</div>'
      + '<p class="small">These buttons open a call or message screen. Nothing is sent automatically; no one has been notified.</p>'
      + '<label class="label" for="comfortCountry">Crisis and emergency help in</label><select id="comfortCountry" class="field">'
      + Object.entries(COUNTRIES).map(([id, value]) => '<option value="' + id + '"' + (id === s.country ? ' selected' : '') + '>' + value.name + '</option>').join('') + '</select>'
      + (c.emergency ? button('comfortEmergency', 'Call emergency services · ' + c.emergency, 'comfort-emergency full') : '<p class="small">If you’re in immediate danger, use your local emergency number. Choose your country above for listed numbers.</p>')
      + (c.crisis ? button('comfortCrisis', 'Call ' + c.label, 'full') : '')
      + button('comfortHelplines', 'Find local crisis support', 'soft full')
      + '<p class="small">Find A Helpline lists support in many countries. UsSpace cannot monitor your safety or replace real support.</p>'
      + contacts(s) + button('comfortSafeAgain', 'I’m somewhere safe now · return', 'full') + '</div>';
  }
  function renderGround(s) {
    const ground = GROUNDING[s.groundStep];
    return '<div class="card comfort-ground"><h3>Ground me</h3><p class="sub">Let your breath stay comfortable. Pause or skip anything that doesn’t feel right.</p>'
      + '<div class="comfort-breath ' + (s.breathing ? 'is-' + s.breathPhase : '') + '" aria-hidden="true"><span>just<br>this breath</span></div>'
      + '<p id="comfortBreathStatus" class="comfort-breath-status" role="status" aria-live="polite">' + (s.breathing ? (s.breathPhase === 'in' ? 'Breathe in gently' : 'Slowly breathe out') + ' · ' + s.breathRound + ' of 4' : 'Unclench your jaw. Let your shoulders drop.') + '</p>'
      + button('comfortBreathToggle', s.breathing ? 'Pause breathing' : 'Start slow breathing', 'soft full')
      + '<p class="small">An optional four gentle rounds: in for about 4 seconds, out for about 6. Your own pace is okay.</p>'
      + '<div class="comfort-senses"><div class="comfort-sense-number">' + ground[0] + '</div><h4>' + ground[1] + '</h4><p>' + ground[2] + '</p><div class="row between">'
      + button('comfortPreviousSense', '← Previous', '', s.groundStep === 0 ? 'disabled' : '')
      + '<span class="small">' + (s.groundStep + 1) + ' of 5</span>'
      + button('comfortNextSense', s.groundStep === 4 ? 'Start again' : 'Next →', 'soft') + '</div></div></div>';
  }
  function renderNormal(s) {
    const modes = [['comfort', 'Comfort'], ['ground', 'Ground'], ['remind', 'Remind'], ['voice', 'Hear my voice']];
    let panel;
    if (s.mode === 'ground') panel = renderGround(s);
    else if (s.mode === 'voice') panel = '<div class="card comfort-voice"><h3>Hear my voice</h3><div class="comfort-voice-symbol" aria-hidden="true">♫</div><p><b>No recording has been added yet.</b></p><p class="sub">When a real voice note is available, it belongs here. For now, you can read a little comfort or reach out to Al.</p>' + button('comfortVoiceMessage', 'Message Al', 'soft full') + '</div>';
    else if (s.mode === 'remind') panel = '<div class="card comfort-reminder"><p class="eyebrow">A little reminder</p><p class="comfort-quote" role="status" aria-live="polite">' + esc(s.reminder) + '</p>' + button('comfortAnotherReminder', 'Another little reminder', 'soft full') + '</div>';
    else panel = '<div class="card comfort-from"><p class="eyebrow">From Al ❤️</p><p class="comfort-quote" role="status" aria-live="polite">' + esc(s.phrase || 'Come sit with me for a minute. Choose what you need — there’s no rush.') + '</p>'
      + '<div class="small">Saved words to come back to. Al isn’t being notified or replying live here.</div>'
      + (s.mood ? button('comfortAnotherPhrase', 'Another little word', 'soft full') : '') + '</div>';
    return '<div class="comfort-hero"><p class="eyebrow">From Al · just for you</p><h2>Need Me?</h2><p>A little space from Al, whenever you need it.</p><span class="comfort-private">Private on this phone</span></div>'
      + '<div class="comfort-moods" role="group" aria-label="What do you need right now?">' + MOODS.map(([id, label]) => button('comfortMood-' + id, label, 'comfort-chip' + (id === s.mood ? ' selected' : ''), 'aria-pressed="' + (id === s.mood) + '"')).join('') + '</div>'
      + '<div class="comfort-modes" role="group" aria-label="Support mode">' + modes.map(([id, label]) => button('comfortMode-' + id, label, 'comfort-mode' + (id === s.mode ? ' selected' : ''), 'aria-pressed="' + (id === s.mode) + '"')).join('') + '</div>'
      + panel + '<div class="comfort-actions">' + button('comfortVoice', 'Play voice note', '') + button('comfortMemory', 'Show memory', '') + button('comfortGround', 'Ground me', '') + button('comfortMessage', 'Message Al', 'primary') + '</div>'
      + '<div class="card comfort-reminder-small"><p class="eyebrow">A little reminder</p><p>' + esc(s.reminder || 'One thing at a time. You are loved.') + '</p></div>'
      + '<label class="label" for="comfortPrivateText">Want to put it into words? <span class="small">Optional · stays here</span></label><textarea id="comfortPrivateText" class="field" maxlength="1000" autocomplete="off" placeholder="A few words, just for this moment…">' + esc(s.privateText) + '</textarea>'
      + '<p class="small comfort-privacy-copy">Your mood and these words aren’t saved to the cloud or sent to Al. Message Al opens a composer where you choose what to share. This comfort space is saved words, not a therapist or a substitute for real support.</p>'
      + button('comfortUnsafe', 'I don’t feel safe', 'comfort-unsafe full') + contacts(s);
  }
  function render() {
    container = container || doc.getElementById('comfort');
    if (!container || !session) return;
    session.setScope(root.UsFeatures?.identity?.() || root.UsExtras?.get?.() || {}, false);
    const s = session.snapshot();
    const wasUnsafe = container.getAttribute?.('data-safety') === 'true';
    container.setAttribute?.('data-safety', String(s.unsafe));
    container.innerHTML = '<div class="subhead">' + button('comfortBack', '← Us', 'backpill') + '</div>'
      + (s.unsafe ? renderSafety(s) : renderNormal(s))
      + (s.notice ? '<p class="comfort-notice" role="status">' + esc(s.notice) + '</p>' : '');
    bind('comfortBack', () => { session.stop(); root.go?.('us'); });
    bind('comfortSaveContacts', () => session.saveContacts({alPhone: doc.getElementById('comfortAlPhone')?.value, trustedName: doc.getElementById('comfortTrustedName')?.value, trustedPhone: doc.getElementById('comfortTrustedPhone')?.value}));
    const details = container.querySelector?.('.comfort-contact-settings');
    if (details) details.ontoggle = () => { /* details is local UI only; never a read event */ };
    if (s.unsafe) {
      bind('comfortContactAl', () => session.contact('al')); bind('comfortContactTrusted', () => session.contact('trusted'));
      bind('comfortCountry', event => session.setCountry(event.target.value), 'onchange');
      bind('comfortEmergency', () => session.emergency('emergency')); bind('comfortCrisis', () => session.emergency('crisis'));
      bind('comfortHelplines', () => link('https://findahelpline.com/')); bind('comfortSafeAgain', () => session.safeAgain());
      if (!wasUnsafe) doc.getElementById('comfortSafetyTitle')?.focus?.();
      return;
    }
    for (const [mood] of MOODS) bind('comfortMood-' + mood, () => session.setMood(mood));
    for (const [mode] of [['comfort'], ['ground'], ['remind'], ['voice']]) bind('comfortMode-' + mode, () => session.setMode(mode));
    bind('comfortAnotherPhrase', () => session.another()); bind('comfortAnotherReminder', () => session.reminder());
    bind('comfortVoice', () => session.setMode('voice')); bind('comfortVoiceMessage', () => session.message());
    bind('comfortMemory', () => session.memory()); bind('comfortGround', () => session.setMode('ground')); bind('comfortMessage', () => session.message());
    bind('comfortUnsafe', () => session.unsafe());
    bind('comfortPrivateText', event => session.text(event.target.value), 'oninput');
    bind('comfortBreathToggle', () => session.snapshot().breathing ? session.stop() : session.startBreathing());
    bind('comfortPreviousSense', () => session.step(-1)); bind('comfortNextSense', () => session.step(s.groundStep === 4 ? -4 : 1));
  }
  function init() {
    container = doc.getElementById('comfort');
    if (!container) return;
    if (!initialized) {
      initialized = true;
      session = createSession({
        storage: root.localStorage, setTimeout: root.setTimeout.bind(root), clearTimeout: root.clearTimeout.bind(root), onChange: render,
        openLink: link, messageAl: mood => root.UsFeatures?.messageAl?.(mood), memory: () => root.UsFeatures?.memory?.()
      });
      root.UsExtras?.subscribe?.(render);
      doc.addEventListener?.('visibilitychange', () => { if (doc.hidden) session.stop(); });
      root.addEventListener?.('pagehide', () => session.stop());
    }
    render();
  }
  root.UsComfort = {init, render, stop: () => session?.stop()};
})(typeof window !== 'undefined' ? window : null);
