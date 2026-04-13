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

function _safeCssUrl(url = '') {
  return encodeURI(String(url ?? '').replace(/[\r\n\f]/g, ''))
    .replace(/'/g, '%27')
    .replace(/"/g, '%22')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\\/g, '%5C');
}

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
  return (
    getUser()?.user_metadata?.role ||
    getUser()?.user_role ||
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

function nav(id, opts = {}) {
  const requestedId = id;
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
  const target = document.getElementById('page-' + id);
  if (!target) { console.warn('[mitmi] nav: page-' + id + ' not found'); return; }
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
  if (id === 'venue-onboarding' && typeof resetVenueOnboarding === 'function') {
    setTimeout(() => resetVenueOnboarding(), 0);
  }
  if (id === 'onboarding' && typeof resetUserOnboarding === 'function') {
    setTimeout(() => {
      _syncBirthYearInputBounds();
      resetUserOnboarding();
    }, 0);
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
  if (!raw) return { key: 'other', sr: 'Ostalo', en: 'Other', emoji: '✨', bg: 'ev-img-b' };
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
  if (raw.includes('festival') || raw.includes('događ') || raw.includes('dogadj')) return { key: 'festival', sr: 'Festival / događaj', en: 'Festival / event', emoji: '🎪', bg: 'ev-img-a' };
  if (raw.includes('organizator')) return { key: 'organizer', sr: 'Organizator događaja', en: 'Event organiser', emoji: '📣', bg: 'ev-img-a' };
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
  return rows;
}

function applyLang(l) {
  const lang = l || getCurrentLang();
  window.curLang = lang;
  document.querySelectorAll('[data-t]').forEach(el => {
    try { const t = JSON.parse(el.getAttribute('data-t')); if (t[lang]) el.textContent = t[lang]; } catch(e) {}
  });
  document.querySelectorAll('[data-t-html]').forEach(el => {
    try { const t = JSON.parse(el.getAttribute('data-t-html')); if (t[lang]) el.innerHTML = t[lang]; } catch(e) {}
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
      searchInput.placeholder = _langText('Pretraži događaje ili organizatore...', 'Search events or organizers...');
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
      searchInput.placeholder = _langText('Pretraži događaje...', 'Search events...');
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
      searchInput.placeholder = _langText('Pretraži organizatore...', 'Search organizers...');
      searchInput.oninput = function() { doVenueSearch(this.value); };
    }
    if (typeof loadBrowseVenues === 'function') loadBrowseVenues().catch(() => {});
    return;
  }
  if (activeTab === 'plans') {
    if (searchInput) {
      searchInput.placeholder = _langText('Pretraži planove...', 'Search plans...');
      searchInput.oninput = function() { doPlanSearch(this.value); };
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
    console.warn('[mitmi] lang rerender failed:', e?.message || e);
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

// --- City picker ---
function showCityPicker() {
  const ov = document.getElementById('city-picker-overlay');
  ov.style.display = 'flex';
}
function hideCityPicker() {
  document.getElementById('city-picker-overlay').style.display = 'none';
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
    showToast('Unesi naziv grada', 'info', 1500);
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
  _hideBrowseTagFilters();
  document.querySelectorAll('[data-range-filter]').forEach(btn => btn.classList.remove('active'));
  _browseState.date = dateVal || '';
  const grid = document.getElementById('browse-grid');
  const empty = document.getElementById('browse-empty');
  if (!grid) return;
  const cards = grid.querySelectorAll('.sq-card, .ev-card');
  let visible = 0;
  cards.forEach(card => {
    if (!dateVal) {
      card.style.display = '';
      visible++;
      return;
    }
    const cardDate = card.getAttribute('data-date') || '';
    const show = cardDate === dateVal;
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  if (empty) empty.style.display = visible === 0 ? 'block' : 'none';
  // Animacija vidljivih
  grid.querySelectorAll('.sq-card:not([style*="none"]), .ev-card:not([style*="none"])').forEach((c, i) => {
    c.style.animation = 'none';
    c.offsetHeight;
    c.style.animation = `cardReveal .3s ease ${i * 0.06}s both`;
  });
  // Reset date filter ako je prazno
  if (!dateVal) {
    showToast('Filter uklonjen', 'info', 1200);
  } else {
    const d = typeof _parseEventDateLocal === 'function' ? _parseEventDateLocal(dateVal) : new Date(dateVal);
    const label = d && !Number.isNaN(d.getTime())
      ? d.toLocaleDateString('sr-Latn', { day:'numeric', month:'long' })
      : dateVal;
    showToast(visible > 0 ? label + ` - ${visible} događaja` : label + ' - nema događaja', visible > 0 ? 'success' : 'info', 2000);
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
    showToast('Prikazani su svi datumi', 'info', 1500);
    return;
  }
  showToast(rangeKey === '7d' ? 'Prikazani događaji u narednih 7 dana' : 'Prikazani događaji u narednih 30 dana', 'success', 1800);
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
  showToast('Prikazani su događaji u narednih nekoliko sati', 'success', 1800);
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

function _deriveDisplayName(email = '', fallback = 'mitmi korisnik') {
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
  const cacheId = getUser()?.id || 'guest';
  const cached = _getCached('organizer', cacheId);
  if (cached) return cached;
  try {
    const rows = await _supaGet('organizers', {
      claimed_by_profile_id: `eq.${getUser()?.id}`,
      select: 'id,name,city,organizer_type,public_address,public_description,instagram_handle,website_url,public_contact_email,public_contact_phone,source_notes,status,claimed_by_profile_id,created_at,updated_at',
      order: 'updated_at.desc',
      limit: '1'
    });
    const organizer = Array.isArray(rows) ? (rows[0] || null) : null;
    if (organizer) _setCached('organizer', cacheId, organizer, CACHE_TTL.organizer);
    return organizer;
  } catch (e) {
    return null;
  }
}

async function _findExistingOrganizerMatch(name = '', city = '') {
  if (!_isSupabaseConfigured()) return null;
  const normalizedName = _normalizeEntityName(name);
  if (!normalizedName) return null;
  try {
    const rows = await _supaGet('organizers', {
      select: 'id,name,city,status,claimed_by_profile_id,instagram_handle',
      order: 'updated_at.desc',
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
  const eventSource = _combinedEventCards().map(ev => ({ ...ev, swipeType: 'event', swipe_key: `event-${ev.id || ev.title || ''}` }));
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
      ? (ev.raw?.description || `Objavljen plan od korisnika ${ev.creatorName || 'mitmi korisnik'} za zajednički odlazak ili dogovor.`)
      : (ev.raw?.description || ev.desc || 'Nađi društvo za ovaj događaj i dogovorite se direktno u aplikaciji.'),
    going: ev.swipeType === 'plan'
      ? `${ev.creatorName || 'mitmi korisnik'} · ${ev.spots || '1'} mesta`
      : (ev.going || `${(typeof _eventSpotsLabel === 'function' ? _eventSpotsLabel(ev.spots, ev.attendee_count || ev.raw?.attendee_count || 0) : (ev.spots || 'Bez limita'))} · aktivna ekipa`),
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
const MOD_PATTERNS = [
  /\b(\+?381|06\d)\s*[\d\s\-]{6,}/,
  /@[\w.]+/,
  /\bwhatsapp\b/i, /\bviber\b/i, /\btelegram\b/i,
];
function checkMsgContent(text) {
  return MOD_PATTERNS.some(p => p.test(text));
}
function showModWarning(type, onConfirm) {
  modOnConfirm = onConfirm;
  document.getElementById('mod-overlay').style.display = 'flex';
}
function modDismiss() {
  document.getElementById('mod-overlay').style.display = 'none';
  modOnConfirm = null;
}
function modConfirm() {
  document.getElementById('mod-overlay').style.display = 'none';
  if (modOnConfirm) { modOnConfirm(); modOnConfirm = null; }
}

// --- Send message ---
// _activeChatId: UUID aktivnog chata iz Supabase
let _activeChatId = null;
let _realtimeSub  = null;
let _chatVisibilityHandler = null;

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
  _doSend(text);

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
  } catch(e) {
    console.warn('[mitmi] sendMsg failed:', e.message);
    // Poruka je već prikazana lokalno, ne gasimo je
  }
}

// Realtime subscribe za aktivan chat
function _subscribeToChat(chatId) {
  if (!chatId || !window.EventSource) return;
  _activeChatId = chatId;

  // Supabase Realtime via REST polling (bez JS SDK)
  // Za pravi realtime koristiti @supabase/supabase-js
  // Ovo je polling fallback svakih 3s
  if (_realtimeSub) clearInterval(_realtimeSub);
  if (_chatVisibilityHandler) {
    document.removeEventListener('visibilitychange', _chatVisibilityHandler);
    _chatVisibilityHandler = null;
  }
  let lastTs = new Date().toISOString();

  const shouldPoll = () => {
    const chatPage = document.getElementById('page-chat');
    return !!(isLoggedIn() && _activeChatId && chatPage?.classList.contains('active') && document.visibilityState === 'visible');
  };

  const pollOnce = async () => {
    if (!shouldPoll()) return;
    try {
      const msgs = await _supaFetch(
        `/rest/v1/messages?chat_id=eq.${_activeChatId}&created_at=gt.${encodeURIComponent(lastTs)}&order=created_at.asc&select=*,profiles!sender_id(username,avatar_url)`,
        { method: 'GET' }
      );
      if (!Array.isArray(msgs) || msgs.length === 0) return;
      lastTs = msgs[msgs.length-1].created_at;
      const myId = getUser()?.id;
      msgs.forEach(m => {
        if (m.sender_id === myId) return; // već prikazano optimistički
        _renderIncomingMsg(m.content, m.profiles?.username || '?');
      });
    } catch(e) {}
  };

  const startPolling = () => {
    if (_realtimeSub || !shouldPoll()) return;
    _realtimeSub = setInterval(pollOnce, 5000);
  };

  const stopPolling = () => {
    if (_realtimeSub) {
      clearInterval(_realtimeSub);
      _realtimeSub = null;
    }
  };

  _chatVisibilityHandler = () => {
    if (shouldPoll()) startPolling();
    else stopPolling();
  };
  document.addEventListener('visibilitychange', _chatVisibilityHandler);

  startPolling();
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
  if (_realtimeSub) { clearInterval(_realtimeSub); _realtimeSub = null; }
  if (_chatVisibilityHandler) {
    document.removeEventListener('visibilitychange', _chatVisibilityHandler);
    _chatVisibilityHandler = null;
  }
  _activeChatId = null;
}
let _activeChatName = null; // pracenje aktivnog threada

function _doSend(val) {
  const msgs = document.getElementById('chat-msgs');
  if (!msgs) return;

  const timeStr = new Date().toLocaleTimeString('sr', { hour:'2-digit', minute:'2-digit' });

  const div = document.createElement('div');
  div.className = 'msg me';
  const wrap = document.createElement('div');
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = val; // textContent — XSS safe
  const time = document.createElement('span');
  time.className = 'msg-time';
  time.textContent = timeStr;
  wrap.appendChild(bubble);
  wrap.appendChild(time);
  div.appendChild(wrap);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
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
    console.warn('[mitmi] _createPlanRecord:', e.message);
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
  _browseState.city = _normalizeBrowseCityLabel(document.getElementById('browse-city-label')?.textContent || '');

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
      else matchCat = cardCat === _browseState.cat || cardBucket === _browseState.cat;
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
}

function doSearch(val) {
  _browseState.query = val.toLowerCase().trim();
  _applyBrowseFilters();
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
  const location = document.getElementById('create-location')?.value.trim() || '';
  const city = document.getElementById('create-city')?.value.trim() || '';
  const desc = document.getElementById('create-desc')?.value.trim() || '';
  const sourceUrl = document.getElementById('create-source-url')?.value.trim() || '';
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
  const isManagedFlow = _createFlowMode === 'managed';
  const shouldPublishEvent = isManagedFlow || !getRoleCapabilities().needsReviewForStandaloneCreate;

  return {
    title,
    category,
    normalizedCategory,
    date,
    time,
    location,
    city,
    desc,
    sourceUrl,
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
  if (!input.title) {
    showToast(input.isManagedFlow ? 'Unesi naziv događaja' : 'Unesi naslov traženja', 'error');
    return false;
  }
  if (!input.targetPlanEventId && !input.date) {
    showToast('Izaberi datum', 'error');
    return false;
  }
  if (!input.targetPlanEventId && !input.category) {
    showToast('Izaberi kategoriju', 'error');
    return false;
  }
  if (!input.targetPlanEventId && !input.city) {
    showToast('Unesi grad', 'error');
    return false;
  }
  if (!input.isManagedFlow && _containsRestrictedContactInfo(`${input.title}\n${input.desc}\n${input.location}\n${input.city}`)) {
    showToast('Traženje društva ne sme da sadrži telefon, email, Instagram, Viber ili druge direktne kontakte.', 'error', 2800);
    return false;
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
  if (_editingEventId) btn.textContent = 'Sačuvaj izmene';
  else if (_createFlowMode === 'managed') btn.textContent = 'Objavi događaj';
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
  const managedTarget = input.isManagedFlow ? await _resolveManagedEventTarget() : null;
  const managedOrganizer = input.isManagedFlow && managedTarget?.entity_type === 'organizer' ? managedTarget : null;
  const myVenue = input.isManagedFlow && managedTarget?.entity_type !== 'organizer' ? managedTarget : null;

  if (input.isManagedFlow && !managedTarget?.id) {
    showToast('Objava događaja mora biti vezana za organizer profil ili mesto. Prvo otvori organizer panel ili odgovarajući profil.', 'error', 3200);
    return null;
  }

  return { isManagedCreate, managedTarget, managedOrganizer, myVenue };
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
  const duplicateSummary = duplicateCandidates
    .map(item => `• ${item.title || 'Događaj'}${item.meta ? ` (${item.meta})` : ''}`)
    .join('\n');
  return window.confirm(`Već postoje slični događaji:\n\n${duplicateSummary}\n\nKlikni OK samo ako želiš da ipak objaviš novi događaj.`);
}

function _buildEventPayload(input, managedOrganizer, myVenue) {
  const startsAt = input.time ? `${input.date}T${input.time}:00` : `${input.date}T20:00:00`;
  const payload = {
    creator_id: getUser()?.id,
    title: input.title,
    category: input.normalizedCategory,
    event_tags: Array.isArray(input.eventTags) ? input.eventTags : [],
    city: input.city || getUser()?.city || '',
    location_name: input.location || null,
    starts_at: startsAt,
    description: input.desc || null,
    capacity: input.spots,
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

async function _persistEventCreateOrUpdate(input, payload, startsAt) {
  let event;
  if (_editingEventId) {
    const updated = await _supaFetch(`/rest/v1/events?id=eq.${_editingEventId}&creator_id=eq.${getUser()?.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(payload)
    });
    event = Array.isArray(updated) ? updated[0] : updated;
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
        console.warn('[mitmi] update related plans:', e.message);
      }
    }
  } else {
    const eventRes = await _supaFetch('/rest/v1/events', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(payload)
    });
    event = Array.isArray(eventRes) ? eventRes[0] : eventRes;
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
      console.warn('[mitmi] persist event cover:', coverErr.message);
      _clearEventCover(event.id);
      event.cover_url = null;
      showToast('Naslovna slika nije sačuvana. Proveri upload i pokušaj ponovo.', 'error', 2600);
    }
  }
  if (!_pendingEventCover) {
    _clearEventCover(event.id);
    if (typeof _clearPersistedEventCover === 'function') {
      try { await _clearPersistedEventCover(event.id); } catch (coverErr) {
        console.warn('[mitmi] clear event cover:', coverErr.message);
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

// --- handleCreatePlan — pravi Supabase insert ---
async function handleCreatePlan() {
  if (!isLoggedIn()) { showToast('Prijavi se da bi objavio traženje društva', 'error'); nav('login'); return; }
  const input = _collectCreatePlanInput();
  if (!_validateCreatePlanInput(input)) return;
  const btn = document.querySelector('#page-create .btn-purple');
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
    const mapped = await _finalizeCreatedEvent(event, payload, uiTags);
    await _finishCreatePlanFlow(mapped, input, createContext);

  } catch(e) {
    console.error('[mitmi] handleCreatePlan:', e);
    showToast('Greška pri objavljivanju, pokušaj ponovo', 'error');
  } finally {
    _restoreCreateSubmitState(btn);
  }
}

const handleCreateInvite = handleCreatePlan;

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
              label: _reportContext.label || 'mitmi app',
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
    console.warn('[mitmi] handleReport:', e.message);
    showToast(contextType === 'issue' ? 'Greška pri slanju baga' : 'Greška pri slanju prijave', 'error');
  }
  navBack();
}

// --- enterApp (za 1a login placeholder) ---
function enterApp() { handleLogin(); }
