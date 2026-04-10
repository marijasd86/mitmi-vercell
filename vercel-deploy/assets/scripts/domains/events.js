// --- Uskoro strip - sortira ev-card po data-date ---
const EVENT_DATA = [];
const CAT_EMOJI = {
  muzika:'🎵',
  svirka:'🎵',
  dj:'🎧',
  standup:'🎤',
  sport:'⚽',
  kultura:'🎨',
  pozoriste:'🎭',
  izlozba:'🖼️',
  film:'🎬',
  kafa:'☕',
  bar:'🍸',
  festival:'🎪',
  radionica:'🛠️',
  priroda:'🏕️',
  izlasci:'☕',
  drugo:'✨'
};
const EVENT_CATEGORY_META = {
  muzika: { bucket: 'muzika', label: 'Muzika' },
  svirka: { bucket: 'muzika', label: 'Svirka' },
  dj: { bucket: 'muzika', label: 'DJ veče' },
  standup: { bucket: 'muzika', label: 'Stand up' },
  festival: { bucket: 'muzika', label: 'Festival' },
  sport: { bucket: 'sport', label: 'Sport' },
  kultura: { bucket: 'kultura', label: 'Kultura' },
  pozoriste: { bucket: 'kultura', label: 'Pozorište' },
  izlozba: { bucket: 'kultura', label: 'Izložba' },
  film: { bucket: 'kultura', label: 'Film / projekcija' },
  radionica: { bucket: 'kultura', label: 'Radionica' },
  kafa: { bucket: 'kafa', label: 'Kafa' },
  bar: { bucket: 'kafa', label: 'Bar / izlazak' },
  izlasci: { bucket: 'kafa', label: 'Izlazak' },
  priroda: { bucket: 'priroda', label: 'Priroda' },
  drugo: { bucket: 'drugo', label: 'Drugo' }
};
const EVENT_CATEGORY_ALIASES = {
  'stand up': 'standup',
  standup: 'standup',
  'dj vece': 'dj',
  'dj vece / party': 'dj',
  'dj party': 'dj',
  'bar / izlazak': 'bar',
  'film / projekcija': 'film'
};
const INVITE_VIBE_OPTIONS = [
  { key: 'solo_friendly', label: 'Solo friendly' },
  { key: 'mala_ekipa', label: 'Mala ekipa' },
  { key: 'spontano', label: 'Alternativna ekipa' },
  { key: 'brzo_okupljanje', label: 'Mirniji vibe' },
  { key: 'bez_alkohola', label: 'Bez alkohola' },
  { key: 'opušteno', label: 'Opušteno' }
];
const ADMIN_ORGANIZERS_KEY = 'mitmi_admin_organizers';
const EVENT_DRAFTS_KEY = 'mitmi_event_drafts';
const LEGACY_INVITE_COMPAT_MODE = false;
let REAL_EVENT_DATA = [];
let BROWSE_PLAN_DATA = [];
let _currentEventId = null;
let _editingEventId = null;
let _planEventId = null;
let _createFlowMode = 'auto';
let _pendingEventCover = '';
const EVENT_MEDIA_KEY = 'mitmi_event_media';
let _adminDraftQueueLoading = false;
let _adminOrganizerLoading = false;

function _uiStorageScope() {
  return getUser()?.id || 'guest';
}

function _uiScopedStorageKey(baseKey = '') {
  return `${baseKey}:${_uiStorageScope()}`;
}

function _safeStorage(type = 'session') {
  try {
    return type === 'local' ? window.localStorage : window.sessionStorage;
  } catch (e) {
    return null;
  }
}

