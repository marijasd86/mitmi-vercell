function _normalizePlanSignalText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function _looksLikeStandaloneSocialPlan(item = {}) {
  const title = _normalizePlanSignalText(item.title || '');
  const description = _normalizePlanSignalText(item.description || '');
  const combined = `${title} ${description}`.trim();
  if (!combined) return false;
  const casualStarts = [
    'trazim drustvo',
    'tražim društvo',
    'probni poziv',
    'test'
  ];
  if (casualStarts.some(prefix => title.startsWith(prefix))) return true;
  const casualSignals = [
    'kafa',
    'setnja',
    'šetnja',
    'pice',
    'piće',
    'bleja',
    'spontan',
    'spontani plan',
    'upozn',
    'drustvo za'
  ];
  return casualSignals.some(token => combined.includes(token));
}

function _looksLikeCatalogEventLead(item = {}) {
  const title = _normalizePlanSignalText(item.eventTitle || item.title || '');
  const location = _normalizePlanSignalText(item.locationName || item.city || '');
  const startsAt = String(item.startsAt || '').trim();
  if (!(title && location && startsAt)) return false;
  if (_looksLikeStandaloneSocialPlan(item)) return false;
  const eventSignals = [
    'koncert',
    'izloz',
    'izlož',
    'predstav',
    'film',
    'festival',
    'utakmic',
    'mec',
    'mec ',
    'meč',
    'turnir',
    'svirk',
    'dj',
    'radionica',
    'tribina',
    'stand up',
    'standup',
    'projekcija'
  ];
  return eventSignals.some(token => title.includes(token)) || !!item.sourceUrl;
}

function _persistAdminDraftState() {
  // Admin organizers/drafts must come from backend only.
  // Keep this as a no-op to avoid cross-user stale state from local persistence.
}

function _hydrateAdminDraftState() {
  ADMIN_ORGANIZERS = [];
  EVENT_DRAFTS = [];
  try {
    _safeStorage('local')?.removeItem(ADMIN_ORGANIZERS_KEY);
    _safeStorage('local')?.removeItem(EVENT_DRAFTS_KEY);
    _safeStorage('session')?.removeItem(ADMIN_ORGANIZERS_KEY);
    _safeStorage('session')?.removeItem(EVENT_DRAFTS_KEY);
    _safeStorage('session')?.removeItem(_uiScopedStorageKey(ADMIN_ORGANIZERS_KEY));
    _safeStorage('session')?.removeItem(_uiScopedStorageKey(EVENT_DRAFTS_KEY));
  } catch (e) {}
}

function _clearMitmiUiStorage() {
  try {
    const localStore = _safeStorage('local');
    const sessionStore = _safeStorage('session');
    localStore?.removeItem(ADMIN_ORGANIZERS_KEY);
    localStore?.removeItem(EVENT_DRAFTS_KEY);
    localStore?.removeItem(EVENT_MEDIA_KEY);
    localStore?.removeItem(_uiScopedStorageKey(EVENT_MEDIA_KEY));
    sessionStore?.removeItem(ADMIN_ORGANIZERS_KEY);
    sessionStore?.removeItem(EVENT_DRAFTS_KEY);
    sessionStore?.removeItem(EVENT_MEDIA_KEY);
    sessionStore?.removeItem(_uiScopedStorageKey(ADMIN_ORGANIZERS_KEY));
    sessionStore?.removeItem(_uiScopedStorageKey(EVENT_DRAFTS_KEY));
    sessionStore?.removeItem(_uiScopedStorageKey(EVENT_MEDIA_KEY));
  } catch (e) {}
}

window._clearMitmiUiStorage = _clearMitmiUiStorage;

async function loadAdminOrganizersFromBackend(opts = {}) {
  if (!_isSupabaseConfigured() || _adminOrganizerLoading) return ADMIN_ORGANIZERS;
  _adminOrganizerLoading = true;
  try {
    const rows = await _supaGet('organizers', {
      select: 'id,name,city,organizer_type,instagram_handle,status,claimed_by_profile_id,merged_into_id',
      order: 'created_at.desc',
      limit: '200'
    });
    const backendOrganizers = (Array.isArray(rows) ? rows : []).map(_mapDbOrganizerToUi);
    const localOnly = ADMIN_ORGANIZERS.filter((item) => !_isBackendOrganizer(item));
    ADMIN_ORGANIZERS = [...backendOrganizers, ...localOnly];
    if (!opts.silent) renderOrganizerReview();
  } catch (e) {
    console.warn('[mitmi] loadAdminOrganizersFromBackend:', e.message);
  } finally {
    _adminOrganizerLoading = false;
  }
  return ADMIN_ORGANIZERS;
}

async function loadAdminClaimRequestsFromBackend(opts = {}) {
  if (!_isSupabaseConfigured()) return ADMIN_CLAIM_REQUESTS;
  try {
    const rows = await _supaGet('organizer_claim_requests', {
      select: 'id,organizer_id,requester_id,status,claim_message,admin_notes,created_at,profiles!requester_id(id,username,display_name),organizers!organizer_id(id,name,city,instagram_handle,status)',
      order: 'created_at.desc',
      limit: '100'
    });
    ADMIN_CLAIM_REQUESTS = (Array.isArray(rows) ? rows : []).filter(item => item.status === 'pending').map(item => ({
      id: item.id,
      organizerId: item.organizer_id,
      requesterId: item.requester_id,
      status: item.status,
      claimMessage: item.claim_message || '',
      adminNotes: item.admin_notes || '',
      createdAt: item.created_at,
      requesterName: item.profiles?.display_name || item.profiles?.username || 'Nepoznato',
      requesterUsername: item.profiles?.username || '',
      organizerName: item.organizers?.name || 'Organizer',
      organizerCity: item.organizers?.city || '',
      organizerInstagram: item.organizers?.instagram_handle || '',
      organizerStatus: item.organizers?.status || 'unclaimed'
    }));
    if (!opts.silent) renderOrganizerReview();
  } catch (e) {
    console.warn('[mitmi] loadAdminClaimRequestsFromBackend:', e.message);
  }
  return ADMIN_CLAIM_REQUESTS;
}

