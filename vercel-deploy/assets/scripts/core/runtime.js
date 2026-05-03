// --- nav() ---
const HISTORY_MAX = 30;
const navHistory = [];
const DATA_CACHE = new Map();
let PENDING_REVIEW_TASKS = [];
let _activeReviewTaskId = null;
const CACHE_TTL = {
  profile: 30000,
  venue: 30000,
  organizer: 30000,
  inbox: 12000,
  notifications: 12000,
  directory: 45000,
  following: 20000,
  blocked: 20000,
  venueAnalytics: 15000
};
let _organizerClaimLookupSupported = null;
let _myClaimedOrganizerLookupPromise = null;
const _lazyPageLoadPromises = new Map();
let _lastNetworkToastAt = 0;
let _networkEventsBound = false;

function _escAttr(str = '') {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _escJsArg(str = '') {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// i18n-safe toast wrapper for new/updated code paths.
function _toast(sr, en, type = 'info', duration = 2800) {
  showToast(_langText(sr, en), type, duration);
}

function _safeCssUrl(url = '') {
  return encodeURI(String(url ?? '').replace(/[\r\n\f]/g, ''))
    .replace(/'/g, '%27')
    .replace(/"/g, '%22')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\\/g, '%5C');
}

function _notifyNetworkIssue(mode = 'network') {
  const now = Date.now();
  if (now - _lastNetworkToastAt < 4000) return;
  _lastNetworkToastAt = now;
  if (mode === 'offline') {
    _toast('Nema interneta. Proveri konekciju i pokušaj ponovo.', 'You are offline. Check your connection and try again.', 'warning', 2800);
    return;
  }
  if (mode === 'server') {
    _toast('Server trenutno ne odgovara. Pokušaj ponovo.', 'Server is not responding right now. Please try again.', 'error', 3000);
    return;
  }
  _toast('Došlo je do greške pri povezivanju. Pokušaj ponovo.', 'A network error occurred. Please try again.', 'error', 3000);
}

function _bindNetworkPresenceEvents() {
  if (_networkEventsBound || typeof window === 'undefined') return;
  _networkEventsBound = true;
  window.addEventListener('offline', () => _notifyNetworkIssue('offline'));
  window.addEventListener('online', () => {
    _toast('Ponovo si online.', 'You are back online.', 'success', 1800);
  });
}

function appConfirm(messageSr = '', messageEn = '') {
  const sr = String(messageSr || '').trim();
  const en = String(messageEn || '').trim();
  const message = _langText(sr || en || 'Da li želiš da nastaviš?', en || sr || 'Do you want to continue?');
  if (typeof document === 'undefined' || !document.body) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const existing = document.getElementById('svita-confirm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'svita-confirm-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:12000;background:rgba(15,14,13,.56);display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `
      <div style="width:min(420px,96vw);background:#fffdf8;border:1px solid var(--border);border-radius:16px;box-shadow:0 22px 72px rgba(0,0,0,.24);padding:16px">
        <div style="font-size:17px;font-weight:800;color:var(--ink);margin-bottom:8px">${_langText('Potvrda', 'Confirmation')}</div>
        <div style="font-size:14px;line-height:1.55;color:var(--ink3);margin-bottom:14px">${_escAttr(message)}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button type="button" id="svita-confirm-cancel" class="btn btn-ghost btn-sm">${_langText('Odustani', 'Cancel')}</button>
          <button type="button" id="svita-confirm-ok" class="btn btn-purple btn-sm">${_langText('Potvrdi', 'Confirm')}</button>
        </div>
      </div>
    `;

    const done = (value) => {
      try { overlay.remove(); } catch (e) {}
      resolve(!!value);
    };
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) done(false);
    });
    overlay.querySelector('#svita-confirm-cancel')?.addEventListener('click', () => done(false));
    overlay.querySelector('#svita-confirm-ok')?.addEventListener('click', () => done(true));
    document.body.appendChild(overlay);
  });
}
globalThis.appConfirm = appConfirm;

function _renderPageLoadingSkeleton() {
  return `
    <div class="page-loading-shell" aria-live="polite" aria-busy="true">
      <div class="page-loading-heading skeleton"></div>
      <div class="page-loading-sub skeleton"></div>
      <div class="page-loading-card">
        <div class="page-loading-line skeleton"></div>
        <div class="page-loading-line page-loading-line-short skeleton"></div>
      </div>
      <div class="page-loading-card">
        <div class="page-loading-line skeleton"></div>
        <div class="page-loading-line skeleton"></div>
        <div class="page-loading-line page-loading-line-short skeleton"></div>
      </div>
      <div class="page-loading-foot skeleton"></div>
    </div>
  `;
}

async function retryLazyPageLoad(id = '') {
  const pageId = String(id || '').trim();
  if (!pageId) return;
  const target = document.getElementById('page-' + pageId);
  if (target) {
    target.dataset.lazyLoaded = '';
  }
  await _ensureLazyPageLoaded(pageId);
  if (document.getElementById('page-' + pageId)?.dataset.lazyLoaded === '1') {
    if (document.getElementById('page-' + pageId)?.classList.contains('active')) {
      applyLang(getCurrentLang());
    }
  }
}
globalThis.retryLazyPageLoad = retryLazyPageLoad;

function _cacheKey(scope = '', id = 'default') {
  return `${scope}:${id}`;
}

function _getCached(scope, id = 'default') {
  const entry = DATA_CACHE.get(_cacheKey(scope, id));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    DATA_CACHE.delete(_cacheKey(scope, id));
    return null;
  }
  return entry.value;
}

function _setCached(scope, id = 'default', value = null, ttl = 15000) {
  DATA_CACHE.set(_cacheKey(scope, id), {
    value,
    expiresAt: Date.now() + ttl
  });
  return value;
}

function _clearCache(scope = '', id = null) {
  if (!scope) {
    DATA_CACHE.clear();
    return;
  }
  if (id !== null) {
    DATA_CACHE.delete(_cacheKey(scope, id));
    return;
  }
  Array.from(DATA_CACHE.keys()).forEach(key => {
    if (key.startsWith(`${scope}:`)) DATA_CACHE.delete(key);
  });
}

function getCurrentRole() {
  const user = getUser?.();
  return (
    user?.role ||
    user?.user_metadata?.role ||
    user?.user_role ||
    _session?.user?.role ||
    _session?.user?.user_metadata?.role ||
    _session?.user_role ||
    'user'
  );
}

function getRoleCapabilities(role = getCurrentRole()) {
  const resolvedRole = role || 'user';
  const isAdmin = resolvedRole === 'admin';
  const isVenue = resolvedRole === 'venue';
  const isUser = !isAdmin && !isVenue;
  return {
    role: resolvedRole,
    isAdmin,
    isVenue,
    isUser,
    canModerate: isAdmin,
    canManageOrganizerProfile: isAdmin || isVenue,
    canPublishManagedEvents: isAdmin || isVenue,
    canSubmitEventLead: true,
    canCreateInvites: true,
    needsReviewForStandaloneCreate: isUser
  };
}

function _canLoadVenueDashboard(role = null) {
  return getRoleCapabilities(role).canManageOrganizerProfile;
}

function _ensureFormFieldIdentityAndLabels() {
  if (typeof document === 'undefined') return;
  const fields = Array.from(document.querySelectorAll('input, select, textarea'));
  let generatedIdx = 0;

  fields.forEach((field) => {
    const tag = String(field.tagName || '').toLowerCase();
    const type = String(field.getAttribute('type') || '').toLowerCase();
    const isButtonLike = tag === 'input' && ['button', 'submit', 'reset', 'image', 'hidden'].includes(type);
    if (isButtonLike) return;

    if (!field.id) {
      field.id = `fld-auto-${++generatedIdx}`;
    }
    if (!field.getAttribute('name')) {
      field.setAttribute('name', field.id);
    }
  });

  const labels = Array.from(document.querySelectorAll('label'));
  labels.forEach((label) => {
    if (label.getAttribute('for')) return;

    let field = label.querySelector('input, select, textarea');
    if (!field) {
      const container = label.closest('.form-group, .field, .row, .input-wrap') || label.parentElement;
      if (container) {
        field = container.querySelector('input, select, textarea');
      }
    }
    if (!field) {
      let sibling = label.nextElementSibling;
      while (sibling && !field) {
        if (sibling.matches?.('input, select, textarea')) field = sibling;
        else field = sibling.querySelector?.('input, select, textarea') || null;
        sibling = field ? null : sibling.nextElementSibling;
      }
    }
    if (!field) return;

    if (!field.id) {
      field.id = `fld-auto-${++generatedIdx}`;
    }
    if (!field.getAttribute('name')) {
      field.setAttribute('name', field.id);
    }
    label.setAttribute('for', field.id);
  });
}

