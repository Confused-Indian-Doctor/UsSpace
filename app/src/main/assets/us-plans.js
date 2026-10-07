/* Couple plans and appreciations. Photos stay on this phone until Save is chosen. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CATEGORIES = ['Travel', 'Food', 'Adventure', 'Date', 'Life', 'Learning', 'Silly', 'Future home'];
  const STATES = ['Dreaming', 'Planning', 'Booked', 'Done'];
  const PRIORITIES = ['Low', 'Normal', 'High'];
  const FIELDS = ['title', 'category', 'location', 'targetDate', 'priority', 'notes', 'photoId', 'state', 'completedDate', 'completedPhotoId'];
  const MAX_PHOTO = 140000, MAX_SOURCE = 20 * 1024 * 1024;
  const blank = () => ({title: '', category: 'Travel', location: '', targetDate: '', priority: 'Normal', notes: '', photoId: '', state: 'Dreaming', completedDate: '', completedPhotoId: ''});
  const text = v => String(v == null ? '' : v);
  const today = ms => new Date(ms).toISOString().slice(0, 10);
  const html = v => text(v).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const photoData = data => typeof data === 'string' && data.length <= MAX_PHOTO && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data);
  function validDate(value) {
    if (!value) return true;
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
  }
  function normalize(input, now) {
    const f = Object.assign(blank(), input || {});
    FIELDS.forEach(key => { f[key] = text(f[key]).trim(); });
    if (!f.title) throw new Error('Give your dream a title.');
    if (f.title.length > 160) throw new Error('Keep the title to 160 characters.');
    if (!CATEGORIES.includes(f.category) || !STATES.includes(f.state) || !PRIORITIES.includes(f.priority)) throw new Error('Choose a category, state and priority from the list.');
    if (f.location.length > 240 || f.notes.length > 4000) throw new Error('Use up to 240 characters for a location and 4,000 for notes.');
    if (!validDate(f.targetDate) || !validDate(f.completedDate)) throw new Error('Choose a valid date.');
    if (f.state === 'Done' && !f.completedDate) f.completedDate = today(now);
    for (const key of ['photoId', 'completedPhotoId']) if (f[key] && !/^[A-Za-z0-9_-]{1,160}$/.test(f[key])) throw new Error('Choose the photo again.');
    return Object.fromEntries(FIELDS.map(key => [key, f[key]]));
  }
  function changes(base, value) {
    return Object.fromEntries(FIELDS.filter(key => text(base[key]) !== text(value[key])).map(key => [key, value[key]]));
  }
  function filterItems(items, category, state) {
    return (items || []).filter(item => (!category || item.category === category) && (!state || item.state === state));
  }
  function attribution(note, now) {
    const parsed = Date.parse(note.createdAt || ''), days = Number.isFinite(parsed) ? Math.max(0, Math.floor((now - parsed) / 86400000)) : null;
    return `${note.authorName || 'Your person'} wrote this ${days === null ? 'a while ago' : days === 0 ? 'today' : `${days} ${days === 1 ? 'day' : 'days'} ago`}`;
  }
  function chooseOld(notes, priorId, now, random) {
    const old = (notes || []).filter(note => Number.isFinite(Date.parse(note.createdAt || '')) && now - Date.parse(note.createdAt) >= 86400000);
    const pool = old.length ? old : (notes || []);
    const alternatives = pool.filter(note => note.id !== priorId), choices = alternatives.length ? alternatives : pool;
    return choices.length ? choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))].id : '';
  }
  function createController(deps) {
    const now = deps.now || Date.now, random = deps.random || Math.random;
    let scope = '', editor = null, jarText = '', selectedId = '', offer = null, error = '', notice = '', photoToken = 0;
    let categoryFilter = '', stateFilter = '';
    const model = () => deps.get() || {};
    function sync() {
      const m = model(), next = `${m.uid || ''}|${m.coupleId || ''}`;
      if (next !== scope) {
        scope = next; editor = null; jarText = ''; selectedId = ''; offer = null; error = ''; notice = ''; photoToken++;
        categoryFilter = ''; stateFilter = '';
      }
      if (!(m.jar || []).some(note => note.id === selectedId)) selectedId = chooseOld(m.jar, '', now(), random);
      return m;
    }
    function paired() {
      const m = sync();
      if (m.uid && m.coupleId) return true;
      error = 'Sign in and pair your two phones to share plans and appreciations.'; return false;
    }
    function queue(kind, id, fields) {
      try { if (deps.mutate(kind, id, fields)) return true; }
      catch (_) { /* A bridge failure must leave the editor intact for retry. */ }
      error = 'This could not be saved. Keep this screen open and try again.'; return false;
    }
    function freshId(prefix) { return `${prefix}_${deps.id()}`; }
    function openBucket(id) {
      const m = sync(), existing = id ? (m.bucket || []).find(item => item.id === id) : null;
      if (id && !existing) { error = 'That plan is no longer available.'; return false; }
      const base = Object.assign(blank(), existing || {});
      editor = {id: existing ? existing.id : freshId('bucket'), existing: !!existing, base, values: {...base}, photos: {}, busy: false, suggestedName: existing ? existing.suggestedName : (m.members || []).find(member => member.uid === m.uid)?.name || 'You'};
      error = ''; notice = ''; photoToken++; return true;
    }
    function edit(key, value) { sync(); if (editor && FIELDS.includes(key)) editor.values[key] = value; }
    function cancel() { sync(); editor = null; error = ''; photoToken++; }
    async function pick(file, field) {
      sync(); error = ''; if (!editor || !['photoId', 'completedPhotoId'].includes(field) || !file) return false;
      const token = ++photoToken, target = editor, originalScope = scope;
      target.busy = false;
      if (file.size > MAX_SOURCE) { error = 'Choose a photo smaller than 20 MB.'; return false; }
      if (file.type && !/^image\//.test(file.type)) { error = 'Choose an image file.'; return false; }
      target.busy = true;
      try {
        const data = await deps.pickPhoto(file);
        sync(); if (scope !== originalScope || editor !== target || token !== photoToken) return false;
        if (!photoData(data)) throw new Error('The photo could not be made small enough. Try a smaller image.');
        target.photos[field] = {id: freshId('photo'), data, queued: false};
        target.values[field] = target.photos[field].id;
        notice = 'Photo ready on this phone. It will be shared only when you tap Save.'; return true;
      } catch (e) {
        sync(); if (scope === originalScope && editor === target && token === photoToken) error = e && e.message ? e.message : 'The photo could not be opened. Please choose another.';
        return false;
      } finally { if (editor === target && token === photoToken) target.busy = false; }
    }
    function clearPhoto(field) {
      sync(); if (!editor || !['photoId', 'completedPhotoId'].includes(field)) return;
      photoToken++; editor.busy = false; delete editor.photos[field]; editor.values[field] = ''; notice = '';
    }
    function saveBucket() {
      sync(); error = ''; notice = '';
      if (!editor || editor.busy || !paired()) return false;
      let fields;
      try { fields = normalize(editor.values, now()); } catch (e) { error = e.message; return false; }
      const patch = editor.existing ? changes(editor.base, fields) : fields;
      for (const [key, selected] of Object.entries(editor.photos)) {
        if (fields[key] !== selected.id || !Object.hasOwn(patch, key)) continue;
        if (!photoData(selected.data)) { error = 'Choose the photo again.'; return false; }
        if (!selected.queued && !queue('photo', selected.id, {data: selected.data})) return false;
        selected.queued = true;
      }
      if (Object.keys(patch).length && !queue('bucket', editor.id, patch)) return false;
      if (fields.state === 'Done') offer = {...editor.base, ...fields, id: editor.id};
      notice = Object.keys(patch).length ? 'Saved for your shared bucket list.' : 'No changes to save.';
      editor = null; photoToken++; return true;
    }
    function changeState(id, state) {
      const m = sync(); error = ''; notice = '';
      const item = (m.bucket || []).find(value => value.id === id);
      if (!item || !STATES.includes(state) || !paired()) return false;
      const patch = {state};
      if (state === 'Done') patch.completedDate = item.completedDate || today(now());
      if (!queue('bucket', id, patch)) return false;
      if (state === 'Done') offer = {...item, ...patch};
      notice = state === 'Done' ? 'A dream you lived together. Save it as a memory whenever you like.' : 'Planning started. One little step closer.';
      return true;
    }
    function turnMemory(id) {
      const m = sync(), item = (m.bucket || []).find(value => value.id === id);
      const completed = offer && offer.id === id ? offer : item;
      if (!completed || completed.state !== 'Done' || typeof deps.prefillMemory !== 'function') return false;
      deps.prefillMemory({title: completed.title, date: completed.completedDate || today(now()), location: completed.location || '', photoId: completed.completedPhotoId || completed.photoId || '', text: completed.notes || ''});
      return true;
    }
    function addNote() {
      sync(); error = ''; notice = ''; const value = jarText.trim();
      if (!paired()) return false;
      if (!value) { error = 'Write a little appreciation first.'; return false; }
      if (value.length > 1500) { error = 'Keep your appreciation to 1,500 characters.'; return false; }
      if (!queue('jar', freshId('jar'), {text: value})) return false;
      jarText = ''; notice = 'A little appreciation added to your jar.'; return true;
    }
    function heart(id) {
      const m = sync(); error = ''; if (!paired() || !(m.jar || []).some(note => note.id === id)) return false;
      return queue('heart', id, {active: !(m.hearts && Array.isArray(m.hearts[id]) && m.hearts[id].includes(m.uid))});
    }
    return {
      sync, openBucket, edit, cancel, pick, clearPhoto, saveBucket, changeState, turnMemory, addNote, heart,
      setJarText(value) { sync(); jarText = text(value); },
      setFilters(category, state) { sync(); categoryFilter = CATEGORIES.includes(category) ? category : ''; stateFilter = STATES.includes(state) ? state : ''; },
      anotherNote() { const m = sync(); selectedId = chooseOld(m.jar, selectedId, now(), random); },
      view() { const m = sync(); return {model: m, editor, jarText, selectedId, offer, error, notice, categoryFilter, stateFilter, items: filterItems(m.bucket, categoryFilter, stateFilter)}; }
    };
  }
  function mount(root) {
    const doc = root.document; let initialized = false, controller;
    const element = id => doc.getElementById(id);
    const status = v => `<p class="plans-status" ${v.error ? 'role="alert"' : 'role="status"'}>${html(v.error || v.notice || '')}</p>`;
    const options = (values, value) => values.map(option => `<option${option === value ? ' selected' : ''}>${html(option)}</option>`).join('');
    function image(id, alt, data) {
      const value = data || root.UsExtras.photo(id);
      return photoData(value) ? `<img class="plans-photo" src="${value}" alt="${html(alt)}">` : '';
    }
    function header(title, subtitle) {
      return `<div class="plans-heading"><button type="button" class="btn soft" data-action="back">‹ Us</button><h2>${title}</h2><p>${subtitle}</p></div>`;
    }
    function sharing(v) {
      if (!v.model.uid || !v.model.coupleId) return '<p class="plans-sharing">Pair your two phones to add and share here. Your existing local memories stay as they are.</p>';
      return `<p class="plans-sharing">Only your paired space.${v.model.pending ? ' Changes are waiting to sync.' : v.model.ready === false ? ' Offline changes will sync when your connection returns.' : ''}</p>`;
    }
    function photoEditor(editor, field, title) {
      const selected = editor.photos[field];
      return `<div class="plans-photo-editor"><label for="plans-${field}">${title}</label>${image(editor.values[field], title, selected && selected.data)}<input id="plans-${field}" type="file" accept="image/*" data-photo="${field}"><p class="small">Choose a photo up to 20 MB. It stays on this phone until Save.</p>${editor.values[field] ? `<button type="button" class="btn soft" data-action="clear-photo" data-field="${field}">Remove photo</button>` : ''}</div>`;
    }
    function form(editor) {
      const f = editor.values;
      return `<form class="plans-editor card" data-form="bucket" aria-label="${editor.existing ? 'Edit bucket list item' : 'New bucket list item'}"><h3>${editor.existing ? 'A little change to the plan' : 'What shall we dream of?'}</h3>
        <label for="plans-title">Title</label><input id="plans-title" data-field="title" class="field" maxlength="160" required value="${html(f.title)}" placeholder="A place, a meal, a little adventure…">
        <div class="plans-grid"><div><label for="plans-category">Category</label><select id="plans-category" data-field="category" class="field">${options(CATEGORIES, f.category)}</select></div><div><label for="plans-state">State</label><select id="plans-state" data-field="state" class="field">${options(STATES, f.state)}</select></div></div>
        <label for="plans-location">Location</label><input id="plans-location" data-field="location" class="field" maxlength="240" value="${html(f.location)}" placeholder="Where might we go?">
        <div class="plans-grid"><div><label for="plans-targetDate">Target date (optional)</label><input id="plans-targetDate" type="date" data-field="targetDate" class="field" value="${html(f.targetDate)}"></div><div><label for="plans-priority">Priority</label><select id="plans-priority" data-field="priority" class="field">${options(PRIORITIES, f.priority)}</select></div></div>
        <p class="small">Suggested by ${html(editor.suggestedName || 'your person')}. The original suggester stays with the dream.</p>
        <label for="plans-notes">Notes</label><textarea id="plans-notes" data-field="notes" class="field" maxlength="4000" placeholder="The tiny details we don't want to forget…">${html(f.notes)}</textarea>
        ${photoEditor(editor, 'photoId', 'Dream photo (optional)')}
        ${f.state === 'Done' ? `<label for="plans-completedDate">Completion date</label><input id="plans-completedDate" type="date" data-field="completedDate" class="field" value="${html(f.completedDate)}">${photoEditor(editor, 'completedPhotoId', 'Photo from the day (optional)')}` : ''}
        <div class="plans-actions"><button type="submit" class="btn primary"${editor.busy ? ' disabled' : ''}>${editor.busy ? 'Preparing photo…' : 'Save to our bucket list'}</button><button type="button" class="btn" data-action="cancel">Cancel</button></div></form>`;
    }
    function bucketCard(item) {
      return `<article class="card plans-item"><div class="row between"><span class="plans-tag">${html(item.category)}</span><span class="plans-state">${html(item.state)}</span></div><h3>${html(item.title)}</h3>${image(item.state === 'Done' ? item.completedPhotoId || item.photoId : item.photoId, item.title)}
        ${item.location ? `<p class="plans-detail">📍 ${html(item.location)}</p>` : ''}${item.targetDate ? `<p class="plans-detail">Hoping for ${html(item.targetDate)}</p>` : ''}<p class="small">Suggested by ${html(item.suggestedName || 'your person')} · ${html(item.priority || 'Normal')} priority</p>
        ${item.notes ? `<p class="plans-body">${html(item.notes)}</p>` : ''}${item.state === 'Done' && item.completedDate ? `<p class="small">Lived together on ${html(item.completedDate)}</p>` : ''}
        <div class="plans-actions"><button type="button" class="btn soft" data-action="edit" data-id="${html(item.id)}">Edit</button>${item.state === 'Dreaming' ? `<button type="button" class="btn" data-action="planning" data-id="${html(item.id)}">Start planning</button>` : ''}${item.state !== 'Done' ? `<button type="button" class="btn" data-action="done" data-id="${html(item.id)}">Mark Done</button>` : `<button type="button" class="btn soft" data-action="memory" data-id="${html(item.id)}">Turn this into a Memory</button>`}</div></article>`;
    }
    function renderBucket(v) {
      const section = element('bucket'); if (!section) return;
      section.innerHTML = header('Our Bucket List', 'Little dreams. Bigger adventures. All the things we want to do together.') + sharing(v) + status(v)
        + (v.editor ? form(v.editor) : '<button type="button" class="btn primary full" data-action="new">＋ Add a dream</button>')
        + (v.offer ? `<aside class="card plans-complete"><h3>We did this, love.</h3><p>${html(v.offer.title)}</p><p class="small">Keep the day in Memories. You can review it before saving.</p><button type="button" class="btn soft" data-action="memory" data-id="${html(v.offer.id)}">Turn this into a Memory</button></aside>` : '')
        + `<div class="plans-grid plans-filters"><div><label for="plans-category-filter">Category</label><select id="plans-category-filter" class="field" data-filter="category"><option value="">All categories</option>${options(CATEGORIES, v.categoryFilter)}</select></div><div><label for="plans-state-filter">State</label><select id="plans-state-filter" class="field" data-filter="state"><option value="">All states</option>${options(STATES, v.stateFilter)}</select></div></div>`
        + (v.items.length ? v.items.map(bucketCard).join('') : `<div class="card plans-empty"><span aria-hidden="true">✦</span><h3>${(v.model.bucket || []).length ? 'No dreams match these filters yet.' : 'Our someday starts here.'}</h3><p>${(v.model.bucket || []).length ? 'Try another category or state.' : 'A coffee spot, a faraway city, learning something together — leave a little dream for us.'}</p></div>`);
    }
    function noteCard(note, v, featured) {
      const active = (v.model.hearts && v.model.hearts[note.id] || []).includes(v.model.uid);
      const count = (v.model.hearts && v.model.hearts[note.id] || []).length;
      return `<article class="card ${featured ? 'plans-old-note' : 'plans-note'}">${featured ? '<div class="eyebrow">A little thing worth keeping</div>' : ''}<p class="plans-note-text">${html(note.text)}</p><p class="small">${html(attribution(note, Date.now()))}</p><button type="button" class="btn soft" data-action="heart" data-id="${html(note.id)}" aria-label="${active ? 'Remove your heart from this appreciation' : 'Heart this appreciation'}" aria-pressed="${active}">${active ? '♥' : '♡'}${count ? ` ${count}` : ''}</button></article>`;
    }
    function renderJar(v) {
      const section = element('jar'); if (!section) return;
      const notes = (v.model.jar || []).slice().sort((a, b) => text(b.createdAt).localeCompare(text(a.createdAt)));
      const old = notes.find(note => note.id === v.selectedId);
      section.innerHTML = header('Appreciation Jar', 'The small things I love about us, kept for another day.') + sharing(v) + status(v)
        + `<form class="card plans-editor" data-form="jar"><label for="plans-jar-text">Leave a little appreciation</label><textarea id="plans-jar-text" class="field" maxlength="1500" placeholder="I loved the way you…">${html(v.jarText)}</textarea><p class="small">This note is shared only with your paired person.</p><button type="submit" class="btn primary">Add to our jar</button></form>`
        + (old ? `<h3 class="section-title">A note to come back to</h3>${noteCard(old, v, true)}${notes.length > 1 ? '<button type="button" class="btn soft full" data-action="another">Another from the jar</button>' : ''}` : '<div class="card plans-empty"><span aria-hidden="true">♡</span><h3>A jar for our little joys.</h3><p>Either of you can leave the first note.</p></div>')
        + (notes.length ? `<h3 class="section-title">All our appreciations · ${notes.length}</h3>${notes.map(note => noteCard(note, v, false)).join('')}` : '');
    }
    function render() {
      if (!controller) return;
      const focus = doc.activeElement, focusId = focus && focus.id, start = focus && focus.selectionStart, end = focus && focus.selectionEnd;
      const v = controller.view(); renderBucket(v); renderJar(v);
      const next = focusId && element(focusId);
      if (next && typeof next.focus === 'function') {
        next.focus({preventScroll: true});
        if (typeof next.setSelectionRange === 'function' && typeof start === 'number') try { next.setSelectionRange(start, end); } catch (_) { /* Date/select inputs do not have a text selection. */ }
      }
    }
    function onClick(event) {
      const button = event.target.closest('[data-action]'); if (!button) return;
      const action = button.dataset.action, id = button.dataset.id;
      if (action === 'back') { if (root.go) root.go('us'); return; }
      if (action === 'new') controller.openBucket();
      if (action === 'edit') controller.openBucket(id);
      if (action === 'cancel') controller.cancel();
      if (action === 'planning') controller.changeState(id, 'Planning');
      if (action === 'done') controller.changeState(id, 'Done');
      if (action === 'memory') controller.turnMemory(id);
      if (action === 'heart') controller.heart(id);
      if (action === 'another') controller.anotherNote();
      if (action === 'clear-photo') controller.clearPhoto(button.dataset.field);
      render();
    }
    function onInput(event) {
      const input = event.target;
      if (input.id === 'plans-jar-text') controller.setJarText(input.value);
      if (input.dataset.field) controller.edit(input.dataset.field, input.value);
    }
    function onChange(event) {
      const input = event.target;
      if (input.dataset.filter) {
        const v = controller.view(); controller.setFilters(input.dataset.filter === 'category' ? input.value : v.categoryFilter, input.dataset.filter === 'state' ? input.value : v.stateFilter); render();
      } else if (input.dataset.photo) {
        const task = controller.pick(input.files && input.files[0], input.dataset.photo); render(); Promise.resolve(task).then(render, render);
      } else if (input.dataset.field) { controller.edit(input.dataset.field, input.value); if (input.dataset.field === 'state') render(); }
    }
    function onSubmit(event) {
      if (!event.target.dataset.form) return; event.preventDefault();
      if (event.target.dataset.form === 'bucket') controller.saveBucket();
      if (event.target.dataset.form === 'jar') controller.addNote();
      render();
    }
    function init() {
      if (initialized || !root.UsExtras) return;
      initialized = true;
      controller = createController({get: () => root.UsExtras.get(), mutate: (kind, id, fields) => root.UsExtras.mutate(kind, id, fields), pickPhoto: file => root.UsExtras.pickPhoto(file), id: () => typeof root.newEntityId === 'function' ? root.newEntityId() : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, prefillMemory: value => root.UsFeatures && root.UsFeatures.prefillMemory(value)});
      ['bucket', 'jar'].forEach(id => { const section = element(id); if (!section) return; section.addEventListener('click', onClick); section.addEventListener('input', onInput); section.addEventListener('change', onChange); section.addEventListener('submit', onSubmit); });
      root.UsExtras.subscribe(render); render();
    }
    root.UsPlans = {init, render};
  }
  return {CATEGORIES, STATES, PRIORITIES, MAX_PHOTO, MAX_SOURCE, normalize, changes, filterItems, attribution, chooseOld, photoData, createController, mount};
});
