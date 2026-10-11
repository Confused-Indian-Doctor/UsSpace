/* Extend the existing paired app. No relationship date enters Health/Cycle. */
(function (root) {
  'use strict';
  const element = id => document.getElementById(id);
  function identity() {
    const shared = typeof state !== 'undefined' ? state.sync || {} : {};
    let auth = {signedIn: false, uid: ''};
    try { if (root.UsAuth) auth = JSON.parse(root.UsAuth.status()); } catch (_) {}
    return Object.assign({}, shared, auth, {
      coupleId: auth.signedIn && auth.uid === shared.uid ? shared.coupleId || '' : '',
      paired: !!auth.signedIn && auth.uid === shared.uid && !!shared.paired,
    });
  }
  function updateIdentity() { root.UsRelationship?.onIdentity(identity()); }
  function renderActivity() {
    const target = element('homeRecentActivity');
    if (!target || typeof state === 'undefined') return;
    const entries = (state.notes || []).map(note => ({date: note.date, title: note.text}))
      .concat((state.memories || []).map(memory => ({date: memory.date, title: 'Memory: ' + memory.title})))
      .filter(value => value.date && value.title)
      .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
    target.innerHTML = entries.length ? '<ul class="home-activity-list">' + entries.map(value =>
      '<li>' + esc(String(value.title).slice(0, 160)) + '<small>' + esc(fmtDate(value.date)) + '</small></li>'
    ).join('') + '</ul>' : '<p class="small">Your notes and memories will appear here as you make them.</p>';
  }
  if (typeof NAV_GROUP !== 'undefined') NAV_GROUP['relationship-timeline'] = 'us';
  root.UsRelationship?.init({navigate: id => go(id), getState: () => state});
  const oldRender = render;
  render = function () { oldRender(); root.UsRelationship?.render(); renderActivity(); };
  const oldSettings = openSettings;
  openSettings = function () { oldSettings(); root.UsRelationship?.render(); };
  const oldAuth = root.onUsAuthState;
  root.onUsAuthState = function (value) { oldAuth?.(value); updateIdentity(); };
  const oldSync = root.onUsSyncState;
  root.onUsSyncState = function (value) { oldSync?.(value); updateIdentity(); };
  root.UsExtras?.subscribe?.(() => root.UsRelationship?.render());
  root.homeDateIdea = function () {
    newIdea();
    element('homeDateIdeaCard')?.scrollIntoView?.({behavior: 'smooth', block: 'center'});
  };
  root.homeCall = function () {
    go('comfort');
    root.UsComfort?.callAl?.();
  };
  updateIdentity(); renderActivity();
})(window);