async function _ensureLazyPageLoaded(id = '') {
  const pageId = String(id || '').trim();
  if (!pageId) return true;
  const target = document.getElementById('page-' + pageId);
  if (!target) return false;
  const lazySrc = target.getAttribute('data-lazy-src') || '';
  if (!lazySrc) return true;
  if (target.dataset.lazyLoaded === '1') return true;
  if (_lazyPageLoadPromises.has(pageId)) {
    return _lazyPageLoadPromises.get(pageId);
  }
  const loadPromise = (async () => {
    try {
      target.innerHTML = _renderPageLoadingSkeleton();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw Object.assign(new Error('Offline'), { code: 'OFFLINE' });
      }
      const response = await fetch(lazySrc, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const html = await response.text();
      target.innerHTML = html;
      target.dataset.lazyLoaded = '1';
      _ensureFormFieldIdentityAndLabels();
      applyLang(getCurrentLang());
      return true;
    } catch (err) {
      console.warn('[svita] lazy page load failed for', pageId, err?.message || err);
      const isOffline = err?.code === 'OFFLINE' || (typeof navigator !== 'undefined' && navigator.onLine === false);
      _notifyNetworkIssue(isOffline ? 'offline' : 'network');
      target.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">${_langText('Sadržaj nije učitan.', 'Content failed to load.')}</div>
          <div class="empty-sub">${_langText('Proveri internet i pokušaj ponovo.', 'Check your connection and try again.')}</div>
          <button class="btn btn-outline btn-sm" onclick="retryLazyPageLoad('${_escJsArg(pageId)}')">${_langText('Pokušaj ponovo', 'Try again')}</button>
        </div>
      `;
      return false;
    } finally {
      _lazyPageLoadPromises.delete(pageId);
    }
  })();
  _lazyPageLoadPromises.set(pageId, loadPromise);
  return loadPromise;
}

async function nav(id, opts = {}) {
  const requestedId = id;
  _bindNetworkPresenceEvents();
  const goUnifiedHome = id === 'home';
  const currentActivePage = document.querySelector('.page.active');
  const currentActiveId = currentActivePage?.id?.replace(/^page-/, '') || '';
  if (goUnifiedHome) id = 'browse';
  const authRequiredPages = new Set(['profile','edit-profile','password-security','edit-venue','create','chats','chat','notif','settings','venue','venue-public','report','review','blocked-users']);
  const adminRequiredPages = new Set(['admin-drafts','admin-organizers','admin-moderation']);
  const venueRequiredPages = new Set(['venue','edit-venue']);
  if (authRequiredPages.has(id) && !isLoggedIn()) {
    showToast(_langText('Prijavi se da nastaviš', 'Sign in to continue'), 'info', 1800);
    id = 'login';
  }
  if (adminRequiredPages.has(id) && !isAdminUser()) {
    showToast(_langText('Admin pristup nije dostupan za ovaj nalog.', 'Admin access is not available for this account.'), 'error', 2200);
    id = isLoggedIn() ? 'settings' : 'login';
  }
  if (venueRequiredPages.has(id)) {
    const role = getCurrentRole();
    if (!getRoleCapabilities(role).canManageOrganizerProfile) {
      showToast(_langText('Organizer panel je dostupan samo organizer ili admin nalozima.', 'The organizer panel is available only to organizer or admin accounts.'), 'info', 2200);
      id = isLoggedIn() ? 'profile' : 'login';
    }
  }
  if (id === 'notif') { setTimeout(loadNotifications, 100); }
  if (id === 'review' && typeof loadPendingReviewTasks === 'function') {
    setTimeout(() => loadPendingReviewTasks({ sync:true, render:true }), 100);
  }
  const isAdminToAdminSwitch = currentActiveId.startsWith('admin-') && id.startsWith('admin-');
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.classList.remove('no-page-anim');
  });
  await _ensureLazyPageLoaded(id);
  const target = document.getElementById('page-' + id);
  if (!target) { console.warn('[svita] nav: page-' + id + ' not found'); return; }
  if (id !== 'chat' && typeof _unsubscribeChat === 'function') {
    _unsubscribeChat();
  }
  if (isAdminToAdminSwitch || opts.noPageAnim) target.classList.add('no-page-anim');
  target.classList.add('active');
  if (id === 'register') {
    const forcedType = opts.regType === 'venue' ? 'venue' : 'user';
    setTimeout(() => {
      _syncBirthYearInputBounds();
      selectRegType(forcedType);
    }, 0);
  }
if (id === 'venue-onboarding') {
  setTimeout(() => {
    _resetVenueOnboardingUiFallback();
    if (typeof resetVenueOnboarding === 'function') resetVenueOnboarding();
  }, 50);
}
if (id === 'onboarding') {
  setTimeout(() => {
    _syncBirthYearInputBounds();
    _resetUserOnboardingUiFallback();
    if (typeof resetUserOnboarding === 'function') resetUserOnboarding();
  }, 50);
}
  if (id === 'login') {
    setTimeout(() => {
      const pendingNotice = _consumePendingAuthNotice();
      _renderAuthNotice('login-auth-notice', pendingNotice);
      if (pendingNotice?.email) {
        const loginEmail = document.getElementById('login-email');
        if (loginEmail && !loginEmail.value) loginEmail.value = pendingNotice.email;
      }
    }, 0);
  } else {
    _renderAuthNotice('login-auth-notice', null);
  }
  if (!isAdminToAdminSwitch && !opts.preserveScroll) {
    window.scrollTo(0, 0);
  }
  _ensureFormFieldIdentityAndLabels();
  setTimeout(() => _ensureFormFieldIdentityAndLabels(), 0);
  // History: ne dupliraj isti id uzastopno
  if (!opts.skipHistory && navHistory[navHistory.length - 1] !== id) {
    navHistory.push(id);
    if (navHistory.length > HISTORY_MAX) navHistory.shift();
  }
  const hideNav = ['landing','login','register','onboarding','venue-onboarding'].includes(id);
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.classList.toggle('show', isLoggedIn() && !hideNav);
  syncBrowseGuestActions();
  if (typeof syncAdminUI === 'function') {
    setTimeout(() => syncAdminUI(), 0);
  }
  if (goUnifiedHome) {
    setBN(0);
    setTimeout(() => {
      switchBrowseTab('events');
    }, 0);
  }
  if (id === 'profile') {
    setTimeout(() => loadMyProfile(), 0);
  }
  if (id === 'edit-profile') {
    setTimeout(() => {
      _syncBirthYearInputBounds();
      loadEditProfileForm();
    }, 0);
  }
  if (id === 'password-security') {
    setTimeout(() => loadPasswordSecurityForm(), 0);
  }
  if (id === 'edit-venue') {
    setTimeout(() => loadEditVenueForm(), 0);
  }
  if (id === 'create') {
    setTimeout(() => loadCreateForm(), 0);
  }
  if (id === 'settings') {
    setTimeout(() => syncSettingsPreferenceUI(), 0);
  }
  if (id === 'chats') {
    setTimeout(() => loadChatsInbox?.(), 0);
  }
  if (id === 'blocked-users') {
    setTimeout(() => loadBlockedProfiles(), 0);
  }
  if (id === 'venue') {
    setTimeout(() => loadMyVenueDashboard(), 0);
  }
  if (id === 'venue-public') {
    setTimeout(() => {
      if (typeof renderPublicVenueProfile === 'function') {
        renderPublicVenueProfile().catch(() => {});
      }
    }, 0);
  }
}

function _resetUserOnboardingUiFallback() {
  obStep = 1;
  for (let i = 1; i <= obTotalSteps; i++) {
    const stepEl = document.getElementById('ob' + i);
    if (stepEl) stepEl.classList.toggle('active', i === 1);
    const dotEl = document.getElementById('obdot' + i);
    if (dotEl) {
      dotEl.classList.remove('active', 'done');
      if (i === 1) dotEl.classList.add('active');
    }
  }
  const barEl = document.getElementById('ob-bar');
  if (barEl) barEl.style.width = (1 / obTotalSteps * 100) + '%';
  const backEl = document.getElementById('ob-back');
  if (backEl) backEl.style.display = 'none';
  const nextEl = document.getElementById('ob-next');
  if (nextEl) nextEl.textContent = 'Nastavi';
}

function _resetVenueOnboardingUiFallback() {
  if (typeof vobStep !== 'undefined') vobStep = 1;
  const steps = typeof vobTotal === 'number' && vobTotal > 0 ? vobTotal : 3;
  for (let i = 1; i <= steps; i++) {
    const stepEl = document.getElementById('vob' + i);
    if (stepEl) stepEl.classList.toggle('active', i === 1);
  }
  const barEl = document.getElementById('vob-bar');
  if (barEl) barEl.style.width = (1 / steps * 100) + '%';
  const backEl = document.getElementById('vob-back');
  if (backEl) backEl.style.display = 'none';
  const nextEl = document.getElementById('vob-next');
  if (nextEl) nextEl.textContent = 'Nastavi';
}

function syncBrowseGuestActions() {
  const guestActions = document.getElementById('browse-guest-actions');
  if (!guestActions) return;
  guestActions.style.display = isLoggedIn() ? 'none' : 'flex';
}

function _looksLikeUuid(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function scrollLandingSection(sectionId) {
  nav('landing');
  requestAnimationFrame(() => {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
  });
}

function navBack() {
  navHistory.pop();
  const prev = navHistory.length > 0
    ? navHistory[navHistory.length - 1]
    : 'home';
  nav(prev, { skipHistory: true });
}

// --- setBN() - active state na bottom nav ---
function setBN(idx) {
  document.querySelectorAll('.bn-item').forEach((b,i) => b.classList.toggle('active', i === idx));
}

// --- i18n ---
function getCurrentLang() {
  return localStorage.getItem('mitmi_lang') || window.curLang || 'sr';
}

function _langText(sr, en) {
  return getCurrentLang() === 'en' ? en : sr;
}

function _organizerCategoryMeta(type = '') {
  const raw = String(type || '').toLowerCase().trim();
  if (!raw) return { key: 'organizer', sr: 'Organizator događaja', en: 'Event organiser', emoji: '📣', bg: 'ev-img-a' };
  if (raw.includes('kafana') || raw.includes('etno bar') || raw.includes('tambur')) return { key: 'kafana', sr: 'Kafana / etno bar', en: 'Tavern / ethno bar', emoji: '🥂', bg: 'ev-img-d' };
  if (raw.includes('klub') || raw.includes('bar')) return { key: 'club', sr: 'Klub / bar', en: 'Club / bar', emoji: '🎵', bg: 'ev-img-a' };
  if (raw.includes('restoran') || raw.includes('kafi') || raw.includes('cafe')) return { key: 'food', sr: 'Restoran / kafić', en: 'Restaurant / cafe', emoji: '🍽️', bg: 'ev-img-d' };
  if (raw.includes('kulturn')) return { key: 'culture_center', sr: 'Kulturni centar', en: 'Cultural centre', emoji: '🎨', bg: 'ev-img-b' };
  if (raw.includes('pozori')) return { key: 'theatre', sr: 'Pozorište', en: 'Theatre', emoji: '🎭', bg: 'ev-img-b' };
  if (raw.includes('bioskop')) return { key: 'cinema', sr: 'Bioskop', en: 'Cinema', emoji: '🎬', bg: 'ev-img-b' };
  if (raw.includes('galer')) return { key: 'gallery', sr: 'Galerija', en: 'Gallery', emoji: '🖼️', bg: 'ev-img-b' };
  if (raw.includes('muzej')) return { key: 'museum', sr: 'Muzej', en: 'Museum', emoji: '🏺', bg: 'ev-img-b' };
  if (raw.includes('sportski objekat')) return { key: 'sports_facility', sr: 'Sportski objekat', en: 'Sports facility', emoji: '🏟️', bg: 'ev-img-c' };
  if (raw.includes('stadion') || raw.includes('arena')) return { key: 'stadium', sr: 'Stadion / arena', en: 'Stadium / arena', emoji: '🏟️', bg: 'ev-img-c' };
  if (raw.includes('sport')) return { key: 'sport', sr: 'Sport', en: 'Sport', emoji: '⚽', bg: 'ev-img-c' };
  if (raw.includes('organizator') || raw.includes('organizer')) return { key: 'organizer', sr: 'Organizator događaja', en: 'Event organiser', emoji: '📣', bg: 'ev-img-a' };
  if (raw.includes('festival') || raw.includes('open air')) return { key: 'festival', sr: 'Festival / događaj', en: 'Festival / event', emoji: '🎪', bg: 'ev-img-a' };
  if (raw.includes('udruženje') || raw.includes('udruzenje') || raw.includes('ngo')) return { key: 'ngo', sr: 'Udruženje / NGO', en: 'Association / NGO', emoji: '🤝', bg: 'ev-img-e' };
  if (raw.includes('cowork') || raw.includes('zajednica') || raw.includes('community')) return { key: 'community', sr: 'Zajednica / coworking', en: 'Community / coworking', emoji: '🧩', bg: 'ev-img-e' };
  return { key: 'other', sr: type || 'Ostalo', en: type || 'Other', emoji: '✨', bg: 'ev-img-b' };
}

function _organizerTypeLabel(type = '') {
  const meta = _organizerCategoryMeta(type);
  return _langText(meta.sr, meta.en);
}

function _organizerTypeBadge(type = '') {
  const meta = _organizerCategoryMeta(type);
  return `${meta.emoji} ${_langText(meta.sr, meta.en)}`;
}

function _normalizeOrganizerInstagram(value = '') {
  return String(value || '').trim().replace(/^@+/, '');
}

function _normalizeOrganizerTypeSignal(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function _organizerTypeSignals(payload = {}) {
  return [
    payload.name,
    payload.description,
    payload.public_address,
    payload.website_url,
    payload.instagram_handle,
    payload.category,
    payload.city
  ].map(_normalizeOrganizerTypeSignal).filter(Boolean);
}

function _signalsContainAny(signals = [], needles = []) {
  return needles.some((needle) => {
    const normalizedNeedle = _normalizeOrganizerTypeSignal(needle);
    return normalizedNeedle && signals.some(signal => signal.includes(normalizedNeedle));
  });
}

function _inferOrganizerTypeFromPayload(payload = {}) {
  const signals = _organizerTypeSignals(payload);
  if (!signals.length) return '';

  if (_signalsContainAny(signals, ['stadion', 'arena', 'sportski centar', 'sportski objekat', 'sport center', 'hala'])) {
    return 'Stadion / arena';
  }
  if (_signalsContainAny(signals, ['pozoriste', 'pozorište', 'teatar', 'theatre', 'theater'])) {
    return 'Pozorište / bioskop';
  }
  if (_signalsContainAny(signals, ['bioskop', 'cinema', 'cineplexx'])) {
    return 'Pozorište / bioskop';
  }
  if (_signalsContainAny(signals, ['galerija', 'gallery', 'muzej', 'museum'])) {
    return 'Galerija / muzej';
  }
  if (_signalsContainAny(signals, ['kulturni centar', 'cultural center', 'cultural centre', 'dom kulture'])) {
    return 'Kulturni centar';
  }
  if (_signalsContainAny(signals, ['ngo', 'udruzenje', 'udruženje', 'fondacija', 'foundation', 'humanitar'])) {
    return 'Udruženje / NGO';
  }
  if (_signalsContainAny(signals, ['cowork', 'coworking', 'community', 'zajednica', 'hub'])) {
    return 'Zajednica / coworking';
  }
  if (_signalsContainAny(signals, ['kafana', 'etno bar', 'tamburasi', 'tamburaši', 'sevdah', 'starogradska'])) {
    return 'Kafana / etno bar';
  }
  if (_signalsContainAny(signals, ['restoran', 'restaurant', 'bistro', 'trattoria', 'pizza', 'burger', 'grill', 'brunch'])) {
    return 'Restoran / kafić';
  }
  if (_signalsContainAny(signals, ['kafic', 'kafić', 'cafe', 'coffee', 'espresso', 'roastery'])) {
    return 'Restoran / kafić';
  }
  if (_signalsContainAny(signals, ['klub', 'club', 'bar', 'pub', 'lounge'])) {
    return 'Klub / bar';
  }
  if (_signalsContainAny(signals, ['festival', 'open air'])) {
    return 'Festival / događaj';
  }
  if (_signalsContainAny(signals, ['sport', 'utakmica', 'match', 'mec', 'meč', 'turnir', 'trening'])) {
    return 'Sportski objekat';
  }
  if (_signalsContainAny(signals, ['meetup', 'networking', 'konferencija', 'conference', 'predavanje', 'panel'])) {
    return 'Organizator događaja';
  }

  return '';
}

function _applyOrganizerTypeSuggestion(config = {}) {
  const typeEl = document.getElementById(config.typeId);
  if (!typeEl) return;
  const fields = ['nameId', 'descriptionId', 'addressId', 'websiteId', 'instagramId', 'cityId', 'categoryId']
    .map((key) => document.getElementById(config[key]))
    .filter(Boolean);
  const suggestion = _inferOrganizerTypeFromPayload({
    name: document.getElementById(config.nameId)?.value || '',
    description: document.getElementById(config.descriptionId)?.value || '',
    public_address: document.getElementById(config.addressId)?.value || '',
    website_url: document.getElementById(config.websiteId)?.value || '',
    instagram_handle: document.getElementById(config.instagramId)?.value || '',
    city: document.getElementById(config.cityId)?.value || '',
    category: document.getElementById(config.categoryId)?.value || ''
  });
  const currentValue = String(typeEl.value || '').trim();
  const allowAutofill = !currentValue || typeEl.dataset.userTouched !== 'true' || typeEl.dataset.autoSuggested === 'true';
  if (allowAutofill && suggestion) {
    typeEl.value = suggestion;
    typeEl.dataset.autoSuggested = 'true';
  }
  if (!typeEl.dataset.organizerTypeBound) {
    typeEl.dataset.organizerTypeBound = 'true';
    typeEl.addEventListener('change', () => {
      typeEl.dataset.userTouched = 'true';
      typeEl.dataset.autoSuggested = 'false';
    });
    fields.forEach((field) => {
      field.addEventListener('input', () => _applyOrganizerTypeSuggestion(config));
      field.addEventListener('change', () => _applyOrganizerTypeSuggestion(config));
    });
  }
}

function _isValidOptionalEmail(value = '') {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function _isValidOptionalUrl(value = '') {
  if (!value) return true;
  try {
    const parsed = new URL(String(value).trim());
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (e) {
    return false;
  }
}

function _buildOrganizerPublicRows(data = {}) {
  const rows = [];
  const rawType = data.organizer_type || data.venue_type || '';
  if (rawType) rows.push(`🏷️ ${_organizerTypeBadge(rawType)}`);
  if (data.public_address) rows.push(`📍 ${data.public_address}`);
  if (data.website_url) rows.push(`🌐 ${data.website_url}`);
  if (data.instagram_handle) rows.push(`📸 @${_normalizeOrganizerInstagram(data.instagram_handle)}`);
  if (data.public_contact_email) rows.push(`✉️ ${data.public_contact_email}`);
  if (data.public_contact_phone) rows.push(`☎️ ${data.public_contact_phone}`);
  if (!rows.length && data.source_notes) {
    const note = String(data.source_notes || '').trim();
    if (note) rows.push(`📝 ${note.length > 180 ? `${note.slice(0, 177)}...` : note}`);
  }
  return rows;
}

function _sanitizeLocalizedHtml(html = '') {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const allowedTags = new Set(['A', 'BR', 'STRONG', 'EM', 'B', 'I', 'SPAN']);
  const walk = (node) => {
    const children = Array.from(node.childNodes || []);
    children.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toUpperCase();
        if (!allowedTags.has(tag)) {
          const textNode = document.createTextNode(child.textContent || '');
          child.replaceWith(textNode);
          return;
        }
        if (tag === 'A') {
          const href = child.getAttribute('href') || '';
          if (href && !/^https?:|^mailto:|^#|^\//i.test(href)) {
            child.removeAttribute('href');
          }
          Array.from(child.attributes).forEach((attr) => {
            const name = attr.name.toLowerCase();
            if (!['href', 'onclick', 'style', 'target', 'rel'].includes(name)) {
              child.removeAttribute(attr.name);
            }
          });
        } else {
          child.removeAttribute('onclick');
        }
        walk(child);
      }
    });
  };
  walk(template.content);
  return template.innerHTML;
}

function applyLang(l) {
  const lang = l || getCurrentLang();
  window.curLang = lang;
  document.querySelectorAll('[data-t]').forEach(el => {
    try { const t = JSON.parse(el.getAttribute('data-t')); if (t[lang]) el.textContent = t[lang]; } catch(e) {}
  });
  document.querySelectorAll('[data-t-html]').forEach(el => {
    try {
      const t = JSON.parse(el.getAttribute('data-t-html'));
      if (t[lang]) el.innerHTML = _sanitizeLocalizedHtml(t[lang]);
    } catch(e) {}
  });
  document.querySelectorAll('[data-t-ph]').forEach(el => {
    try { const t = JSON.parse(el.getAttribute('data-t-ph')); if (t[lang]) el.placeholder = t[lang]; } catch(e) {}
  });
  // Settings lang checkmarks
  const srCheck = document.getElementById('sr-check');
  const enCheck = document.getElementById('en-check');
  if (srCheck) srCheck.textContent = lang === 'sr' ? '✓' : '';
  if (enCheck) enCheck.textContent = lang === 'en' ? '✓' : '';
  document.querySelectorAll('[data-lang-btn]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang-btn') === lang);
  });
  document.querySelectorAll('[data-legal-lang]').forEach(el => {
    el.style.display = el.getAttribute('data-legal-lang') === lang ? '' : 'none';
  });
}
function setLang(l, el) {
  window.curLang = l;
  document.querySelectorAll('.lbtn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`.lbtn[data-lang-btn="${l}"], .lang-app-btn[data-lang-btn="${l}"]`).forEach(btn => btn.classList.add('active'));
  applyLang(l);
  localStorage.setItem('mitmi_lang', l);
  _rerenderActivePageForLang();
}

function _getActivePageId() {
  const activePage = document.querySelector('.page.active');
  if (!activePage?.id) return '';
  return String(activePage.id).replace(/^page-/, '');
}

function _getActiveBrowseTab() {
  if (document.getElementById('bt-home')?.classList.contains('active')) return 'home';
  if (document.getElementById('bt-venues')?.classList.contains('active')) return 'venues';
  if (document.getElementById('bt-discover')?.classList.contains('active')) return 'discover';
  if (document.getElementById('bt-plans')?.classList.contains('active')) return 'plans';
  return 'events';
}

function _rerenderBrowseForLang() {
  const searchInput = document.getElementById('browse-search');
  const activeTab = _getActiveBrowseTab();
  if (activeTab === 'home') {
    if (searchInput) {
      searchInput.placeholder = _langText('Pretraži događaje ili osobe...', 'Search events or people...');
      searchInput.oninput = function() {
        const q = this.value;
        switchBrowseTab('events', true);
        this.value = q;
        doSearch(q);
      };
    }
    if (typeof renderBrowseHomeStrip === 'function') renderBrowseHomeStrip();
    return;
  }
  if (activeTab === 'events') {
    if (searchInput) {
      searchInput.placeholder = _langText('Pretraži događaje ili osobe...', 'Search events or people...');
      searchInput.oninput = function() { doSearch(this.value); };
    }
    if (typeof _renderBrowseTagFilters === 'function' && typeof _isBrowseCategoryFilter === 'function') {
      if (_isBrowseCategoryFilter(_browseState.cat)) _renderBrowseTagFilters(_browseState.cat);
      else _hideBrowseTagFilters?.();
    }
    if (typeof renderBrowseEventsGrid === 'function') renderBrowseEventsGrid();
    _applyBrowseFilters();
    return;
  }
  if (activeTab === 'venues') {
    if (searchInput) {
      searchInput.placeholder = _langText('Pretraži organizatore ili osobe...', 'Search organizers or people...');
      searchInput.oninput = function() {
        doVenueSearch(this.value);
        renderBrowseProfileSearchResults?.(this.value);
      };
    }
    if (typeof loadBrowseVenues === 'function') loadBrowseVenues().catch(() => {});
    return;
  }
  if (activeTab === 'plans') {
    if (searchInput) {
      searchInput.placeholder = _langText('Pretraži planove ili osobe...', 'Search plans or people...');
      searchInput.oninput = function() {
        doPlanSearch(this.value);
        renderBrowseProfileSearchResults?.(this.value);
      };
    }
    if (typeof loadBrowsePlans === 'function') loadBrowsePlans().catch(() => {});
    return;
  }
  if (searchInput) {
    searchInput.placeholder = _langText('Otkrij događaje...', 'Discover events...');
    searchInput.oninput = function() {};
  }
  if (typeof ttLoadCard === 'function') ttLoadCard(_getSwipeData()[swipeIdx] || _getSwipeData()[0]);
}

function _rerenderActivePageForLang() {
  const pageId = _getActivePageId();
  syncBrowseGuestActions();
  syncSettingsPreferenceUI();
  try {
    if (pageId === 'browse') {
      _rerenderBrowseForLang();
      return;
    }
    if (pageId === 'register' && typeof _syncRegisterUI === 'function') {
      _syncBirthYearInputBounds();
      _syncRegisterUI();
      return;
    }
    if (pageId === 'onboarding') {
      _syncBirthYearInputBounds();
      return;
    }
    if (pageId === 'profile') {
      loadMyProfile().catch(() => {});
      return;
    }
    if (pageId === 'edit-profile') {
      loadEditProfileForm().catch(() => {});
      return;
    }
    if (pageId === 'edit-venue') {
      loadEditVenueForm().catch(() => {});
      return;
    }
    if (pageId === 'venue') {
      loadMyVenueDashboard().catch(() => {});
      return;
    }
    if (pageId === 'venue-public' && typeof renderPublicVenueProfile === 'function') {
      renderPublicVenueProfile(_currentPublicVenueTarget).catch(() => {});
      return;
    }
    if (pageId === 'event' && _currentEventId && typeof openEventById === 'function') {
      openEventById(_currentEventId).catch(() => {});
      return;
    }
    if (pageId === 'notif' && typeof loadNotifications === 'function') {
      loadNotifications().catch(() => {});
      return;
    }
    if (pageId === 'chats' && typeof loadChatsInbox === 'function') {
      loadChatsInbox().catch(() => {});
      return;
    }
    if (pageId === 'admin-drafts' && typeof renderAdminDrafts === 'function') {
      renderAdminDrafts();
      return;
    }
    if (pageId === 'admin-organizers' && typeof renderOrganizerReview === 'function') {
      renderOrganizerReview();
      return;
    }
    if (pageId === 'blocked-users' && typeof loadBlockedProfiles === 'function') {
      loadBlockedProfiles().catch(() => {});
    }
  } catch (e) {
    console.warn('[svita] lang rerender failed:', e?.message || e);
  }
}

// --- Toast ---
function showToast(msg, type = 'success', duration = 3000) {
  const icons = { success:'ok', error:'x', info:'i', warning:'!' };
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const ico = document.createElement('span');
  ico.className = 'toast-ico';
  ico.textContent = icons[type] || '•';
  const msg_el = document.createElement('span');
  msg_el.className = 'toast-msg';
  msg_el.textContent = msg; // textContent = XSS safe
  t.appendChild(ico);
  t.appendChild(msg_el);
  container.appendChild(t);
  setTimeout(() => { t.classList.add('hiding'); setTimeout(() => t.remove(), 250); }, duration);
}

// --- Tab switching ---
function openUnifiedHub(mode = 'events', navIndex = 0) {
  nav('browse');
  setBN(navIndex);
  setTimeout(() => {
    loadPublishedEvents().catch(() => {});
    if (mode === 'home') renderBrowseHomeStrip();
    switchBrowseTab(mode);
  }, 0);
}

function openBrowseMode(mode = 'events') {
  openUnifiedHub(mode, 0);
}

function backToHomeEvents() {
  const browseEvents = document.getElementById('bt-events');
  if (browseEvents) {
    switchBrowseTab('events');
    return;
  }
}
function switchPTab(btn, targetId) {
  btn.closest('.prof-tabs, .page').querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  const page = btn.closest('.page');
  page.querySelectorAll('.ptab-pane').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const el = document.getElementById(targetId);
  if (el) el.classList.add('active');
  if (targetId === 'pt3') {
    const searchEl = document.getElementById('profile-people-search');
    if (searchEl) {
      const raw = String(searchEl.value || '').trim();
      if (raw.includes('@') && raw.includes('.')) {
        searchEl.value = '';
        if (typeof filterProfileDirectory === 'function') filterProfileDirectory('');
      }
    }
  }
}

// --- Pill / filter ---
function setPill(el, cat) {
  // Active state
  el.closest('.pills').querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  // Filter kartice u tab-events
  const grid = document.querySelector('#tab-events .ev-grid-2');
  if (!grid) return;
  const cards = grid.querySelectorAll('.ev-card');
  let visible = 0;
  cards.forEach(card => {
    const cardCat = card.getAttribute('data-cat') || '';
    const cardDay = card.getAttribute('data-day') || '';
    let show = false;
    if (!cat || cat === 'all') {
      show = true;
    } else if (cat === 'danas') {
      show = cardDay === 'danas';
    } else {
      show = cardCat === cat;
    }
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  // Animiraj vidljive kartice
  grid.querySelectorAll('.ev-card:not([style*="none"])').forEach((c, i) => {
    c.style.animation = 'none';
    c.offsetHeight; // reflow
    c.style.animation = `cardReveal .3s ease ${i * 0.06}s both`;
  });
}

function _isBrowseCategoryFilter(cat = '') {
  return [
    'muzika',
    'scena_humor',
    'kultura_umetnost',
    'sport_rekreacija',
    'izlasci_druzenje',
    'napolju',
    'hobiji_igre',
    'edukacija_meetup',
    'drugo'
  ].includes(String(cat || ''));
}

function _hideBrowseTagFilters() {
  const row = document.getElementById('browse-tag-filter-row');
  const pills = document.getElementById('browse-tag-pills');
  if (row) row.style.display = 'none';
  if (pills) pills.innerHTML = '';
}

function _renderBrowseTagFilters(category = '') {
  const row = document.getElementById('browse-tag-filter-row');
  const pills = document.getElementById('browse-tag-pills');
  const title = document.getElementById('browse-tag-filter-title');
  if (!row || !pills || typeof _eventTagOptions !== 'function' || typeof _eventCategoryLabel !== 'function') return;
  if (!_isBrowseCategoryFilter(category)) {
    _hideBrowseTagFilters();
    return;
  }
  const options = _eventTagOptions(category);
  const activeTag = String(_browseState.tag || '').trim();
  if (title) title.textContent = `Tagovi · ${_eventCategoryLabel(category, { bucket: true })}`;
  pills.innerHTML = [
    `<button type="button" class="pill${activeTag ? '' : ' active'}" onclick="clearBrowseTagFilter()">Sve u kategoriji</button>`,
    ...options.map(option => `<button type="button" class="pill${activeTag === option.key ? ' active' : ''}" onclick="setBrowseTagPill(this,'${_escAttr(option.key)}')">${_escHtml(option.label)}</button>`)
  ].join('');
  row.style.display = '';
}

function setBrowseTagPill(el, tagKey = '') {
  const pillContainer = document.getElementById('browse-tag-pills');
  if (pillContainer) pillContainer.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  _browseState.tag = String(tagKey || '').trim().toLowerCase();
  _applyBrowseFilters();
}

function clearBrowseTagFilter() {
  _browseState.tag = '';
  if (_isBrowseCategoryFilter(_browseState.cat)) {
    _renderBrowseTagFilters(_browseState.cat);
  } else {
    _hideBrowseTagFilters();
  }
  _applyBrowseFilters();
}

function setBrowsePill(el, cat) {
  // closest('.pills') — kompatibilno sa br-pills-wrap strukturom
  const pillContainer = el.closest('.pills') || el.closest('.filter-row') || el.closest('.br-pills-wrap');
  if (pillContainer) pillContainer.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  _browseState.range = '';
  _browseState.tag = '';
  const dateInput = document.getElementById('browse-date-input');
  if (dateInput) dateInput.value = '';
  document.querySelectorAll('[data-range-filter]').forEach(btn => btn.classList.remove('active'));
  _browseState.cat = cat || 'all';
  _renderBrowseTagFilters(_browseState.cat);
  _applyBrowseFilters();
}

// Legacy compatibility helper for old tab blocks in hidden/archived layouts.
function switchTab(btn, paneId) {
  if (!btn || !paneId) return;
  const root = btn.closest('.home-wrap') || document;
  root.querySelectorAll('.h-tab').forEach(el => el.classList.remove('active'));
  root.querySelectorAll('.h-pane').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');
  const pane = document.getElementById(paneId);
  if (pane) pane.classList.add('active');
}

window.switchTab = switchTab;

// --- City picker ---
function showCityPicker() {
  const ov = document.getElementById('city-picker-overlay');
  if (!ov) return;
  ov.style.display = 'flex';
}
function hideCityPicker() {
  const ov = document.getElementById('city-picker-overlay');
  if (!ov) return;
  ov.style.display = 'none';
}
function setCity(city) {
  ['city-label','browse-city-label','browse-home-city-label'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = city;
  });
  _browseState.city = _normalizeBrowseCityLabel(city);
  hideCityPicker();
  if (typeof _applyBrowseFilters === 'function') _applyBrowseFilters();
  if (typeof renderBrowseHomeStrip === 'function') renderBrowseHomeStrip();
  showToast(city, 'success', 1500);
}

function applyCustomCity() {
  const input = document.getElementById('custom-city-input');
  const city = input?.value?.trim();
  if (!city || city.length < 2) {
    showToast(_langText('Unesi naziv grada', 'Enter city name'), 'info', 1500);
    return;
  }
  setCity(city);
  if (input) input.value = '';
}

// --- Date filter ---
function toggleDateFilter() {
  const row = document.getElementById('date-filter-row');
  // br-date-pill je stvarni element u HTML-u (date-filter-btn ne postoji)
  const btn = document.getElementById('br-date-pill') || document.getElementById('date-filter-btn');
  if (!row) return;
  const visible = row.style.display !== 'none';
  row.style.display = visible ? 'none' : 'block';
  if (btn) {
    btn.style.borderColor = visible ? '' : 'var(--purple)';
    btn.style.color       = visible ? '' : 'var(--purple)';
    btn.classList.toggle('active', !visible);
  }
}
function filterByDate(dateVal) {
  _browseState.range = '';
  _browseState.tag = '';
  if (_isBrowseCategoryFilter(_browseState.cat)) {
    _renderBrowseTagFilters(_browseState.cat);
  } else {
    _hideBrowseTagFilters();
  }
  document.querySelectorAll('[data-range-filter]').forEach(btn => btn.classList.remove('active'));
  _browseState.date = dateVal || '';
  _applyBrowseFilters();
  if (!dateVal) {
    showToast(_langText('Filter uklonjen', 'Filter removed'), 'info', 1200);
  } else {
    const d = typeof _parseEventDateLocal === 'function' ? _parseEventDateLocal(dateVal) : new Date(dateVal);
    const label = d && !Number.isNaN(d.getTime())
      ? d.toLocaleDateString('sr-Latn', { day:'numeric', month:'long' })
      : dateVal;
    const grid = document.getElementById('browse-grid');
    const visible = grid
      ? Array.from(grid.querySelectorAll('.sq-card, .ev-card')).filter(card => card.style.display !== 'none').length
      : 0;
    showToast(visible > 0 ? `${label} - ${visible} događaja` : `${label} - nema događaja`, visible > 0 ? 'success' : 'info', 2000);
  }
}

function filterUpcomingRange(rangeKey, btnEl) {
  _browseState.date = '';
  _browseState.cat = 'all';
  _browseState.tag = '';
  _browseState.range = rangeKey || '';
  _hideBrowseTagFilters();
  const dateInput = document.getElementById('browse-date-input');
  if (dateInput) dateInput.value = '';
  document.querySelectorAll('[data-range-filter]').forEach(btn => btn.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  _applyBrowseFilters();
  if (!rangeKey) {
    showToast(_langText('Prikazani su svi datumi', 'All dates are shown'), 'info', 1500);
    return;
  }
  showToast(
    rangeKey === '7d'
      ? _langText('Prikazani događaji u narednih 7 dana', 'Showing events in the next 7 days')
      : _langText('Prikazani događaji u narednih 30 dana', 'Showing events in the next 30 days'),
    'success',
    1800
  );
}

function filterTonight(btnEl = null) {
  _browseState.date = '';
  _browseState.range = '';
  _browseState.cat = 'tonight';
  _browseState.tag = '';
  _hideBrowseTagFilters();
  const dateInput = document.getElementById('browse-date-input');
  if (dateInput) dateInput.value = '';
  document.querySelectorAll('[data-range-filter]').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('#br-pills-wrap .pill').forEach(btn => btn.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  _applyBrowseFilters();
  showToast(_langText('Prikazani su događaji u narednih nekoliko sati', 'Showing events in the next few hours'), 'success', 1800);
}

// --- Onboarding ---
let obStep = 1;
const obTotalSteps = 3;

function obNext() {
  if (typeof validateUserOnboardingStep === 'function' && !validateUserOnboardingStep(obStep)) {
    return;
  }
  if (obStep < obTotalSteps) {
    document.getElementById('ob' + obStep).classList.remove('active');
    obStep++;
    document.getElementById('ob' + obStep).classList.add('active');
    updateObDots(obStep);
    document.getElementById('ob-bar').style.width = (obStep / obTotalSteps * 100) + '%';
    document.getElementById('ob-back').style.display = obStep > 1 ? 'block' : 'none';
    if (obStep === obTotalSteps) {
      document.getElementById('ob-next').setAttribute('data-t', '{"sr":"Pogledaj događaje","en":"See events"}');
      document.getElementById('ob-next').textContent = 'Pogledaj događaje';
    }
  } else {
    if (typeof saveOnboarding === 'function') saveOnboarding();
  }
}
function obBack() {
  if (obStep > 1) {
    document.getElementById('ob' + obStep).classList.remove('active');
    obStep--;
    document.getElementById('ob' + obStep).classList.add('active');
    updateObDots(obStep);
    document.getElementById('ob-bar').style.width = (obStep / obTotalSteps * 100) + '%';
    document.getElementById('ob-back').style.display = obStep > 1 ? 'block' : 'none';
    document.getElementById('ob-next').textContent = 'Nastavi';
  }
}
function updateObDots(step) {
  for (let i = 1; i <= obTotalSteps; i++) {
    const dot = document.getElementById('obdot' + i);
    if (!dot) continue;
    dot.classList.remove('active','done');
    if (i === step) dot.classList.add('active');
    else if (i < step) dot.classList.add('done');
  }
}

function _containsRestrictedContactInfo(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  const emailMatch = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw);
  const phoneMatch = /(?:\+?\d[\d\s()./-]{6,}\d)/.test(raw);
  const contactWords = /(instagram|insta|ig:|viber|whatsapp|wa\b|telegram|tg\b|facebook|fb\b|telefon|phone|broj|kontaktiraj me|pozovi me|piši na)/i.test(lower);
  return emailMatch || phoneMatch || contactWords;
}

function _publicContactSafetyMessage() {
  return 'Ne unosi telefon, email, Instagram, Viber ili druge direktne kontakt podatke u javni opis.';
}

// --- Profile about chip ---
function addToAbout(chip) {
  const lang = localStorage.getItem('mitmi_lang') || 'sr';
  const text = chip.getAttribute('data-' + lang) || chip.textContent;
  const ta = document.getElementById('ob-about');
  if (!ta) return;
  ta.value = ta.value ? ta.value + ' ' + text : text;
}

function _deriveDisplayName(email = '', fallback = 'svita korisnik') {
  const raw = (email.split('@')[0] || fallback)
    .replace(/[._-]+/g, ' ')
    .trim();
  const titled = raw
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return titled || fallback;
}

function _normalizeUsername(value = '') {
  return value
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
}

function _defaultUsername(seed = '') {
  const base = _normalizeUsername(seed) || `mitmi_${String(Date.now()).slice(-6)}`;
  return base.length >= 3 ? base : `${base}_user`;
}

function _normalizeEntityName(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function _profileEmail() {
  return getUser()?.email || _session?.user_email || '';
}

async function _getMyVenue() {
  if (!isLoggedIn()) return null;
  const cached = _getCached('venue', getUser()?.id || 'guest');
  if (cached) return cached;
  const rows = await _supaGet('venues', {
    profile_id: `eq.${getUser()?.id}`,
    select: 'id,profile_id,venue_name,venue_type,city,description,public_address,instagram_handle,website_url,public_contact_email,public_contact_phone,cover_url,status,created_at',
    limit: '1'
  });
  const venue = Array.isArray(rows) ? (rows[0] || null) : null;
  if (venue) _setCached('venue', getUser()?.id || 'guest', venue, CACHE_TTL.venue);
  return venue;
}

async function _getMyClaimedOrganizer() {
  if (!isLoggedIn() || !_isSupabaseConfigured()) return null;
  if (_organizerClaimLookupSupported === false) return null;
  const cacheId = getUser()?.id || 'guest';
  const cached = _getCached('organizer', cacheId);
  if (cached) return cached;
  if (_myClaimedOrganizerLookupPromise) return _myClaimedOrganizerLookupPromise;

  _myClaimedOrganizerLookupPromise = (async () => {
    try {
      const baseParams = {
        claimed_by_profile_id: `eq.${getUser()?.id}`,
        order: 'created_at.desc',
        limit: '1'
      };
      const selectVariants = [
        'id,name,city,organizer_type,public_address,public_description,instagram_handle,website_url,public_contact_email,public_contact_phone,source_notes,status,created_at',
        'id,name,city,organizer_type,instagram_handle,status,created_at',
        'id,name,city,organizer_type,status,created_at',
        'id,name,status,created_at'
      ];
      let rows = [];
      let lookupWorked = false;
      for (const select of selectVariants) {
        try {
          rows = await _supaGet('organizers', { ...baseParams, select });
          lookupWorked = true;
          break;
        } catch (e) {
          if (Number(e?.status || 0) === 400) {
            _organizerClaimLookupSupported = false;
            return null;
          }
          const msg = String(e?.message || e?.data?.message || '').toLowerCase();
          if (msg.includes('claimed_by_profile_id') && msg.includes('column')) {
            _organizerClaimLookupSupported = false;
            return null;
          }
          rows = [];
        }
      }
      if (!lookupWorked) {
        _organizerClaimLookupSupported = false;
        return null;
      }
      _organizerClaimLookupSupported = true;
      const organizer = Array.isArray(rows) ? (rows[0] || null) : null;
      if (organizer) _setCached('organizer', cacheId, organizer, CACHE_TTL.organizer);
      return organizer;
    } catch (e) {
      _organizerClaimLookupSupported = false;
      return null;
    } finally {
      _myClaimedOrganizerLookupPromise = null;
    }
  })();

  return _myClaimedOrganizerLookupPromise;
}

async function _findExistingOrganizerMatch(name = '', city = '') {
  if (!_isSupabaseConfigured()) return null;
  const normalizedName = _normalizeEntityName(name);
  if (!normalizedName) return null;
  try {
    const rows = await _supaGet('organizers', {
      select: 'id,name,city,status,instagram_handle',
      order: 'created_at.desc',
      limit: '100'
    });
    const matches = (Array.isArray(rows) ? rows : []).filter((row) => {
      if ((row.status || '') === 'merged' || (row.status || '') === 'archived') return false;
      const sameName = _normalizeEntityName(row.name || '') === normalizedName;
      if (!sameName) return false;
      const rowCity = String(row.city || '').trim().toLowerCase();
      const wantedCity = String(city || '').trim().toLowerCase();
      return !wantedCity || !rowCity || rowCity === wantedCity;
    });
    return matches[0] || null;
  } catch (e) {
    return null;
  }
}

async function _getMyManagedOrganizerTarget() {
  const organizer = await _getMyClaimedOrganizer();
  if (organizer) return _normalizeVenueTarget(organizer);
  const venue = await _getMyVenue();
  return venue ? _normalizeVenueTarget(venue) : null;
}

async function _resolveManagedEventTarget() {
  const ownTarget = await _getMyManagedOrganizerTarget();
  if (ownTarget?.id) return ownTarget;

  const currentTarget = _normalizeVenueTarget(_currentPublicVenueTarget || null);
  if (currentTarget?.id && getRoleCapabilities().canPublishManagedEvents) {
    return currentTarget;
  }

  return null;
}

async function _upsertMyVenue(venueFields = {}) {
  if (!isLoggedIn()) throw new Error('Moraš biti prijavljen/a');
  const existingVenue = await _getMyVenue();
  const payload = {
    profile_id: getUser()?.id,
    venue_name: venueFields.venue_name || existingVenue?.venue_name || 'Organizer',
    venue_type: venueFields.venue_type || existingVenue?.venue_type || null,
    city: venueFields.city || existingVenue?.city || '',
    description: venueFields.description || existingVenue?.description || null,
    public_address: venueFields.public_address ?? existingVenue?.public_address ?? null,
    instagram_handle: venueFields.instagram_handle ?? existingVenue?.instagram_handle ?? null,
    website_url: venueFields.website_url ?? existingVenue?.website_url ?? null,
    public_contact_email: venueFields.public_contact_email ?? existingVenue?.public_contact_email ?? null,
    public_contact_phone: venueFields.public_contact_phone ?? existingVenue?.public_contact_phone ?? null,
    cover_url: venueFields.cover_url ?? existingVenue?.cover_url ?? null,
    status: venueFields.status || existingVenue?.status || 'pending'
  };

  if (existingVenue?.id) {
    const rows = await _supaFetch(`/rest/v1/venues?id=eq.${existingVenue.id}`, {
      method: 'PATCH',
      headers: {
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    return Array.isArray(rows) ? (rows[0] || { ...existingVenue, ...payload }) : { ...existingVenue, ...payload };
  }

  const rows = await _supaFetch('/rest/v1/venues', {
    method: 'POST',
    headers: {
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? (rows[0] || payload) : payload;
}

async function _saveMyClaimedOrganizerProfile(fields = {}) {
  if (!isLoggedIn()) throw new Error('Moraš biti prijavljen/a');
  const organizer = await _getMyClaimedOrganizer();
  if (!organizer?.id) throw new Error('Organizer profil nije povezan');
  const payload = {
    name: fields.venue_name || organizer.name || 'Organizer',
    city: fields.city || organizer.city || '',
    public_description: fields.description || organizer.public_description || organizer.source_notes || null,
    public_address: fields.public_address || organizer.public_address || null,
    instagram_handle: fields.instagram_handle || organizer.instagram_handle || null,
    website_url: fields.website_url || organizer.website_url || null,
    public_contact_email: fields.public_contact_email || organizer.public_contact_email || null,
    public_contact_phone: fields.public_contact_phone || organizer.public_contact_phone || null,
    organizer_type: fields.organizer_type || organizer.organizer_type || null,
    updated_by: getUser()?.id || null
  };
  const rows = await _supaFetch(`/rest/v1/organizers?id=eq.${organizer.id}`, {
    method: 'PATCH',
    headers: {
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });
  _clearCache('organizer', getUser()?.id || 'guest');
  const updated = Array.isArray(rows) ? rows[0] : rows;
  return updated || { ...organizer, ...payload };
}

// --- Swipe logic ---
let swipeStartX = 0, swipeCurrentX = 0, isSwiping = false;
const swipeData = [];
let swipeIdx = 0;
let _activeSwipeCat = 'all';
let _swipeFiltered = null;

const CAT_EMOJI_MAP = {
  muzika:'🎵', svirka:'🎵', dj:'🎧', standup:'🎤',
  sport:'⚽',
  kultura:'🎨', pozoriste:'🎭', izlozba:'🖼️', film:'🎬', radionica:'🛠️',
  kafa:'☕', bar:'🍸',
  festival:'🎪',
  priroda:'🏕️',
  drugo:'✨'
};
const BG_MAP = {
  muzika:'ev-img-a', svirka:'ev-img-a', dj:'ev-img-a', standup:'ev-img-a', festival:'ev-img-a',
  kultura:'ev-img-b', pozoriste:'ev-img-b', izlozba:'ev-img-b', film:'ev-img-b', radionica:'ev-img-b',
  sport:'ev-img-c',
  kafa:'ev-img-d', bar:'ev-img-d',
  priroda:'ev-img-e',
  drugo:'ev-img-b'
};

function _getSwipeData() {
  const baseEvents = _combinedEventCards();
  const fallbackEvents = Array.isArray(globalThis._browseHomePreviewEvents) ? globalThis._browseHomePreviewEvents : [];
  const normalizeCity = (value = '') => (typeof _normalizeBrowseCityLabel === 'function'
    ? _normalizeBrowseCityLabel(value)
    : String(value || '').trim().toLowerCase());
  const activeCity = normalizeCity(_browseState.city || '');
  const sourceEvents = baseEvents.length ? baseEvents : fallbackEvents;
  const resolvedEvents = activeCity
    ? sourceEvents.filter((ev) => {
        const eventCity = normalizeCity(ev?.raw?.city || ev?.city || '');
        return !!eventCity && eventCity === activeCity;
      })
    : sourceEvents;
  const eventSource = resolvedEvents.map(ev => ({ ...ev, swipeType: 'event', swipe_key: `event-${ev.id || ev.title || ''}` }));
  const planSource = typeof getSwipePlanCards === 'function' ? getSwipePlanCards() : [];
  const source = (_swipeFiltered && _swipeFiltered.length)
    ? _swipeFiltered
    : [...eventSource, ...planSource].sort((a, b) => {
      const coverDelta = Number(Boolean(b.cover_url)) - Number(Boolean(a.cover_url));
      if (coverDelta !== 0) return coverDelta;
      return new Date(a.starts_at || a.date || 0) - new Date(b.starts_at || b.date || 0);
    });
  return source.map(ev => ({
    swipeType: ev.swipeType || 'event',
    swipe_key: ev.swipe_key || ev.id || '',
    inviteId: ev.inviteId || '',
    eventId: (ev.swipeType || 'event') === 'plan' ? (ev.eventId || '') : (ev.eventId || ev.id || ''),
    eventTitle: ev.eventTitle || ev.raw?.event?.title || ev.title || '',
    creatorId: ev.creatorId || '',
    creatorName: ev.creatorName || '',
    id: ev.id || '',
    cat: ev.cat || 'muzika',
    category_label: ev.category_label || '',
    title: ev.title || '',
    venue: ev.location_name || (ev.meta || '').split('·').slice(-1)[0]?.trim() || 'Lokacija nije upisana',
    date: ev.meta || '',
    desc: ev.swipeType === 'plan'
      ? (ev.raw?.description || `Objavljen plan od korisnika ${ev.creatorName || 'svita korisnik'} za zajednički odlazak ili dogovor.`)
      : (ev.raw?.description || ev.desc || 'Nađi društvo za ovaj događaj i dogovorite se direktno u aplikaciji.'),
    going: ev.swipeType === 'plan'
      ? `${ev.creatorName || 'svita korisnik'} · ${ev.spots || '1'} mesta`
      : (ev.going || `${(typeof _eventSpotsLabel === 'function' ? _eventSpotsLabel(ev.spots, ev.attendee_count || ev.raw?.attendee_count || 0) : (ev.spots || 'Bez limita mesta'))}`),
    spots: ev.spots || '',
    spotsLabel: ev.spotsLabel || '',
    spotsVariant: ev.spotsVariant || '',
    attendee_count: ev.attendee_count || ev.raw?.attendee_count || 0,
    bg: BG_MAP[ev.cat] || 'ev-img-a',
    cover_url: ev.cover_url || ''
  }));
}

function loadSwipeCard(el, data) {
  if (!el || !data) return;
  const isFront = el.id === 'swipe-front';

  if (isFront) {
    // Full-screen — update ids direktno
    const bg = el.querySelector('.swipe-fs-bg');
    if (bg) {
      bg.className = 'swipe-fs-bg ' + (BG_MAP[data.cat] || 'ev-img-a');
    }
    const catEl  = document.getElementById('sf-cat');
    const titEl  = document.getElementById('sf-title');
    const venEl  = document.getElementById('sf-venue');
    const datEl  = document.getElementById('sf-date');
    const desEl  = document.getElementById('sf-desc');
    const goEl   = document.getElementById('sf-going');
    const spEl   = document.getElementById('sf-spots');
    const emoji  = CAT_EMOJI_MAP[data.cat] || '📅';
    if (catEl) catEl.textContent = emoji + ' ' + (data.cat ? data.cat.charAt(0).toUpperCase() + data.cat.slice(1) : '');
    if (titEl) titEl.textContent = data.title;
    if (venEl) venEl.textContent = '📍 ' + data.venue;
    if (datEl) datEl.textContent = '📅 ' + data.date;
    if (desEl) desEl.textContent = data.desc || '';
    if (goEl)  goEl.textContent  = data.going || '';
    if (spEl)  {
      const spotsLabel = data.spotsLabel || (typeof _eventSpotsLabel === 'function'
        ? _eventSpotsLabel(data.spots, data.attendee_count || 0)
        : ((data.spots || '') ? `${data.spots} mesta` : 'Bez limita'));
      spEl.textContent = spotsLabel;
      const variant = data.spotsVariant || 'neutral';
      spEl.style.background = variant === 'urgent' || variant === 'warning'
        ? 'rgba(245,158,11,.25)'
        : (variant === 'full' ? 'rgba(82,82,91,.22)' : 'rgba(255,255,255,.15)');
    }
  } else {
    // Back kartica — samo bg i naslov
    const bg = el.querySelector('.swipe-fs-bg');
    if (bg) bg.className = 'swipe-fs-bg ' + (BG_MAP[data.cat] || 'ev-img-a');
    const titEl = el.querySelector('.swipe-fs-title');
    if (titEl) titEl.textContent = data.title;
    const metEl = el.querySelector('.swipe-fs-meta');
    if (metEl) metEl.textContent = data.venue;
  }
}

// Swipe touch events
const swipeStack = document.getElementById('swipe-stack');
if (swipeStack) {
  swipeStack.addEventListener('touchstart', e => {
    swipeStartX = e.touches[0].clientX;
    isSwiping = true;
  }, { passive: true });
  swipeStack.addEventListener('touchmove', e => {
    if (!isSwiping) return;
    swipeCurrentX = e.touches[0].clientX;
    const dx = swipeCurrentX - swipeStartX;
    const front = document.getElementById('swipe-front');
    if (front) {
      front.style.transform = `rotate(${dx * 0.05}deg) translateX(${dx}px)`;
      const likeInd = document.getElementById('swipe-like-ind');
      const skipInd = document.getElementById('swipe-skip-ind');
      if (likeInd) likeInd.style.opacity = Math.max(0, dx / 80);
      if (skipInd) skipInd.style.opacity = Math.max(0, -dx / 80);
    }
  }, { passive: true });
  swipeStack.addEventListener('touchend', e => {
    if (!isSwiping) return;
    isSwiping = false;
    const dx = swipeCurrentX - swipeStartX;
    const front = document.getElementById('swipe-front');
    if (front) front.style.transform = '';
    const likeInd = document.getElementById('swipe-like-ind');
    const skipInd = document.getElementById('swipe-skip-ind');
    if (likeInd) likeInd.style.opacity = 0;
    if (skipInd) skipInd.style.opacity = 0;
    if (Math.abs(dx) > 80) doSwipe(dx > 0 ? 'right' : 'left');
  });
}

// --- Chat moderation (checkMsgContent) ---
let modOnConfirm = null;
let modOnCancel = null;
const MOD_PATTERNS = [
  /\b(\+?381|06\d)\s*[\d\s\-]{6,}/,
  /@[\w.]+/,
  /\bwhatsapp\b/i, /\bviber\b/i, /\btelegram\b/i,
];
function checkMsgContent(text) {
  return MOD_PATTERNS.some(p => p.test(text));
}
function showModWarning(type, onConfirm) {
  const t = type === 'contact'
    ? ['Kontakt podaci nisu dozvoljeni', 'Ne delite broj telefona, Instagram, email, Viber ili druge kontakte u porukama.']
    : ['Pažnja', 'Poruka sadrži potencijalno neprikladne reči.'];
  showModDialog({
    title: t[0],
    message: t[1],
    confirmText: 'Svejedno pošalji',
    cancelText: 'Otkaži',
    confirmClassName: 'btn btn-danger btn-full',
    onConfirm
  });
}
function showModDialog({
  title = 'Pažnja',
  message = '',
  confirmText = 'Potvrdi',
  cancelText = 'Otkaži',
  confirmClassName = 'btn btn-danger btn-full',
  onConfirm = null,
  onCancel = null
} = {}) {
  const overlay = document.getElementById('mod-overlay');
  const titleEl = document.getElementById('mod-title');
  const msgEl = document.getElementById('mod-msg');
  const cancelBtn = document.getElementById('mod-cancel-btn');
  const confirmBtn = document.getElementById('mod-confirm-btn');
  if (!overlay || !titleEl || !msgEl || !cancelBtn || !confirmBtn) {
    if (typeof onCancel === 'function') onCancel();
    return;
  }
  titleEl.textContent = title;
  msgEl.textContent = message;
  msgEl.style.whiteSpace = 'pre-line';
  cancelBtn.textContent = cancelText;
  confirmBtn.textContent = confirmText;
  confirmBtn.className = confirmClassName;
  modOnConfirm = typeof onConfirm === 'function' ? onConfirm : null;
  modOnCancel = typeof onCancel === 'function' ? onCancel : null;
  overlay.style.display = 'flex';
}
function modDismiss() {
  document.getElementById('mod-overlay').style.display = 'none';
  if (modOnCancel) modOnCancel();
  modOnCancel = null;
  modOnConfirm = null;
}
function modConfirm() {
  document.getElementById('mod-overlay').style.display = 'none';
  if (modOnConfirm) modOnConfirm();
  modOnConfirm = null;
  modOnCancel = null;
}

// --- Send message ---
// _activeChatId: UUID aktivnog chata iz Supabase
let _activeChatId = null;
let _realtimeSub  = null;
let _chatVisibilityHandler = null;
let _supaRealtimeClient = null;

function _getSupaRealtimeClient() {
  if (_supaRealtimeClient) return _supaRealtimeClient;
  const hasSdk = !!(window.supabase && typeof window.supabase.createClient === 'function');
  if (!hasSdk) return null;
  if (typeof SUPA_URL !== 'string' || typeof SUPA_ANON !== 'string' || !SUPA_URL || !SUPA_ANON) return null;
  _supaRealtimeClient = window.supabase.createClient(SUPA_URL, SUPA_ANON);
  return _supaRealtimeClient;
}

function _isRealtimeChannel(sub) {
  return !!sub && typeof sub === 'object' && typeof sub.unsubscribe === 'function';
}

async function _loadChatHistory(chatId) {
  if (!chatId) return;
  try {
    if (typeof _loadChatMessages === 'function' && typeof _renderChatMessageList === 'function') {
      const messages = await _loadChatMessages(chatId);
      _renderChatMessageList(Array.isArray(messages) ? messages : []);
      return;
    }
    const msgs = await _supaFetch(
      `/rest/v1/messages?chat_id=eq.${chatId}&order=created_at.asc&limit=100&select=*,profiles!sender_id(username,avatar_url,display_name,id)`,
      { method: 'GET' }
    );
    const list = Array.isArray(msgs) ? msgs : [];
    const box = document.getElementById('chat-msgs');
    if (!box) return;
    box.innerHTML = '';
    list.forEach(msg => _appendSingleMessage(msg, { suppressMine: false }));
    box.scrollTop = box.scrollHeight;
  } catch (e) {
    console.warn('[svita] _loadChatHistory failed:', e.message);
    showToast(_langText('Poruke se ne učitavaju. Proveri internet.', 'Messages failed to load. Check your connection.'), 'error', 2500);
  }
}

function _appendSingleMessage(msg, { suppressMine = true } = {}) {
  const msgs = document.getElementById('chat-msgs');
  if (!msgs || !msg) return;
  const myId = getUser()?.id;
  const isMine = msg.sender_id === myId;
  if (isMine && suppressMine) return;

  const msgId = String(msg.id || '');
  if (msgId) {
    const alreadyRendered = Array.from(msgs.querySelectorAll('[data-msg-id]'))
      .some(node => String(node.dataset.msgId || '') === msgId);
    if (alreadyRendered) return;
  }

  const sender = msg.profiles || {};
  const div = document.createElement('div');
  div.className = 'msg' + (isMine ? ' me' : '');
  if (msgId) div.dataset.msgId = msgId;

  if (!isMine) {
    const av = document.createElement('div');
    av.className = 'av av-32 av-purple';
    av.style.cursor = 'pointer';
    av.textContent = ((sender.display_name || sender.username || '?').charAt(0) || '?').toUpperCase();
    if (sender.id) av.onclick = () => openOtherProfile(sender.id);
    div.appendChild(av);
  }

  const wrap = document.createElement('div');
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = msg.content || '';
  const time = document.createElement('span');
  time.className = 'msg-time';
  const senderName = sender.username || sender.display_name || '?';
  const timeStr = new Date(msg.created_at || Date.now()).toLocaleTimeString('sr', { hour: '2-digit', minute: '2-digit' });
  time.textContent = isMine ? timeStr : `${senderName} · ${timeStr}`;
  wrap.appendChild(bubble);
  wrap.appendChild(time);
  div.appendChild(wrap);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function _startChatPollingFallback(chatId) {
  if (!chatId) return;
  if (_realtimeSub && typeof _realtimeSub === 'number') return;
  if (_isRealtimeChannel(_realtimeSub)) {
    try {
      const supa = _getSupaRealtimeClient();
      _realtimeSub.unsubscribe();
      if (supa && typeof supa.removeChannel === 'function') {
        supa.removeChannel(_realtimeSub).catch?.(() => {});
      }
    } catch (e) {}
    _realtimeSub = null;
  }
  _realtimeSub = setInterval(() => {
    if (_activeChatId === chatId && document.visibilityState === 'visible') {
      _loadChatHistory(chatId).catch(() => {});
    }
  }, 8000);
}

function sendMsg() {
  const input = document.getElementById('chat-input');
  if (!input || !input.value.trim()) return;
  const val = input.value.trim();
  if (checkMsgContent(val)) {
    showModWarning('contact', () => _sendMsgToSupabase(val));
    return;
  }
  _sendMsgToSupabase(val);
  input.value = '';
}

async function _sendMsgToSupabase(text) {
  if (!isLoggedIn()) return;
  // Optimistički prikaz odmah
  const optimisticMsg = _doSend(text);

  if (!_activeChatId) return; // demo mod — nema pravog chata

  try {
    await _supaFetch('/rest/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        chat_id:   _activeChatId,
        sender_id: getUser()?.id,
        content:   text
      })
    });
    if (optimisticMsg?.timeEl) {
      optimisticMsg.timeEl.textContent = optimisticMsg.sentAt || '';
      optimisticMsg.timeEl.classList.remove('is-pending', 'is-failed');
    }
  } catch(e) {
    console.warn('[svita] sendMsg failed:', e.message);
    if (optimisticMsg?.timeEl) {
      optimisticMsg.timeEl.textContent = _langText('Nije poslato · proveri vezu', 'Not sent · check connection');
      optimisticMsg.timeEl.classList.remove('is-pending');
      optimisticMsg.timeEl.classList.add('is-failed');
    }
    if (optimisticMsg?.bubbleEl) optimisticMsg.bubbleEl.classList.add('msg-send-failed');
    showToast(_langText('Poruka nije poslata. Pokušaj ponovo.', 'Message was not sent. Please try again.'), 'error', 2200);
  }
}

// Realtime subscribe za aktivan chat
function _subscribeToChat(chatId) {
  // Always reset previous polling/listeners before starting a new subscription.
  _unsubscribeChat();
  if (!chatId) return;
  _activeChatId = chatId;
  _loadChatHistory(chatId).catch(() => {});

  const supa = _getSupaRealtimeClient();
  const token = getSession?.()?.access_token || null;
  if (!supa) {
    _startChatPollingFallback(chatId);
  } else {
    try {
      if (token && typeof supa.realtime?.setAuth === 'function') {
        supa.realtime.setAuth(token);
      }
      const channel = supa
        .channel(`chat-${chatId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        }, (payload) => {
          const incoming = payload?.new || null;
          if (!incoming || _activeChatId !== chatId) return;
          _appendSingleMessage(incoming, { suppressMine: true });
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[svita] chat realtime fallback:', status);
            if (_activeChatId === chatId) _startChatPollingFallback(chatId);
          }
        });
      _realtimeSub = channel;
    } catch (e) {
      console.warn('[svita] chat realtime subscribe failed:', e.message);
      _startChatPollingFallback(chatId);
    }
  }

  _chatVisibilityHandler = () => {
    if (_activeChatId !== chatId) return;
    if (document.visibilityState === 'visible') {
      _loadChatHistory(chatId).catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', _chatVisibilityHandler);
}

function _renderIncomingMsg(text, senderName) {
  const msgs = document.getElementById('chat-msgs');
  if (!msgs) return;
  const timeStr = new Date().toLocaleTimeString('sr', { hour:'2-digit', minute:'2-digit' });
  const div = document.createElement('div');
  div.className = 'msg';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  const time = document.createElement('span');
  time.className = 'msg-time';
  time.textContent = senderName + ' · ' + timeStr;
  div.appendChild(bubble);
  div.appendChild(time);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function _unsubscribeChat() {
  if (_realtimeSub) {
    if (_isRealtimeChannel(_realtimeSub)) {
      try {
        const supa = _getSupaRealtimeClient();
        _realtimeSub.unsubscribe();
        if (supa && typeof supa.removeChannel === 'function') {
          supa.removeChannel(_realtimeSub).catch?.(() => {});
        }
      } catch (e) {}
    } else {
      clearInterval(_realtimeSub);
    }
    _realtimeSub = null;
  }
  if (_chatVisibilityHandler) {
    document.removeEventListener('visibilitychange', _chatVisibilityHandler);
    _chatVisibilityHandler = null;
  }
  _activeChatId = null;
}
let _activeChatName = null; // pracenje aktivnog threada

function _doSend(val) {
  const msgs = document.getElementById('chat-msgs');
  if (!msgs) return null;

  const timeStr = new Date().toLocaleTimeString('sr', { hour:'2-digit', minute:'2-digit' });

  const div = document.createElement('div');
  div.className = 'msg me';
  const wrap = document.createElement('div');
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = val; // textContent — XSS safe
  const time = document.createElement('span');
  time.className = 'msg-time is-pending';
  time.textContent = _langText('Šalje se…', 'Sending…');
  wrap.appendChild(bubble);
  wrap.appendChild(time);
  div.appendChild(wrap);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return { rowEl: div, bubbleEl: bubble, timeEl: time, sentAt: timeStr };
}

// --- Swipe doSwipe indicators reset ---
function updateSwipeIndicators(dx) {
  const l = document.getElementById('swipe-like-ind');
  const s = document.getElementById('swipe-skip-ind');
  if (l) l.style.opacity = Math.max(0, dx / 80);
  if (s) s.style.opacity = Math.max(0, -dx / 80);
}

// --- "Idemo zajedno" ---
let _dogovorState = 'idle';


// --- selType ---
function selType(el) {
  el.closest('.type-grid').querySelectorAll('.type-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
}

// --- checkDuplicate ---
function checkDuplicate() {
  const input = document.querySelector('#page-create .form-input');
  if (!input || input.value.length < 4) {
    document.getElementById('dupe-warning').style.display = 'none';
    return;
  }
  const val = input.value.toLowerCase().trim();
  const titles = _combinedEventCards().map(e => String(e.title || '').toLowerCase()).filter(Boolean);
  const isDupe = titles.some(t => {
    const words = val.split(' ').filter(w => w.length > 3);
    return words.length > 0 && words.some(w => t.includes(w));
  });
  document.getElementById('dupe-warning').style.display = isDupe ? 'block' : 'none';
}

function _normalizeCreateDuplicateValue(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function _createDayToken(value = '') {
  return value ? String(value).slice(0, 10) : '';
}

function _findCreateDuplicateCandidates({ title = '', location = '', date = '', organizerId = null } = {}) {
  const normalizedTitle = _normalizeCreateDuplicateValue(title);
  const normalizedLocation = _normalizeCreateDuplicateValue(location);
  const day = _createDayToken(date);
  if (!normalizedTitle && !normalizedLocation && !day) return [];
  return _combinedEventCards().filter(item => {
    const raw = item.raw || {};
    const itemTitle = _normalizeCreateDuplicateValue(item.title || raw.title || '');
    const itemLocation = _normalizeCreateDuplicateValue(item.location_name || raw.location_name || '');
    const itemDay = _createDayToken(item.starts_at || raw.starts_at || item.date || '');
    const sameOrganizer = !!(organizerId && raw.organizer_id && raw.organizer_id === organizerId);
    const sameDay = !!(day && itemDay && day === itemDay);
    const similarTitle = !!(normalizedTitle && itemTitle && (itemTitle === normalizedTitle || itemTitle.includes(normalizedTitle) || normalizedTitle.includes(itemTitle)));
    const similarLocation = !!(normalizedLocation && itemLocation && (itemLocation === normalizedLocation || itemLocation.includes(normalizedLocation) || normalizedLocation.includes(itemLocation)));
    return (sameOrganizer && sameDay) || (similarTitle && sameDay) || (similarTitle && similarLocation);
  }).slice(0, 3);
}

async function _createPlanRecord({
  title = '',
  description = '',
  category = '',
  eventTags = [],
  city = '',
  location = '',
  startsAt = '',
  spots = null,
  sourceUrl = '',
  eventId = null,
  organizerId = null,
  venueId = null
} = {}) {
  if (!_isSupabaseConfigured() || !isLoggedIn()) return null;
  return _supaFetch('/rest/v1/plans', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({
      creator_id: getUser()?.id,
      event_id: eventId || null,
      organizer_id: organizerId || null,
      venue_id: venueId || null,
      title,
      description: description || null,
      category: category || null,
      event_tags: Array.isArray(eventTags) ? eventTags : [],
      city: city || null,
      location_name: location || null,
      starts_at: startsAt || null,
      spots_total: spots || 1,
      source_url: sourceUrl || null,
      status: 'open'
    })
  }).catch((e) => {
    console.warn('[svita] _createPlanRecord:', e.message);
    return null;
  });
}

// --- rateCat ---
function rateCat(star, catIdx, val) {
  const row = star.closest('.rev-stars');
  row.querySelectorAll('.rev-star').forEach((s, i) => {
    s.classList.toggle('on', i < val);
  });
}

// --- showCancelConfirm ---
function showCancelConfirm() {
  document.getElementById('cancel-overlay').style.display = 'flex';
}

// --- doSearch (basic filter) ---
// --- Unified browse filter state ---
const _browseState = { query: '', cat: 'all', tag: '', date: '', range: '', city: '' };

function resetBrowseFilters({ preserveQuery = false, apply = true } = {}) {
  if (!preserveQuery) _browseState.query = '';
  _browseState.cat = 'all';
  _browseState.tag = '';
  _browseState.date = '';
  _browseState.range = '';
  // Do not auto-apply city as a hard filter when entering Events tab.
  // City can still be applied explicitly via city picker actions.
  _browseState.city = '';

  const searchInput = document.getElementById('browse-search');
  if (searchInput && !preserveQuery) searchInput.value = '';

  const dateInput = document.getElementById('browse-date-input');
  if (dateInput) dateInput.value = '';

  document.querySelectorAll('#br-pills-wrap .pill').forEach((btn, index) => {
    btn.classList.toggle('active', index === 0);
  });
  document.querySelectorAll('[data-range-filter]').forEach(btn => btn.classList.remove('active'));
  _hideBrowseTagFilters();

  const dateBtn = document.getElementById('br-date-pill') || document.getElementById('date-filter-btn');
  if (dateBtn) {
    dateBtn.classList.remove('active');
    dateBtn.style.borderColor = '';
    dateBtn.style.color = '';
  }

  if (apply) _applyBrowseFilters();
}

function _applyBrowseFilters() {
  const grid = document.getElementById('browse-grid');
  const empty = document.getElementById('browse-empty');
  if (!grid) return;
  // Podrzi i sq-card i ev-card
  const cards = grid.querySelectorAll('.sq-card, .ev-card');
  let visible = 0;
  cards.forEach(card => {
    const text    = card.textContent.toLowerCase();
    const cardCat = card.getAttribute('data-cat') || '';
    const cardBucket = card.getAttribute('data-bucket') || '';
    const cardTags = String(card.getAttribute('data-tags') || '')
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean);
    const cardDay = card.getAttribute('data-day') || '';
    const cardDate= card.getAttribute('data-date') || '';
    const cardCity= _normalizeBrowseCityLabel(card.getAttribute('data-city') || '');
    const matchQ = !_browseState.query || text.includes(_browseState.query);
    let matchCat = true;
    if (_browseState.cat && _browseState.cat !== 'all') {
      if (_browseState.cat === 'danas')  matchCat = cardDay === 'danas';
      else if (_browseState.cat === 'sutra') matchCat = cardDay === 'sutra';
      else if (_browseState.cat === 'ove_nedelje') matchCat = cardDay === 'danas' || cardDay === 'sutra' || cardDay === 'vikend' || cardDay === 'ove_nedelje';
      else if (_browseState.cat === 'tonight') matchCat = typeof _isTonightEvent === 'function' ? _isTonightEvent(cardDate) : false;
      else matchCat = typeof _matchesEventCategoryFilter === 'function'
        ? _matchesEventCategoryFilter(_browseState.cat, cardCat, cardBucket, cardTags)
        : (cardCat === _browseState.cat || cardBucket === _browseState.cat);
    }
    let matchDate = !_browseState.date || cardDate === _browseState.date;
    if (_browseState.range) {
      const cardTs = cardDate
        ? ((typeof _parseEventDateLocal === 'function' ? _parseEventDateLocal(cardDate) : new Date(cardDate))?.getTime?.() ?? NaN)
        : NaN;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const limit = new Date(today);
      if (_browseState.range === '7d') limit.setDate(limit.getDate() + 7);
      if (_browseState.range === '30d') limit.setDate(limit.getDate() + 30);
      matchDate = !Number.isNaN(cardTs) && cardTs >= today.getTime() && cardTs <= limit.getTime();
    }
    const matchTag = !_browseState.tag || cardTags.includes(_browseState.tag);
    const matchCity = !_browseState.city || cardCity === _browseState.city;
    const show = matchQ && matchCat && matchTag && matchDate && matchCity;
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  if (empty) empty.style.display = visible === 0 ? 'block' : 'none';
  grid.querySelectorAll('.sq-card:not([style*="none"]), .ev-card:not([style*="none"])').forEach((c, i) => {
    c.style.animation = 'none'; c.offsetHeight;
    c.style.animation = `cardReveal .3s ease ${i * 0.06}s both`;
  });
  if (typeof _syncBrowseLoadMoreUi === 'function') _syncBrowseLoadMoreUi();
}

function doSearch(val) {
  const safeQuery = String(val || '');
  _browseState.query = safeQuery.toLowerCase().trim();
  _applyBrowseFilters();
  if (typeof renderBrowseProfileSearchResults === 'function') {
    renderBrowseProfileSearchResults(safeQuery).catch?.(() => {});
  }
}

function _normalizeBrowseCityLabel(value = '') {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'srbija' || raw.toLowerCase() === 'cela srbija') return '';
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function _collectCreatePlanInput() {
  const title = document.getElementById('create-title')?.value.trim() || '';
  const category = document.getElementById('create-category')?.value || '';
  const date = document.getElementById('create-date')?.value || '';
  const time = document.getElementById('create-time')?.value || '';
  const endDate = document.getElementById('create-end-date')?.value || '';
  const endTime = document.getElementById('create-end-time')?.value || '';
  const location = document.getElementById('create-location')?.value.trim() || '';
  const city = document.getElementById('create-city')?.value.trim() || '';
  const address = document.getElementById('create-address')?.value.trim() || '';
  const desc = document.getElementById('create-desc')?.value.trim() || '';
  const sourceUrl = document.getElementById('create-source-url')?.value.trim() || '';
  const organizerText = document.getElementById('create-organizer')?.value.trim() || '';
  const ticketPriceEl = document.getElementById('create-ticket-price');
  const ticketPriceRsd = ticketPriceEl?.value === '' || ticketPriceEl?.value == null
    ? null
    : parseInt(ticketPriceEl.value, 10);
  const eventTags = typeof getSelectedCreateTags === 'function' ? getSelectedCreateTags() : [];
  const spotsEl = document.getElementById('create-spots');
  const spots = spotsEl?.value ? parseInt(spotsEl.value, 10) : null;
  const vibeTags = typeof getSelectedCreateVibes === 'function' ? getSelectedCreateVibes() : [];
  const normalizedCategory = typeof _normalizeEventCategoryKey === 'function'
    ? _normalizeEventCategoryKey(category || '')
    : String(category || '').toLowerCase();
  const contextInput = document.getElementById('create-organizer');
  const selectedContextType = contextInput?.dataset.contextType || '';
  const selectedContextEventId = selectedContextType === 'event' ? (contextInput?.dataset.eventId || '') : '';
  const selectedContextOrganizerId = selectedContextType === 'organizer' ? (contextInput?.dataset.organizerId || '') : '';
  const targetPlanEventId = _planEventId || selectedContextEventId;
  const roleCaps = typeof getRoleCapabilities === 'function'
    ? getRoleCapabilities()
    : { canPublishManagedEvents: false, needsReviewForStandaloneCreate: true };
  const isManagedFlow = _createFlowMode === 'managed'
    || (_createFlowMode === 'auto' && roleCaps.canPublishManagedEvents && !_planEventId);
  const shouldPublishEvent = isManagedFlow || !roleCaps.needsReviewForStandaloneCreate;
  const startsAt = date ? (time ? `${date}T${time}:00` : `${date}T20:00:00`) : '';
  const endsAt = endDate ? `${endDate}T${(endTime || time || '23:59')}:00` : '';

  return {
    title,
    category,
    normalizedCategory,
    date,
    time,
    endDate,
    endTime,
    startsAt,
    endsAt,
    location,
    city,
    address,
    desc,
    sourceUrl,
    organizerText,
    ticketPriceRsd,
    eventTags,
    spots,
    vibeTags,
    selectedContextType,
    selectedContextEventId,
    selectedContextOrganizerId,
    targetPlanEventId,
    isManagedFlow,
    shouldPublishEvent
  };
}

function _validateCreatePlanInput(input) {
  if (!getUser()?.id) {
    showToast(_langText('Sesija nije spremna. Osveži stranicu i prijavi se ponovo.', 'Session is not ready. Refresh and sign in again.'), 'error', 2600);
    return false;
  }
  if (!input.title) {
    showToast(input.isManagedFlow ? 'Unesi naziv događaja' : 'Unesi naslov traženja', 'error');
    return false;
  }
  if (!input.targetPlanEventId && !input.date) {
    showToast(_langText('Izaberi datum', 'Choose a date'), 'error');
    return false;
  }
  if (!input.targetPlanEventId && !input.category) {
    showToast(_langText('Izaberi kategoriju', 'Choose a category'), 'error');
    return false;
  }
  if (!input.targetPlanEventId && !input.city) {
    showToast(_langText('Unesi grad', 'Enter city'), 'error');
    return false;
  }
  if (input.isManagedFlow && !input.location) {
    showToast(_langText('Unesi mesto održavanja ili okvirnu lokaciju', 'Enter venue or approximate location'), 'error');
    return false;
  }
  if (!input.isManagedFlow && _containsRestrictedContactInfo(`${input.title}\n${input.desc}\n${input.location}\n${input.city}`)) {
    showToast(_langText('Traženje društva ne sme da sadrži telefon, email, Instagram, Viber ili druge direktne kontakte.', 'Plan text cannot include phone, email, Instagram, Viber or other direct contacts.'), 'error', 2800);
    return false;
  }
  if (input.ticketPriceRsd != null && (!Number.isInteger(input.ticketPriceRsd) || input.ticketPriceRsd < 0)) {
    showToast(_langText('Unesi ispravnu cenu ulaznice', 'Enter a valid ticket price'), 'error');
    return false;
  }
  if (input.endsAt && input.startsAt) {
    const startTs = new Date(input.startsAt).getTime();
    const endTs = new Date(input.endsAt).getTime();
    if (!Number.isNaN(startTs) && !Number.isNaN(endTs) && endTs <= startTs) {
      showToast(_langText('"Do" termin mora biti posle početka događaja.', 'End date/time must be after start.'), 'error', 2500);
      return false;
    }
  }
  return true;
}

function _setCreateSubmitBusyState(btn, input) {
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = input.isManagedFlow ? 'Objavljujemo događaj...' : 'Objavljujemo traženje...';
}

function _restoreCreateSubmitState(btn) {
  if (!btn) return;
  btn.disabled = false;
  const roleCaps = typeof getRoleCapabilities === 'function'
    ? getRoleCapabilities()
    : { canPublishManagedEvents: false };
  const isManagedUiFlow = _createFlowMode === 'managed'
    || (_createFlowMode === 'auto' && roleCaps.canPublishManagedEvents && !_planEventId);
  if (_editingEventId) btn.textContent = 'Sačuvaj izmene';
  else if (isManagedUiFlow) btn.textContent = 'Objavi događaj';
  else if (_createFlowMode === 'suggest') btn.textContent = 'Pošalji predlog';
  else btn.textContent = 'Objavi plan';
}

async function _submitStandalonePlanForEvent(input) {
  await _createPlanRecord({
    title: input.title,
    description: input.desc,
    category: input.normalizedCategory,
    eventTags: input.eventTags,
    city: input.city || getUser()?.city || '',
    location: input.location,
    startsAt: null,
    spots: input.spots,
    sourceUrl: input.sourceUrl,
    eventId: input.targetPlanEventId,
    organizerId: null,
    venueId: null
  });
  showToast('Traženje društva je objavljeno unutar događaja', 'success');
  resetCreateForm();
  await loadEventPlans(input.targetPlanEventId);
  await loadMyProfile();
  if (typeof openEventById === 'function') await openEventById(input.targetPlanEventId);
  else nav('event');
}

async function _resolveCreateManagedContext(input) {
  const isManagedCreate = !_editingEventId && !_planEventId && input.isManagedFlow;
  const roleCaps = typeof getRoleCapabilities === 'function'
    ? getRoleCapabilities()
    : { canPublishManagedEvents: false };
  let managedTarget = null;
  if (input.isManagedFlow) {
    try {
      managedTarget = await _resolveManagedEventTarget();
    } catch (e) {
      console.warn('[svita] resolve managed target:', e?.message || e);
      managedTarget = null;
    }
  }
  const managedOrganizer = input.isManagedFlow && managedTarget?.entity_type === 'organizer' ? managedTarget : null;
  const myVenue = input.isManagedFlow && managedTarget?.entity_type !== 'organizer' ? managedTarget : null;

  if (input.isManagedFlow && !managedTarget?.id) {
    const allowDetachedManagedPublish = !!(
      roleCaps.canPublishManagedEvents
      || (typeof isAdminUser === 'function' && isAdminUser())
    );
    if (allowDetachedManagedPublish) {
      return {
        isManagedCreate,
        managedTarget: null,
        managedOrganizer: null,
        myVenue: null,
        isAdminDetachedCreate: true
      };
    }
    showToast('Objava događaja mora biti vezana za organizer profil ili mesto. Prvo otvori organizer panel ili odgovarajući profil.', 'error', 3200);
    return null;
  }

  return { isManagedCreate, managedTarget, managedOrganizer, myVenue, isAdminDetachedCreate: false };
}

async function _confirmDuplicateManagedCreate(input, managedOrganizer) {
  const startsAt = input.time ? `${input.date}T${input.time}:00` : `${input.date}T20:00:00`;
  const duplicateCandidates = _findCreateDuplicateCandidates({
    title: input.title,
    location: input.location,
    date: startsAt,
    organizerId: managedOrganizer?.id || null
  });
  if (!duplicateCandidates.length) return true;
  if (isAdminUser()) {
    showToast('Pronađeni su slični događaji, ali admin objava nastavlja. Proveri duplikate kasnije u pretrazi.', 'info', 3200);
    return true;
  }
  const duplicateSummary = duplicateCandidates
    .map(item => `• ${item.title || 'Događaj'}${item.meta ? ` (${item.meta})` : ''}`)
    .join('\n');
  return new Promise((resolve) => {
    showModDialog({
      title: _langText('Slični događaji već postoje', 'Similar events already exist'),
      message: _langText(
        `Pronašli smo moguće duplikate:\n\n${duplicateSummary}\n\nObjavi novi događaj samo ako je zaista različit.`,
        `We found possible duplicates:\n\n${duplicateSummary}\n\nPublish a new event only if it is genuinely different.`
      ),
      confirmText: _langText('Ipak objavi', 'Publish anyway'),
      cancelText: _langText('Odustani', 'Cancel'),
      confirmClassName: 'btn btn-danger btn-full',
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false)
    });
  });
}

function _buildEventPayload(input, managedOrganizer, myVenue) {
  const startsAt = input.startsAt || (input.time ? `${input.date}T${input.time}:00` : `${input.date}T20:00:00`);
  const payload = {
    creator_id: getUser()?.id,
    title: input.title,
    category: input.normalizedCategory,
    event_tags: Array.isArray(input.eventTags) ? input.eventTags : [],
    city: input.city || getUser()?.city || '',
    location_name: input.location || null,
    public_address: input.address || null,
    starts_at: startsAt,
    ends_at: input.endsAt || null,
    description: input.desc || null,
    capacity: input.spots,
    ticket_price_rsd: input.ticketPriceRsd,
    is_published: input.shouldPublishEvent
  };
  if (input.isManagedFlow) {
    if (managedOrganizer?.id) payload.organizer_id = managedOrganizer.id;
    if (myVenue?.id) payload.venue_id = myVenue.id;
  } else if (input.selectedContextOrganizerId) {
    payload.organizer_id = input.selectedContextOrganizerId;
  }
  return { payload, startsAt, uiTags: input.eventTags };
}

function _normalizeGhostOrganizerSignalLocal(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function _ghostSignalIncludesLocal(signals = [], patterns = []) {
  return patterns.some((pattern) => {
    const needle = _normalizeGhostOrganizerSignalLocal(pattern);
    return needle && signals.some(signal => signal.includes(needle));
  });
}

function _inferGhostOrganizerTypeForCreate(source = {}) {
  if (typeof _inferGhostOrganizerType === 'function') {
    try { return _inferGhostOrganizerType(source); } catch (e) {}
  }
  const tags = Array.isArray(source.eventTags) ? source.eventTags : [];
  const signals = [
    source.locationName,
    source.organizerName,
    source.title,
    source.category,
    source.city,
    ...tags
  ].map(_normalizeGhostOrganizerSignalLocal).filter(Boolean);

  if (_ghostSignalIncludesLocal(signals, ['kafana', 'etno bar', 'tamburasi', 'tamburaši'])) return 'kafana / etno bar';
  if (_ghostSignalIncludesLocal(signals, ['klub', 'club', 'bar', 'pub', 'lounge'])) return 'klub / bar';
  if (_ghostSignalIncludesLocal(signals, ['kafic', 'kafić', 'cafe', 'coffee'])) return 'restoran / kafić';
  if (_ghostSignalIncludesLocal(signals, ['pozoriste', 'pozorište', 'teatar', 'theatre'])) return 'pozorište';
  if (_ghostSignalIncludesLocal(signals, ['stadion', 'arena', 'hala', 'sportski centar'])) return 'stadion / arena';
  if (_ghostSignalIncludesLocal(signals, ['festival', 'open air'])) return 'festival / događaj';

  const category = _normalizeGhostOrganizerSignalLocal(source.category || '');
  if (category === 'sport_rekreacija') return 'sport';
  if (category === 'kultura_umetnost') return 'kulturni centar';
  return 'organizator događaja';
}

function _ghostOrganizerNameFromCreateInput(input = {}) {
  const addressSeed = String(input.address || '')
    .split(',')
    .map(part => part.trim())
    .find(Boolean) || '';
  const picked = String(
    input.organizerText
    || addressSeed
    || input.location
    || 'Organizer u pripremi'
  ).trim();
  const titleNorm = _normalizeCreateDuplicateValue(input.title || '');
  const pickedNorm = _normalizeCreateDuplicateValue(picked);
  if (pickedNorm && titleNorm && pickedNorm === titleNorm) {
    const location = String(input.location || '').trim();
    const locationNorm = _normalizeCreateDuplicateValue(location);
    if (location && locationNorm && locationNorm !== titleNorm) return location;
    return 'Organizator u pripremi';
  }
  return picked;
}

function _missingOrganizerColumnFromError(error) {
  const msg = String(error?.message || error?.data?.message || '');
  const match = msg.match(/Could not find the '([^']+)' column of 'organizers'/i);
  return match?.[1] || null;
}

function _unsupportedOrganizerColumnsCache() {
  if (!Array.isArray(globalThis.__mitmiUnsupportedOrganizerColumns)) {
    let initial = [];
    try {
      const raw = sessionStorage.getItem('mitmi_unsupported_organizer_columns');
      if (raw) initial = raw.split(',').map(item => item.trim()).filter(Boolean);
    } catch (e) {}
    globalThis.__mitmiUnsupportedOrganizerColumns = initial;
  }
  return new Set(globalThis.__mitmiUnsupportedOrganizerColumns);
}

function _persistUnsupportedOrganizerColumns(columns = new Set()) {
  const arr = Array.from(columns).filter(Boolean);
  globalThis.__mitmiUnsupportedOrganizerColumns = arr;
  try {
    sessionStorage.setItem('mitmi_unsupported_organizer_columns', arr.join(','));
  } catch (e) {}
}

function _stripUnsupportedOrganizerColumns(payload = {}) {
  const unsupported = _unsupportedOrganizerColumnsCache();
  if (!unsupported.size) return { ...payload };
  const next = { ...payload };
  unsupported.forEach((col) => {
    if (Object.prototype.hasOwnProperty.call(next, col)) delete next[col];
  });
  return next;
}

async function _insertOrganizerWithSchemaFallback(payload = {}) {
  let safePayload = _stripUnsupportedOrganizerColumns(payload);
  let lastError = null;
  for (let i = 0; i < 6; i += 1) {
    try {
      return await _supaFetch('/rest/v1/organizers', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(safePayload)
      });
    } catch (error) {
      lastError = error;
      const missingColumn = _missingOrganizerColumnFromError(error);
      if (!missingColumn || !Object.prototype.hasOwnProperty.call(safePayload, missingColumn)) {
        throw error;
      }
      const unsupported = _unsupportedOrganizerColumnsCache();
      unsupported.add(missingColumn);
      _persistUnsupportedOrganizerColumns(unsupported);
      const { [missingColumn]: _removed, ...nextPayload } = safePayload;
      safePayload = nextPayload;
    }
  }
  throw lastError || new Error('Organizer create failed');
}

async function _createGhostOrganizerForManagedEvent(event, input, payload) {
  if (!_isSupabaseConfigured() || !isAdminUser() || !event?.id) return null;
  const organizerName = _ghostOrganizerNameFromCreateInput(input);
  const organizerType = _inferGhostOrganizerTypeForCreate({
    title: input.title,
    category: input.normalizedCategory || input.category,
    city: input.city,
    locationName: input.location,
    eventTags: input.eventTags
  });

  const organizerRows = await _insertOrganizerWithSchemaFallback({
    name: organizerName,
    city: input.city || '',
    organizer_type: organizerType,
    // Keep organizer cover independent from event cover.
    // Organizer/venue profile media should be uploaded separately.
    cover_url: null,
    public_description: input.desc || null,
    public_address: input.address || input.location || null,
    source_notes: [
      `Auto-created from admin publish flow for event ${event.id}`.trim(),
      input.location ? `Location: ${input.location}` : '',
      input.address ? `Address: ${input.address}` : ''
    ].filter(Boolean).join(' | '),
    status: 'unclaimed',
    created_by: getUser()?.id || null,
    updated_by: getUser()?.id || null
  });
  const organizer = Array.isArray(organizerRows) ? organizerRows[0] : null;
  if (!organizer?.id) throw new Error('Ghost organizer nije kreiran');

  await _supaFetch(`/rest/v1/events?id=eq.${event.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      organizer_id: organizer.id
    })
  });

  return {
    ...event,
    organizer_id: organizer.id,
    organizers: organizer,
    raw: {
      ...(event.raw || {}),
      ...payload,
      organizer_id: organizer.id
    }
  };
}

async function _recoverRecentEventRecord(input = {}, startsAt = '', explicitEventId = '') {
  if (!_isSupabaseConfigured() || !isLoggedIn()) return null;
  const userId = getUser()?.id || '';
  if (!userId && !explicitEventId) return null;
  try {
    const rows = await _supaGet('events', {
      select: 'id,creator_id,venue_id,organizer_id,title,description,category,event_tags,city,location_name,public_address,starts_at,capacity,ticket_price_rsd,cover_url,is_published,is_cancelled,created_at',
      ...(explicitEventId ? { id: `eq.${explicitEventId}` } : { creator_id: `eq.${userId}` }),
      order: 'created_at.desc',
      limit: explicitEventId ? '1' : '8'
    });
    const items = Array.isArray(rows) ? rows : [];
    if (explicitEventId) return items[0] || null;
    const normalizedTitle = String(input?.title || '').trim().toLowerCase();
    const normalizedCity = String(input?.city || '').trim().toLowerCase();
    const normalizedLocation = String(input?.location || '').trim().toLowerCase();
    const matched = items.find((row) => {
      const rowTitle = String(row?.title || '').trim().toLowerCase();
      if (normalizedTitle && rowTitle !== normalizedTitle) return false;
      if (startsAt && String(row?.starts_at || '').slice(0, 16) !== String(startsAt).slice(0, 16)) return false;
      if (normalizedCity) {
        const rowCity = String(row?.city || '').trim().toLowerCase();
        if (rowCity && rowCity !== normalizedCity) return false;
      }
      if (normalizedLocation) {
        const rowLoc = String(row?.location_name || '').trim().toLowerCase();
        if (rowLoc && rowLoc !== normalizedLocation) return false;
      }
      return true;
    }) || null;
    return matched;
  } catch (e) {
    return null;
  }
}

async function _persistEventCreateOrUpdate(input, payload, startsAt) {
  const shouldRetryWithoutOptionalColumns = (error) => {
    const message = String(error?.message || error?.data?.message || '').toLowerCase();
    const missingOptionalColumn = ['ticket_price_rsd', 'public_address', 'ends_at'].find((column) => (
      Object.prototype.hasOwnProperty.call(payload, column)
      && message.includes(column)
      && (
        message.includes('column')
        || message.includes('schema cache')
        || message.includes('could not find')
      )
    ));
    return missingOptionalColumn || '';
  };

  const runEventMutation = async (bodyPayload) => {
    if (_editingEventId) {
      const ownUpdate = await _supaFetch(`/rest/v1/events?id=eq.${_editingEventId}&creator_id=eq.${getUser()?.id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(bodyPayload)
      });
      const ownRows = Array.isArray(ownUpdate) ? ownUpdate : (ownUpdate ? [ownUpdate] : []);
      if (ownRows.length > 0) return ownUpdate;

      // Fallback for admin/claimed-organizer/venue-owner edit flows.
      // RLS stays the final authority.
      const canTryManagedFallback = !!(
        input?.isManagedFlow
        || isAdminUser()
        || getRoleCapabilities()?.canPublishManagedEvents
      );
      if (!canTryManagedFallback) return ownUpdate;

      return _supaFetch(`/rest/v1/events?id=eq.${_editingEventId}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(bodyPayload)
      });
    }
    return _supaFetch('/rest/v1/events', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(bodyPayload)
    });
  };

  const submitEventMutation = async () => {
    try {
      return await runEventMutation(payload);
    } catch (error) {
      const missingColumn = shouldRetryWithoutOptionalColumns(error);
      if (!missingColumn) throw error;
      const fallbackPayload = { ...payload };
      delete fallbackPayload[missingColumn];
      const retried = await runEventMutation(fallbackPayload);
      const retryMessage = missingColumn === 'public_address'
        ? 'Događaj je objavljen bez posebne adrese jer baza još nema novo polje. Pokreni najnoviji Supabase patch kada stigneš.'
        : (missingColumn === 'ends_at'
          ? 'Događaj je objavljen bez "do" termina jer baza još nema novo polje. Pokreni najnoviji Supabase patch kada stigneš.'
          : 'Događaj je objavljen bez cene ulaznice jer baza još nema novo polje. Pokreni najnoviji Supabase patch kada stigneš.');
      showToast(retryMessage, 'info', 3200);
      return retried;
    }
  };

  const submitEventMutationWithManagedFallback = async () => {
    try {
      return await submitEventMutation();
    } catch (error) {
      const message = String(error?.message || error?.data?.message || '').toLowerCase();
      const canRetryDetachedManagedInsert = (
        !_editingEventId
        && input?.isManagedFlow
        && (payload?.organizer_id || payload?.venue_id)
        && (
          message.includes('row-level security')
          || message.includes('permission denied')
          || message.includes('violates row-level security policy')
        )
      );

      if (!canRetryDetachedManagedInsert) throw error;

      const detachedPayload = { ...payload };
      delete detachedPayload.organizer_id;
      delete detachedPayload.venue_id;

      const retried = await runEventMutation(detachedPayload);
      showToast('Događaj je objavljen bez automatskog povezivanja sa organizer/mesto profilom. Poveži ga iz admin panela.', 'info', 3800);
      return retried;
    }
  };

  let event;
  if (_editingEventId) {
    const updated = await submitEventMutationWithManagedFallback();
    event = Array.isArray(updated) ? updated[0] : updated;
    if (!event?.id && _editingEventId) {
      event = await _recoverRecentEventRecord(input, startsAt, _editingEventId);
    }
    if (!event?.id) throw new Error('Događaj nije izmenjen');
    if (!_createFlowMode || _createFlowMode !== 'managed') {
      try {
        await _supaFetch(`/rest/v1/plans?event_id=eq.${event.id}&creator_id=eq.${getUser()?.id}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            title: input.title,
            description: input.desc || null,
            category: input.normalizedCategory || input.category || null,
            event_tags: Array.isArray(input.eventTags) ? input.eventTags : [],
            city: input.city || getUser()?.city || null,
            location_name: input.location || null,
            starts_at: startsAt,
            spots_total: input.spots || 1,
            source_url: input.sourceUrl || null,
            status: 'open'
          })
        });
      } catch (e) {
        console.warn('[svita] update related plans:', e.message);
      }
    }
  } else {
    const eventRes = await submitEventMutationWithManagedFallback();
    event = Array.isArray(eventRes) ? eventRes[0] : eventRes;
    if (!event?.id) {
      event = await _recoverRecentEventRecord(input, startsAt);
    }
    if (!event?.id) throw new Error('Event nije kreiran');
    if (_createFlowMode === 'social') {
      await _createPlanRecord({
        title: input.title,
        description: input.desc,
        category: input.category,
        eventTags: input.eventTags,
        city: input.city || getUser()?.city || '',
        location: input.location,
        startsAt,
        spots: input.spots,
        sourceUrl: input.sourceUrl,
        eventId: input.selectedContextEventId || event.id || null,
        organizerId: input.selectedContextOrganizerId || null,
        venueId: null
      });
    }
  }
  return event;
}