async function loadAdminOrphanPublishedEvents(opts = {}) {
  if (!isAdminUser() || !_isSupabaseConfigured()) {
    ADMIN_ORPHAN_EVENTS = [];
    return ADMIN_ORPHAN_EVENTS;
  }
  try {
    const rows = await _supaGet('events', {
      select: 'id,title,city,location_name,organizer_name_override,starts_at,category,event_tags,creator_id,is_published,is_cancelled,is_hidden,created_at,profiles!creator_id(role,display_name,username)',
      organizer_id: 'is.null',
      venue_id: 'is.null',
      is_published: 'eq.true',
      order: 'starts_at.asc',
      limit: '120'
    });
    ADMIN_ORPHAN_EVENTS = (Array.isArray(rows) ? rows : []).filter(row => {
      const creatorProfile = row?.profiles || {};
      if (creatorProfile?.role !== 'admin') return false;
      if (row?.is_cancelled || row?.is_hidden) return false;
      return _isLikelyAdminCatalogEvent(row);
    }).map(row => ({
      id: row.id,
      title: row.title || 'Događaj',
      city: row.city || '',
      locationName: row.location_name || '',
      organizerName: _bestOrganizerNameForEvent(row),
      startsAt: row.starts_at || '',
      category: row.category || 'drugo',
      creatorName: row?.profiles?.display_name || row?.profiles?.username || ''
    }));
    if (!opts.silent) renderOrganizerReview();
  } catch (e) {
    console.warn('[mitmi] loadAdminOrphanPublishedEvents:', e.message);
    ADMIN_ORPHAN_EVENTS = [];
  }
  return ADMIN_ORPHAN_EVENTS;
}

function _bestOrganizerNameForEvent(row = {}) {
  const raw = [
    row.organizer_name_override,
    row.location_name,
    row.title
  ].map(value => String(value || '').trim()).find(Boolean) || 'Organizer u pripremi';
  return raw
    .replace(/\s+-\s+(pon|uto|sre|čet|pet|sub|ned|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*$/i, '')
    .replace(/\s*,\s*[^,]*\d+\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function eventKeyFromData(data) {
  if (!data) return '';
  return data.id || [data.title || '', data.meta || '', data.dayOffset ?? '', data.cat || ''].join('|');
}

function isAdminUser() {
  const role = getUser()?.user_metadata?.role || getUser()?.user_role || null;
  return role === 'admin';
}

function syncAdminUI() {
  const section = document.getElementById('admin-settings-section');
  if (section) section.style.display = isAdminUser() ? 'block' : 'none';
  const createLabel = document.querySelector('#bn2 .bn-label');
  if (createLabel && typeof getRoleCapabilities === 'function') {
    createLabel.textContent = getRoleCapabilities().canPublishManagedEvents ? 'Događaj' : 'Društvo';
  }
  const profileAdminShortcut = document.getElementById('profile-admin-shortcut');
  if (profileAdminShortcut) profileAdminShortcut.style.display = isAdminUser() ? '' : 'none';
  const settingsAdminShortcut = document.getElementById('settings-admin-shortcut');
  if (settingsAdminShortcut) settingsAdminShortcut.style.display = isAdminUser() ? '' : 'none';
  const organizerBtn = document.getElementById('profile-organizer-btn');
  if (organizerBtn) {
    const role = getUser()?.user_metadata?.role || getUser()?.user_role || null;
    const shouldShow = role === 'venue' || role === 'admin';
    organizerBtn.style.display = shouldShow ? '' : 'none';
    organizerBtn.textContent = role === 'venue' ? 'Moj organizer panel' : 'Admin panel';
    organizerBtn.onclick = () => nav(role === 'admin' ? 'admin-drafts' : 'venue');
  }
  const pendingDrafts = EVENT_DRAFTS.filter(item => (item.reviewStatus || 'pending') === 'pending').length;
  const planSignalCount = ADMIN_PLAN_SIGNALS.length;
  const organizerOpen = ADMIN_ORGANIZERS.filter(item => item.status !== 'archived' && item.status !== 'merged').length;
  const moderationOpen = ADMIN_MODERATION_ITEMS.filter(item => ['open', 'reviewing'].includes(item.status)).length;
  [
    'admin-nav-drafts-count',
    'admin-nav-drafts-count-drafts',
    'admin-nav-drafts-count-organizers'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(pendingDrafts);
  });
  [
    'admin-nav-organizers-count',
    'admin-nav-organizers-count-drafts',
    'admin-nav-organizers-count-organizers'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(organizerOpen);
  });
  [
    'admin-nav-moderation-count',
    'admin-nav-moderation-count-drafts',
    'admin-nav-moderation-count-organizers'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(moderationOpen);
  });
  const planSignalStat = document.getElementById('admin-stat-plan-signals');
  if (planSignalStat) planSignalStat.textContent = String(planSignalCount);
  const planSignalBadge = document.getElementById('admin-plan-signals-badge');
  if (planSignalBadge) planSignalBadge.textContent = `${planSignalCount} plan signala`;
}

function getOrganizerById(id) {
  return ADMIN_ORGANIZERS.find(org => org.id === id) || null;
}
