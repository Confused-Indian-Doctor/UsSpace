(function (global) {
  'use strict';

  const CATEGORIES = [
    { id: 'miss', title: 'Open when you miss me', icon: '☾', seed: "My love, different places, same sky, still us. I wish I could close the distance with one hug. Until then, make yourself something warm and imagine me asking about the smallest part of your day. You are still part of mine. We are walking towards another hello, one ordinary day at a time.\n\nWith love, Al" },
    { id: 'sad', title: 'Open when you feel sad', icon: '♡', seed: "Hey love, you don’t have to be okay all the time. If I were there, I would sit beside you without making you explain everything. Rest first. Have some water. Be gentle with the person I love. A difficult day does not make you difficult to love.\n\nWith love, Al" },
    { id: 'anxious', title: 'Open when you are anxious', icon: '〰', seed: "Love, let’s make the world a little smaller for a minute. Feel your feet on the floor, loosen your shoulders, and take a comfortable, slow breath. Nothing has to be solved all at once. What is one tiny next step? If you want company while you take it, reach out to me or someone you trust.\n\nWith love, Al" },
    { id: 'sleep', title: 'Open when you can’t sleep', icon: '✦', seed: "Put the whole world down for tonight, love. You have done enough for today. No pressure to fall asleep straight away; just let yourself rest. Imagine me beside you, quietly reminding you that the to-do list can wait until morning.\n\nWith love, Al" },
    { id: 'reassurance', title: 'Open when you need reassurance', icon: '♥', seed: "I choose you on hard days and easy days. You never have to earn my care by being cheerful, certain, or perfect. You are loved when you are tired and quiet too. Inshallah, this difficult feeling will pass. Still you. Still me. Still us.\n\nWith love, Al" },
    { id: 'proud', title: 'Open when you feel proud of yourself', icon: '☀', seed: "Look at you, love. Please pause long enough to enjoy this. I am proud of the effort nobody saw, of the times you tried again, and of the person you are becoming. Tell me about your win when you want to. I would like to celebrate it with you, however small you think it is.\n\nWith love, Al" },
    { id: 'laugh', title: 'Open when you need to laugh', icon: '☺', seed: "An extremely important announcement: I am requesting one very dramatic smile from my favourite person. Imagine me trying to look serious and failing immediately. You may roll your eyes at me; I am counting that as affection. If this joke needs improvement, please send a formal complaint with one selfie.\n\nWith love, Al" },
    { id: 'argument', title: 'Open when we’ve had an argument', icon: '✉', seed: "Love, we can disagree and still care about each other. I want us to understand each other, not keep score. You do not have to rush past your feelings for my sake. Let’s take a little space if we need it, then talk when we can both listen. We each deserve kindness and room to be honest.\n\nWith love, Al" }
  ];
  const IDS = new Set(CATEGORIES.map(x => x.id));
  const STORAGE_PREFIX = 'usspace:open-when:v1:';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const str = value => typeof value === 'string' ? value : '';
  const category = id => CATEGORIES.find(x => x.id === id);
  const clone = value => JSON.parse(JSON.stringify(value));

  function createController(options) {
    const read = options.readSnapshot;
    const mutate = options.mutate;
    const storage = options.storage;
    const now = options.now || (() => new Date().toISOString());
    let scope = '', currentUid = '', coupleId = '', drafts = {};
    let selected = '', reader = '', confirmation = null, roleChoice = null;
    let status = '', storageError = false, rolePending = false;
    const locallyEdited = new Set();

    function storageKey() { return STORAGE_PREFIX + encodeURIComponent(currentUid) + ':' + encodeURIComponent(coupleId); }
    function validDraft(value) {
      return value && IDS.has(value.category) && value.coupleId === coupleId && value.id === coupleId + '_' + value.category &&
        typeof value.title === 'string' && value.title.length <= 200 && typeof value.body === 'string' && value.body.length <= 12000;
    }
    function persist() {
      if (!currentUid || !coupleId) return false;
      try {
        storage.setItem(storageKey(), JSON.stringify({ version: 1, uid: currentUid, coupleId: coupleId, drafts: drafts }));
        storageError = false;
        return true;
      } catch (_) { storageError = true; return false; }
    }
    function restore() {
      try {
        const raw = storage.getItem(storageKey());
        if (!raw || raw.length > 120000) return;
        const saved = JSON.parse(raw);
        if (!saved || saved.version !== 1 || saved.uid !== currentUid || saved.coupleId !== coupleId) return;
        Object.values(saved.drafts || {}).forEach(draft => { if (validDraft(draft)) drafts[draft.category] = clone(draft); });
      } catch (_) { /* An unreadable local draft does not affect pairing or other features. */ }
    }
    function context() {
      const model = read() || {};
      const nextUid = str(model.uid), nextCouple = str(model.coupleId);
      const nextScope = nextUid && nextCouple ? nextUid + '\u001f' + nextCouple : '';
      if (nextScope !== scope || nextUid !== currentUid || nextCouple !== coupleId) {
        scope = nextScope; currentUid = nextUid; coupleId = nextCouple;
        drafts = {}; selected = ''; reader = ''; confirmation = null; roleChoice = null;
        status = ''; storageError = false; rolePending = false; locallyEdited.clear();
        if (scope) restore();
      }
      const members = Array.isArray(model.members) ? model.members.filter(x => x && str(x.uid)).map(x => ({ uid: x.uid, name: str(x.name) || 'Paired account' })) : [];
      const unique = new Set(members.map(x => x.uid));
      const paired = !!scope && members.length === 2 && unique.size === 2 && unique.has(currentUid);
      const rawRoles = model.roles || {};
      const validRoles = paired && rawRoles.alUid !== rawRoles.yashikaUid && unique.has(rawRoles.alUid) && unique.has(rawRoles.yashikaUid);
      const roles = validRoles ? { alUid: rawRoles.alUid, yashikaUid: rawRoles.yashikaUid } : null;
      const author = !!roles && roles.alUid === currentUid;
      const recipient = !!roles && roles.yashikaUid === currentUid;
      if (roles) { roleChoice = null; rolePending = false; }
      if (!author) { selected = ''; confirmation = null; }
      if (author && Array.isArray(model.drafts)) {
        model.drafts.forEach(remote => {
          if (!validDraft(remote) || locallyEdited.has(remote.category)) return;
          const local = drafts[remote.category];
          if (!local || str(remote.updatedAt) > str(local.updatedAt)) drafts[remote.category] = clone(remote);
        });
      }
      const letters = roles && Array.isArray(model.letters) ? model.letters.filter(letter => letter && IDS.has(letter.category) && letter.id === letter.category &&
        letter.authorUid === roles.alUid && letter.recipientUid === roles.yashikaUid && (letter.authorUid === currentUid || letter.recipientUid === currentUid) &&
        typeof letter.title === 'string' && letter.title.length <= 200 && typeof letter.body === 'string' && letter.body.length <= 12000) : [];
      return { model, paired, roles, author, recipient, members, letters };
    }
    function safelyMutate(kind, id, fields) {
      try { return mutate(kind, id, fields) === true; } catch (_) { return false; }
    }
    function getView() {
      const c = context();
      const opened = reader ? c.letters.find(x => x.category === reader) || null : null;
      if (reader && !opened) reader = '';
      const self = c.members.find(x => x.uid === currentUid) || { uid: currentUid, name: 'Your account' };
      const partner = c.members.find(x => x.uid !== currentUid) || { uid: '', name: 'Your paired account' };
      const roleName = uid => (c.members.find(x => x.uid === uid) || {}).name || 'Paired account';
      return {
        uid: currentUid, coupleId, paired: c.paired, ready: !!c.model.ready, self, partner, roles: c.roles,
        author: c.author, recipient: c.recipient, alName: c.roles ? roleName(c.roles.alUid) : 'Al',
        recipientName: c.roles ? roleName(c.roles.yashikaUid) : 'Yashika', roleChoice, rolePending,
        cards: CATEGORIES.map(item => ({ id: item.id, title: item.title, icon: item.icon, released: c.letters.some(x => x.category === item.id), hasDraft: c.author && !!drafts[item.id] })),
        draft: c.author && selected ? clone(drafts[selected]) : null,
        opened: opened ? clone(opened) : null,
        confirmation: c.author && confirmation ? clone(confirmation) : null,
        status, storageError, syncError: str(c.model.error), pending: Number(c.model.pending) || 0
      };
    }
    function chooseRole(choice) {
      const c = context();
      if (!c.paired || c.roles || c.model.roles || rolePending || !['al', 'yashika'].includes(choice)) return false;
      roleChoice = choice; status = '';
      return true;
    }
    function confirmRole() {
      const c = context();
      if (!roleChoice || !c.paired || c.roles || c.model.roles || rolePending || !c.model.ready) return false;
      const partner = c.members.find(x => x.uid !== currentUid);
      const fields = roleChoice === 'al' ? { alUid: currentUid, yashikaUid: partner.uid } : { alUid: partner.uid, yashikaUid: currentUid };
      if (!safelyMutate('roles', 'identity', fields)) { status = 'Role setup could not be queued. Check your connection and try again.'; return false; }
      rolePending = true; roleChoice = null; status = 'Account roles are being saved. Drafts will open after confirmation from sync.';
      return true;
    }
    function cancel() { context(); roleChoice = null; confirmation = null; return true; }
    function edit(id) {
      const c = context();
      if (!c.author || !IDS.has(id)) return false;
      selected = id; reader = ''; confirmation = null; status = '';
      if (!drafts[id]) {
        const seed = category(id);
        drafts[id] = { id: coupleId + '_' + id, coupleId, category: id, title: seed.title, body: seed.seed, updatedAt: now(), starter: true };
        persist();
      }
      return true;
    }
    function update(field, value) {
      const c = context();
      if (!c.author || !selected || !drafts[selected] || !['title', 'body'].includes(field) || typeof value !== 'string') return false;
      const max = field === 'title' ? 200 : 12000;
      if (value.length > max) return false;
      drafts[selected][field] = value; drafts[selected].updatedAt = now();
      drafts[selected].starter = false; locallyEdited.add(selected); confirmation = null;
      persist(); status = storageError ? 'Your edits are open here, but this phone could not save them. Copy them before leaving.' : 'Saved on this phone. Yashika cannot see this draft.';
      return true;
    }
    function saveDraft() {
      const c = context();
      if (!c.author || !selected || !drafts[selected]) return false;
      const d = drafts[selected];
      persist();
      if (!c.model.ready) { status = storageError ? 'This phone could not save your draft. Copy the text before leaving.' : 'Saved on this phone. You can save a private backup when sync is available.'; return !storageError; }
      const fields = { category: d.category, title: d.title, body: d.body };
      const accepted = safelyMutate('draft', d.id, fields);
      status = accepted ? 'Private draft backup queued. This does not send the letter to Yashika.' : 'Private backup could not be queued. Your draft stays on this phone.';
      return accepted;
    }
    function requestPublish() {
      const c = context();
      if (!c.author || !selected || !drafts[selected] || !c.model.ready) { status = 'Publishing needs Al’s signed-in account and an active paired connection.'; return false; }
      const d = drafts[selected];
      if (!d.title.trim() || !d.body.trim()) { status = 'Give your letter a title and a few words before publishing.'; return false; }
      confirmation = { uid: currentUid, coupleId, category: selected, title: d.title, body: d.body };
      return true;
    }
    function confirmPublish(reviewed) {
      const c = context();
      if (reviewed !== true || !confirmation || !c.author || !c.model.ready || confirmation.uid !== currentUid || confirmation.coupleId !== coupleId) return false;
      const d = drafts[confirmation.category];
      if (!d || confirmation.title !== d.title || confirmation.body !== d.body) { confirmation = null; return false; }
      const fields = { category: d.category, title: d.title.trim(), body: d.body.trim() };
      if (!safelyMutate('letter', d.category, fields)) { status = 'Publishing could not be queued. Your private draft is still saved here.'; return false; }
      confirmation = null; status = 'Publication queued for Yashika. The envelope becomes available after sync.';
      return true;
    }
    function openLetter(id) {
      const c = context();
      if (!IDS.has(id) || !c.letters.some(x => x.category === id)) return false;
      selected = ''; confirmation = null; reader = id; status = '';
      return true;
    }
    function closeLetter() { context(); selected = ''; reader = ''; confirmation = null; status = ''; return true; }
    return { getView, chooseRole, confirmRole, cancel, edit, update, saveDraft, requestPublish, confirmPublish, openLetter, closeLetter };
  }

  function renderMarkup(view) {
    const action = (name, label, cls, data, disabled) => '<button type="button" class="btn ' + (cls || '') + '" data-letter-action="' + name + '"' + (data ? ' data-letter-id="' + esc(data) + '"' : '') + (disabled ? ' disabled' : '') + '>' + label + '</button>';
    let html = '<div class="subhead">' + action('us', '← Us', 'backpill') + '</div><header class="letter-hero card"><div class="eyebrow">Little things from Al</div><h2>Open When…</h2><p>A letter for the moment you need it.</p><span class="letter-privacy">🔒 Private envelopes · no read receipts</span></header>';
    if (!view.paired) {
      return html + '<div class="card letter-notice"><h3>Pair your two accounts first</h3><p>Open When letters belong to your private space together. Sign in and finish pairing on Home, then choose which account belongs to Al and Yashika.</p>' + action('home', 'Open pairing on Home', 'soft full') + '</div>';
    }
    if (!view.roles) {
      html += '<section class="card letter-role"><h3>Who is on this account?</h3><p>Choose deliberately. Display names do not assign roles, and this setup is saved once for your paired space.</p><div class="letter-identity"><b>' + esc(view.self.name) + '</b><span>Current account</span><code>' + esc(view.self.uid) + '</code></div><div class="letter-identity"><b>' + esc(view.partner.name) + '</b><span>Other paired account</span><code>' + esc(view.partner.uid) + '</code></div>';
      if (view.roleChoice) {
        const al = view.roleChoice === 'al' ? view.self : view.partner, y = view.roleChoice === 'yashika' ? view.self : view.partner;
        html += '<div class="letter-confirm" role="group" aria-label="Confirm account roles"><h4>Check before saving</h4><p><b>Al’s account:</b> ' + esc(al.name) + ' <small>(' + esc(al.uid) + ')</small></p><p><b>Yashika’s account:</b> ' + esc(y.name) + ' <small>(' + esc(y.uid) + ')</small></p><p>Al writes and publishes. Yashika can open published letters. Roles cannot be changed in the app after saving.</p><div class="letter-actions">' + action('confirm-role', 'Save these account roles', 'primary', '', !view.ready) + action('cancel', 'Go back', '') + '</div></div>';
      } else {
        html += '<div class="letter-actions">' + action('role-al', 'This is Al’s account', 'soft', '', view.rolePending) + action('role-yashika', 'This is Yashika’s account', '', '', view.rolePending) + '</div>';
      }
      html += '</section>';
    } else {
      html += '<div class="letter-role-summary"><span>' + (view.author ? 'Writing as Al' : 'Letters for Yashika') + '</span><small>' + esc(view.self.name) + ' · ' + esc(view.self.uid) + '</small></div>';
      if (view.opened) {
        html += '<article class="card letter-paper"><div class="letter-actions">' + action('close', '← All envelopes', '') + '</div><div class="eyebrow">From Al ❤️' + (view.author ? ' · published preview' : '') + '</div><h3>' + esc(view.opened.title) + '</h3><div class="letter-body">' + esc(view.opened.body) + '</div><p class="small">Opening this letter stays on this phone. Al does not receive a read receipt.</p></article>';
      } else if (view.draft) {
        const d = view.draft;
        html += '<section class="card letter-editor"><div class="letter-actions">' + action('close', '← All envelopes', '') + '</div><div class="eyebrow">Al’s private draft</div><h3>Make these words yours</h3><p class="letter-draft-notice">' + (d.starter ? 'This is a suggested starting point, not a letter Al has already written. Review and edit it before choosing to publish.' : 'These edits are private. Saving a draft never sends it to Yashika.') + '</p><label class="label" for="letter-title">Letter title</label><input id="letter-title" class="field" maxlength="200" value="' + esc(d.title) + '" autocomplete="off" data-letter-field="title"><label class="label" for="letter-body">Your words</label><textarea id="letter-body" class="field letter-writing" maxlength="12000" data-letter-field="body" spellcheck="true">' + esc(d.body) + '</textarea><div class="letter-actions">' + action('save-draft', 'Save private backup', 'soft') + action('request-publish', 'Publish for Yashika', 'primary', '', !view.ready) + '</div><p class="small">Drafts save on this phone as you write. A private backup is visible only to this signed-in account. Publishing replaces the released version of this envelope.</p>';
        if (view.confirmation) {
          html += '<div class="letter-confirm" role="group" aria-label="Confirm letter publication"><h4>Ready for Yashika to open?</h4><p>This publishes “' + esc(view.confirmation.title) + '” for <b>' + esc(view.recipientName) + '</b>, Yashika’s paired account. Al can preview the published letter.</p><label class="letter-review"><input id="letter-reviewed" type="checkbox"><span>I have reviewed these words and want Yashika to be able to read this letter.</span></label><div class="letter-actions">' + action('confirm-publish', 'Yes, publish this letter', 'primary') + action('cancel', 'Keep it private', '') + '</div></div>';
        }
        html += '</section>';
      } else {
        html += '<p class="letter-intro">' + (view.author ? 'Write in your own words. Every envelope begins as a private draft; only an explicit publication releases it for Yashika.' : 'Choose an envelope whenever you want. Unreleased letters stay with Al until he chooses to publish them.') + '</p><div class="letter-envelopes">';
        view.cards.forEach(card => {
          html += '<article class="letter-envelope"><div class="letter-seal" aria-hidden="true">' + esc(card.icon) + '</div><div class="letter-envelope-copy"><h3>' + esc(card.title) + '</h3><p>' + (card.released ? 'A letter from Al is here.' : view.author && card.hasDraft ? 'Your private draft is here.' : 'An envelope waiting for Al’s words.') + '</p><div class="letter-actions">';
          if (view.author) html += action('edit', card.hasDraft ? 'Edit private draft' : 'Write this letter', 'soft', card.id);
          if (card.released) html += action('open', view.author ? 'Preview published' : 'Open letter', view.author ? '' : 'soft', card.id);
          else if (!view.author) html += '<span class="letter-waiting">Not published yet</span>';
          html += '</div></div></article>';
        });
        html += '</div>';
      }
    }
    if (view.storageError) html += '<p class="letter-error" role="alert">This phone could not save local edits. Copy your words before leaving this screen.</p>';
    if (view.syncError) html += '<p class="letter-error" role="alert">Sync: ' + esc(view.syncError) + '</p>';
    html += '<p id="letter-status" class="letter-status" role="status" aria-live="polite">' + esc(view.status || (!view.ready ? 'Offline: existing letters and private local drafts may still be available. Publication needs sync.' : '')) + '</p>';
    return html;
  }

  let controller = null, mounted = false, root = null;
  function render() {
    if (!controller || !root) return;
    const focused = global.document.activeElement;
    const preserve = focused && root.contains(focused) && focused.id && focused.dataset.letterField ? { id: focused.id, start: focused.selectionStart, end: focused.selectionEnd } : null;
    root.innerHTML = renderMarkup(controller.getView());
    if (preserve) {
      const restored = global.document.getElementById(preserve.id);
      if (restored) {
        restored.focus({ preventScroll: true });
        try { restored.setSelectionRange(preserve.start, preserve.end); } catch (_) {}
      }
    }
  }
  function init() {
    if (mounted) { render(); return; }
    root = global.document && global.document.getElementById('letters');
    if (!root || !global.UsExtras) return;
    controller = createController({ readSnapshot: () => global.UsExtras.get(), mutate: (kind, id, fields) => global.UsExtras.mutate(kind, id, fields), storage: global.localStorage });
    root.addEventListener('input', event => {
      const field = event.target && event.target.dataset && event.target.dataset.letterField;
      if (!field) return;
      controller.update(field, event.target.value);
      const statusEl = global.document.getElementById('letter-status');
      if (statusEl) statusEl.textContent = controller.getView().status;
      const confirmationEl = root.querySelector('[aria-label="Confirm letter publication"]');
      if (confirmationEl) confirmationEl.remove();
    });
    root.addEventListener('click', event => {
      const button = event.target.closest && event.target.closest('[data-letter-action]');
      if (!button || !root.contains(button) || button.disabled) return;
      const act = button.dataset.letterAction, id = button.dataset.letterId;
      if (act === 'us' || act === 'home') { if (typeof global.go === 'function') global.go(act); return; }
      if (act === 'role-al') controller.chooseRole('al');
      else if (act === 'role-yashika') controller.chooseRole('yashika');
      else if (act === 'confirm-role') controller.confirmRole();
      else if (act === 'cancel') controller.cancel();
      else if (act === 'edit') controller.edit(id);
      else if (act === 'open') controller.openLetter(id);
      else if (act === 'close') controller.closeLetter();
      else if (act === 'save-draft') controller.saveDraft();
      else if (act === 'request-publish') controller.requestPublish();
      else if (act === 'confirm-publish') {
        const review = global.document.getElementById('letter-reviewed');
        if (!review || !review.checked) {
          if (typeof global.toast === 'function') global.toast('Review your words and tick the confirmation first.');
          return;
        }
        controller.confirmPublish(true);
      }
      render();
    });
    mounted = true;
    global.UsExtras.subscribe(render);
    render();
  }
  global.UsLetters = { init, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = { createController, renderMarkup, categories: CATEGORIES.map(x => ({ id: x.id, title: x.title })) };
})(typeof window !== 'undefined' ? window : globalThis);