async function _finalizeCreatedEvent(event, payload, uiTags = []) {
  if (_pendingEventCover) {
    try {
      const persistedCover = (typeof _persistEventCover === 'function')
        ? await _persistEventCover(event.id, _pendingEventCover)
        : _pendingEventCover;
      _setEventCover(event.id, persistedCover);
      event.cover_url = persistedCover;
    } catch (coverErr) {
      console.warn('[svita] persist event cover:', coverErr.message);
      _clearEventCover(event.id);
      event.cover_url = null;
      showToast('Naslovna slika nije sačuvana. Proveri upload i pokušaj ponovo.', 'error', 2600);
    }
  }
  if (!_pendingEventCover) {
    const hasExistingCover = !!event.cover_url;
    if (hasExistingCover && typeof _applyCoverFocusToUrl === 'function') {
      const focusX = Number(globalThis._pendingEventCoverFocusX ?? 50);
      const focusY = Number(globalThis._pendingEventCoverFocusY ?? 82);
      const focusedCoverUrl = _applyCoverFocusToUrl(event.cover_url, focusX, focusY);
      if (focusedCoverUrl && focusedCoverUrl !== event.cover_url) {
        try {
          const updated = await _supaFetch(`/rest/v1/events?id=eq.${event.id}&creator_id=eq.${getUser()?.id}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify({ cover_url: focusedCoverUrl })
          });
          const savedRow = Array.isArray(updated) ? updated[0] : updated;
          event.cover_url = savedRow?.cover_url || focusedCoverUrl;
          _setEventCover(event.id, event.cover_url);
        } catch (focusErr) {
          console.warn('[svita] persist cover focus:', focusErr?.message || focusErr);
          event.cover_url = focusedCoverUrl;
          _setEventCover(event.id, event.cover_url);
        }
      }
    }
    _clearEventCover(event.id);
    if (typeof _clearPersistedEventCover === 'function') {
      try { await _clearPersistedEventCover(event.id); } catch (coverErr) {
        console.warn('[svita] clear event cover:', coverErr.message);
      }
    }
    event.cover_url = null;
  }

  if (typeof _setEventTags === 'function') {
    _setEventTags(event.id, uiTags || []);
  }

  const mapped = _mapDbEventToCard({ ...event, ...payload });
  _syncEventCollections(mapped);
  _currentEventId = event.id;
  return mapped;
}

async function _finishCreatePlanFlow(mapped, input, createContext) {
  if (_editingEventId) {
    showToast('Događaj je ažuriran', 'success');
    resetCreateForm();
    await loadMyProfile();
    renderEventDetail(mapped);
    nav('event');
    return;
  }

  const isStandaloneSocialCreate = !_editingEventId && !_planEventId && _createFlowMode === 'social';
  showToast(
    createContext.isManagedCreate ? 'Događaj je objavljen' : (isStandaloneSocialCreate ? 'Traženje društva je objavljeno' : 'Traženje društva je objavljeno'),
    'success'
  );
  resetCreateForm();
  await loadMyProfile();
  if (createContext.isManagedCreate && mapped?.id) {
    if (typeof openEventById === 'function') {
      await openEventById(mapped.id);
    } else {
      nav('event');
      renderEventDetail(mapped);
    }
    showToast('Novi događaj je otvoren odmah posle objave', 'info', 2200);
    return;
  }
  openUnifiedHub('events', 0);
  setTimeout(() => {
    const searchInput = document.getElementById('browse-search');
    if (searchInput) searchInput.value = input.title;
    doSearch(input.title);
    showToast(
      createContext.isManagedCreate
        ? 'Novi događaj je dodat u pretragu događaja'
        : (isStandaloneSocialCreate ? 'Novi plan je dodat u Istraži' : 'Plan je dodat uz događaj'),
      'info',
      2200
    );
  }, 60);
}

async function _maybeAttachGhostOrganizerToManagedCreate(event, input, payload, createContext) {
  if (!createContext?.isManagedCreate || !createContext?.isAdminDetachedCreate) return event;
  if (payload?.organizer_id || payload?.venue_id || event?.organizer_id || event?.venue_id) return event;
  // Keep admin flow reviewable: do not auto-create ghost organizers.
  // Newly published detached events stay visible in admin orphan moderation.
  showToast('Događaj je objavljen. Organizer profil dodaj kroz Admin pregled kad potvrdiš podatke.', 'info', 3200);
  return event;
}

// --- handleCreatePlan — pravi Supabase insert ---
async function handleCreatePlan() {
  if (!isLoggedIn()) { showToast('Prijavi se da bi objavio traženje društva', 'error'); nav('login'); return; }
  const input = _collectCreatePlanInput();
  if (!_validateCreatePlanInput(input)) return;
  const btn = document.getElementById('create-submit-btn');
  _setCreateSubmitBusyState(btn, input);

  try {
    if (input.targetPlanEventId && !_editingEventId) {
      await _submitStandalonePlanForEvent(input);
      return;
    }

    const createContext = await _resolveCreateManagedContext(input);
    if (!createContext) return;

    if (createContext.isManagedCreate && !_editingEventId) {
      const shouldContinue = await _confirmDuplicateManagedCreate(input, createContext.managedOrganizer);
      if (!shouldContinue) return;
    }

    const { payload, startsAt, uiTags } = _buildEventPayload(input, createContext.managedOrganizer, createContext.myVenue);
    const event = await _persistEventCreateOrUpdate(input, payload, startsAt);
    const eventWithOrganizer = await _maybeAttachGhostOrganizerToManagedCreate(event, input, payload, createContext);
    const mapped = await _finalizeCreatedEvent(eventWithOrganizer, payload, uiTags);
    await _finishCreatePlanFlow(mapped, input, createContext);

  } catch(e) {
    console.error('[svita] handleCreatePlan:', e);
    const rawMessage = String(e?.message || e?.data?.message || e?.error_description || '').trim();
    const message = rawMessage.toLowerCase();
    if (message.includes('ticket_price_rsd')) {
      showToast('Objava nije uspela jer Supabase još nema novo polje za cenu ulaznice. Pokreni poslednji SQL patch pa pokušaj ponovo.', 'error', 3600);
    } else if (message.includes('public_address')) {
      showToast('Objava nije uspela jer Supabase još nema novo polje za adresu događaja. Pokreni poslednji SQL patch pa pokušaj ponovo.', 'error', 3600);
    } else if (message.includes('ends_at')) {
      showToast('Objava nije uspela jer Supabase još nema novo polje za završetak događaja. Pokreni poslednji SQL patch pa pokušaj ponovo.', 'error', 3600);
    } else if (message.includes('row-level security') || message.includes('permission denied')) {
      showToast('Ovaj nalog trenutno nema dozvolu za ovu objavu. Proveri admin ili organizer prava.', 'error', 3200);
    } else if (rawMessage) {
      showToast(`Objava nije uspela: ${rawMessage}`, 'error', 4200);
    } else {
      showToast('Greška pri objavljivanju, pokušaj ponovo', 'error');
    }
  } finally {
    _restoreCreateSubmitState(btn);
  }
}

const handleCreateInvite = handleCreatePlan;

// Fallback submit handler used by inline onclick in index.html.
// Keep this in runtime so create submit still works even if a later
// domain script fails to initialize.
async function handleCreateSubmit() {
  if (_createFlowMode === 'suggest' && !_planEventId && !_editingEventId) {
    if (typeof handleSuggestEventSubmit === 'function') {
      await handleSuggestEventSubmit();
      return;
    }
    showToast('Predlog događaja trenutno nije dostupan.', 'error', 2200);
    return;
  }
  await handleCreatePlan();
}

window.handleCreateSubmit = handleCreateSubmit;

let _createSubmitInFlight = false;

async function submitCreateFromUi() {
  if (!isLoggedIn()) {
    showToast('Prijavi se da bi objavila događaj ili plan.', 'info', 2200);
    nav('login');
    return false;
  }
  if (_createSubmitInFlight) {
    showToast('Objava je već u toku. Sačekaj trenutak.', 'info', 1800);
    return false;
  }
  _createSubmitInFlight = true;
  try {
    const runWithTimeout = async (task, timeoutMs = 25000) => {
      let timeoutId = null;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Zahtev je istekao. Proveri internet i pokušaj ponovo.')), timeoutMs);
      });
      try {
        return await Promise.race([task, timeoutPromise]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    if (typeof handleCreateSubmit === 'function') {
      await runWithTimeout(handleCreateSubmit());
      return false;
    }
    if (typeof handleCreatePlan === 'function') {
      await runWithTimeout(handleCreatePlan());
      return false;
    }
    throw new Error('Create forma nije potpuno učitana. Osveži stranicu i pokušaj ponovo.');
  } catch (e) {
    const rawMessage = String(e?.message || e?.data?.message || '').trim();
    console.error('[svita] submitCreateFromUi:', e);
    const normalizedMessage = rawMessage.toLowerCase();
    if (normalizedMessage.includes('istekao')) {
      try {
        const input = (typeof _collectCreatePlanInput === 'function') ? _collectCreatePlanInput() : null;
        const isEventCreateFlow = !!(input && !input.targetPlanEventId && _createFlowMode !== 'suggest');
        if (isEventCreateFlow && typeof _recoverRecentEventRecord === 'function') {
          const startsAt = input.time ? `${input.date}T${input.time}:00` : `${input.date}T20:00:00`;
          const recovered = await _recoverRecentEventRecord(input, startsAt);
          if (recovered?.id) {
            const mapped = _mapDbEventToCard(recovered);
            _syncEventCollections(mapped);
            resetCreateForm();
            showToast('Događaj je ipak kreiran. Otvaramo ga sada.', 'success', 2600);
            if (typeof openEventById === 'function') {
              await openEventById(recovered.id);
            } else {
              nav('event');
              renderEventDetail(mapped);
            }
            return false;
          }
        }
      } catch (recoverErr) {
        console.warn('[svita] submitCreateFromUi timeout recovery:', recoverErr?.message || recoverErr);
      }
    }
    showToast(rawMessage ? `Objava nije uspela: ${rawMessage}` : 'Objava trenutno nije uspela, pokušaj ponovo.', 'error', 3600);
    return false;
  } finally {
    _createSubmitInFlight = false;
  }
}

window.submitCreateFromUi = submitCreateFromUi;

// --- handleReport — pravi Supabase insert ---
async function handleReport() {
  if (!isLoggedIn()) { nav('login'); return; }
  const reasonEl = document.getElementById('report-reason');
  const detailsEl = document.getElementById('report-details');
  const rawReason = reasonEl?.value || 'Ostalo';
  const reason = String(rawReason).toLowerCase().replace(/\s+/g, '_');
  const details = detailsEl?.value?.trim() || null;
  const contextType = _reportContext.type || 'profile';
  const entityType = contextType === 'venue' ? 'organizer' : (contextType === 'issue' ? 'report' : contextType);
  const entityId =
    contextType === 'profile' ? _reportContext.profileId :
    contextType === 'venue' ? _reportContext.venueId :
    contextType === 'event' ? _reportContext.eventId :
    null;

  try {
    if (_isSupabaseConfigured() && entityId) {
      await _supaFetch('/rest/v1/rpc/submit_report', {
        method: 'POST',
        body: JSON.stringify({
          p_entity_type: entityType,
          p_entity_id: entityId,
          p_reason: reason,
          p_message: details
        })
      });
    } else {
      const created = await _supaFetch('/rest/v1/reports', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          reporter_id: getUser()?.id,
          reason,
          message: details,
          entity_type: entityType,
          entity_id: null,
          resolved: false,
          status: 'open'
        })
      });
      const report = Array.isArray(created) ? created[0] : created;
      if (report?.id) {
        await _supaFetch('/rest/v1/rpc/create_moderation_item', {
          method: 'POST',
          body: JSON.stringify({
            p_entity_type: 'report',
            p_entity_id: report.id,
            p_reason: reason,
            p_source_type: 'user',
            p_priority: contextType === 'issue' ? 1 : 2,
            p_report_id: report.id,
            p_metadata: {
              label: _reportContext.label || 'svita app',
              message: details,
              context_type: contextType,
              category: contextType === 'issue' ? 'bug_report' : 'user_report'
            }
          })
        });
      }
    }
    showToast(contextType === 'issue' ? 'Bag je poslat timu' : 'Prijava poslata', 'success');
  } catch(e) {
    console.warn('[svita] handleReport:', e.message);
    showToast(contextType === 'issue' ? 'Greška pri slanju baga' : 'Greška pri slanju prijave', 'error');
  }
  navBack();
}

// --- enterApp (za 1a login placeholder) ---
function enterApp() { handleLogin(); }

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _ensureFormFieldIdentityAndLabels, { once: true });
  } else {
    _ensureFormFieldIdentityAndLabels();
  }
}
