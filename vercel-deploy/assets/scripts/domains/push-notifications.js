const SVITA_ONESIGNAL_APP_ID = String(globalThis.SVITA_ONESIGNAL_APP_ID || '').trim();

function _oneSignalReady() {
  return !!(globalThis.OneSignalDeferred && Array.isArray(globalThis.OneSignalDeferred));
}

function _oneSignalEnabledConfig() {
  return !!SVITA_ONESIGNAL_APP_ID;
}

function _ensureOneSignalQueue() {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
}

function _onesignalSetExternalUser() {
  const userId = getUser()?.id;
  if (!userId || !_oneSignalEnabledConfig()) return;
  _ensureOneSignalQueue();
  OneSignalDeferred.push(async function (OneSignal) {
    try {
      await OneSignal.login(String(userId));
    } catch (e) {
      console.warn('[svita] OneSignal login:', e?.message || e);
    }
  });
}

function _onesignalLogoutUser() {
  if (!_oneSignalEnabledConfig()) return;
  _ensureOneSignalQueue();
  OneSignalDeferred.push(async function (OneSignal) {
    try {
      await OneSignal.logout();
    } catch (e) {
      console.warn('[svita] OneSignal logout:', e?.message || e);
    }
  });
}

async function initOneSignal() {
  if (!_oneSignalEnabledConfig()) return { ok: false, reason: 'missing-app-id' };
  _ensureOneSignalQueue();
  OneSignalDeferred.push(async function (OneSignal) {
    try {
      await OneSignal.init({
        appId: SVITA_ONESIGNAL_APP_ID,
        serviceWorkerPath: '/OneSignalSDKWorker.js',
        serviceWorkerParam: { scope: '/' },
        allowLocalhostAsSecureOrigin: true,
        notifyButton: { enable: false }
      });
      if (isLoggedIn()) _onesignalSetExternalUser();
    } catch (e) {
      console.warn('[svita] OneSignal init:', e?.message || e);
    }
  });
  return { ok: true };
}

async function enablePushNotifications({ silent = false } = {}) {
  if (!_oneSignalEnabledConfig()) {
    if (!silent) showToast(_langText('OneSignal nije podešen', 'OneSignal is not configured'), 'error', 2200);
    return { ok: false, reason: 'missing-app-id' };
  }
  _ensureOneSignalQueue();
  OneSignalDeferred.push(async function (OneSignal) {
    try {
      if (Notification.permission !== 'granted') {
        await OneSignal.Notifications.requestPermission();
      }
      if (Notification.permission === 'granted') {
        await OneSignal.User.PushSubscription.optIn();
        if (isLoggedIn()) _onesignalSetExternalUser();
        if (!silent) showToast(_langText('Push obaveštenja su uključena', 'Push notifications are enabled'), 'success', 1800);
      } else if (!silent) {
        showToast(_langText('Dozvola za obaveštenja nije odobrena', 'Notification permission was not granted'), 'info', 2200);
      }
    } catch (e) {
      console.warn('[svita] enable push:', e?.message || e);
      if (!silent) showToast(_langText('Nismo uspeli da uključimo obaveštenja', 'Could not enable notifications'), 'error', 2200);
    }
  });
  return { ok: true };
}

async function disablePushNotifications({ silent = false } = {}) {
  if (!_oneSignalEnabledConfig()) return { ok: false };
  _ensureOneSignalQueue();
  OneSignalDeferred.push(async function (OneSignal) {
    try {
      await OneSignal.User.PushSubscription.optOut();
      if (!silent) showToast(_langText('Push obaveštenja su isključena', 'Push notifications are disabled'), 'info', 1600);
    } catch (e) {
      console.warn('[svita] disable push:', e?.message || e);
    }
  });
  return { ok: true };
}

async function sendPushEvent(type, payload = {}) {
  if (!isLoggedIn() || !_isSupabaseConfigured() || !_oneSignalEnabledConfig()) return;
  try {
    await _supaFetch('/functions/v1/onesignal-dispatch', {
      method: 'POST',
      body: JSON.stringify({
        eventType: type,
        payload
      })
    });
  } catch (e) {
    console.warn('[svita] sendPushEvent:', e?.message || e);
  }
}

async function syncPushSubscriptionIfPermitted() {
  if (!_oneSignalEnabledConfig()) return;
  if (!isLoggedIn()) return;
  _onesignalSetExternalUser();
  if (Notification.permission === 'granted') {
    await enablePushNotifications({ silent: true });
  }
}

window.initOneSignal = initOneSignal;
window.enablePushNotifications = enablePushNotifications;
window.disablePushNotifications = disablePushNotifications;
window.sendPushEvent = sendPushEvent;
window.syncPushSubscriptionIfPermitted = syncPushSubscriptionIfPermitted;
window._onesignalLogoutUser = _onesignalLogoutUser;
window._onesignalSetExternalUser = _onesignalSetExternalUser;
