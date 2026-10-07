/* Account-scoped, persistent edits for Us. Private comfort activity never enters this store. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UsExtras = api.browser(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const fields = {
    roles: ['alUid', 'yashikaUid'],
    bucket: ['title', 'category', 'location', 'targetDate', 'priority', 'notes', 'photoId', 'state', 'completedDate', 'completedPhotoId'],
    jar: ['text'], heart: ['active'], photo: ['data'],
    draft: ['category', 'title', 'body'], letter: ['category', 'title', 'body'],
  };
  const categories = ['Travel', 'Food', 'Adventure', 'Date', 'Life', 'Learning', 'Silly', 'Future home'];
  const letterCategories = ['miss', 'sad', 'anxious', 'sleep', 'reassurance', 'proud', 'laugh', 'argument'];
  const clone = x => JSON.parse(JSON.stringify(x));
  const safeId = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,140}$/.test(x) && !['__proto__', 'prototype', 'constructor'].includes(x);
  const imageData = x => typeof x === 'string' && x.length <= 140000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(x);
  const empty = () => ({uid: '', coupleId: '', partnerUid: '', members: [], ready: false, error: '', roles: null, bucket: [], jar: [], hearts: {}, photos: {}, letters: [], drafts: [], pending: 0});
  function validFields(kind, value) {
    if (!fields[kind] || !value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (Object.keys(value).some(k => !fields[kind].includes(k))) return false;
    for (const [key, v] of Object.entries(value)) {
      if (kind === 'heart') { if (key !== 'active' || typeof v !== 'boolean') return false; continue; }
      if (typeof v !== 'string') return false;
      const max = key === 'data' ? 140000 : key === 'body' ? 12000 : key === 'notes' ? 4000 : key === 'text' ? 1500 : key === 'location' ? 240 : key === 'title' && ['draft', 'letter'].includes(kind) ? 200 : 160;
      if (v.length > max) return false;
      if (['alUid', 'yashikaUid', 'photoId', 'completedPhotoId'].includes(key) && v && !safeId(v)) return false;
      if (key === 'data' && !imageData(v)) return false;
      if (key === 'category' && !(kind === 'bucket' ? categories : letterCategories).includes(v)) return false;
      if (key === 'state' && !['Dreaming', 'Planning', 'Booked', 'Done'].includes(v)) return false;
      if (key === 'priority' && !['Low', 'Normal', 'High'].includes(v)) return false;
      if (['targetDate', 'completedDate'].includes(key) && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    }
    return Object.keys(value).length > 0;
  }
  function apply(model, op) {
    const f = op.fields;
    const name = model.members.find(m => m.uid === model.uid)?.name || 'Me';
    const upsert = (key, value) => {
      const i = model[key].findIndex(x => x.id === op.id);
      if (i < 0) model[key].unshift(Object.assign({id: op.id}, value));
      else model[key][i] = Object.assign({}, model[key][i], value);
    };
    if (op.kind === 'bucket') upsert('bucket', Object.assign(model.bucket.some(x => x.id === op.id) ? {} : {suggestedBy: model.uid, suggestedName: name, category: 'Date', priority: 'Normal', state: 'Dreaming', createdAt: op.at}, f, {updatedAt: op.at, updatedBy: model.uid}));
    if (op.kind === 'jar') upsert('jar', Object.assign(model.jar.some(x => x.id === op.id) ? {} : {authorUid: model.uid, authorName: name, createdAt: op.at}, f));
    if (op.kind === 'photo') model.photos[op.id] = f.data;
    if (op.kind === 'roles') model.roles = clone(f);
    if (op.kind === 'heart') {
      const users = new Set(model.hearts[op.id] || []);
      if (f.active) users.add(model.uid); else users.delete(model.uid);
      model.hearts[op.id] = [...users];
    }
    if (op.kind === 'draft') upsert('drafts', Object.assign({coupleId: model.coupleId, updatedAt: op.at}, f));
    if (op.kind === 'letter') upsert('letters', Object.assign({authorUid: model.uid, recipientUid: model.roles?.yashikaUid || '', publishedAt: op.at}, f));
    return model;
  }
  class Store {
    constructor(storage, send, changed, schedule = setTimeout, cancel = clearTimeout, newId) {
      this.storage = storage; this.send = send; this.changed = changed || (() => {});
      this.schedule = schedule; this.cancel = cancel;
      this.newId = newId || (() => 'op_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2));
      this.base = empty(); this.queue = []; this.scope = ''; this.timer = null; this.inFlight = '';
    }
    configure(session) {
      const next = session?.signedIn && session?.paired && safeId(session.uid) && safeId(session.coupleId) ? session.uid + ':' + session.coupleId : '';
      if (next === this.scope) return false;
      this.cancel(this.timer); this.timer = null; this.inFlight = ''; this.scope = next; this.base = empty(); this.queue = [];
      if (next) {
        this.base.uid = session.uid; this.base.coupleId = session.coupleId;
        try {
          const cache = JSON.parse(this.storage.getItem(this.key('cache')) || 'null');
          if (cache?.uid === session.uid && cache?.coupleId === session.coupleId) this.base = Object.assign(empty(), cache, {ready: false, error: ''});
          const saved = JSON.parse(this.storage.getItem(this.key('pending')) || '[]');
          this.queue = Array.isArray(saved) ? saved.filter(x => x?.uid === session.uid && x?.coupleId === session.coupleId && safeId(x.operationId) && safeId(x.id) && validFields(x.kind, x.fields)) : [];
        } catch (_) { this.queue = []; }
      }
      this.notify(); return true;
    }
    key(part) { return 'usspace_us_extras_v1:' + this.scope + ':' + part; }
    get() {
      const model = clone(this.base);
      for (const op of this.queue) apply(model, op);
      model.pending = this.queue.length;
      return model;
    }
    photo(id) {
      const queued = this.queue.findLast(x => x.kind === 'photo' && x.id === id);
      const value = queued ? queued.fields.data : this.base.photos[id];
      return imageData(value) ? value : '';
    }
    notify() { this.changed(this.get()); }
    persistQueue() { this.storage.setItem(this.key('pending'), JSON.stringify(this.queue)); }
    mutate(kind, id, value) {
      if (!this.scope || !this.base.ready) return false;
      if (!safeId(id) || !validFields(kind, value)) { this.base.error = 'Please check this entry before saving.'; this.notify(); return false; }
      if (kind === 'roles' && (value.alUid === value.yashikaUid || !this.base.members.some(x => x.uid === value.alUid) || !this.base.members.some(x => x.uid === value.yashikaUid))) return false;
      if (['draft', 'letter'].includes(kind) && this.base.roles?.alUid !== this.base.uid) return false;
      const op = {operationId: this.newId(), uid: this.base.uid, coupleId: this.base.coupleId, kind, id, fields: clone(value), at: new Date().toISOString()};
      if (!safeId(op.operationId)) return false;
      this.queue.push(op);
      try { this.persistQueue(); } catch (_) { this.queue.pop(); this.base.error = 'This phone has no room to save another edit. Free some storage, then try again.'; this.notify(); return false; }
      this.base.error = ''; this.notify(); this.pump(); return true;
    }
    snapshot(value) {
      if (!this.scope || value?.uid !== this.base.uid || value?.coupleId !== this.base.coupleId) return false;
      const fresh = Object.assign(empty(), value);
      for (const key of ['bucket', 'jar', 'members', 'letters', 'drafts']) if (!Array.isArray(fresh[key])) fresh[key] = [];
      fresh.hearts = fresh.hearts && typeof fresh.hearts === 'object' ? fresh.hearts : {};
      fresh.photos = Object.fromEntries(Object.entries(fresh.photos || {}).filter(([id, data]) => safeId(id) && imageData(data)));
      this.base = fresh;
      const cache = Object.assign({}, fresh, {photos: {}, ready: false});
      try { this.storage.setItem(this.key('cache'), JSON.stringify(cache)); } catch (_) { /* Firestore also keeps its own offline cache. */ }
      this.notify(); this.pump(); return true;
    }
    ack(value) {
      if (!this.scope || value?.uid !== this.base.uid || value?.coupleId !== this.base.coupleId || value.operationId !== this.inFlight) return false;
      this.cancel(this.timer); this.timer = null; this.inFlight = '';
      if (value.success) {
        const op = this.queue.shift();
        if (op) apply(this.base, op);
        try { this.persistQueue(); } catch (_) { /* A replay is safe: the native transaction has an immutable receipt. */ }
        this.base.error = ''; this.notify(); this.pump();
      } else {
        this.base.error = value.error || 'Saved on this phone; waiting to sync.';
        this.notify(); this.timer = this.schedule(() => this.pump(), 5000);
      }
      return true;
    }
    pump() {
      if (!this.scope || !this.base.ready || this.inFlight || !this.queue.length) return;
      const op = this.queue[0]; this.inFlight = op.operationId;
      try { this.send(clone(op)); } catch (_) { this.inFlight = ''; this.base.error = 'Saved on this phone; waiting for the connection.'; this.notify(); this.timer = this.schedule(() => this.pump(), 5000); return; }
      if (this.inFlight === op.operationId) this.timer = this.schedule(() => { this.inFlight = ''; this.pump(); }, 30000);
    }
  }
  async function pickPhoto(root, file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo.');
    if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.');
    const url = root.URL.createObjectURL(file);
    const image = new root.Image();
    try {
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('This photo could not be opened.')); image.src = url; });
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60000000) throw new Error('Please choose a smaller photo.');
      let scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = root.document.createElement('canvas');
      for (let round = 0; round < 4; round++) {
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Photo attachments are unavailable on this phone.');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.82, 0.65, 0.48, 0.32]) { const data = canvas.toDataURL('image/jpeg', quality); if (imageData(data)) return data; }
        scale *= 0.65;
      }
      throw new Error('This photo is too detailed to attach. Try cropping it first.');
    } finally { root.URL.revokeObjectURL(url); }
  }
  function browser(root) {
    const subscribers = new Set(); let hooks = {};
    const store = new Store(root.localStorage, op => {
      if (!root.UsSpaceExtras?.mutate) throw new Error('Native sync unavailable');
      const {operationId, uid, coupleId, kind, id, fields} = op;
      root.UsSpaceExtras.mutate(JSON.stringify({operationId, uid, coupleId, kind, id, fields}));
    }, model => { for (const fn of subscribers) { try { fn(model); } catch (e) { root.console?.error('Us feature render failed', e); } } }, root.setTimeout.bind(root), root.clearTimeout.bind(root));
    root.onUsExtrasSnapshot = x => store.snapshot(x);
    root.onUsExtrasAck = x => store.ack(x);
    return {
      init(value) { hooks = value || {}; },
      get: () => store.get(),
      configure(session) { const changed = store.configure(session); if (changed && session?.signedIn) this.refresh(); return changed; },
      refresh() { try { root.UsSpaceExtras?.refresh(); } catch (_) {} },
      mutate: (kind, id, value) => store.mutate(kind, id, value),
      subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
      photo: id => store.photo(id),
      pickPhoto: file => pickPhoto(root, file),
      sendMessage(text) { return hooks.sendMessage?.(text) || false; },
      openLink(url) {
        if (typeof url !== 'string' || !/^(https:\/\/|tel:[+\d]|sms:[+\d])/.test(url) || /[\r\n]/.test(url)) return false;
        try { if (root.UsSpaceExtras?.openLink) { root.UsSpaceExtras.openLink(url); return true; } } catch (_) {}
        try { root.open?.(url, '_blank', 'noopener,noreferrer'); return true; } catch (_) { return false; }
      },
    };
  }
  return {Store, validFields, imageData, apply, empty, pickPhoto, browser};
});
