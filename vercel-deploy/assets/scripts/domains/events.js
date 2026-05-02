// --- Uskoro strip - sortira ev-card po data-date ---
EVENT_DATA = Array.isArray(globalThis.EVENT_DATA) ? globalThis.EVENT_DATA : [];
globalThis.EVENT_DATA = EVENT_DATA;
REAL_EVENT_DATA = Array.isArray(globalThis.REAL_EVENT_DATA) ? globalThis.REAL_EVENT_DATA : [];
globalThis.REAL_EVENT_DATA = REAL_EVENT_DATA;
var BROWSE_PLAN_DATA = Array.isArray(globalThis.BROWSE_PLAN_DATA) ? globalThis.BROWSE_PLAN_DATA : [];
globalThis.BROWSE_PLAN_DATA = BROWSE_PLAN_DATA;
let _currentEventId = null;
let _editingEventId = null;
let _planEventId = null;
let _createFlowMode = 'auto';
let _pendingEventCover = '';
var _adminDraftQueueLoading = Boolean(globalThis._adminDraftQueueLoading);
globalThis._adminDraftQueueLoading = _adminDraftQueueLoading;
var _adminOrganizerLoading = Boolean(globalThis._adminOrganizerLoading);
globalThis._adminOrganizerLoading = _adminOrganizerLoading;

function _createOrganizerQueryValue() {
  return String(document.getElementById('create-organizer')?.value || '').trim();
}

function _renderEventTagPills(tags = [], limit = 4) {
  const normalized = _normalizeEventTags(tags).slice(0, limit);
  if (!normalized.length) return '';
  return normalized.map(tag => `<span class="event-tag-pill">${_escHtml(_eventTagLabel(tag))}</span>`).join('');
}

function openPlanDirectChat(profileId, name = 'Direktna poruka', inviteId = '', eventId = '', inviteTitle = 'Plan', eventTitle = 'Događaj', planId = '') {
  return openDirectChat(profileId, name, {
    kind: 'plan',
    inviteId,
    inviteTitle,
    eventId,
    eventTitle,
    planId
  });
}

const openInviteDirectChat = openPlanDirectChat;

async function applyToPlan(inviteId, creatorId, creatorName = 'svita korisnik', inviteTitle = 'Plan', eventId = '', eventTitle = 'Događaj', planId = '', sourceType = 'plan') {
  if (!isLoggedIn()) {
    showToast('Prijavi se da bi se javio/la za plan', 'info', 1800);
    nav('login');
    return;
  }
  if (isProfileBlocked(creatorId)) {
    showToast('Ovaj profil više nije dostupan za javljanje na plan', 'info', 1800);
    return;
  }
  if (!creatorId) {
    showToast('Plan trenutno nije dostupan', 'error');
    return;
  }
  if (creatorId === getUser()?.id) {
    showToast('Ne možeš da se javiš na svoj plan', 'info');
    return;
  }
  try {
    showToast('Otvaramo poruke da se dogovorite oko izlaska', 'success', 1600);
    await openPlanDirectChat(creatorId, creatorName, '', eventId, inviteTitle, eventTitle, planId || '');
  } catch (e) {
    console.warn('[svita] applyToPlan:', e.message);
    showToast('Prijava na plan trenutno nije uspela', 'error');
  }
}

const applyToInvite = applyToPlan;

