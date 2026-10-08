/* Add settings and the private Graph rota to the existing app, without a new tab. */
(function (root) {
  'use strict';
  const routes = new Set(['home', 'notes', 'jar', 'letters', 'goals', 'bucket', 'memories', 'calendar']);
  const element = id => document.getElementById(id);
  let pendingOpen = null, openTimer = null;
  function clearPendingOpen() { pendingOpen = null; if (openTimer) root.clearTimeout(openTimer); openTimer = null; }
  function identity() {
    const shared = typeof state !== 'undefined' ? state.sync || {} : {};
    let auth = {signedIn: false, uid: ''};
    try { if (root.UsAuth) auth = JSON.parse(root.UsAuth.status()); } catch (_) {}
    return Object.assign({}, shared, auth, {
      coupleId: auth.signedIn && auth.uid === shared.uid ? shared.coupleId || '' : '',
      paired: !!auth.signedIn && auth.uid === shared.uid && !!shared.paired,
    });
  }
  function refreshIdentity() {
    const account = identity();
    root.UsPreferences?.onIdentity(account);
    root.UsWorkSchedule?.onIdentity(account);
    root.UsNotifications?.refresh();
    if (pendingOpen) {
      if (!account.signedIn || account.uid !== pendingOpen.recipientUid) clearPendingOpen();
      else if (account.paired && account.coupleId === pendingOpen.coupleId) {
        const route = pendingOpen.route; clearPendingOpen(); if (typeof go === 'function') go(route);
      }
    }
  }
  root.onUsNotificationState = function (value) {
    const target = element('notificationDeviceStatus');
    if (!target) return;
    if (value?.error) target.textContent = value.error;
    else if (!value?.signedIn) target.textContent = 'Sign in to set up private push notifications.';
    else if (!value?.enabled) target.textContent = 'Push notifications are off. Choose what you would like to hear about.';
    else if (!value?.permissionGranted) target.textContent = 'Allow notifications in Android settings to receive your chosen updates.';
    else if (!value?.paired) target.textContent = 'Pair your two accounts to receive updates from your person.';
    else if (value?.registered) target.textContent = 'This phone is registered. Delivery also needs your private notification server.';
    else target.textContent = 'Preparing notifications on this phone…';
    if (value?.lastAction && typeof toast === 'function') toast(value.lastAction);
  };
  root.onUsNotificationOpen = function (value) {
    // Native also rechecks current Firebase identity and server membership.
    if (!value || !routes.has(value.route) || !value.recipientUid || !value.coupleId) return;
    const account = identity();
    if (!account.signedIn || account.uid !== value.recipientUid) return;
    clearPendingOpen(); pendingOpen = Object.assign({}, value);
    openTimer = root.setTimeout(clearPendingOpen, 60000);
    refreshIdentity();
  };
  if (typeof NAV_GROUP !== 'undefined') NAV_GROUP['work-schedule'] = 'life';
  root.UsPreferences?.init({
    mount: '#preferencesSettings',
    onNotificationEnable() { root.UsNotifications?.requestPermission(); root.UsNotifications?.refresh(); },
  });
  root.UsWorkSchedule?.init({navigate: id => { if (typeof go === 'function') go(id); }});
  const oldAuth = root.onUsAuthState;
  root.onUsAuthState = function (value) { oldAuth?.(value); refreshIdentity(); };
  const oldSync = root.onUsSyncState;
  root.onUsSyncState = function (value) {
    oldSync?.(value);
    if (pendingOpen && value?.paired && value.coupleId && value.coupleId !== pendingOpen.coupleId) clearPendingOpen();
    refreshIdentity();
  };
  const oldSettings = typeof openSettings === 'function' ? openSettings : null;
  if (oldSettings) openSettings = function () {
    oldSettings(); root.UsPreferences?.render();
    if (root.UsNotifications) {
      try { root.onUsNotificationState(JSON.parse(root.UsNotifications.status())); } catch (_) {}
    }
  };
  refreshIdentity();
})(window);
