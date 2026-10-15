import assert from 'node:assert/strict';
class DB {
  constructor() {this.data = new Map(); this.updateTimes = new Map(); this.lock = Promise.resolve(); this.readHook = null; this.writeHook = null;}
  seed(path, value) {this.data.set(path, structuredClone(value)); return this;}
  doc(path) {return new Ref(this, path);}
  collection(path) {return new Collection(this, path);}
  async runTransaction(callback) {
    const prior = this.lock; let release; this.lock = new Promise(resolve => {release = resolve;}); await prior;
    const writes = [];
    try {
      const result = await callback({get: reference => reference.get(),
        create: (reference, value) => writes.push(() => {assert.equal(this.data.has(reference.path), false); this.writeHook?.(reference.path, value); this.seed(reference.path, value);}),
        update: (reference, value) => writes.push(() => {assert.ok(this.data.has(reference.path)); this.writeHook?.(reference.path, value); this.seed(reference.path, {...this.data.get(reference.path), ...value});}),
        set: (reference, value) => writes.push(() => {this.writeHook?.(reference.path, value); this.seed(reference.path, value);}),
        delete: reference => writes.push(() => this.data.delete(reference.path))});
      for (const write of writes) write();
      return result;
    } finally {release();}
  }
}
class Ref {
  constructor(db, path) {this.db = db; this.path = path; this.id = path.split('/').at(-1);}
  collection(name) {return new Collection(this.db, `${this.path}/${name}`);}
  async get() {this.db.readHook?.(this.path); const value = this.db.data.get(this.path); return {exists: value !== undefined, id: this.id, ref: this, updateTime: this.db.updateTimes.get(this.path), data: () => structuredClone(value)};}
  async update(patch) {assert.ok(this.db.data.has(this.path)); this.db.writeHook?.(this.path, patch); this.db.seed(this.path, {...this.db.data.get(this.path), ...patch});}
}
class Collection {
  constructor(db, path, filter = null, maximum = Infinity) {this.db = db; this.path = path; this.filter = filter; this.maximum = maximum;}
  doc(id) {return this.db.doc(`${this.path}/${id}`);}
  where(key, op, value) {assert.equal(op, '=='); return new Collection(this.db, this.path, {key, value}, this.maximum);}
  limit(maximum) {return new Collection(this.db, this.path, this.filter, maximum);}
  async get() {return {docs: await Promise.all([...this.db.data.keys()].filter(path => path.startsWith(this.path + '/') && path.slice(this.path.length + 1).indexOf('/') === -1)
    .filter(path => !this.filter || this.db.data.get(path)[this.filter.key] === this.filter.value).slice(0, this.maximum).map(path => this.db.doc(path).get()))};}
}

export {DB};