function _matchingOrganizersForQuery(query = '', cityHint = '') {
  const normalizedQuery = String(query || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedCity = String(cityHint || '').toLowerCase().trim();
  return ADMIN_ORGANIZERS
    .filter(item => item.status !== 'archived' && item.status !== 'merged')
    .map(item => {
      const name = String(item.name || '');
      const ig = String(item.instagram || '').replace(/^@+/, '');
      const city = String(item.city || '');
      const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normalizedIg = ig.toLowerCase();
      const cityMatches = normalizedCity && city.toLowerCase().includes(normalizedCity);
      let score = 0;
      if (!normalizedQuery) score += cityMatches ? 2 : 1;
      if (normalizedQuery && normalizedName === normalizedQuery) score += 8;
      if (normalizedQuery && normalizedIg === normalizedQuery.replace(/^@+/, '')) score += 8;
      if (normalizedQuery && normalizedName.includes(normalizedQuery)) score += 5;
      if (normalizedQuery && normalizedQuery.includes(normalizedName) && normalizedName) score += 4;
      if (normalizedQuery && normalizedIg.includes(normalizedQuery.replace(/^@+/, ''))) score += 4;
      if (cityMatches) score += 2;
      return { ...item, _score: score };
    })
    .filter(item => item._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
}

function _matchingEventsForQuery(query = '', cityHint = '') {
  const normalizedQuery = String(query || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedCity = String(cityHint || '').toLowerCase().trim();
  return _combinedEventCards()
    .map(item => {
      const title = String(item.title || '');
      const city = String(item.raw?.city || item.location_name || '');
      const location = String(item.raw?.location_name || item.location_name || '');
      const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cityMatches = normalizedCity && city.toLowerCase().includes(normalizedCity);
      let score = 0;
      if (normalizedQuery && normalizedTitle === normalizedQuery) score += 8;
      if (normalizedQuery && normalizedTitle.includes(normalizedQuery)) score += 5;
      if (normalizedQuery && normalizedQuery.includes(normalizedTitle) && normalizedTitle) score += 4;
      if (normalizedQuery && location.toLowerCase().includes(String(query || '').toLowerCase())) score += 3;
      if (!normalizedQuery) score += cityMatches ? 2 : 1;
      if (cityMatches) score += 2;
      return { ...item, _score: score };
    })
    .filter(item => item._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
}


async function loadMyCreatedEvents() {
  if (!isLoggedIn()) return [];
  try {
    const params = {
      select: 'id,creator_id,venue_id,organizer_id,title,description,category,event_tags,city,location_name,public_address,organizer_name_override,starts_at,capacity,attendee_count,cover_url,is_published,is_cancelled,created_at',
      creator_id: `eq.${getUser()?.id}`,
      organizer_id: 'is.null',
      venue_id: 'is.null',
      order: 'starts_at.asc',
      limit: '48'
    };
    const rows = await _supaGet('events', params);
    const filteredRows = (Array.isArray(rows) ? rows : []).filter(row => {
      if (_isLikelyManagedProfileEventLeak(row)) return false;
      if (!isAdminUser()) return true;
      return !_isLikelyAdminCatalogEvent(row);
    });
    const mapped = filteredRows.map(_mapDbEventToCard);
    const deduped = new Map();
    mapped.forEach(item => {
      const key = item.id || `${item.title}-${item.starts_at || item.date || ''}`;
      if (!deduped.has(key)) deduped.set(key, item);
    });
    return Array.from(deduped.values());
  } catch (e) {
    console.warn('[svita] loadMyCreatedEvents:', e.message);
    return [];
  }
}

function _isLikelyManagedProfileEventLeak(row = {}) {
  return !!String(row?.organizer_name_override || '').trim();
}

function _isLikelyAdminCatalogEvent(row = {}) {
  if (!row) return false;
  const title = String(row.title || '').trim();
  const locationName = String(row.location_name || '').trim();
  const city = String(row.city || '').trim();
  const startsAt = String(row.starts_at || '').trim();
  const isPublished = row.is_published !== false;
  const looksLikeCatalogLead = _looksLikeCatalogEventLead({
    title,
    eventTitle: title,
    locationName,
    city,
    startsAt,
    sourceUrl: row?.source_url || ''
  });
  const hasStructuredEventShape = isPublished && !!startsAt && (!!locationName || !!city);
  return looksLikeCatalogLead || hasStructuredEventShape;
}

function renderMyCreatedEvents(items = []) {
  const box = document.getElementById('profile-created-events');
  if (!box) return;
  const prefs = typeof _getUserPrefs === 'function' ? _getUserPrefs() : { event_visibility: 'profile' };
  if (prefs.event_visibility === 'hidden') {
    box.innerHTML = `<div class="draft-empty">${_langText('Događaji su trenutno sakriveni sa tvog profila.', 'Events are currently hidden from your profile.')}</div>`;
    return;
  }
  if (!items.length) {
    box.innerHTML = `<div style="font-size:13px;color:var(--ink4);padding:8px 0">${_langText('Još nema objavljenih događaja.', 'There are no published events yet.')}</div>`;
    return;
  }
  box.innerHTML = items.map(item => {
    const label = item.category_label || _eventCategoryLabel(item.raw_category || item.cat || 'drugo');
    const tagClass = 'tag-purple';
    const coverStyle = item.cover_url ? ` style="background-image:url('${_safeCssUrl(item.cover_url)}');background-size:cover;background-position:center;color:transparent"` : '';
    return `<div class="ev-row" onclick="openEventById('${_escHtml(item.id)}')"><div class="ev-row-img ${_escHtml(item.bg)}"${coverStyle}>${item.cover_url ? '•' : _eventEmoji(item.cat)}</div><div style="flex:1"><div class="ev-row-title">${_escHtml(item.title)}</div><div class="ev-row-meta">${_escHtml(item.meta || _langText('Detalji nisu upisani', 'Details have not been added'))}</div></div><span class="tag ${tagClass}">${label}</span></div>`;
  }).join('');
}

function _currentEventCard() {
  return _combinedEventCards().find(item => item.id === _currentEventId) || null;
}

function _syncEventCollections(card = null) {
  if (!card?.id) return;
  _replaceRealEventCard(card);
  renderBrowseEventsGrid();
  renderBrowseHomeStrip();
  renderUskoroStrip();
  if (typeof _canLoadVenueDashboard === 'function' && _canLoadVenueDashboard()) {
    loadMyVenueDashboard().catch(() => {});
  }
}

function openCreatePlanForEvent(eventId = null) {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  if (!eventId) {
    showToast('Prvo otvori događaj za koji želiš da objaviš plan', 'info', 1800);
    return;
  }
  resetCreateForm();
  _createFlowMode = 'social';
  _planEventId = eventId;
  nav('create');
  setTimeout(() => loadCreateForm(), 0);
}

if (typeof globalThis.openCreateInviteForEvent !== 'function') {
  globalThis.openCreateInviteForEvent = openCreatePlanForEvent;
}

ADMIN_ORGANIZERS = Array.isArray(globalThis.ADMIN_ORGANIZERS) ? globalThis.ADMIN_ORGANIZERS : [];
EVENT_DRAFTS = Array.isArray(globalThis.EVENT_DRAFTS) ? globalThis.EVENT_DRAFTS : [];
FOLLOWED_EVENTS = Array.isArray(globalThis.FOLLOWED_EVENTS) ? globalThis.FOLLOWED_EVENTS : [];
PROFILE_DIRECTORY = Array.isArray(globalThis.PROFILE_DIRECTORY) ? globalThis.PROFILE_DIRECTORY : [];
FOLLOWED_PROFILE_IDS = Array.isArray(globalThis.FOLLOWED_PROFILE_IDS) ? globalThis.FOLLOWED_PROFILE_IDS : [];
let _profileDirectoryLoaded = false;
let _followedProfileIdsLoaded = false;
ADMIN_CLAIM_REQUESTS = Array.isArray(globalThis.ADMIN_CLAIM_REQUESTS) ? globalThis.ADMIN_CLAIM_REQUESTS : [];
_currentPublicProfileId = globalThis._currentPublicProfileId || null;
_currentPublicVenueId = globalThis._currentPublicVenueId || null;
_currentPublicVenueTarget = globalThis._currentPublicVenueTarget || null;
_reportContext = globalThis._reportContext || { type:'profile', profileId:null, venueId:null, eventId:null, label:'' };
BLOCKED_PROFILE_IDS = Array.isArray(globalThis.BLOCKED_PROFILE_IDS) ? globalThis.BLOCKED_PROFILE_IDS : [];
let _blockedProfileIdsLoaded = false;
ADMIN_MODERATION_ITEMS = Array.isArray(globalThis.ADMIN_MODERATION_ITEMS) ? globalThis.ADMIN_MODERATION_ITEMS : [];
ADMIN_PLAN_SIGNALS = Array.isArray(globalThis.ADMIN_PLAN_SIGNALS) ? globalThis.ADMIN_PLAN_SIGNALS : [];
ADMIN_ORPHAN_EVENTS = Array.isArray(globalThis.ADMIN_ORPHAN_EVENTS) ? globalThis.ADMIN_ORPHAN_EVENTS : [];
let _moderationFilter = 'all';
function _currentSwipeEvent() {
  return _getSwipeData()[swipeIdx] || _getSwipeData()[0] || null;
}