function _loadStoredList(key, fallback = []) {
  try {
    const storage = _safeStorage('session');
    const parsed = JSON.parse(storage?.getItem(_uiScopedStorageKey(key)) || 'null');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

function _saveStoredList(key, list = []) {
  try {
    const storage = _safeStorage('session');
    storage?.setItem(_uiScopedStorageKey(key), JSON.stringify(Array.isArray(list) ? list : []));
  } catch (e) {}
}

function _isBackendDraft(draft = {}) {
  return !!draft?.backend;
}

function _isBackendOrganizer(organizer = {}) {
  return !!organizer?.backend;
}

function _mapOrganizerStatus(status = '') {
  if (status === 'unclaimed') return 'ghost';
  return status || 'ghost';
}

function _mapDbOrganizerToUi(row = {}) {
  return {
    id: row.id || '',
    name: row.name || 'Organizer',
    city: row.city || '',
    instagram: (row.instagram_handle || '').replace(/^@+/, ''),
    status: _mapOrganizerStatus(row.status || ''),
    claimedByProfileId: row.claimed_by_profile_id || null,
    mergedIntoId: row.merged_into_id || null,
    backend: true
  };
}

function _mapDbDraftToUi(row = {}) {
  const organizer = row.organizers || null;
  const submitter = row.profiles || null;
  return {
    id: row.id || '',
    sourceType: row.source_type || 'user',
    reviewStatus: row.review_status || 'pending',
    title: row.title || 'Draft događaja',
    category: row.category || '',
    city: row.city || '',
    startsAt: row.starts_at || '',
    locationName: row.location_name || '',
    sourceUrl: row.source_url || null,
    sourceLabel: row.source_label || '',
    organizerId: row.organizer_id || organizer?.id || null,
    proposedOrganizerName: row.proposed_organizer_name || organizer?.name || '',
    proposedOrganizerInstagram: row.proposed_organizer_instagram || organizer?.instagram_handle || '',
    aiConfidence: row.ai_confidence == null ? null : Number(row.ai_confidence),
    aiSummary: row.ai_summary || row.description || '',
    submittedByLabel: submitter?.display_name || submitter?.username || row.submitted_by || 'mitmi korisnik',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
    adminNotes: row.admin_notes || '',
    backend: true
  };
}

function _createOrganizerQueryValue() {
  return String(document.getElementById('create-organizer')?.value || '').trim();
}

function _getEventMediaMap() {
  try {
    const sessionStore = _safeStorage('session');
    const localStore = _safeStorage('local');
    const scopedKey = _uiScopedStorageKey(EVENT_MEDIA_KEY);
    const raw = sessionStore?.getItem(scopedKey)
      || sessionStore?.getItem(EVENT_MEDIA_KEY)
      || localStore?.getItem(scopedKey)
      || localStore?.getItem(EVENT_MEDIA_KEY)
      || '{}';
    return JSON.parse(raw) || {};
  } catch(e) {
    return {};
  }
}

function _saveEventMediaMap(map = {}) {
  try {
    const sessionStore = _safeStorage('session');
    sessionStore?.setItem(_uiScopedStorageKey(EVENT_MEDIA_KEY), JSON.stringify(map));
  } catch(e) {}
}

function _setEventCover(eventId, coverUrl) {
  if (!eventId || !coverUrl) return;
  const map = _getEventMediaMap();
  map[eventId] = { ...(map[eventId] || {}), cover_url: coverUrl };
  _saveEventMediaMap(map);
}

function _getEventCover(eventId) {
  const map = _getEventMediaMap();
  return map[eventId]?.cover_url || '';
}

function _clearEventCover(eventId) {
  if (!eventId) return;
  const map = _getEventMediaMap();
  if (!map[eventId]) return;
  delete map[eventId];
  _saveEventMediaMap(map);
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

async function applyToPlan(inviteId, creatorId, creatorName = 'mitmi korisnik', inviteTitle = 'Plan', eventId = '', eventTitle = 'Događaj', planId = '', sourceType = 'legacy') {
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
  const normalizedSource = String(sourceType || '').toLowerCase();
  if (!LEGACY_INVITE_COMPAT_MODE || normalizedSource !== 'legacy' || !inviteId) {
    showToast('Otvaramo poruke da se dogovorite oko izlaska', 'success', 1600);
    await openPlanDirectChat(creatorId, creatorName, '', eventId, inviteTitle, eventTitle, planId || '');
    return;
  }
  try {
    const existing = await _supaGet('invite_applications', {
      select: 'id',
      invite_id: `eq.${inviteId}`,
      applicant_id: `eq.${getUser()?.id}`,
      limit: '1'
    });
    if (!Array.isArray(existing) || !existing.length) {
      await _supaFetch('/rest/v1/invite_applications', {
        method: 'POST',
        body: JSON.stringify({
          invite_id: inviteId,
          applicant_id: getUser()?.id,
          message: `Zdravo! Voleo/la bih da se priključim planu: ${inviteTitle}`,
          app_status: 'pending'
        })
      });
      showToast('Prijava je poslata', 'success');
    } else {
      showToast('Već si se prijavio/la na ovaj plan', 'info');
    }
    await openPlanDirectChat(creatorId, creatorName, inviteId, eventId, inviteTitle, eventTitle);
  } catch (e) {
    console.warn('[mitmi] applyToPlan:', e.message);
    showToast('Prijava na plan trenutno nije uspela', 'error');
  }
}

const applyToInvite = applyToPlan;

function _eventVisualCategory(category = '') {
  const normalized = _normalizeEventCategoryKey(category);
  return EVENT_CATEGORY_META[normalized]?.bucket || 'drugo';
}

function _eventEmoji(category = '') {
  const normalized = _normalizeEventCategoryKey(category);
  return CAT_EMOJI[normalized] || CAT_EMOJI[_eventVisualCategory(category)] || '📅';
}

function _normalizeEventCategoryKey(category = '') {
  const normalized = String(category || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/č/g, 'c')
    .replace(/ć/g, 'c')
    .replace(/ž/g, 'z')
    .replace(/š/g, 's')
    .replace(/đ/g, 'dj');
  return EVENT_CATEGORY_ALIASES[normalized] || normalized || 'drugo';
}

function _eventCategoryLabel(category = '', { bucket = false } = {}) {
  const normalized = _normalizeEventCategoryKey(category);
  const resolved = bucket ? _eventVisualCategory(normalized) : normalized;
  return EVENT_CATEGORY_META[resolved]?.label || EVENT_CATEGORY_META.drugo.label;
}

function _parseEventDateLocal(value = '') {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function _eventDateToken(value = '') {
  const parsed = _parseEventDateLocal(value);
  if (!parsed) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function _eventSpotsState(capacityValue, attendeeCountValue = 0) {
  const capacity = Number(capacityValue);
  const attendeeCount = Math.max(Number(attendeeCountValue) || 0, 0);

  if (!Number.isFinite(capacity) || capacity <= 0) {
    return { label: 'Broj mesta nije ograničen', variant: 'neutral', remaining: null };
  }

  const remaining = Math.max(capacity - attendeeCount, 0);
  const ratio = capacity > 0 ? remaining / capacity : 0;

  if (remaining === 0) {
    return { label: 'Nema slobodnih mesta', variant: 'full', remaining };
  }
  if (ratio <= 0.1) {
    return { label: `Još samo ${remaining} mesta`, variant: 'urgent', remaining };
  }
  if (ratio <= 0.4) {
    return { label: `Još ${remaining} mesta`, variant: 'warning', remaining };
  }
  return { label: `${remaining} mesta slobodno`, variant: 'ok', remaining };
}

function _eventSpotsLabel(value, attendeeCountValue = 0) {
  return _eventSpotsState(value, attendeeCountValue).label;
}

function _eventBg(category = '') {
  const normalized = _eventVisualCategory(category);
  if (normalized === 'muzika') return 'ev-img-a';
  if (normalized === 'kultura') return 'ev-img-b';
  if (normalized === 'sport') return 'ev-img-c';
  if (normalized === 'kafa') return 'ev-img-d';
  if (normalized === 'priroda') return 'ev-img-e';
  return 'ev-img-b';
}

function _eventDayBucket(dateStr = '') {
  const date = _parseEventDateLocal(dateStr);
  if (!date) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compare = new Date(date);
  compare.setHours(0, 0, 0, 0);
  const diffDays = Math.round((compare - today) / 86400000);
  if (diffDays === 0) return 'danas';
  const day = date.getDay();
  if (day === 5 || day === 6 || day === 0) return 'vikend';
  return '';
}

function _formatEventMeta(event = {}) {
  const startsAt = event.starts_at || event.date || '';
  const date = startsAt ? new Date(startsAt) : null;
  const dayLabel = startsAt ? dateLabel(startsAt) : 'Termin uskoro';
  const timeLabel = date && !Number.isNaN(date.getTime())
    ? date.toLocaleTimeString('sr-Latn', { hour: '2-digit', minute: '2-digit' })
    : '';
  const location = event.location_name || event.city || 'Lokacija nije upisana';
  return [dayLabel, timeLabel, location].filter(Boolean).join(' · ');
}

function _formatEventDateTimeLine(event = {}) {
  const startsAt = event.starts_at || event.date || '';
  const parsed = _parseEventDateLocal(startsAt);
  if (!parsed) return 'Termin uskoro';
  const datePart = parsed.toLocaleDateString('sr-Latn', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
  const timePart = parsed.toLocaleTimeString('sr-Latn', {
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${datePart} · ${timePart}`;
}

function _formatEventLocationLine(event = {}) {
  return event.location_name
    ? [event.location_name, event.city].filter(Boolean).join(' · ')
    : (event.city || 'Lokacija nije upisana');
}

function _eventStatusSummary(event = {}) {
  const spots = _eventSpotsState(event.capacity ?? event.spots ?? null, event.attendee_count || 0);
  return spots.label;
}

function _renderBrowseEventsEmptyState() {
  return `
    <div class="empty-state browse-empty-state" style="grid-column:1/-1">
      <div class="empty-ico" aria-hidden="true">📅</div>
      <div class="empty-title">Nema događaja za ovaj filter</div>
      <div class="empty-sub">Probaj drugi datum, kategoriju ili se vrati malo kasnije kad stignu nove objave.</div>
    </div>
  `;
}

function _normalizeInviteVibes(vibes = []) {
  const allowed = new Set(INVITE_VIBE_OPTIONS.map(item => item.key));
  return (Array.isArray(vibes) ? vibes : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .filter(item => allowed.has(item))
    .slice(0, 3);
}

function _inviteVibeLabel(key = '') {
  return INVITE_VIBE_OPTIONS.find(item => item.key === key)?.label || key;
}

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

function _renderInviteVibes(vibes = []) {
  const normalized = _normalizeInviteVibes(vibes);
  if (!normalized.length) return '';
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${normalized.map(vibe => `<span class="tag tag-outline" style="font-size:10px;padding:2px 7px">${_escHtml(_inviteVibeLabel(vibe))}</span>`).join('')}</div>`;
}

function _isTonightEvent(startsAt = '') {
  const ts = new Date(startsAt).getTime();
  if (Number.isNaN(ts)) return false;
  const now = Date.now();
  return ts >= now && ts <= (now + 8 * 60 * 60 * 1000);
}

function _mapDbEventToCard(event = {}) {
  const startsAt = event.starts_at || new Date().toISOString();
  const dateOnly = _eventDateToken(startsAt);
  const capacity = event.capacity ?? event.spots ?? null;
  const attendeeCount = Number(event.attendee_count || 0);
  const rawCategory = _normalizeEventCategoryKey(event.category || 'drugo');
  const cat = _eventVisualCategory(rawCategory);
  const coverUrl = event.cover_url || _getEventCover(event.id);
  const spotsState = _eventSpotsState(capacity, attendeeCount);
  return {
    id: event.id || `local-${Date.now()}`,
    title: event.title || 'Novi događaj',
    meta: _formatEventMeta(event),
    date: dateOnly,
    starts_at: startsAt,
    cat,
    raw_category: rawCategory,
    category_label: _eventCategoryLabel(rawCategory),
    bg: _eventBg(cat),
    cover_url: coverUrl,
    spots: capacity != null && capacity !== '' ? String(capacity) : '',
    capacity: Number.isFinite(Number(capacity)) ? Number(capacity) : null,
    attendee_count: attendeeCount,
    spotsLabel: spotsState.label,
    spotsVariant: spotsState.variant,
    urgent: spotsState.variant === 'urgent',
    location_name: event.location_name || '',
    raw: event
  };
}

function _combinedEventCards() {
  const map = new Map();
  [...REAL_EVENT_DATA, ...EVENT_DATA.map(_mapDbEventToCard)].forEach(item => {
    const key = item.id || `${item.title}-${item.date || item.starts_at || ''}`;
    if (!map.has(key)) map.set(key, item);
  });
  return Array.from(map.values())
    .filter(item => {
      if (!item.date && !item.starts_at) return true;
      const parsed = _parseEventDateLocal(item.starts_at || item.date || '');
      if (!parsed) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const compare = new Date(parsed);
      compare.setHours(0, 0, 0, 0);
      return compare >= today;
    })
    .sort((a, b) => {
      const aTs = _parseEventDateLocal(a.starts_at || a.date || '')?.getTime() || 0;
      const bTs = _parseEventDateLocal(b.starts_at || b.date || '')?.getTime() || 0;
      return aTs - bTs;
    });
}

function _replaceRealEventCard(card = null) {
  if (!card?.id) return;
  REAL_EVENT_DATA = [card, ...REAL_EVENT_DATA.filter(item => item.id !== card.id)];
}

function renderBrowseEventsGrid() {
  const grid = document.getElementById('browse-grid');
  if (!grid) return;
  const items = _combinedEventCards();
  if (!items.length) {
    grid.innerHTML = _renderBrowseEventsEmptyState();
    return;
  }
  grid.innerHTML = items.map(event => {
    const categoryLabel = event.category_label || _eventCategoryLabel(event.raw_category || event.cat || 'drugo');
    const dateLine = _formatEventDateTimeLine(event.raw || event);
    const locationLine = _formatEventLocationLine(event.raw || event);
    const spotsLabel = event.spotsLabel || _eventSpotsLabel(event.spots, event.attendee_count);
    const spotsVariant = event.spotsVariant || _eventSpotsState(event.spots, event.attendee_count).variant;
    const coverStyle = event.cover_url ? ` style="background-image:url('${_safeCssUrl(event.cover_url)}');background-size:cover;background-position:center"` : '';
    return `<div class="sq-card" data-cat="${_escHtml(event.raw_category || event.cat)}" data-bucket="${_escHtml(event.cat)}" data-day="${_escHtml(_eventDayBucket(event.date || event.starts_at || ''))}" data-date="${_escHtml(event.date || '')}" data-city="${_escHtml((event.raw?.city || event.city || '').trim())}" onclick="openEventById('${_escHtml(event.id)}')">
      <div class="sq-img ${_escHtml(event.bg)}"${coverStyle}>
        <span class="sq-cat">${_escHtml(categoryLabel)}</span>
        <span class="sq-spots sq-spots-${_escHtml(spotsVariant)}">${_escHtml(spotsLabel)}</span>
      </div>
      <div class="sq-body">
        <div class="sq-title">${_escHtml(event.title)}</div>
        <div class="sq-meta sq-meta-primary">${_escHtml(dateLine)}</div>
        <div class="sq-meta">${_escHtml(locationLine)}</div>
      </div>
    </div>`;
  }).join('');
  _applyBrowseFilters();
}

async function loadPublishedEvents() {
  if (!_isSupabaseConfigured()) {
    renderBrowseEventsGrid();
    return _combinedEventCards();
  }
  try {
    if (typeof loadBlockedProfileIds === 'function') {
      await loadBlockedProfileIds();
    }
    const rows = await _supaGet('events', {
      select: 'id,creator_id,title,description,category,city,location_name,starts_at,capacity,attendee_count,cover_url,is_published,is_cancelled,is_hidden,created_at',
      is_published: 'eq.true',
      is_cancelled: 'eq.false',
      is_hidden: 'eq.false',
      order: 'starts_at.asc',
      limit: '24'
    });
    REAL_EVENT_DATA = Array.isArray(rows)
      ? rows.filter(row => !BLOCKED_PROFILE_IDS.includes(row.creator_id)).map(_mapDbEventToCard)
      : [];
  } catch (e) {
    console.warn('[mitmi] loadPublishedEvents:', e.message);
  }
  renderBrowseEventsGrid();
  return _combinedEventCards();
}

async function loadMyCreatedEvents() {
  if (!isLoggedIn()) return [];
  try {
    const params = {
      select: 'id,creator_id,venue_id,organizer_id,title,description,category,city,location_name,organizer_name_override,starts_at,capacity,attendee_count,cover_url,is_published,is_cancelled,created_at',
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
    console.warn('[mitmi] loadMyCreatedEvents:', e.message);
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
    box.innerHTML = '<div class="draft-empty">Događaji su trenutno sakriveni sa tvog profila.</div>';
    return;
  }
  if (!items.length) {
    box.innerHTML = `<div style="font-size:13px;color:var(--ink4);padding:8px 0">Još nema objavljenih događaja.</div>`;
    return;
  }
  box.innerHTML = items.map(item => {
    const label = item.category_label || _eventCategoryLabel(item.raw_category || item.cat || 'drugo');
    const tagClass = 'tag-purple';
    const coverStyle = item.cover_url ? ` style="background-image:url('${_safeCssUrl(item.cover_url)}');background-size:cover;background-position:center;color:transparent"` : '';
    return `<div class="ev-row" onclick="openEventById('${_escHtml(item.id)}')"><div class="ev-row-img ${_escHtml(item.bg)}"${coverStyle}>${item.cover_url ? '•' : _eventEmoji(item.cat)}</div><div style="flex:1"><div class="ev-row-title">${_escHtml(item.title)}</div><div class="ev-row-meta">${_escHtml(item.meta || 'Detalji nisu upisani')}</div></div><span class="tag ${tagClass}">${label}</span></div>`;
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

function _setCreateCoverPreview(coverUrl = '') {
  const preview = document.getElementById('create-cover-preview');
  const empty = document.getElementById('create-cover-empty');
  const clearBtn = document.getElementById('create-cover-clear');
  if (preview) {
    preview.style.backgroundImage = coverUrl ? `url(${coverUrl})` : '';
    preview.style.backgroundSize = coverUrl ? 'cover' : '';
    preview.style.backgroundPosition = coverUrl ? 'center' : '';
  }
  if (empty) empty.style.display = coverUrl ? 'none' : '';
  if (clearBtn) clearBtn.style.display = coverUrl ? '' : 'none';
}

function resetCreateForm() {
  _editingEventId = null;
  _planEventId = null;
  _createFlowMode = 'auto';
  _pendingEventCover = '';
  const titleEl = document.getElementById('create-title');
  const categoryEl = document.getElementById('create-category');
  const dateEl = document.getElementById('create-date');
  const timeEl = document.getElementById('create-time');
  const locationEl = document.getElementById('create-location');
  const cityEl = document.getElementById('create-city');
  const descEl = document.getElementById('create-desc');
  const spotsEl = document.getElementById('create-spots');
  const headerEl = document.getElementById('create-page-title');
  const saveBtn = document.getElementById('create-submit-btn');
  const fileEl = document.getElementById('create-cover-input');
  const contextEl = document.getElementById('create-event-context');
  const categoryWrap = document.getElementById('create-category-wrap');
  const dateWrap = document.getElementById('create-date-wrap');
  const timeWrap = document.getElementById('create-time-wrap');
  const locationWrap = document.getElementById('create-location-wrap');
  const coverWrap = document.getElementById('create-cover-wrap');
  const organizerWrap = document.getElementById('create-organizer-wrap');
  const sourceUrlWrap = document.getElementById('create-source-url-wrap');
  const vibesWrap = document.getElementById('create-vibes-wrap');
  const spotsWrap = document.getElementById('create-spots-wrap');
  const intentCard = document.getElementById('create-intent-card');
  const reviewNote = document.getElementById('create-review-note');
  const suggestionsEl = document.getElementById('create-title-suggestions');
  const organizerEl = document.getElementById('create-organizer');
  const sourceUrlEl = document.getElementById('create-source-url');
  const titleLabel = document.getElementById('create-title-label');
  const categoryLabel = document.getElementById('create-category-label');
  const dateLabelEl = document.getElementById('create-date-label');
  const timeLabelEl = document.getElementById('create-time-label');
  const locationLabel = document.getElementById('create-location-label');
  const cityLabel = document.getElementById('create-city-label');
  const contextLabel = document.getElementById('create-context-label');
  const contextHint = document.getElementById('create-context-hint');
  const descLabel = document.getElementById('create-desc-label');
  const spotsLabel = document.getElementById('create-spots-label');

  if (titleEl) titleEl.value = '';
  if (categoryEl) categoryEl.value = 'svirka';
  if (dateEl) dateEl.value = '';
  if (timeEl) timeEl.value = '';
  if (locationEl) locationEl.value = '';
  if (cityEl) cityEl.value = getUser()?.city || '';
  if (descEl) descEl.value = '';
  if (spotsEl) spotsEl.value = '';
  if (organizerEl) organizerEl.value = '';
  if (sourceUrlEl) sourceUrlEl.value = '';
  clearSelectedCreateOrganizer();
  if (headerEl) headerEl.textContent = 'Objavi plan';
  if (saveBtn) saveBtn.textContent = 'Objavi plan';
  if (fileEl) fileEl.value = '';
  if (contextEl) contextEl.style.display = 'none';
  if (categoryWrap) categoryWrap.style.display = '';
  if (dateWrap) dateWrap.style.display = '';
  if (timeWrap) timeWrap.style.display = '';
  if (locationWrap) locationWrap.style.display = '';
  if (coverWrap) coverWrap.style.display = '';
  if (organizerWrap) organizerWrap.style.display = 'none';
  if (sourceUrlWrap) sourceUrlWrap.style.display = 'none';
  if (vibesWrap) vibesWrap.style.display = '';
  if (spotsWrap) spotsWrap.style.display = '';
  if (intentCard) intentCard.style.display = '';
  if (reviewNote) reviewNote.style.display = 'none';
  if (titleEl) titleEl.placeholder = 'npr. Idem na koncert u subotu i tražim društvo';
  if (titleLabel) titleLabel.textContent = 'Naslov plana';
  if (categoryLabel) categoryLabel.textContent = 'Kategorija';
  if (dateLabelEl) dateLabelEl.textContent = 'Datum';
  if (timeLabelEl) timeLabelEl.textContent = 'Vreme';
  if (locationLabel) locationLabel.textContent = 'Mesto / venue';
  if (cityLabel) cityLabel.textContent = 'Grad';
  if (contextLabel) contextLabel.textContent = 'Događaj ili mesto (opciono)';
  if (contextHint) contextHint.textContent = 'Ako znaš mesto ili organizer, dodaj ih ovde. Ako ne znaš, slobodno ostavi prazno.';
  if (descLabel) descLabel.textContent = 'Opis (opcionalno)';
  if (spotsLabel) spotsLabel.textContent = 'Broj mesta';
  if (organizerEl) organizerEl.placeholder = 'npr. SKCNS, Dom omladine ili naziv događaja';
  document.querySelectorAll('[data-create-vibe]').forEach(btn => btn.classList.remove('active'));
  if (suggestionsEl) {
    suggestionsEl.innerHTML = `
      <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Tražim društvo za koncert')">koncert</button>
      <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Tražim društvo za izložbu')">izložbu</button>
      <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Tražim društvo za tenis')">tenis</button>
      <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Tražim društvo za kafu')">kafu</button>
      <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Tražim društvo za šetnju')">šetnju</button>
      <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Tražim društvo za večerašnji izlazak')">izlazak</button>
    `;
  }
  const organizerSuggestions = document.getElementById('create-organizer-suggestions');
  if (organizerSuggestions) {
    organizerSuggestions.innerHTML = '';
    organizerSuggestions.style.display = 'none';
  }
  refreshCreateDescriptionSuggestions();
  _setCreateCoverPreview('');
}

function applyCreateTitlePrompt(text = '') {
  const input = document.getElementById('create-title');
  if (!input) return;
  input.value = text || '';
  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function _createDescriptionSuggestionSet(context = {}) {
  const category = _eventVisualCategory(String(context.category || document.getElementById('create-category')?.value || 'drugo'));
  const eventTitle = String(context.eventTitle || '').trim();
  const location = String(context.location || document.getElementById('create-location')?.value || '').trim();
  const locationText = location || 'centar grada';
  if (eventTitle) {
    return [
      { label: 'kratko i jasno', text: `Tražim 1-2 osobe za ${eventTitle}. Dogovor oko detalja možemo u chatu.` },
      { label: 'ranije okupljanje', text: `Ako je neko za kratko okupljanje pre ${eventTitle}, pišite.` },
      { label: 'plan posle', text: `Tražim ekipu za ${eventTitle}, a možemo i da nastavimo druženje posle ako kliknemo.` },
      { label: 'opušten ton', text: `Idem na ${eventTitle} i prijalo bi mi prijatno društvo bez komplikacije i velikog plana.` }
    ];
  }
  const presets = {
    muzika: [
      { label: 'koncert', text: 'Tražim društvo za koncert. Volim opuštenu ekipu i dogovor bez razvlačenja.' },
      { label: 'pre događaja', text: `Ako je neko za kratko okupljanje pre svirke u ${locationText}, javite se.` },
      { label: 'solo friendly', text: 'Idem solo pa bih volela da se spojim sa još 1-2 osobe koje su za muziku i dobru energiju.' }
    ],
    sport: [
      { label: 'aktivno', text: 'Tražim društvo za sportski plan i dogovor koji može brzo da se organizuje.' },
      { label: 'rekreativno', text: 'Nisam za takmičenje nego za dobar trening i prijatnu ekipu.' },
      { label: 'termin', text: `Ako je neko za termin u ${locationText}, možemo lako da se uklopimo oko vremena.` }
    ],
    kultura: [
      { label: 'izložba', text: 'Tražim društvo za kulturni događaj i prijao bi mi neko ko voli mirniji tempo i razgovor.' },
      { label: 'posle događaja', text: 'Možemo zajedno na događaj, a posle i na kratku kafu ili šetnju ako bude lepo.' },
      { label: 'opušteno', text: 'Plan je jednostavan: događaj, malo druženja i bez prevelikog pritiska.' }
    ],
    kafa: [
      { label: 'kratko druženje', text: 'Tražim društvo za kafu i lagan razgovor, bez velikog plana i komplikacije.' },
      { label: 'posle posla', text: `Ako je neko za spontano viđanje u ${locationText}, možemo brzo da se dogovorimo.` },
      { label: 'mala ekipa', text: 'Najviše mi odgovara mala ekipa ili još jedna osoba za opušten izlazak.' }
    ],
    priroda: [
      { label: 'šetnja', text: 'Tražim društvo za prirodu i lagan plan bez žurbe.' },
      { label: 'vikend', text: 'Ako je neko za kratku šetnju ili boravak napolju, možemo se lako dogovoriti.' },
      { label: 'opušten ritam', text: 'Bitno mi je da plan bude prijatan, miran i da nije previše zahtevan.' }
    ],
    drugo: [
      { label: 'spontano', text: 'Tražim društvo za ovaj plan i volela bih brz, jednostavan dogovor.' },
      { label: 'mala ekipa', text: 'Najviše mi odgovara mala ekipa ili još jedna osoba za prijatno druženje.' },
      { label: 'jasan dogovor', text: 'Ako ti ovo zvuči zanimljivo, javi se da se lako uskladimo oko detalja.' }
    ]
  };
  return presets[category] || presets.drugo;
}

function applyCreateDescriptionPrompt(text = '') {
  const input = document.getElementById('create-desc');
  if (!input) return;
  input.value = text || '';
  input.focus();
}

function refreshCreateDescriptionSuggestions(context = {}) {
  const box = document.getElementById('create-desc-suggestions');
  if (!box) return;
  const suggestions = _createDescriptionSuggestionSet(context);
  box.innerHTML = suggestions.map(item => {
    const safeText = _escHtml(String(item.text || '')).replace(/'/g, '&#39;');
    return `<button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateDescriptionPrompt('${safeText}')">${_escHtml(item.label || 'predlog')}</button>`;
  }).join('');
}

function clearSelectedCreateOrganizer() {
  const input = document.getElementById('create-organizer');
  if (input) {
    delete input.dataset.organizerId;
    delete input.dataset.eventId;
    delete input.dataset.contextType;
  }
}

function selectCreateOrganizer(organizerId) {
  const input = document.getElementById('create-organizer');
  const list = document.getElementById('create-organizer-suggestions');
  const organizer = getOrganizerById(organizerId);
  if (!input || !organizer) return;
  input.value = organizer.name || '';
  input.dataset.organizerId = organizer.id;
  input.dataset.contextType = 'organizer';
  if (list) {
    list.innerHTML = `
      <div class="create-organizer-suggest is-selected">
        <div class="create-organizer-suggest-title">${_escHtml(organizer.name || 'Organizer')}</div>
        <div class="create-organizer-suggest-meta">Mesto / organizer · ${_escHtml(organizer.city || 'Grad nije unet')}${organizer.instagram ? ' · @' + _escHtml(organizer.instagram) : ''}</div>
      </div>
    `;
    list.style.display = '';
  }
}

function selectCreateEventReference(eventId) {
  const input = document.getElementById('create-organizer');
  const list = document.getElementById('create-organizer-suggestions');
  const event = _combinedEventCards().find(item => item.id === eventId);
  if (!input || !event) return;
  input.value = event.title || '';
  input.dataset.eventId = event.id;
  input.dataset.contextType = 'event';
  delete input.dataset.organizerId;
  if (list) {
    list.innerHTML = `
      <div class="create-organizer-suggest is-selected">
        <div class="create-organizer-suggest-title">${_escHtml(event.title || 'Događaj')}</div>
        <div class="create-organizer-suggest-meta">Postojeći događaj · ${_escHtml(event.meta || event.location_name || 'Detalji nisu upisani')}</div>
      </div>
    `;
    list.style.display = '';
  }
}

function renderCreateOrganizerSuggestions() {
  const input = document.getElementById('create-organizer');
  const list = document.getElementById('create-organizer-suggestions');
  if (!input || !list) return;
  const query = _createOrganizerQueryValue();
  const selectedId = input.dataset.organizerId || '';
  const selectedEventId = input.dataset.eventId || '';
  const selected = selectedId ? getOrganizerById(selectedId) : null;
  const selectedEvent = selectedEventId ? _combinedEventCards().find(item => item.id === selectedEventId) : null;
  if (selected && query && query === (selected.name || '')) {
    list.innerHTML = `
      <div class="create-organizer-suggest is-selected">
        <div class="create-organizer-suggest-title">${_escHtml(selected.name || 'Organizer')}</div>
        <div class="create-organizer-suggest-meta">Mesto / organizer · ${_escHtml(selected.city || 'Grad nije unet')}${selected.instagram ? ' · @' + _escHtml(selected.instagram) : ''}</div>
      </div>
    `;
    list.style.display = '';
    return;
  }
  if (selectedEvent && query && query === (selectedEvent.title || '')) {
    list.innerHTML = `
      <div class="create-organizer-suggest is-selected">
        <div class="create-organizer-suggest-title">${_escHtml(selectedEvent.title || 'Događaj')}</div>
        <div class="create-organizer-suggest-meta">Postojeći događaj · ${_escHtml(selectedEvent.meta || selectedEvent.location_name || 'Detalji nisu upisani')}</div>
      </div>
    `;
    list.style.display = '';
    return;
  }
  if (!selected || query !== (selected.name || '')) {
    clearSelectedCreateOrganizer();
  }
  const organizerMatches = _matchingOrganizersForQuery(query, getUser()?.city || '');
  const eventMatches = _matchingEventsForQuery(query, getUser()?.city || '');
  if (!organizerMatches.length && !eventMatches.length) {
    list.innerHTML = '';
    list.style.display = 'none';
    return;
  }
  const eventHtml = eventMatches.length ? `
    <div class="create-organizer-suggest-list">
      <div class="admin-mini" style="padding:0 4px 6px">Postojeći događaji</div>
      ${eventMatches.map(item => `
        <button type="button" class="create-organizer-suggest" onclick="selectCreateEventReference('${item.id}')">
          <div class="create-organizer-suggest-title">${_escHtml(item.title || 'Događaj')}</div>
          <div class="create-organizer-suggest-meta">${_escHtml(item.meta || item.location_name || 'Detalji nisu upisani')}</div>
        </button>
      `).join('')}
    </div>` : '';
  const organizerHtml = organizerMatches.length ? `
    <div class="create-organizer-suggest-list">
      <div class="admin-mini" style="padding:0 4px 6px">Mesta i organizatori</div>
      ${organizerMatches.map(item => `
        <button type="button" class="create-organizer-suggest" onclick="selectCreateOrganizer('${item.id}')">
          <div class="create-organizer-suggest-title">${_escHtml(item.name || 'Organizer')}</div>
          <div class="create-organizer-suggest-meta">${_escHtml(item.city || 'Grad nije unet')}${item.instagram ? ' · @' + _escHtml(item.instagram) : ''}</div>
        </button>
      `).join('')}
    </div>` : '';
  list.innerHTML = `${eventHtml}${organizerHtml}`;
  list.style.display = '';
}

function loadCreateForm() {
  const headerEl = document.getElementById('create-page-title');
  const saveBtn = document.getElementById('create-submit-btn');
  const contextEl = document.getElementById('create-event-context');
  const categoryWrap = document.getElementById('create-category-wrap');
  const dateWrap = document.getElementById('create-date-wrap');
  const timeWrap = document.getElementById('create-time-wrap');
  const locationWrap = document.getElementById('create-location-wrap');
  const coverWrap = document.getElementById('create-cover-wrap');
  const organizerWrap = document.getElementById('create-organizer-wrap');
  const sourceUrlWrap = document.getElementById('create-source-url-wrap');
  const vibesWrap = document.getElementById('create-vibes-wrap');
  const spotsWrap = document.getElementById('create-spots-wrap');
  const intentCard = document.getElementById('create-intent-card');
  const reviewNote = document.getElementById('create-review-note');
  const reviewNoteTitle = document.getElementById('create-review-note-title');
  const reviewNoteCopy = document.getElementById('create-review-note-copy');
  const suggestionsEl = document.getElementById('create-title-suggestions');
  const organizerEl = document.getElementById('create-organizer');
  const sourceUrlEl = document.getElementById('create-source-url');
  const titleLabel = document.getElementById('create-title-label');
  const titleHint = document.getElementById('create-title-hint');
  const categoryLabel = document.getElementById('create-category-label');
  const dateLabelEl = document.getElementById('create-date-label');
  const timeLabelEl = document.getElementById('create-time-label');
  const locationLabel = document.getElementById('create-location-label');
  const cityLabel = document.getElementById('create-city-label');
  const descLabel = document.getElementById('create-desc-label');
  const descHint = document.getElementById('create-desc-hint');
  const spotsLabel = document.getElementById('create-spots-label');
  const vibesLabel = document.getElementById('create-vibes-label');
  const vibesHint = document.getElementById('create-vibes-hint');
  const roleCaps = typeof getRoleCapabilities === 'function'
    ? getRoleCapabilities()
    : { canPublishManagedEvents: false };
  const intentBlocks = intentCard ? intentCard.querySelectorAll('div') : [];
  const intentTitleEl = intentBlocks[1] || null;
  const intentCopyEl = intentBlocks[2] || null;

  if (_planEventId && !_editingEventId) {
    const card = _combinedEventCards().find(item => item.id === _planEventId);
    const raw = card?.raw || {};
    const titleEl = document.getElementById('create-title');
    const descEl = document.getElementById('create-desc');
    const spotsEl = document.getElementById('create-spots');
    if (headerEl) headerEl.textContent = 'Objavi plan za događaj';
    if (saveBtn) saveBtn.textContent = 'Objavi plan';
    if (intentCard) intentCard.style.display = '';
    if (titleEl) titleEl.value = '';
    if (titleEl) titleEl.placeholder = `npr. Tražim društvo za ${card?.title || 'ovaj događaj'}`;
    if (descEl) descEl.value = '';
    if (spotsEl) spotsEl.value = '';
    if (contextEl) {
      const meta = [card?.date || raw.starts_at?.slice(0, 10) || '', raw.location_name || raw.city || 'Lokacija nije upisana'].filter(Boolean).join(' · ');
      contextEl.style.display = '';
      contextEl.innerHTML = `<div style="font-size:12px;color:var(--purple);font-weight:700;margin-bottom:4px">Povezano sa događajem</div><div style="font-size:15px;font-weight:800;color:var(--ink)">${_escHtml(card?.title || 'Događaj')}</div><div style="font-size:13px;color:var(--ink3);margin-top:4px">${_escHtml(meta)}</div>`;
    }
    if (categoryWrap) categoryWrap.style.display = 'none';
    if (dateWrap) dateWrap.style.display = 'none';
    if (timeWrap) timeWrap.style.display = 'none';
    if (locationWrap) locationWrap.style.display = 'none';
    if (coverWrap) coverWrap.style.display = 'none';
    document.querySelectorAll('[data-create-vibe]').forEach(btn => btn.classList.remove('active'));
    if (suggestionsEl) {
      const safeTitle = _escHtml(card?.title || 'ovaj događaj').replace(/'/g, '&#39;');
      suggestionsEl.innerHTML = `
        <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Tražim društvo za ${safeTitle}')">za ovaj događaj</button>
        <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Tražim društvo za dolazak ranije na ${safeTitle}')">ranije okupljanje</button>
        <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Tražim društvo za odlazak na ${safeTitle}')">zajednički odlazak</button>
        <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Tražim društvo za posle ${safeTitle}')">plan posle</button>
      `;
    }
    refreshCreateDescriptionSuggestions({
      eventTitle: card?.title || 'ovaj događaj',
      category: raw.category || card?.cat || 'drugo',
      location: raw.location_name || raw.city || ''
    });
    _pendingEventCover = '';
    _setCreateCoverPreview('');
    return;
  }

  if (!_editingEventId) {
    if (_createFlowMode === 'suggest') {
      if (headerEl) headerEl.textContent = 'Predloži događaj';
      if (saveBtn) saveBtn.textContent = 'Pošalji predlog';
      if (contextEl) contextEl.style.display = 'none';
      if (categoryWrap) categoryWrap.style.display = '';
      if (dateWrap) dateWrap.style.display = '';
      if (timeWrap) timeWrap.style.display = '';
      if (locationWrap) locationWrap.style.display = '';
      if (coverWrap) coverWrap.style.display = 'none';
      if (organizerWrap) organizerWrap.style.display = '';
      if (sourceUrlWrap) sourceUrlWrap.style.display = '';
      if (vibesWrap) vibesWrap.style.display = 'none';
      if (spotsWrap) spotsWrap.style.display = 'none';
      if (intentCard) intentCard.style.display = 'none';
      if (reviewNote) reviewNote.style.display = '';
      if (reviewNoteTitle) reviewNoteTitle.textContent = 'Predloži događaj';
      if (reviewNoteCopy) reviewNoteCopy.textContent = 'Ovo nije direktna objava događaja. Pošalji osnovne podatke, a mitmi admin će proveriti detalje i objaviti događaj ako je sve u redu.';
      if (titleLabel) titleLabel.textContent = 'Naziv događaja';
      if (categoryLabel) categoryLabel.textContent = 'Kategorija';
      if (dateLabelEl) dateLabelEl.textContent = 'Datum';
      if (timeLabelEl) timeLabelEl.textContent = 'Vreme';
      if (locationLabel) locationLabel.textContent = 'Mesto / venue';
      if (cityLabel) cityLabel.textContent = 'Grad';
      if (contextLabel) contextLabel.textContent = 'Organizer ili mesto (opciono)';
      if (contextHint) contextHint.textContent = 'Ako znaš ko organizuje događaj ili gde se održava, dodaj to ovde da admin lakše poveže pravi profil.';
      if (descLabel) descLabel.textContent = 'Kratke napomene (opcionalno)';
      if (spotsLabel) spotsLabel.textContent = 'Broj mesta';
      const titleEl = document.getElementById('create-title');
      const descEl = document.getElementById('create-desc');
      if (titleEl && !titleEl.value) titleEl.placeholder = 'npr. Otvaranje nove izložbe u petak';
      if (descEl) descEl.placeholder = 'Šta znaš o događaju, ko organizuje i zašto vredi da se pojavi u aplikaciji...';
      if (organizerEl && !organizerEl.value) organizerEl.placeholder = 'npr. SKCNS ili @skcns';
      if (sourceUrlEl && !sourceUrlEl.value) sourceUrlEl.placeholder = 'https://instagram.com/...';
      renderCreateOrganizerSuggestions();
      if (suggestionsEl) {
        suggestionsEl.innerHTML = `
          <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Koncert u subotu u centru')">koncert</button>
          <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Nova izložba ovog vikenda')">izložba</button>
          <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Turnir i sportski događaj u gradu')">sport</button>
          <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Večernji program u gradu')">večernji program</button>
        `;
      }
      refreshCreateDescriptionSuggestions();
      return;
    }

    const isManagedCreate = _createFlowMode === 'managed'
      || (_createFlowMode === 'auto' && roleCaps.canPublishManagedEvents);
    if (headerEl) headerEl.textContent = isManagedCreate ? 'Objavi događaj' : 'Tražim društvo';
    if (saveBtn) saveBtn.textContent = isManagedCreate ? 'Objavi događaj' : 'Objavi plan';
    if (contextEl) contextEl.style.display = 'none';
    if (categoryWrap) categoryWrap.style.display = '';
    if (dateWrap) dateWrap.style.display = '';
    if (timeWrap) timeWrap.style.display = '';
    if (locationWrap) locationWrap.style.display = '';
    if (coverWrap) coverWrap.style.display = '';
    if (organizerWrap) organizerWrap.style.display = isManagedCreate ? 'none' : '';
    if (sourceUrlWrap) sourceUrlWrap.style.display = 'none';
    if (vibesWrap) vibesWrap.style.display = isManagedCreate ? 'none' : '';
    if (spotsWrap) spotsWrap.style.display = '';
    if (intentCard) intentCard.style.display = isManagedCreate ? 'none' : '';
    if (reviewNote) reviewNote.style.display = 'none';
    if (titleLabel) titleLabel.textContent = isManagedCreate ? 'Naziv događaja' : 'Naslov plana';
    if (titleHint) {
      titleHint.textContent = isManagedCreate
        ? 'Najbolje prolaze kratki nazivi koji odmah kažu o kakvom događaju se radi.'
        : 'Najbolje prolaze kratki naslovi koji odmah kažu kakav plan imaš.';
    }
    if (categoryLabel) categoryLabel.textContent = 'Kategorija';
    if (dateLabelEl) dateLabelEl.textContent = 'Datum';
    if (timeLabelEl) timeLabelEl.textContent = 'Vreme';
    if (locationLabel) locationLabel.textContent = 'Mesto / venue';
    if (cityLabel) cityLabel.textContent = 'Grad';
    if (contextLabel) contextLabel.textContent = 'Događaj ili mesto (opciono)';
    if (contextHint) {
      contextHint.textContent = isManagedCreate
        ? 'Ovaj događaj se objavljuje direktno na organizer profil.'
        : 'Ako je plan vezan za neki događaj, klub ili mesto, dodaj ga ovde. Ako nije, ostavi prazno.';
    }
    if (descLabel) descLabel.textContent = isManagedCreate ? 'Opis događaja (opcionalno)' : 'Opis (opcionalno)';
    if (descHint) {
      descHint.textContent = isManagedCreate
        ? 'Kratak i jasan opis događaja prolazi bolje od dugog objašnjenja.'
        : 'Kratak i konkretan opis prolazi bolje od dugog objašnjenja.';
    }
    if (spotsLabel) spotsLabel.textContent = isManagedCreate ? 'Kapacitet (opcionalno)' : 'Broj mesta';
    if (vibesLabel) vibesLabel.textContent = 'Vibe / kakvo društvo tražiš';
    if (vibesHint) vibesHint.textContent = 'Izaberi do 3 taga da ljudi odmah vide kakvu ekipu tražiš.';
    if (intentTitleEl) intentTitleEl.textContent = isManagedCreate ? 'Kreiraj događaj...' : 'Tražim društvo za...';
    if (intentCopyEl) {
      intentCopyEl.textContent = isManagedCreate
        ? 'Kreiraj događaj sa jasnim naslovom, vremenom i lokacijom da bi drugi lako mogli da ga pronađu.'
        : 'Napiši konkretan plan. Ljudi brže reaguju kad odmah vide za šta tražiš društvo.';
    }
    const titleEl = document.getElementById('create-title');
    const descEl = document.getElementById('create-desc');
    if (titleEl && !titleEl.value) {
      titleEl.placeholder = isManagedCreate
        ? 'npr. Letnji live nastup u subotu'
        : 'npr. Društvo za večerašnji izlazak';
    }
    if (descEl) {
      descEl.placeholder = isManagedCreate
        ? 'Kratko opiši program, atmosferu i bitne detalje događaja...'
        : 'Šta tražiš, kakvo društvo...';
    }
    if (organizerEl && !organizerEl.value && !isManagedCreate) {
      organizerEl.placeholder = 'npr. SKCNS, Dom omladine ili naziv događaja';
    }
    if (suggestionsEl) {
      suggestionsEl.style.display = isManagedCreate ? 'none' : 'flex';
    }
    if (!isManagedCreate) {
      refreshCreateDescriptionSuggestions();
    } else {
      const descSuggestions = document.getElementById('create-desc-suggestions');
      if (descSuggestions) descSuggestions.innerHTML = '';
    }
    return;
  }
  const card = _combinedEventCards().find(item => item.id === _editingEventId);
  const raw = card?.raw || {};
  const date = raw.starts_at ? new Date(raw.starts_at) : null;
  const titleEl = document.getElementById('create-title');
  const categoryEl = document.getElementById('create-category');
  const dateEl = document.getElementById('create-date');
  const timeEl = document.getElementById('create-time');
  const locationEl = document.getElementById('create-location');
  const cityEl = document.getElementById('create-city');
  const descEl = document.getElementById('create-desc');
  const spotsEl = document.getElementById('create-spots');
  if (headerEl) headerEl.textContent = 'Uredi događaj';
  if (saveBtn) saveBtn.textContent = 'Sačuvaj izmene';
  if (contextEl) contextEl.style.display = 'none';
  if (intentCard) intentCard.style.display = 'none';
  if (reviewNote) reviewNote.style.display = 'none';
  if (categoryWrap) categoryWrap.style.display = '';
  if (dateWrap) dateWrap.style.display = '';
  if (timeWrap) timeWrap.style.display = '';
  if (locationWrap) locationWrap.style.display = '';
  if (coverWrap) coverWrap.style.display = '';
  if (organizerWrap) organizerWrap.style.display = 'none';
  if (sourceUrlWrap) sourceUrlWrap.style.display = 'none';
  if (vibesWrap) vibesWrap.style.display = 'none';
  if (spotsWrap) spotsWrap.style.display = '';
  if (titleLabel) titleLabel.textContent = 'Naziv događaja';
  if (titleHint) titleHint.textContent = 'Najbolje prolaze kratki nazivi koji odmah kažu o kakvom događaju se radi.';
  if (descLabel) descLabel.textContent = 'Opis događaja (opcionalno)';
  if (descHint) descHint.textContent = 'Kratak i jasan opis događaja prolazi bolje od dugog objašnjenja.';
  if (spotsLabel) spotsLabel.textContent = 'Kapacitet (opcionalno)';
  if (locationLabel) locationLabel.textContent = 'Mesto / venue';
  if (cityLabel) cityLabel.textContent = 'Grad';
  document.querySelectorAll('[data-create-vibe]').forEach(btn => btn.classList.remove('active'));
  if (titleEl) titleEl.value = raw.title || card?.title || '';
  if (categoryEl) categoryEl.value = _normalizeEventCategoryKey(raw.category || card?.raw_category || card?.cat || 'svirka');
  if (dateEl) dateEl.value = raw.starts_at ? raw.starts_at.slice(0, 10) : (card?.date || '');
  if (timeEl && date && !Number.isNaN(date.getTime())) timeEl.value = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (locationEl) locationEl.value = raw.location_name || '';
  if (cityEl) cityEl.value = raw.city || getUser()?.city || '';
  if (descEl) descEl.value = raw.description || '';
  if (descEl) descEl.placeholder = 'Kratko opiši program, atmosferu i bitne detalje događaja...';
  if (spotsEl) spotsEl.value = raw.capacity || '';
  if (suggestionsEl) suggestionsEl.style.display = 'none';
  const descSuggestions = document.getElementById('create-desc-suggestions');
  if (descSuggestions) descSuggestions.innerHTML = '';
  _pendingEventCover = card?.cover_url || _getEventCover(_editingEventId) || '';
  _setCreateCoverPreview(_pendingEventCover);
}

function toggleCreateVibe(btn, vibeKey = '') {
  if (!btn || !vibeKey) return;
  const active = Array.from(document.querySelectorAll('[data-create-vibe].active'));
  if (!btn.classList.contains('active') && active.length >= 3) {
    showToast('Izaberi najviše 3 vibe taga', 'info', 1500);
    return;
  }
  btn.classList.toggle('active');
}

function getSelectedCreateVibes() {
  return _normalizeInviteVibes(
    Array.from(document.querySelectorAll('[data-create-vibe].active')).map(btn => btn.dataset.createVibe || '')
  );
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

const openCreateInviteForEvent = openCreatePlanForEvent;

async function openCreateEvent(eventId = null, mode = 'auto') {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  if (!eventId) {
    resetCreateForm();
    _createFlowMode = mode || 'auto';
    nav('create');
    setTimeout(() => loadCreateForm(), 0);
    return;
  }
  _createFlowMode = 'managed';
  _editingEventId = eventId;
  let card = _combinedEventCards().find(item => item.id === eventId) || null;
  if (!card && _isSupabaseConfigured()) {
    try {
      const rows = await _supaGet('events', {
        select: 'id,creator_id,venue_id,organizer_id,title,description,category,city,location_name,starts_at,capacity,attendee_count,cover_url,is_published,is_cancelled,created_at',
        id: `eq.${eventId}`,
        limit: '1'
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row) {
        card = _mapDbEventToCard(row);
        _replaceRealEventCard(card);
      }
    } catch (e) {
      console.warn('[mitmi] openCreateEvent:', e.message);
    }
  }
  nav('create');
  setTimeout(() => loadCreateForm(), 0);
}

function _draftSubmitterLabel() {
  const user = getUser() || {};
  return user.display_name || user.username || user.email || 'mitmi korisnik';
}

function _extractOrganizerInstagram(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const handleMatch = text.match(/@([a-z0-9._]+)/i);
  if (handleMatch) return handleMatch[1].toLowerCase();
  try {
    const parsed = new URL(text);
    if ((parsed.hostname || '').includes('instagram.com')) {
      return (parsed.pathname.split('/').filter(Boolean)[0] || '').replace(/^@+/, '').toLowerCase();
    }
  } catch (e) {}
  return '';
}

async function handleSuggestEventSubmit() {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  const title = document.getElementById('create-title')?.value.trim();
  const category = document.getElementById('create-category')?.value || '';
  const date = document.getElementById('create-date')?.value || '';
  const time = document.getElementById('create-time')?.value || '';
  const location = document.getElementById('create-location')?.value.trim();
  const city = document.getElementById('create-city')?.value.trim() || '';
  const desc = document.getElementById('create-desc')?.value.trim();
  const organizer = document.getElementById('create-organizer')?.value.trim();
  const sourceUrl = document.getElementById('create-source-url')?.value.trim();
  const organizerId = document.getElementById('create-organizer')?.dataset.organizerId || null;

  if (!title) { showToast('Unesi naziv događaja', 'error'); return; }
  if (!category) { showToast('Izaberi kategoriju', 'error'); return; }
  if (!date) { showToast('Izaberi datum događaja', 'error'); return; }
  if (!city) { showToast('Unesi grad događaja', 'error'); return; }
  if (!location) { showToast('Unesi lokaciju ili mesto održavanja', 'error'); return; }
  if (_containsRestrictedContactInfo(`${title}\n${desc}\n${location}\n${city}`)) {
    showToast('Predlog događaja ne sme da sadrži telefon, email, Instagram ili druge direktne kontakte u javnom tekstu.', 'error', 2800);
    return;
  }
  if (sourceUrl) {
    try { new URL(sourceUrl); } catch (e) {
      showToast('Link nije ispravan', 'error');
      return;
    }
  }

  const startsAt = time ? `${date}T${time}:00` : `${date}T20:00:00`;
  const payload = {
    source_type: 'user',
    review_status: 'pending',
    title,
    description: desc || null,
    category: _normalizeEventCategoryKey(category),
    city,
    starts_at: startsAt,
    location_name: location,
    source_url: sourceUrl || null,
    source_label: sourceUrl ? 'user_link' : 'user_manual',
    organizer_id: organizerId || null,
    proposed_organizer_name: organizer || '',
    proposed_organizer_instagram: _extractOrganizerInstagram(organizer || sourceUrl || ''),
    ai_summary: desc || 'Korisnik je poslao predlog događaja za admin pregled.',
    submitted_by: getUser()?.id || null
  };
  if (!_isSupabaseConfigured()) {
    showToast('Predlog događaja trenutno nije dostupan. Pokušaj ponovo malo kasnije.', 'error', 2400);
    return;
  }
  try {
    await _supaFetch('/rest/v1/event_drafts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    await Promise.all([
      loadAdminOrganizersFromBackend({ silent: true }),
      loadAdminDraftQueueFromBackend({ silent: true })
    ]);
    renderAdminDrafts();
    resetCreateForm();
    openUnifiedHub('events', 0);
    showToast('Predlog je poslat adminu na pregled', 'success', 2200);
  } catch (e) {
    console.warn('[mitmi] handleSuggestEventSubmit:', e.message);
    showToast('Predlog trenutno nije poslat adminu. Sačuvaj podatke i pokušaj ponovo.', 'error', 2600);
  }
}

async function handleCreateCover(input) {
  if (!input.files || !input.files[0]) return;
  try {
    if (input.files[0].size > 8 * 1024 * 1024) {
      showToast('Cover slika je prevelika. Izaberi manju fotografiju.', 'error');
      return;
    }
    const compressed = await compressImage(input.files[0], 960, 0.72);
    _pendingEventCover = compressed;
    _setCreateCoverPreview(compressed);
    showToast('Cover slika je dodata', 'success', 1800);
  } catch (e) {
    showToast('Slika nije uspela da se obradi', 'error');
  } finally {
    input.value = '';
  }
}

function clearCreateCover() {
  _pendingEventCover = '';
  _setCreateCoverPreview('');
}

let ADMIN_ORGANIZERS = [];
let EVENT_DRAFTS = [];
let FOLLOWED_EVENTS = [];
let PROFILE_DIRECTORY = [];
let FOLLOWED_PROFILE_IDS = [];
let ADMIN_CLAIM_REQUESTS = [];
let _currentPublicProfileId = null;
let _currentPublicVenueId = null;
let _currentPublicVenueTarget = null;
let _reportContext = { type:'profile', profileId:null, venueId:null, eventId:null, label:'' };
let BLOCKED_PROFILE_IDS = [];
let ADMIN_MODERATION_ITEMS = [];
let ADMIN_PLAN_SIGNALS = [];
let ADMIN_ORPHAN_EVENTS = [];
let _moderationFilter = 'all';

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
      select: 'id,name,city,instagram_handle,status,claimed_by_profile_id,merged_into_id',
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

async function loadAdminDraftQueueFromBackend(opts = {}) {
  if (!_isSupabaseConfigured() || _adminDraftQueueLoading) return EVENT_DRAFTS;
  _adminDraftQueueLoading = true;
  try {
    const rows = await _supaGet('event_drafts', {
      select: 'id,source_type,review_status,source_url,source_label,title,description,category,city,location_name,starts_at,updated_at,created_at,organizer_id,proposed_organizer_name,proposed_organizer_instagram,ai_summary,ai_confidence,admin_notes,submitted_by,profiles!submitted_by(username,display_name),organizers!organizer_id(id,name,city,instagram_handle,status)',
      review_status: 'eq.pending',
      order: 'created_at.desc',
      limit: '200'
    });
    const backendDrafts = (Array.isArray(rows) ? rows : []).map(_mapDbDraftToUi);
    const localOnly = EVENT_DRAFTS.filter((item) => !_isBackendDraft(item));
    EVENT_DRAFTS = [...backendDrafts, ...localOnly];
    if (!opts.silent) renderAdminDrafts();
  } catch (e) {
    console.warn('[mitmi] loadAdminDraftQueueFromBackend:', e.message);
  } finally {
    _adminDraftQueueLoading = false;
  }
  return EVENT_DRAFTS;
}

async function loadAdminOrphanPublishedEvents(opts = {}) {
  if (!isAdminUser() || !_isSupabaseConfigured()) {
    ADMIN_ORPHAN_EVENTS = [];
    return ADMIN_ORPHAN_EVENTS;
  }
  try {
    const rows = await _supaGet('events', {
      select: 'id,title,city,location_name,organizer_name_override,starts_at,category,creator_id,is_published,is_cancelled,is_hidden,created_at,profiles!creator_id(role,display_name,username)',
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

async function loadAdminPlanSignalsFromBackend(opts = {}) {
  if (!_isSupabaseConfigured()) return ADMIN_PLAN_SIGNALS;
  try {
    let rows = (await _loadPlans({
      status: 'eq.open',
      order: 'created_at.desc',
      limit: '200'
    })).map(_mapPlanToInviteLike);
    if (!rows.length) {
      const legacy = await _supaGet('invites', {
        select: 'id,title,description,spots_total,status,created_at,creator_id,event_id,events!event_id(id,creator_id,organizer_id,venue_id,title,description,category,city,location_name,starts_at,cover_url,is_published,is_cancelled),profiles!creator_id(id,username,display_name)',
        status: 'eq.open',
        order: 'created_at.desc',
        limit: '200'
      });
      rows = Array.isArray(legacy) ? legacy : [];
    }
    ADMIN_PLAN_SIGNALS = rows.map(item => {
      const event = item.events || {};
      const profile = item.profiles || {};
      const isSelfHosted = !item.event_id || (!!event.id && !!item.creator_id && event.creator_id === item.creator_id);
      const hasOrganizer = !!(event.organizer_id || event.venue_id);
      const title = event.title || item.title || '';
      const locationName = event.location_name || item.location_name || event.city || item.city || '';
      const startsAt = event.starts_at || item.starts_at || '';
      const looksEventLike = !!(title && locationName && startsAt);
      return {
        id: item.id || '',
        title: item.title || 'Plan',
        description: item.description || '',
        creatorId: item.creator_id || '',
        creatorName: profile.display_name || profile.username || 'mitmi korisnik',
        eventId: item.event_id || event.id || '',
        eventTitle: title || 'Događaj',
        eventCategory: event.category || 'drugo',
        city: event.city || '',
        locationName,
        startsAt,
        organizerId: event.organizer_id || null,
        venueId: event.venue_id || null,
        sourceUrl: item.source_url || '',
        isSelfHosted,
        hasOrganizer,
        looksEventLike
      };
    }).filter(item => item.isSelfHosted && !item.hasOrganizer && item.looksEventLike && _looksLikeCatalogEventLead(item));
    if (!opts.silent) renderAdminPlanSignals();
  } catch (e) {
    console.warn('[mitmi] loadAdminPlanSignalsFromBackend:', e.message);
  }
  return ADMIN_PLAN_SIGNALS;
}

function _dateFromOffset(dayOffset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return _eventDateToken(d);
}

function eventKeyFromData(data) {
  if (!data) return '';
  return data.id || [data.title || '', data.meta || '', data.dayOffset ?? '', data.cat || ''].join('|');
}

function dateLabel(dateStr) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const d = _parseEventDateLocal(dateStr);
  if (!d) return 'Uskoro';
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Danas';
  if (diff === 1) return 'Sutra';
  if (diff <= 6) {
    const days = ['Ned','Pon','Uto','Sre','Čet','Pet','Sub'];
    return days[d.getDay()];
  }
  return d.toLocaleDateString('sr-Latn', { day:'numeric', month:'short' });
}

function renderUskoroStrip() {
  const strip = document.getElementById('uskoro-strip');
  if (!strip) return;
  const today = new Date();
  today.setHours(0,0,0,0);

  // Sortiraj po datumu, preskoci prošle
  const upcoming = _combinedEventCards()
    .map(e => ({ ...e, date: e.date || _dateFromOffset(e.dayOffset || 0) }))
    .filter(e => (_parseEventDateLocal(e.date) || new Date(0)) >= today)
    .sort((a, b) => (_parseEventDateLocal(a.date)?.getTime() || 0) - (_parseEventDateLocal(b.date)?.getTime() || 0));

  if (upcoming.length === 0) {
    strip.innerHTML = '<div style="font-size:13px;color:var(--ink4);padding:12px 0">Još nema predstojećih događaja.</div>';
    return;
  }

  strip.innerHTML = upcoming.map((ev, i) => {
    const label = dateLabel(ev.date);
    const isToday = label === 'Danas';
    const spotsLabel = ev.spotsLabel || _eventSpotsLabel(ev.spots, ev.attendee_count);
    const spotsVariant = ev.spotsVariant || _eventSpotsState(ev.spots, ev.attendee_count).variant;
    const emoji = _eventEmoji(ev.raw_category || ev.cat);
    const delay = i * 0.07;
    const heroStyle = ev.cover_url ? `background-image:url('${_safeCssUrl(ev.cover_url)}');background-size:cover;background-position:center;position:relative` : 'position:relative';
    return `<div class="hero-ev-card" style="flex-shrink:0;width:155px;animation:cardReveal .3s ease ${delay}s both;opacity:0" onclick="openEventById('${_escHtml(ev.id || '')}')">
      <div class="hero-ev-img ${ev.bg}" style="${heroStyle}">
        ${isToday ? '<span style="position:absolute;top:8px;right:8px;background:var(--amber);color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:10px;letter-spacing:.04em">DANAS</span>' : ''}
      </div>
      <div class="hero-ev-body">
        <div style="font-size:10px;font-weight:700;color:var(--ink3);margin-bottom:3px">${emoji} ${_escHtml(ev.category_label || _eventCategoryLabel(ev.raw_category || ev.cat || 'drugo'))}</div>
        <div class="hero-ev-title">${ev.title}</div>
        <div class="hero-ev-meta">${ev.meta}</div>
        <div class="hero-ev-spots hero-ev-spots-${_escHtml(spotsVariant)}">${_escHtml(spotsLabel)}</div>
        <button class="hero-ev-btn" onclick="openEventById('${_escHtml(ev.id || '')}');event.stopPropagation()">Nađi društvo</button>
      </div>
    </div>`;
  }).join('');
}

function renderBrowseHomeStrip() {
  const strip = document.getElementById('browse-home-strip');
  if (!strip) return;
  const today = new Date();
  today.setHours(0,0,0,0);
  const upcoming = _combinedEventCards()
    .map(e => ({ ...e, date: e.date || _dateFromOffset(e.dayOffset || 0) }))
    .filter(e => (_parseEventDateLocal(e.date) || new Date(0)) >= today)
    .sort((a, b) => (_parseEventDateLocal(a.date)?.getTime() || 0) - (_parseEventDateLocal(b.date)?.getTime() || 0))
    .slice(0, 2);
  if (!upcoming.length) {
    strip.innerHTML = '<div class="draft-empty">Kad se pojave prvi događaji, ovde ćeš videti kratak pregled najbližih izlazaka.</div>';
    return;
  }
  strip.innerHTML = upcoming.map((ev, i) => {
    const label = dateLabel(ev.date);
    const isToday = label === 'Danas';
    const spotsLabel = ev.spotsLabel || _eventSpotsLabel(ev.spots, ev.attendee_count);
    const spotsVariant = ev.spotsVariant || _eventSpotsState(ev.spots, ev.attendee_count).variant;
    const emoji = _eventEmoji(ev.raw_category || ev.cat);
    const delay = i * 0.06;
    const coverStyle = ev.cover_url
      ? `background-image:url('${_safeCssUrl(ev.cover_url)}');background-size:cover;background-position:center`
      : '';
    const title = _escHtml(ev.title || 'Događaj');
    const meta = _escHtml(ev.meta || 'Detalji uskoro');
    return `<article class="browse-preview-card" style="animation:cardReveal .3s ease ${delay}s both;opacity:0" onclick="openEventById('${_escHtml(ev.id || '')}')">
      <div class="browse-preview-media ${_escHtml(ev.bg || 'ev-img-a')}"${coverStyle ? ` style="${coverStyle}"` : ''}>
        <span class="browse-preview-kicker">${emoji} ${_escHtml(label)}</span>
        ${isToday ? '<span class="browse-preview-badge">Danas</span>' : ''}
      </div>
      <div class="browse-preview-body">
        <div class="browse-preview-title">${title}</div>
        <div class="browse-preview-meta">${meta}</div>
        <div class="browse-preview-footer">
          <div class="browse-preview-spots browse-preview-spots-${_escHtml(spotsVariant)}">${_escHtml(spotsLabel)}</div>
          <button class="browse-preview-btn" onclick="openEventById('${_escHtml(ev.id || '')}');event.stopPropagation()">Detalji</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function renderLandingHeroEvents() {
  const section = document.getElementById('landing-hero-events');
  const box = document.getElementById('landing-hero-cards');
  if (!section || !box) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = _combinedEventCards()
    .map(e => ({ ...e, date: e.date || _dateFromOffset(e.dayOffset || 0) }))
    .filter(e => (_parseEventDateLocal(e.date) || new Date(0)) >= today)
    .slice(0, 4);

  if (!upcoming.length) {
    section.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  section.style.display = '';
  box.innerHTML = upcoming.map((ev, i) => {
    const emoji = _eventEmoji(ev.raw_category || ev.cat);
    const coverStyle = ev.cover_url
      ? `background-image:url('${_safeCssUrl(ev.cover_url)}');background-size:cover;background-position:center`
      : '';
    return `<div class="hero-ev-card" style="animation:cardReveal .3s ease ${i * 0.06}s both;opacity:0" onclick="openEventById('${_escHtml(ev.id || '')}')">
      <div class="hero-ev-img ${_escHtml(ev.bg)}"${coverStyle ? ` style="${coverStyle}"` : ''}>
        <span class="hero-cat-tag"><span class="hero-tag-icon" aria-hidden="true">${emoji}</span>${_escHtml(ev.category_label || _eventCategoryLabel(ev.raw_category || ev.cat || 'drugo'))}</span>
      </div>
      <div class="hero-ev-body">
        <div class="hero-ev-title">${_escHtml(ev.title || 'Događaj')}</div>
        <div class="hero-ev-meta">${_escHtml(ev.meta || 'Detalji nisu upisani')}</div>
        <button class="hero-ev-btn" onclick="openEventById('${_escHtml(ev.id || '')}');event.stopPropagation()">Pogledaj</button>
      </div>
    </div>`;
  }).join('');
}

// Pozovi pri init i kad se navigira na home
// renderUskoroStrip se poziva direktno iz nav()
document.addEventListener('DOMContentLoaded', renderUskoroStrip);
document.addEventListener('DOMContentLoaded', renderLandingHeroEvents);
document.addEventListener('DOMContentLoaded', () => { loadPublishedEvents().then(() => renderLandingHeroEvents()).catch(() => {}); });

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

function organizerLabel(draft) {
  const organizer = draft.organizerId ? getOrganizerById(draft.organizerId) : null;
  return organizer?.name || draft.proposedOrganizerName || 'Organizer nije unet';
}

async function createDraftFromPlanSignal(signalId) {
  const lead = ADMIN_PLAN_SIGNALS.find(item => item.id === signalId);
  if (!lead || !_isSupabaseConfigured()) return;
  try {
    await _supaFetch('/rest/v1/event_drafts', {
      method: 'POST',
      body: JSON.stringify({
        source_type: 'user',
        review_status: 'pending',
        title: lead.eventTitle,
        description: lead.description || null,
        category: lead.eventCategory || 'drugo',
        city: lead.city || '',
        starts_at: lead.startsAt || null,
        location_name: lead.locationName || '',
        source_label: 'plan_signal',
        source_url: null,
        organizer_id: lead.organizerId || null,
        ai_summary: 'Signal je izveden iz korisničkog plana koji liči na pravi događaj.',
        submitted_by: lead.creatorId || null
      })
    });
    showToast('Signal iz plana je poslat u draftove', 'success', 2000);
    await Promise.all([
      loadAdminDraftQueueFromBackend({ silent: true }),
      loadAdminPlanSignalsFromBackend({ silent: true })
    ]);
    renderAdminDrafts();
  } catch (e) {
    console.warn('[mitmi] createDraftFromPlanSignal:', e.message);
    showToast('Signal iz plana trenutno nije poslat u draftove', 'error');
  }
}

function renderAdminPlanSignals() {
  syncAdminUI();
  const list = document.getElementById('admin-plan-signal-list');
  if (!list) return;
  if (!ADMIN_PLAN_SIGNALS.length) {
    list.innerHTML = '<div class="draft-empty">Za sada nema planova koji izgledaju kao pravi događaji za katalog.</div>';
    return;
  }
  list.innerHTML = ADMIN_PLAN_SIGNALS.map(item => {
    const meta = [adminDraftTimeLabel(item.startsAt), item.locationName || item.city || 'Lokacija nije upisana'].filter(Boolean).join(' · ');
    return `<div class="draft-card"><div class="draft-top"><div style="flex:1;min-width:0"><div class="draft-title">${_escHtml(item.eventTitle)}</div><div class="draft-meta">${_escHtml(meta)}</div></div><div class="draft-chip-row" style="justify-content:flex-end"><span class="tag tag-gold">Plan</span><span class="tag tag-amber">Signal</span></div></div><div class="draft-note"><strong>Objavio/la:</strong> ${_escHtml(item.creatorName)}</div><div class="draft-note" style="margin-top:8px"><strong>Plan:</strong> ${_escHtml(item.title || 'Tražim društvo')}</div>${item.description ? `<div class="draft-note" style="margin-top:8px">${_escHtml(item.description)}</div>` : ''}<div class="draft-actions"><button class="btn btn-purple btn-sm" onclick="createDraftFromPlanSignal('${item.id}')">Pošalji u draftove</button><button class="btn btn-outline btn-sm" onclick="openEventById('${_escHtml(item.eventId || '')}')">Otvori događaj</button></div></div>`;
  }).join('');
}

function organizerStatusTag(draft) {
  const organizer = draft.organizerId ? getOrganizerById(draft.organizerId) : null;
  if (!organizer && draft.proposedOrganizerName) return '<span class="tag tag-amber">Predložen organizer</span>';
  if (!organizer) return '<span class="tag tag-gray">Nije povezan</span>';
  if (organizer.status === 'claimed') return '<span class="tag tag-green">Preuzet</span>';
  return '<span class="tag tag-amber">Organizer u pripremi</span>';
}

function _draftDetailRow(label, value) {
  if (!value) return '';
  return `<div class="draft-detail"><div class="draft-detail-label">${_escHtml(label)}</div><div class="draft-detail-value">${_escHtml(value)}</div></div>`;
}

function _normalizeAdminQuery(value = '') {
  return String(value || '').toLowerCase().trim();
}

function _draftMatchesAdminQuery(draft, query = '') {
  if (!query) return true;
  const haystack = [
    draft.title,
    draft.proposedOrganizerName,
    draft.proposedOrganizerInstagram,
    draft.city,
    draft.locationName,
    draft.sourceUrl,
    draft.submittedByLabel,
    draft.aiSummary,
    organizerLabel(draft)
  ].filter(Boolean).join(' \n ').toLowerCase();
  return haystack.includes(query);
}

function _organizerMatchesAdminQuery(organizer, query = '') {
  if (!query) return true;
  const haystack = [
    organizer.name,
    organizer.city,
    organizer.instagram,
    organizer.status
  ].filter(Boolean).join(' \n ').toLowerCase();
  return haystack.includes(query);
}

function possibleOrganizerMatches(draft) {
  const normalized = (draft.proposedOrganizerName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ig = (draft.proposedOrganizerInstagram || '').toLowerCase().replace(/^@+/, '');
  return ADMIN_ORGANIZERS.filter(org => {
    const orgName = (org.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const orgIg = (org.instagram || '').toLowerCase().replace(/^@+/, '');
    return (!!ig && orgIg === ig) || (!!normalized && (orgName === normalized || orgName.includes(normalized) || normalized.includes(orgName)));
  });
}

function possibleOrganizerMatchesForOrphanEvent(item) {
  const normalized = String(item?.organizerName || item?.locationName || item?.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const city = String(item?.city || '').trim().toLowerCase();
  return ADMIN_ORGANIZERS.filter(org => {
    if (!org || org.status === 'merged' || org.status === 'archived') return false;
    const orgName = String(org.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const orgCity = String(org.city || '').trim().toLowerCase();
    const nameMatch = !!(normalized && (orgName === normalized || orgName.includes(normalized) || normalized.includes(orgName)));
    const cityMatch = !city || !orgCity || orgCity === city;
    return nameMatch && cityMatch;
  }).slice(0, 3);
}

function _normalizeAdminEventDuplicateValue(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function _adminEventDayToken(value = '') {
  return value ? String(value).slice(0, 10) : '';
}

function possibleEventDuplicates(draft) {
  if (!draft) return [];
  const title = _normalizeAdminEventDuplicateValue(draft.title || '');
  const location = _normalizeAdminEventDuplicateValue(draft.locationName || '');
  const city = _normalizeAdminEventDuplicateValue(draft.city || '');
  const day = _adminEventDayToken(draft.startsAt || '');
  const organizerId = draft.organizerId || null;
  if (!title && !location && !day) return [];
  return _combinedEventCards().filter(item => {
    const raw = item.raw || {};
    const itemTitle = _normalizeAdminEventDuplicateValue(item.title || raw.title || '');
    const itemLocation = _normalizeAdminEventDuplicateValue(item.location_name || raw.location_name || '');
    const itemCity = _normalizeAdminEventDuplicateValue(raw.city || '');
    const itemDay = _adminEventDayToken(item.starts_at || raw.starts_at || item.date || '');
    const sameOrganizer = !!(organizerId && raw.organizer_id && raw.organizer_id === organizerId);
    const sameDay = !!(day && itemDay && day === itemDay);
    const similarTitle = !!(title && itemTitle && (itemTitle === title || itemTitle.includes(title) || title.includes(itemTitle)));
    const similarLocation = !!(location && itemLocation && (itemLocation === location || itemLocation.includes(location) || location.includes(itemLocation)));
    const sameCity = !!(city && itemCity && city === itemCity);
    return (sameOrganizer && sameDay) || (similarTitle && sameDay) || (similarTitle && similarLocation) || (similarTitle && sameCity && sameDay);
  }).slice(0, 3);
}

function possibleOrganizerDuplicates(organizer) {
  if (!organizer) return [];
  const normalized = (organizer.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ig = (organizer.instagram || '').toLowerCase().replace(/^@+/, '');
  return ADMIN_ORGANIZERS.filter(other => {
    if (other.id === organizer.id || other.status === 'merged' || other.status === 'archived') return false;
    const otherName = (other.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const otherIg = (other.instagram || '').toLowerCase().replace(/^@+/, '');
    return (!!ig && otherIg === ig) || (!!normalized && (otherName === normalized || otherName.includes(normalized) || normalized.includes(otherName)));
  });
}

function adminDraftTimeLabel(startsAt) {
  if (!startsAt) return 'Vreme nije uneto';
  const d = new Date(startsAt);
  return d.toLocaleString('sr-Latn', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

function _draftAgeDays(draft = {}) {
  const sourceDate = draft.createdAt || draft.updatedAt || draft.startsAt || null;
  if (!sourceDate) return 0;
  const parsed = new Date(sourceDate);
  if (Number.isNaN(parsed.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000));
}

function _isStaleDraft(draft = {}) {
  if (!draft || draft.reviewStatus !== 'pending') return false;
  const ageDays = _draftAgeDays(draft);
  if (ageDays >= 21) return true;
  if (draft.startsAt) {
    const starts = new Date(draft.startsAt);
    if (!Number.isNaN(starts.getTime()) && starts.getTime() < Date.now() - (7 * 86400000)) return true;
  }
  return false;
}

function cleanupAdminDrafts() {
  let cleanedDrafts = 0;
  EVENT_DRAFTS.forEach(draft => {
    if (_isStaleDraft(draft)) {
      draft.reviewStatus = 'rejected';
      draft.rejectedReason = 'stale_cleanup';
      cleanedDrafts += 1;
    }
  });
  let archivedGhosts = 0;
  ADMIN_ORGANIZERS.forEach(org => {
    if (org.status !== 'ghost') return;
    const hasPending = EVENT_DRAFTS.some(draft => draft.organizerId === org.id && draft.reviewStatus === 'pending');
    if (!hasPending) {
      org.status = 'archived';
      archivedGhosts += 1;
    }
  });
  _persistAdminDraftState();
  renderAdminDrafts();
  renderOrganizerReview();
  if (!cleanedDrafts && !archivedGhosts) {
    showToast('Nema zastarelih draftova za čišćenje', 'info', 1800);
    return;
  }
  showToast(`Počišćeno: ${cleanedDrafts} draftova, ${archivedGhosts} profila u pripremi`, 'success', 2200);
}

async function openAdminDrafts() {
  nav('admin-drafts', { noPageAnim: true, preserveScroll: true });
  await Promise.all([
    loadAdminOrganizersFromBackend({ silent: true }),
    loadAdminClaimRequestsFromBackend({ silent: true }),
    loadAdminDraftQueueFromBackend({ silent: true }),
    loadAdminOrphanPublishedEvents({ silent: true }),
      loadAdminPlanSignalsFromBackend({ silent: true })
  ]);
  renderAdminDrafts();
}
async function openOrganizerReview() {
  nav('admin-organizers', { noPageAnim: true, preserveScroll: true });
  await Promise.all([
    loadAdminOrganizersFromBackend({ silent: true }),
    loadAdminClaimRequestsFromBackend({ silent: true }),
    loadAdminDraftQueueFromBackend({ silent: true }),
    loadAdminOrphanPublishedEvents({ silent: true })
  ]);
  renderOrganizerReview();
}
function openModerationInbox() {
  nav('admin-moderation', { noPageAnim: true, preserveScroll: true });
  loadAdminModerationQueue();
}

function setModerationFilter(filter = 'all') {
  _moderationFilter = filter || 'all';
  renderAdminModerationInbox();
}

function _moderationMatchesQuery(item, query = '') {
  if (!query) return true;
  const haystack = [
    item.entity_type,
    item.reason,
    item.status,
    item.source_type,
    item.report_message,
    item.notes,
    item.created_by_username
  ].filter(Boolean).join(' \n ').toLowerCase();
  return haystack.includes(query);
}

function _moderationStatusTag(status = 'open') {
  if (status === 'reviewing') return '<span class="tag tag-purple">U obradi</span>';
  if (status === 'resolved') return '<span class="tag tag-green">Rešeno</span>';
  if (status === 'dismissed') return '<span class="tag tag-gray">Odbačeno</span>';
  return '<span class="tag tag-amber">Otvoreno</span>';
}

function _moderationEntityLabel(type = '') {
  const map = {
    user: 'Korisnik',
    event: 'Događaj',
    invite: 'Plan',
    chat_message: 'Poruka',
    organizer: 'Organizer',
    event_draft: 'Draft',
    claim_request: 'Preuzimanje profila',
    report: 'Prijava'
  };
  return map[type] || type || 'Slučaj';
}

function _moderationContextLabel(item = {}) {
  if (item.entity_type === 'report' && item.metadata?.category === 'bug_report') return 'Bag';
  return _moderationEntityLabel(item.entity_type);
}

function _moderationCanSoftHide(type = '') {
  return ['event', 'organizer', 'event_draft'].includes(type);
}

function _moderationNoteValue(itemId) {
  return document.getElementById(`moderation-note-${itemId}`)?.value.trim() || '';
}

async function loadAdminModerationQueue() {
  if (!isAdminUser()) {
    showToast('Samo admin ima pristup moderation inbox-u', 'error');
    return;
  }
  const list = document.getElementById('admin-moderation-list');
  if (list) list.innerHTML = '<div class="draft-empty">Učitavanje moderation inbox-a...</div>';
  if (!_isSupabaseConfigured()) {
    ADMIN_MODERATION_ITEMS = [];
    renderAdminModerationInbox();
    return;
  }
  try {
    const rows = await _supaGet('admin_moderation_queue', {
      select: '*',
      order: 'created_at.desc',
      limit: '100'
    });
    ADMIN_MODERATION_ITEMS = Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn('[mitmi] loadAdminModerationQueue:', e.message);
    showToast('Prijave i bagovi trenutno nisu dostupni', 'error');
  }
  renderAdminModerationInbox();
}

function renderAdminModerationInbox() {
  syncAdminUI();
  const list = document.getElementById('admin-moderation-list');
  if (!list) return;
  const query = _normalizeAdminQuery(document.getElementById('admin-moderation-search')?.value || '');
  const openCount = ADMIN_MODERATION_ITEMS.filter(item => item.status === 'open').length;
  const reviewingCount = ADMIN_MODERATION_ITEMS.filter(item => item.status === 'reviewing').length;
  const resolvedCount = ADMIN_MODERATION_ITEMS.filter(item => ['resolved', 'dismissed'].includes(item.status)).length;
  const openEl = document.getElementById('moderation-stat-open');
  const reviewingEl = document.getElementById('moderation-stat-reviewing');
  const resolvedEl = document.getElementById('moderation-stat-resolved');
  const badgeEl = document.getElementById('moderation-queue-badge');
  if (openEl) openEl.textContent = String(openCount);
  if (reviewingEl) reviewingEl.textContent = String(reviewingCount);
  if (resolvedEl) resolvedEl.textContent = String(resolvedCount);
  if (badgeEl) badgeEl.textContent = `${ADMIN_MODERATION_ITEMS.length} slučajeva`;
  if (!ADMIN_MODERATION_ITEMS.length) {
    list.innerHTML = '<div class="draft-empty">Još nema moderation slučajeva. Korisničke prijave će se pojaviti ovde.</div>';
    return;
  }
  const filtered = ADMIN_MODERATION_ITEMS
    .filter(item => _moderationFilter === 'all' ? true : item.status === _moderationFilter)
    .filter(item => _moderationMatchesQuery(item, query));
  if (!filtered.length) {
    list.innerHTML = '<div class="draft-empty">Nema rezultata za ovu pretragu ili filter.</div>';
    return;
  }
  list.innerHTML = filtered.map(item => {
    const title = `${_moderationContextLabel(item)} · ${item.reason || 'bez razloga'}`;
    const createdAt = item.created_at ? new Date(item.created_at).toLocaleString('sr-Latn', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : 'bez vremena';
    const message = item.report_message || item.notes || 'Nema dodatne poruke.';
    const sourceTag = item.metadata?.category === 'bug_report'
      ? '<span class="tag tag-purple">Bug</span>'
      : (item.source_type === 'user' ? '<span class="tag tag-gold">User</span>' : item.source_type === 'admin' ? '<span class="tag tag-outline">Admin</span>' : '<span class="tag tag-purple">System</span>');
    const authorLabel = item.created_by_username || (item.metadata?.context_type === 'issue' ? 'bag report' : 'bez autora');
    return `<div class="moderation-card">
      <div class="moderation-card-head">
        <div style="flex:1;min-width:0">
          <div class="moderation-title">${_escHtml(title)}</div>
          <div class="moderation-meta">${_escHtml(createdAt)} · ${_escHtml(authorLabel)} · #${_escHtml(item.entity_id || '')}</div>
        </div>
        <div class="draft-chip-row" style="justify-content:flex-end">${sourceTag}${_moderationStatusTag(item.status)}</div>
      </div>
      <div class="draft-detail-grid">
        ${_draftDetailRow('Tip', _moderationContextLabel(item))}
        ${_draftDetailRow('Prioritet', item.priority != null ? String(item.priority) : '')}
        ${_draftDetailRow('Izvor', item.source_type || '')}
        ${_draftDetailRow('Status', item.status || '')}
      </div>
      <div class="draft-note"><strong>Poruka:</strong> ${_escHtml(message)}</div>
      <textarea class="form-textarea moderation-note-input" id="moderation-note-${item.id}" placeholder="Dodaj admin belešku...">${_escHtml(item.notes || '')}</textarea>
      <div class="draft-actions" style="margin-top:10px">
        <button class="btn btn-outline btn-sm" onclick="assignModerationToMe('${item.id}')">U obradi</button>
        <button class="btn btn-purple btn-sm" onclick="resolveModerationItemUI('${item.id}','resolved')">Rešeno</button>
        <button class="btn btn-outline btn-sm" onclick="resolveModerationItemUI('${item.id}','dismissed')">Odbaci</button>
        ${_moderationCanSoftHide(item.entity_type) ? `<button class="btn btn-danger btn-sm" onclick="softHideModerationEntityUI('${item.id}','${item.entity_type}','${item.entity_id}')">Sakrij</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function assignModerationToMe(itemId) {
  if (!_isSupabaseConfigured() || !itemId) return;
  try {
    await _supaFetch(`/rest/v1/moderation_items?id=eq.${itemId}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        status: 'reviewing',
        assigned_to: getUser()?.id,
        notes: _moderationNoteValue(itemId) || null
      })
    });
    showToast('Slučaj je označen kao u obradi', 'success', 1600);
    await loadAdminModerationQueue();
  } catch (e) {
    console.warn('[mitmi] assignModerationToMe:', e.message);
    showToast('Ova akcija trenutno nije uspela', 'error');
  }
}

async function resolveModerationItemUI(itemId, status = 'resolved') {
  if (!_isSupabaseConfigured() || !itemId) return;
  try {
    await _supaFetch('/rest/v1/rpc/resolve_moderation_item', {
      method: 'POST',
      body: JSON.stringify({
        p_item_id: itemId,
        p_status: status,
        p_note: _moderationNoteValue(itemId) || null
      })
    });
    showToast(status === 'dismissed' ? 'Prijava je odbačena' : 'Slučaj je rešen', 'success', 1600);
    await loadAdminModerationQueue();
  } catch (e) {
    console.warn('[mitmi] resolveModerationItemUI:', e.message);
    showToast('Promena statusa nije uspela', 'error');
  }
}

async function softHideModerationEntityUI(itemId, entityType, entityId) {
  if (!_isSupabaseConfigured() || !itemId || !entityType || !entityId) return;
  const note = _moderationNoteValue(itemId) || 'Sakriveno kroz moderation inbox';
  try {
    await _supaFetch('/rest/v1/rpc/soft_hide_entity', {
      method: 'POST',
      body: JSON.stringify({
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_reason: note
      })
    });
    await _supaFetch('/rest/v1/rpc/resolve_moderation_item', {
      method: 'POST',
      body: JSON.stringify({
        p_item_id: itemId,
        p_status: 'resolved',
        p_note: note
      })
    });
    showToast('Sadržaj je sakriven i slučaj je zatvoren', 'success', 1800);
    await loadAdminModerationQueue();
  } catch (e) {
    console.warn('[mitmi] softHideModerationEntityUI:', e.message);
    showToast('Sakrivanje trenutno nije uspelo', 'error');
  }
}

async function shareMyProfile() {
  const shareUrl = window.location.href.split('#')[0] + '#profile';
  try {
    if (navigator.share) {
      await navigator.share({ title: 'mitmi profil', url: shareUrl });
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link profila je kopiran', 'success', 1500);
      return;
    }
  } catch (e) {
    console.warn('[mitmi] shareMyProfile:', e.message);
  }
  showToast('Podela nije dostupna na ovom uredjaju', 'info', 1800);
}

function isEventFollowed(data) {
  const key = eventKeyFromData(data);
  return FOLLOWED_EVENTS.some(item => eventKeyFromData(item) === key);
}

async function loadFollowedEvents() {
  if (!isLoggedIn() || !_isSupabaseConfigured()) {
    renderSavedEvents();
    return FOLLOWED_EVENTS;
  }
  try {
    const rows = await _supaGet('event_follows', {
      select: 'event_id,events(id,creator_id,title,description,category,city,location_name,starts_at,capacity,attendee_count,is_published,is_cancelled,created_at)',
      user_id: `eq.${getUser()?.id}`,
      order: 'created_at.desc',
      limit: '200'
    });
    FOLLOWED_EVENTS = Array.isArray(rows)
      ? rows
          .map(row => row.events)
          .filter(Boolean)
          .map(_mapDbEventToCard)
      : [];
  } catch (e) {
    console.warn('[mitmi] loadFollowedEvents:', e.message);
  }
  renderSavedEvents();
  return FOLLOWED_EVENTS;
}

async function followEvent(data, opts = {}) {
  if (!data) return;
  if (isEventFollowed(data)) {
    if (!opts.silent) showToast('Vec pratis ovaj dogadjaj', 'info', 1400);
    return;
  }
  const mapped = {
    id: data.id || '',
    title:data.title || 'Dogadjaj',
    meta:data.meta || '',
    dayOffset:data.dayOffset ?? 0,
    date:data.date || _dateFromOffset(data.dayOffset || 0),
    cat:data.cat || 'kultura',
    bg:data.bg || 'ev-img-b',
    spots:data.spots || '',
    urgent:!!data.urgent,
    cover_url: data.cover_url || ''
  };
  try {
    if (_isSupabaseConfigured() && data.id) {
      await _supaFetch('/rest/v1/event_follows', {
        method: 'POST',
        body: JSON.stringify({
          user_id: getUser()?.id,
          event_id: data.id
        })
      });
    }
  } catch (e) {
    console.warn('[mitmi] followEvent:', e.message);
  }
  FOLLOWED_EVENTS.unshift(mapped);
  renderSavedEvents();
  if (!opts.silent) showToast('Dogadjaj je sacuvan', 'success', 1500);
}

async function unfollowEventByKey(key) {
  const existing = FOLLOWED_EVENTS.find(item => eventKeyFromData(item) === key);
  try {
    if (_isSupabaseConfigured() && existing?.id) {
      await _supaFetch(`/rest/v1/event_follows?user_id=eq.${getUser()?.id}&event_id=eq.${existing.id}`, {
        method: 'DELETE'
      });
    }
  } catch (e) {
    console.warn('[mitmi] unfollowEventByKey:', e.message);
  }
  FOLLOWED_EVENTS = FOLLOWED_EVENTS.filter(item => eventKeyFromData(item) !== key);
  renderSavedEvents();
  showToast('Dogadjaj je uklonjen iz sacuvanih', 'info', 1400);
}

function renderSavedEvents() {
  const box = document.getElementById('saved-events-list');
  const count = document.getElementById('saved-events-count');
  if (count) count.textContent = String(FOLLOWED_EVENTS.length);
  if (!box) return;
  if (!FOLLOWED_EVENTS.length) {
    box.innerHTML = '<div class="draft-empty">Ovde ce ti stajati dogadjaji koje pratis.</div>';
    return;
  }
  box.innerHTML = FOLLOWED_EVENTS.map(ev => {
    const key = eventKeyFromData(ev).replace(/'/g, "\\'");
    const date = ev.date || _dateFromOffset(ev.dayOffset || 0);
    const coverStyle = ev.cover_url ? ` style="background-image:url('${_safeCssUrl(ev.cover_url)}');background-size:cover;background-position:center;color:transparent"` : '';
    return `<div class="ev-row" onclick="openEventById('${_escHtml(ev.id || '')}')"><div class="ev-row-img ${ev.bg || 'ev-img-b'}"${coverStyle}>${ev.cover_url ? '•' : (CAT_EMOJI[ev.cat] || '🎫')}</div><div style="flex:1;min-width:0"><div class="ev-row-title">${ev.title}</div><div class="ev-row-meta">${dateLabel(date)} · ${ev.meta || 'Detalji nisu upisani'}</div></div><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();unfollowEventByKey('${key}')">Otprati</button></div>`;
  }).join('');
}

async function followCurrentSwipeEvent() {
  const current = _getSwipeData()[swipeIdx] || _getSwipeData()[0];
  await followEvent(current);
  const btn = document.getElementById('tt-follow-btn');
  if (btn) btn.textContent = isEventFollowed(current) ? 'Pratis' : 'Prati';
  if (_currentEventId && current?.id === _currentEventId) renderEventDetail(current);
}

function _currentSwipeEvent() {
  return _getSwipeData()[swipeIdx] || _getSwipeData()[0] || null;
}

async function createGhostOrganizerForDraft(draftId) {
  const draft = EVENT_DRAFTS.find(item => item.id === draftId);
  if (!draft) return;
  if (_isBackendDraft(draft) && _isSupabaseConfigured()) {
    try {
      const existing = possibleOrganizerMatches(draft)[0];
      if (existing) {
        await connectDraftToOrganizer(draftId, existing.id);
        return;
      }
      const orgRows = await _supaFetch('/rest/v1/organizers', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          name: draft.proposedOrganizerName || 'Organizer u pripremi',
          city: draft.city || '',
          instagram_handle: (draft.proposedOrganizerInstagram || '').replace(/^@+/, '') || null,
          status: 'unclaimed',
          created_by: getUser()?.id || null,
          updated_by: getUser()?.id || null
        })
      });
      const created = Array.isArray(orgRows) ? orgRows[0] : null;
      if (!created?.id) throw new Error('Organizer create failed');
      await _supaFetch(`/rest/v1/event_drafts?id=eq.${draftId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          organizer_id: created.id,
          admin_notes: draft.adminNotes || 'Organizer u pripremi je kreiran iz admin draft toka.'
        })
      });
      await Promise.all([
        loadAdminOrganizersFromBackend({ silent: true }),
        loadAdminDraftQueueFromBackend({ silent: true })
      ]);
      renderAdminDrafts();
      renderOrganizerReview();
      showToast('Organizer u pripremi je kreiran', 'success');
      return;
    } catch (e) {
      console.warn('[mitmi] createGhostOrganizerForDraft:', e.message);
      showToast('Organizer trenutno nije moguće kreirati', 'error');
      return;
    }
  }
  const existing = possibleOrganizerMatches(draft)[0];
  if (existing) {
    draft.organizerId = existing.id;
    showToast('Draft je povezan sa postojećim organizerom', 'success');
    renderAdminDrafts();
    renderOrganizerReview();
    return;
  }
  const newId = 'org-' + (ADMIN_ORGANIZERS.length + 1);
  ADMIN_ORGANIZERS.unshift({ id:newId, name:draft.proposedOrganizerName || 'Organizer u pripremi', city:draft.city || '', instagram:(draft.proposedOrganizerInstagram || '').replace(/^@+/, ''), status:'ghost' });
  draft.organizerId = newId;
  _persistAdminDraftState();
  showToast('Organizer u pripremi je kreiran', 'success');
  renderAdminDrafts();
  renderOrganizerReview();
}

async function connectPublishedEventToOrganizer(eventId, organizerId) {
  if (!eventId || !organizerId || !_isSupabaseConfigured()) return;
  try {
    await _supaFetch(`/rest/v1/events?id=eq.${eventId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        organizer_id: organizerId
      })
    });
    await Promise.all([
      loadAdminOrphanPublishedEvents({ silent: true }),
      typeof loadRealEvents === 'function' ? loadRealEvents() : Promise.resolve(),
      typeof loadMyProfile === 'function' ? loadMyProfile() : Promise.resolve()
    ]);
    renderOrganizerReview();
    showToast('Događaj je povezan sa organizer profilom', 'success', 1800);
  } catch (e) {
    console.warn('[mitmi] connectPublishedEventToOrganizer:', e.message);
    showToast('Povezivanje događaja trenutno nije uspelo', 'error');
  }
}

function _orphanOrganizerMatchReason(item = {}, match = {}) {
  const itemName = _normalizeAdminQuery(item.organizerName || item.locationName || item.title || '');
  const matchName = _normalizeAdminQuery(match.name || '');
  const sameName = !!itemName && !!matchName && itemName === matchName;
  const itemCity = _normalizeAdminQuery(item.city || '');
  const matchCity = _normalizeAdminQuery(match.city || '');
  const sameCity = !!itemCity && !!matchCity && itemCity === matchCity;
  if (sameName && sameCity) return 'Isto ime i isti grad';
  if (sameName) return 'Poklapanje imena';
  if (sameCity) return 'Isti grad';
  return 'Slično poklapanje';
}

async function createGhostOrganizerForPublishedEvent(eventId) {
  const item = ADMIN_ORPHAN_EVENTS.find(entry => entry.id === eventId);
  if (!item || !_isSupabaseConfigured()) return;
  try {
    const existing = possibleOrganizerMatchesForOrphanEvent(item)[0];
    if (existing?.id) {
      await connectPublishedEventToOrganizer(eventId, existing.id);
      return;
    }
    const orgRows = await _supaFetch('/rest/v1/organizers', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name: item.organizerName || item.locationName || item.title || 'Organizer u pripremi',
        city: item.city || '',
        status: 'unclaimed',
        created_by: getUser()?.id || null,
        updated_by: getUser()?.id || null
      })
    });
    const created = Array.isArray(orgRows) ? orgRows[0] : null;
    if (!created?.id) throw new Error('Organizer create failed');
    await Promise.all([
      connectPublishedEventToOrganizer(eventId, created.id),
      loadAdminOrganizersFromBackend({ silent: true })
    ]);
    renderOrganizerReview();
    showToast('Organizer u pripremi je kreiran i povezan sa događajem', 'success', 2200);
  } catch (e) {
    console.warn('[mitmi] createGhostOrganizerForPublishedEvent:', e.message);
    showToast('Organizer trenutno nije moguće kreirati za ovaj događaj', 'error');
  }
}

async function connectDraftToOrganizer(draftId, organizerId) {
  const draft = EVENT_DRAFTS.find(item => item.id === draftId);
  if (!draft) return;
  if (_isBackendDraft(draft) && _isSupabaseConfigured()) {
    try {
      await _supaFetch(`/rest/v1/event_drafts?id=eq.${draftId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          organizer_id: organizerId,
          reviewed_by: isAdminUser() ? getUser()?.id || null : null
        })
      });
      await loadAdminDraftQueueFromBackend({ silent: true });
      renderAdminDrafts();
      renderOrganizerReview();
      showToast('Organizer je povezan sa draftom', 'success', 1400);
      return;
    } catch (e) {
      console.warn('[mitmi] connectDraftToOrganizer:', e.message);
      showToast('Povezivanje trenutno nije uspelo', 'error');
      return;
    }
  }
  draft.organizerId = organizerId;
  _persistAdminDraftState();
  showToast('Organizer je povezan sa draftom', 'success', 1400);
  renderAdminDrafts();
  renderOrganizerReview();
}

async function approveDraft(draftId) {
  const draft = EVENT_DRAFTS.find(item => item.id === draftId);
  if (!draft) return;
  const duplicateCandidates = possibleEventDuplicates(draft);
  if (duplicateCandidates.length) {
    const duplicateSummary = duplicateCandidates
      .map(item => `• ${item.title || 'Događaj'}${item.meta ? ` (${item.meta})` : ''}`)
      .join('\n');
    const shouldContinue = window.confirm(
      `Već postoje slični događaji:\n\n${duplicateSummary}\n\nKlikni OK samo ako želiš da ipak objaviš ovaj događaj kao poseban unos.`
    );
    if (!shouldContinue) return;
  }
  if (_isBackendDraft(draft) && _isSupabaseConfigured()) {
    try {
      if (!draft.organizerId && draft.proposedOrganizerName) {
        await createGhostOrganizerForDraft(draftId);
      }
      await _supaFetch('/rest/v1/rpc/approve_event_draft', {
        method: 'POST',
        body: JSON.stringify({
          p_draft_id: draftId,
          p_publish: true
        })
      });
      await loadAdminDraftQueueFromBackend({ silent: true });
      if (typeof loadRealEvents === 'function') {
        await loadRealEvents();
      }
      renderAdminDrafts();
      renderOrganizerReview();
      renderUskoroStrip();
      if (typeof renderBrowseHomeStrip === 'function') renderBrowseHomeStrip();
      showToast('Draft je odobren i objavljen', 'success');
      return;
    } catch (e) {
      console.warn('[mitmi] approveDraft:', e.message);
      showToast('Odobravanje drafta trenutno nije uspelo', 'error');
      return;
    }
  }
  if (!draft.organizerId && draft.proposedOrganizerName) createGhostOrganizerForDraft(draftId);
  draft.reviewStatus = 'approved';
  _persistAdminDraftState();
  _replaceRealEventCard({
    id: `admin-draft-${draft.id}`,
    title: draft.title || 'Odobren događaj',
    meta: `${adminDraftTimeLabel(draft.startsAt)} · ${draft.locationName || draft.city || 'Lokacija nije upisana'}`,
    date: draft.startsAt ? String(draft.startsAt).slice(0, 10) : '',
    starts_at: draft.startsAt || '',
    cat: _eventVisualCategory(draft.category || 'kultura'),
    bg: _eventBg(draft.category || 'kultura'),
    cover_url: '',
    spots: '',
    urgent: false,
    location_name: draft.locationName || draft.city || '',
    raw: {
      id: `admin-draft-${draft.id}`,
      title: draft.title || 'Odobren događaj',
      starts_at: draft.startsAt || '',
      category: draft.category || 'kultura',
      location_name: draft.locationName || '',
      city: draft.city || '',
      organizer_id: draft.organizerId || null
    }
  });
  renderAdminDrafts();
  renderOrganizerReview();
  renderUskoroStrip();
  if (typeof renderBrowseHomeStrip === 'function') renderBrowseHomeStrip();
  showToast('Draft je odobren i dodat u prikaz događaja', 'success');
}

async function rejectDraft(draftId) {
  const draft = EVENT_DRAFTS.find(item => item.id === draftId);
  if (!draft) return;
  if (_isBackendDraft(draft) && _isSupabaseConfigured()) {
    try {
      await _supaFetch(`/rest/v1/event_drafts?id=eq.${draftId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          review_status: 'rejected',
          reviewed_by: getUser()?.id || null,
          reviewed_at: new Date().toISOString()
        })
      });
      await loadAdminDraftQueueFromBackend({ silent: true });
      renderAdminDrafts();
      showToast('Draft je odbijen', 'info', 1400);
      return;
    } catch (e) {
      console.warn('[mitmi] rejectDraft:', e.message);
      showToast('Odbijanje drafta trenutno nije uspelo', 'error');
      return;
    }
  }
  draft.reviewStatus = 'rejected';
  _persistAdminDraftState();
  renderAdminDrafts();
  showToast('Draft je odbijen', 'info', 1400);
}

async function simulateAiImport() {
  const urlEl = document.getElementById('ai-import-url');
  const organizerEl = document.getElementById('ai-import-organizer');
  const sourceUrl = urlEl?.value.trim();
  const organizerHint = organizerEl?.value.trim();
  if (!sourceUrl) { showToast('Prvo nalepi link događaja', 'error'); return; }
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch (e) {
    showToast('Link nije ispravan', 'error');
    return;
  }
  const host = (parsed.hostname || '').replace(/^www\./, '').toLowerCase();
  const pathParts = parsed.pathname.split('/').filter(Boolean);
  const isInstagram = host.includes('instagram.com');
  const igHandle = isInstagram && pathParts[0] && !['p', 'reel', 'reels', 'tv', 'stories', 'explore'].includes(pathParts[0].toLowerCase())
    ? pathParts[0].replace(/^@+/, '')
    : '';
  const igPostType = isInstagram && ['p', 'reel', 'reels', 'tv'].includes((pathParts[0] || '').toLowerCase())
    ? pathParts[0].toLowerCase()
    : '';
  const organizerHandle = organizerHint ? organizerHint.replace(/^@+/, '') : igHandle;
  const inferredName = organizerHint
    || (organizerHandle ? `@${organizerHandle}` : (isInstagram ? 'Instagram organizer' : host.replace(/\.[a-z.]+$/i, '')));
  const draftTitle = isInstagram
    ? (igPostType ? `Instagram ${igPostType} draft` : 'Instagram event draft')
    : `Draft sa linka: ${host || 'spoljni izvor'}`;
  const draftSummary = isInstagram
    ? 'Instagram link je prepoznat, ali naslov, vreme i lokacija nisu pouzdano izvučeni iz objave. Pre objave ručno proveri sve podatke.'
    : 'Link je pretvoren u draft za pregled. Pre objave ručno proveri naslov, vreme, lokaciju i organizer podatke.';
  const draftLocation = isInstagram
    ? 'Ručno dodaj lokaciju iz objave'
    : 'Ručno dodaj lokaciju';
  const payload = {
    source_type: 'ai',
    review_status: 'pending',
    title: draftTitle,
    category: host.includes('ticket') || host.includes('residentadvisor') ? 'muzika' : 'kultura',
    city: '',
    starts_at: null,
    location_name: draftLocation,
    source_url: sourceUrl,
    source_label: host || 'spoljni_izvor',
    organizer_id: null,
    proposed_organizer_name: inferredName,
    proposed_organizer_instagram: organizerHandle.toLowerCase(),
    ai_confidence: isInstagram ? 0.42 : 0.56,
    ai_summary: draftSummary,
    submitted_by: getUser()?.id || null
  };
  if (!_isSupabaseConfigured()) {
    showToast('AI import trenutno nije dostupan bez povezane baze', 'error', 2400);
    return;
  }
  try {
    await _supaFetch('/rest/v1/event_drafts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (urlEl) urlEl.value = '';
    if (organizerEl) organizerEl.value = '';
    await Promise.all([
      loadAdminOrganizersFromBackend({ silent: true }),
      loadAdminDraftQueueFromBackend({ silent: true })
    ]);
    renderAdminDrafts();
    showToast('Draft je generisan za ručnu proveru', 'success');
  } catch (e) {
    console.warn('[mitmi] simulateAiImport:', e.message);
    showToast('AI draft trenutno nije sačuvan. Proveri bazu i pokušaj ponovo.', 'error', 2400);
  }
}

function renderAdminDrafts() {
  syncAdminUI();
  renderAdminPlanSignals();
  const list = document.getElementById('admin-draft-list');
  if (!list) return;
  const query = _normalizeAdminQuery(document.getElementById('admin-draft-search')?.value || '');
  const pending = EVENT_DRAFTS.filter(item => item.reviewStatus === 'pending');
  const visibleDrafts = pending.filter(draft => _draftMatchesAdminQuery(draft, query));
  const aiCount = EVENT_DRAFTS.filter(item => item.sourceType === 'ai' && item.reviewStatus === 'pending').length;
  const ghostCount = ADMIN_ORGANIZERS.filter(item => item.status === 'ghost').length;
  const staleCount = pending.filter(_isStaleDraft).length;
  const pendingEl = document.getElementById('admin-stat-pending');
  const aiEl = document.getElementById('admin-stat-ai');
  const ghostEl = document.getElementById('admin-stat-ghost');
  const staleEl = document.getElementById('admin-stat-stale');
  const badgeEl = document.getElementById('admin-queue-badge');
  if (pendingEl) pendingEl.textContent = String(pending.length);
  if (aiEl) aiEl.textContent = String(aiCount);
  if (ghostEl) ghostEl.textContent = String(ghostCount);
  if (staleEl) staleEl.textContent = String(staleCount);
  if (badgeEl) badgeEl.textContent = `${pending.length} draftova`;
  if (!pending.length) { list.innerHTML = '<div class="draft-empty">Nema draftova na čekanju. Novi AI importi i korisničke prijave će se pojaviti ovde.</div>'; return; }
  if (!visibleDrafts.length) { list.innerHTML = '<div class="draft-empty">Nema rezultata za ovu pretragu. Probaj naziv događaja, organizer, grad ili submitter ime.</div>'; return; }
  list.innerHTML = visibleDrafts.map(draft => {
    const matches = !draft.organizerId ? possibleOrganizerMatches(draft).slice(0, 2) : [];
    const duplicateEvents = possibleEventDuplicates(draft);
    const conf = draft.aiConfidence != null ? `<span class="tag tag-purple">AI ${(draft.aiConfidence * 100).toFixed(0)}%</span>` : '';
    const sourceTag = draft.sourceType === 'ai' ? '<span class="tag tag-purple">AI</span>' : draft.sourceType === 'user' ? '<span class="tag tag-gold">User</span>' : '<span class="tag tag-gray">Manual</span>';
    const staleTag = _isStaleDraft(draft) ? '<span class="tag tag-amber">Zastareo</span>' : '';
    const matchHtml = matches.map(match => `<div class="draft-match"><div><div style="font-size:13px;font-weight:700;color:var(--ink)">${match.name}</div><div class="admin-mini">${match.city || 'Grad nije unet'}${match.instagram ? ' · @' + match.instagram : ''}</div></div><button class="btn btn-outline btn-sm" onclick="connectDraftToOrganizer('${draft.id}','${match.id}')">Poveži</button></div>`).join('');
    const duplicateHtml = duplicateEvents.map(item => `<div class="draft-match"><div><div style="font-size:13px;font-weight:700;color:var(--ink)">${_escHtml(item.title || 'Događaj')}</div><div class="admin-mini">${_escHtml(item.meta || item.location_name || 'Detalji nisu upisani')}</div></div><button class="btn btn-outline btn-sm" onclick="openEventById('${_escHtml(item.id || '')}')">Otvori</button></div>`).join('');
    const draftDetails = [
      _draftDetailRow('Predloženi organizer', draft.proposedOrganizerName || ''),
      _draftDetailRow('Instagram', draft.proposedOrganizerInstagram ? `@${String(draft.proposedOrganizerInstagram).replace(/^@+/, '')}` : ''),
      _draftDetailRow('Grad', draft.city || ''),
      _draftDetailRow('Lokacija', draft.locationName || ''),
      _draftDetailRow('Vreme', draft.startsAt ? adminDraftTimeLabel(draft.startsAt) : ''),
      _draftDetailRow('Izvor', draft.sourceUrl || '')
    ].filter(Boolean).join('');
    const detailsHtml = draftDetails ? `<div class="draft-detail-grid">${draftDetails}</div>` : '';
    const noteTitle = draft.sourceType === 'user' ? 'Napomena korisnika' : 'Sažetak';
    const noteBody = draft.aiSummary || 'Još nema kratkog opisa.';
    return `<div class="draft-card"><div class="draft-top"><div style="flex:1;min-width:0"><div class="draft-title">${draft.title}</div><div class="draft-meta">${adminDraftTimeLabel(draft.startsAt)} · ${draft.locationName || draft.city || 'Lokacija nije upisana'}</div></div><div class="draft-chip-row" style="justify-content:flex-end">${sourceTag}${conf}${staleTag}</div></div><div class="draft-chip-row"><span class="tag tag-outline">${draft.category || 'nekategorisano'}</span><span class="tag tag-outline">${organizerLabel(draft)}</span>${organizerStatusTag(draft)}${duplicateEvents.length ? '<span class="tag tag-amber">Mogući duplikat</span>' : ''}</div>${detailsHtml}<div class="draft-note"><strong>${noteTitle}:</strong> ${_escHtml(noteBody)}</div>${matchHtml ? `<div style="margin-top:8px"><div class="admin-mini" style="margin-bottom:6px">Moguća poklapanja organizera</div>${matchHtml}</div>` : ''}${duplicateHtml ? `<div style="margin-top:8px"><div class="admin-mini" style="margin-bottom:6px">Slični događaji</div>${duplicateHtml}</div>` : ''}<div class="draft-actions"><button class="btn btn-purple btn-sm" onclick="approveDraft('${draft.id}')">${duplicateEvents.length ? 'Ipak objavi' : 'Odobri'}</button><button class="btn btn-outline btn-sm" onclick="createGhostOrganizerForDraft('${draft.id}')">${draft.organizerId ? 'Osveži organizera' : 'Kreiraj organizer profil'}</button><button class="btn btn-danger btn-sm" onclick="rejectDraft('${draft.id}')">Odbij</button></div><div class="admin-mini" style="margin-top:10px">Poslao/la: ${draft.submittedByLabel || 'Nepoznato'} · starost drafta: ${_draftAgeDays(draft)} dana</div></div>`;
  }).join('');
}

async function markOrganizerClaimed(organizerId) {
  const organizer = getOrganizerById(organizerId);
  if (!organizer) return;
  if (_isBackendOrganizer(organizer) && _isSupabaseConfigured()) {
    try {
      await _supaFetch(`/rest/v1/organizers?id=eq.${organizerId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'claimed',
          updated_by: getUser()?.id || null
        })
      });
      await Promise.all([
        loadAdminOrganizersFromBackend({ silent: true }),
        loadAdminDraftQueueFromBackend({ silent: true })
      ]);
      renderAdminDrafts();
      renderOrganizerReview();
      showToast('Organizer je označen kao preuzet', 'success', 1400);
      return;
    } catch (e) {
      console.warn('[mitmi] markOrganizerClaimed:', e.message);
      showToast('Organizer trenutno nije moguće označiti kao preuzet', 'error');
      return;
    }
  }
  organizer.status = 'claimed';
  _persistAdminDraftState();
  showToast('Organizer je označen kao preuzet', 'success', 1400);
  renderAdminDrafts();
  renderOrganizerReview();
}

async function archiveOrganizer(organizerId) {
  const organizer = getOrganizerById(organizerId);
  if (!organizer) return;
  if (_isBackendOrganizer(organizer) && _isSupabaseConfigured()) {
    try {
      await _supaFetch(`/rest/v1/organizers?id=eq.${organizerId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'archived',
          updated_by: getUser()?.id || null
        })
      });
      await Promise.all([
        loadAdminOrganizersFromBackend({ silent: true }),
        loadAdminDraftQueueFromBackend({ silent: true })
      ]);
      renderAdminDrafts();
      renderOrganizerReview();
      showToast('Organizer je arhiviran', 'info', 1400);
      return;
    } catch (e) {
      console.warn('[mitmi] archiveOrganizer:', e.message);
      showToast('Organizer trenutno nije moguće arhivirati', 'error');
      return;
    }
  }
  organizer.status = 'archived';
  EVENT_DRAFTS.forEach(draft => { if (draft.organizerId === organizerId) draft.organizerId = null; });
  _persistAdminDraftState();
  showToast('Organizer je arhiviran', 'info', 1400);
  renderAdminDrafts();
  renderOrganizerReview();
}

async function mergeOrganizerInto(fromId, intoId) {
  if (fromId === intoId) return;
  const from = getOrganizerById(fromId);
  const into = getOrganizerById(intoId);
  if (!from || !into) return;
  if ((_isBackendOrganizer(from) || _isBackendOrganizer(into)) && _isSupabaseConfigured()) {
    try {
      await _supaFetch('/rest/v1/rpc/merge_organizers', {
        method: 'POST',
        body: JSON.stringify({
          p_from_organizer_id: fromId,
          p_into_organizer_id: intoId
        })
      });
      await Promise.all([
        loadAdminOrganizersFromBackend({ silent: true }),
        loadAdminDraftQueueFromBackend({ silent: true })
      ]);
      renderAdminDrafts();
      renderOrganizerReview();
      showToast(`Spojeno u organizer profil ${into.name}`, 'success');
      return;
    } catch (e) {
      console.warn('[mitmi] mergeOrganizerInto:', e.message);
      showToast('Spajanje organizer profila trenutno nije uspelo', 'error');
      return;
    }
  }
  EVENT_DRAFTS.forEach(draft => { if (draft.organizerId === fromId) draft.organizerId = intoId; });
  from.status = 'merged';
  from.mergedIntoId = intoId;
  _persistAdminDraftState();
  showToast(`Spojeno u organizer profil ${into.name}`, 'success');
  renderAdminDrafts();
  renderOrganizerReview();
}

function renderOrganizerReview() {
  syncAdminUI();
  const list = document.getElementById('organizer-review-list');
  const claimList = document.getElementById('organizer-claim-list');
  const orphanList = document.getElementById('organizer-orphan-event-list');
  if (!list) return;
  const query = _normalizeAdminQuery(document.getElementById('admin-organizer-search')?.value || '');
  const visible = ADMIN_ORGANIZERS.filter(item => item.status !== 'archived');
  const filteredVisible = visible.filter(item => _organizerMatchesAdminQuery(item, query));
  const ghosts = visible.filter(item => item.status === 'ghost');
  const claimed = visible.filter(item => item.status === 'claimed');
  const dupCount = ghosts.filter(item => possibleOrganizerDuplicates(item).length > 0).length;
  const ghostStat = document.getElementById('organizer-stat-ghost');
  const claimedStat = document.getElementById('organizer-stat-claimed');
  const dupStat = document.getElementById('organizer-stat-duplicates');
  const claimsStat = document.getElementById('organizer-stat-claims');
  const orphanStat = document.getElementById('organizer-stat-orphans');
  if (ghostStat) ghostStat.textContent = String(ghosts.length);
  if (claimedStat) claimedStat.textContent = String(claimed.length);
  if (dupStat) dupStat.textContent = String(dupCount);
  if (claimsStat) claimsStat.textContent = String(ADMIN_CLAIM_REQUESTS.length);
  if (orphanStat) orphanStat.textContent = String(ADMIN_ORPHAN_EVENTS.length);
  if (orphanList) {
    orphanList.innerHTML = !ADMIN_ORPHAN_EVENTS.length
      ? '<div class="draft-empty">Trenutno nema objavljenih događaja bez organizer profila.</div>'
      : ADMIN_ORPHAN_EVENTS.map(item => {
          const matches = possibleOrganizerMatchesForOrphanEvent(item);
          const matchHtml = matches.length
            ? `<div style="margin-top:8px"><div class="admin-mini" style="margin-bottom:6px">Moguća poklapanja organizera</div>${matches.map(match => `<div class="draft-match"><div><div style="font-size:13px;font-weight:700;color:var(--ink)">${_escHtml(match.name)}</div><div class="admin-mini">${_escHtml(match.city || 'Grad nije unet')}${match.instagram ? ' · @' + _escHtml(match.instagram) : ''}</div><div class="admin-mini" style="margin-top:4px;color:var(--purple3)">${_escHtml(_orphanOrganizerMatchReason(item, match))}</div></div><button class="btn btn-outline btn-sm" onclick="connectPublishedEventToOrganizer('${item.id}','${match.id}')">Poveži</button></div>`).join('')}</div>`
            : '';
          return `<div class="organizer-card"><div class="organizer-head"><div><div class="organizer-name">${_escHtml(item.organizerName || item.title)}</div><div class="organizer-meta">${_escHtml(item.city || 'Grad nije unet')}${item.locationName ? ' · ' + _escHtml(item.locationName) : ''}</div></div><span class="tag tag-amber">Bez organizera</span></div><div class="draft-note"><strong>Događaj:</strong> ${_escHtml(item.title)}</div>${item.creatorName ? `<div class="draft-note" style="margin-top:8px"><strong>Objavio/la:</strong> ${_escHtml(item.creatorName)}</div>` : ''}<div class="draft-note" style="margin-top:8px"><strong>Termin:</strong> ${_escHtml(item.startsAt ? adminDraftTimeLabel(item.startsAt) : 'Termin nije upisan')}</div>${matchHtml}<div class="organizer-actions"><button class="btn btn-purple btn-sm" onclick="createGhostOrganizerForPublishedEvent('${item.id}')">Kreiraj organizer profil</button><button class="btn btn-outline btn-sm" onclick="openEventById('${_escHtml(item.id)}')">Otvori događaj</button></div></div>`;
        }).join('');
  }
  if (claimList) {
    claimList.innerHTML = !ADMIN_CLAIM_REQUESTS.length
      ? '<div class="draft-empty">Još nema zahteva za preuzimanje.</div>'
      : ADMIN_CLAIM_REQUESTS.map(item => `<div class="organizer-card"><div class="organizer-head"><div><div class="organizer-name">${_escHtml(item.organizerName)}</div><div class="organizer-meta">${_escHtml(item.organizerCity || 'Grad nije unet')}${item.organizerInstagram ? ' · @' + _escHtml(item.organizerInstagram.replace(/^@+/, '')) : ''}</div></div><span class="tag tag-purple">${item.organizerStatus === 'claimed' ? 'Prebacivanje' : 'Preuzimanje'}</span></div><div class="draft-note">Zahtev poslao/la: <strong>${_escHtml(item.requesterName)}</strong>${item.requesterUsername ? ` · @${_escHtml(item.requesterUsername.replace(/^@+/, ''))}` : ''}</div>${item.organizerStatus === 'claimed' ? `<div class="draft-note" style="margin-top:8px">Odobrenjem ovog zahteva prebacuješ upravljanje na novi organizer nalog.</div>` : ''}${item.claimMessage ? `<div class="draft-note" style="margin-top:8px"><strong>Poruka:</strong> ${_escHtml(item.claimMessage)}</div>` : ''}<div class="organizer-actions" style="margin-top:10px"><button class="btn btn-purple btn-sm" onclick="approveOrganizerClaimRequest('${item.id}')">${item.organizerStatus === 'claimed' ? 'Prebaci upravljanje' : 'Odobri'}</button><button class="btn btn-outline btn-sm" onclick="rejectOrganizerClaimRequest('${item.id}')">Odbij</button></div></div>`).join('');
  }
  if (!visible.length) { list.innerHTML = '<div class="draft-empty">Još nema organizer profila za pregled. Organizatori u pripremi iz draftova će se pojaviti ovde.</div>'; return; }
  if (!filteredVisible.length) { list.innerHTML = '<div class="draft-empty">Nema rezultata za ovu pretragu. Probaj naziv, Instagram ili grad.</div>'; return; }
  list.innerHTML = filteredVisible.map(org => {
    const duplicates = possibleOrganizerDuplicates(org).slice(0, 3);
    const statusTag = org.status === 'claimed' ? '<span class="tag tag-green">Preuzet</span>' : org.status === 'merged' ? '<span class="tag tag-gray">Spojen</span>' : '<span class="tag tag-amber">U pripremi</span>';
    const dupHtml = duplicates.length ? `<div class="organizer-merge-list">${duplicates.map(dup => `<div class="draft-match"><div><div style="font-size:13px;font-weight:700;color:var(--ink)">${dup.name}</div><div class="admin-mini">${dup.city || 'Grad nije unet'}${dup.instagram ? ' · @' + dup.instagram : ''}</div></div><button class="btn btn-outline btn-sm" onclick="mergeOrganizerInto('${org.id}','${dup.id}')">Spoji u ovaj profil</button></div>`).join('')}</div>` : '';
    return `<div class="organizer-card"><div class="organizer-head"><div><div class="organizer-name">${org.name}</div><div class="organizer-meta">${org.city || 'Grad nije unet'}${org.instagram ? ' · @' + org.instagram : ''}</div></div>${statusTag}</div><div class="draft-note">Povezani draftovi: ${EVENT_DRAFTS.filter(draft => draft.organizerId === org.id && draft.reviewStatus === 'pending').length}</div>${dupHtml}<div class="organizer-actions">${org.status !== 'claimed' ? `<button class="btn btn-purple btn-sm" onclick="markOrganizerClaimed('${org.id}')">Označi kao preuzet</button>` : `<button class="btn btn-outline btn-sm" onclick="revokeOrganizerClaim('${org.id}')">Ukloni upravljanje</button>`}${org.status !== 'merged' ? `<button class="btn btn-outline btn-sm" onclick="archiveOrganizer('${org.id}')">Arhiviraj</button>` : ''}</div></div>`;
  }).join('');
}

async function approveOrganizerClaimRequest(claimId) {
  if (!claimId || !_isSupabaseConfigured()) return;
  try {
    await _supaFetch('/rest/v1/rpc/approve_organizer_claim', {
      method: 'POST',
      body: JSON.stringify({ p_claim_request_id: claimId })
    });
    await Promise.all([
      loadAdminOrganizersFromBackend({ silent: true }),
      loadAdminClaimRequestsFromBackend({ silent: true })
    ]);
    renderOrganizerReview();
    showToast('Zahtev za preuzimanje je odobren', 'success');
  } catch (e) {
    console.warn('[mitmi] approveOrganizerClaimRequest:', e.message);
    showToast('Odobravanje claim zahteva nije uspelo', 'error');
  }
}

async function rejectOrganizerClaimRequest(claimId) {
  if (!claimId || !_isSupabaseConfigured()) return;
  try {
    await _supaFetch(`/rest/v1/organizer_claim_requests?id=eq.${claimId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'rejected',
        reviewed_by: getUser()?.id || null,
        reviewed_at: new Date().toISOString(),
        admin_notes: 'Rejected from admin organizer review.'
      })
    });
    await loadAdminClaimRequestsFromBackend({ silent: true });
    renderOrganizerReview();
    showToast('Zahtev za preuzimanje je odbijen', 'info');
  } catch (e) {
    console.warn('[mitmi] rejectOrganizerClaimRequest:', e.message);
    showToast('Odbijanje claim zahteva nije uspelo', 'error');
  }
}

async function revokeOrganizerClaim(organizerId) {
  if (!organizerId || !_isSupabaseConfigured()) return;
  try {
    await _supaFetch('/rest/v1/rpc/revoke_organizer_claim', {
      method: 'POST',
      body: JSON.stringify({
        p_organizer_id: organizerId,
        p_note: 'Organizer upravljanje je uklonjeno iz admin panela.'
      })
    });
    await Promise.all([
      loadAdminOrganizersFromBackend({ silent: true }),
      loadAdminClaimRequestsFromBackend({ silent: true }),
      loadAdminDraftQueueFromBackend({ silent: true })
    ]);
    renderAdminDrafts();
    renderOrganizerReview();
    showToast('Upravljanje organizer profilom je uklonjeno', 'info');
  } catch (e) {
    console.warn('[mitmi] revokeOrganizerClaim:', e.message);
    showToast('Uklanjanje upravljanja trenutno nije uspelo', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  _hydrateAdminDraftState();
  loadAdminOrganizersFromBackend({ silent: true });
  loadAdminClaimRequestsFromBackend({ silent: true });
  loadAdminDraftQueueFromBackend({ silent: true });
  loadAdminOrphanPublishedEvents({ silent: true });
  loadAdminPlanSignalsFromBackend({ silent: true });
  syncAdminUI();
  renderSavedEvents();
  const createLabel = document.querySelector('#bn2 .bn-label');
  if (createLabel && typeof getRoleCapabilities === 'function') {
    createLabel.textContent = getRoleCapabilities().canPublishManagedEvents ? 'Događaj' : 'Društvo';
  }
});

// Thin compatibility aliases while older call sites are being retired.
const loadAdminInviteLeadsFromBackend = loadAdminPlanSignalsFromBackend;
const renderAdminInviteLeads = renderAdminPlanSignals;
const createDraftFromInviteLead = createDraftFromPlanSignal;
