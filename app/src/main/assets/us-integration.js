/* Extend the existing app: keep its navigation, state and realtime protocol. */
(function (root) {
  'use strict';
  let verifiedUid = '', editorScope = '', memoryPhotoId = '', memoryPhotoData = '', photoToken = 0, messageMood = '';
  const el = id => document.getElementById(id);
  const scope = () => verifiedUid + ':' + (state.sync?.coupleId || '');
  const moodNames = {sad: 'sad', anxious: 'anxious', missing: 'missing you', miss: 'missing you', overwhelmed: 'overwhelmed', sleep: 'having trouble sleeping', reassurance: 'needing reassurance'};
  function clearEditors() {
    photoToken++; memoryPhotoData = ''; memoryPhotoId = ''; messageMood = '';
    if (el('memoryPhoto')) el('memoryPhoto').value = '';
    if (el('memoryPhotoPreview')) el('memoryPhotoPreview').innerHTML = '';
    if (el('memorySaveBtn')) el('memorySaveBtn').disabled = false;
    if (el('memoryPhotoStatus')) el('memoryPhotoStatus').textContent = 'Photo stays on this phone until Save.';
    if (el('alMessageText')) el('alMessageText').value = '';
    if (el('alIncludeMood')) el('alIncludeMood').checked = false;
    if (el('alMessageModal')) closeM('alMessageModal');
    if (el('memoryModal')) closeM('memoryModal');
  }
  function configure() {
    if (editorScope !== scope()) { editorScope = scope(); clearEditors(); }
    root.UsExtras.configure(Object.assign({}, state.sync, {signedIn: !!verifiedUid && verifiedUid === state.sync?.uid}));
    root.UsComfort?.render();
  }
  function photoPreview() {
    const data = memoryPhotoData || root.UsExtras.photo(memoryPhotoId);
    if (el('memoryPhotoPreview')) el('memoryPhotoPreview').innerHTML = data ? '<img class="memory-photo-preview" alt="Selected memory photo" src="' + data + '">' : '';
  }
  root.UsFeatures = {
    identity: () => ({uid: verifiedUid, coupleId: verifiedUid ? state.sync?.coupleId || '' : ''}),
    memory() { go('memories'); },
    prefillMemory(value) {
      go('memories'); openMemory();
      memoryTitle.value = value.title || ''; memoryDate.value = value.date || new Date().toISOString().slice(0, 10);
      memoryPlace.value = value.location || ''; memoryText.value = value.text || '';
      memoryPhotoId = value.photoId || ''; photoPreview();
    },
    messageAl(mood) {
      messageMood = typeof mood === 'string' ? mood : '';
      el('alMessageText').value = 'Could you call me when you have a moment?';
      el('alIncludeMood').checked = false;
      el('alMoodChoice').style.display = messageMood ? 'block' : 'none';
      updateAlMessagePreview(); openM('alMessageModal');
    },
  };
  root.updateAlMessagePreview = function () {
    const text = el('alMessageText').value.trim();
    const addition = messageMood && el('alIncludeMood').checked ? '\nI’m feeling ' + (moodNames[messageMood] || messageMood.slice(0, 60)) + '.' : '';
    el('alMessagePreview').textContent = text + addition;
  };
  root.confirmAlMessage = function () {
    if (!verifiedUid || !state.sync?.paired || !syncController?.ready) return toast('Sign in and pair your phones to leave a shared note.');
    updateAlMessagePreview();
    const text = el('alMessagePreview').textContent.trim();
    if (!text || text.length > 1500) return toast('Write a message of up to 1,500 characters.');
    state.notes.unshift({id: newEntityId(), text, date: new Date().toISOString()});
    save(); closeM('alMessageModal'); render(); toast('Your message is saved in shared love notes.');
  };
  root.UsExtras.init({sendMessage(text) { root.UsFeatures.messageAl(); el('alMessageText').value = String(text || '').slice(0, 1500); updateAlMessagePreview(); return true; }});
  Object.assign(NAV_GROUP, {comfort: 'us', letters: 'us', jar: 'us', bucket: 'us'});
  const oldGo = go;
  go = function (id) { if (id !== 'comfort') root.UsComfort?.stop(); oldGo(id); if (id === 'us') root.UsExtras.refresh(); };
  const oldAuth = root.onUsAuthState;
  root.onUsAuthState = function (value) { verifiedUid = value?.signedIn ? value.uid || '' : ''; oldAuth(value); configure(); };
  const oldSync = root.onUsSyncState;
  root.onUsSyncState = function (value) { oldSync(value); configure(); };
  const oldRender = render;
  render = function () { oldRender(); root.UsComfort?.render(); root.UsLetters?.render(); root.UsPlans?.render(); };
  const oldOpenMemory = openMemory;
  openMemory = function () { photoToken++; memoryPhotoId = ''; memoryPhotoData = ''; oldOpenMemory(); if (el('memoryPhoto')) el('memoryPhoto').value = ''; if (el('memorySaveBtn')) el('memorySaveBtn').disabled = false; if (el('memoryPhotoStatus')) el('memoryPhotoStatus').textContent = 'Photo stays on this phone until Save.'; photoPreview(); };
  root.selectMemoryPhoto = async function (input) {
    const file = input.files?.[0]; if (!file) return;
    const token = ++photoToken, ownScope = scope();
    el('memoryPhotoStatus').textContent = 'Preparing your photo…'; el('memorySaveBtn').disabled = true;
    try {
      const data = await root.UsExtras.pickPhoto(file);
      if (token !== photoToken || ownScope !== scope()) return;
      memoryPhotoData = data; memoryPhotoId = ''; photoPreview();
      el('memoryPhotoStatus').textContent = 'Ready on this phone. Shared only when you save the memory.';
    } catch (e) { if (token === photoToken) el('memoryPhotoStatus').textContent = e.message || 'Choose another photo.'; }
    finally { if (token === photoToken) el('memorySaveBtn').disabled = false; }
  };
  addMemory = function () {
    if (!memoryTitle.value.trim()) return toast('Give the memory a title');
    if (memoryPhotoData) {
      const id = 'photo_' + newEntityId();
      if (!root.UsExtras.mutate('photo', id, {data: memoryPhotoData})) return toast('Connect your paired space before sharing this photo.');
      memoryPhotoId = id;
    }
    state.memories.unshift({id: newEntityId(), title: memoryTitle.value.trim(), date: memoryDate.value || new Date().toISOString(), place: memoryPlace.value.trim(), text: memoryText.value.trim(), emoji: '✨', photoId: memoryPhotoId});
    save(); closeM('memoryModal'); render(); toast('Memory saved ✨');
    memoryPhotoData = ''; memoryPhotoId = '';
  };
  renderMemories = function () {
    const target = el('memoryList');
    target.innerHTML = state.memories.length ? state.memories.map(m => {
      const image = root.UsExtras.photo(m.photoId);
      return '<div class="card memory">' + (image ? '<img class="thumb memory-thumb" src="' + image + '" alt="' + esc(m.title) + '">' : '<div class="thumb">' + esc(m.emoji || '📍') + '</div>') + '<div><b>' + esc(m.title) + '</b><div class="small">' + fmtDate(m.date) + (m.place ? ' · ' + esc(m.place) : '') + '</div><div style="margin-top:6px">' + esc(m.text) + '</div></div></div>';
    }).join('') : '<div class="empty">Your timeline starts here. Add a memory you never want to lose.</div>';
  };
  root.UsExtras.subscribe(model => {
    renderMemories();
    if (el('usExtrasStatus')) el('usExtrasStatus').textContent = model.error || (model.pending ? model.pending + ' shared edit' + (model.pending === 1 ? '' : 's') + ' waiting to sync.' : 'Need Me? stays private on this phone. Shared plans and notes go only to your paired space.');
  });
  root.UsComfort.init(); root.UsLetters.init(); root.UsPlans.init();
  configure(); renderMemories();
  root.UsExtras.refresh();
})(window);
