// --- Uskoro strip - sortira ev-card po data-date ---
const EVENT_DATA = [];
const CAT_EMOJI = { muzika:'🎵', sport:'⚽', kultura:'🎨', kafa:'☕', priroda:'🏕️', izlasci:'☕', drugo:'✨' };
let REAL_EVENT_DATA = [];
let _currentEventId = null;
let _editingEventId = null;
let _inviteEventId = null;
let _pendingEventCover = '';
const EVENT_MEDIA_KEY = 'mitmi_event_media';

function _getEventMediaMap() {
  try {
    return JSON.parse(localStorage.getItem(EVENT_MEDIA_KEY) || '{}') || {};
  } catch(e) {
    return {};
  }
}

function _saveEventMediaMap(map = {}) {
  try { localStorage.setItem(EVENT_MEDIA_KEY, JSON.stringify(map)); } catch(e) {}
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

async function loadEventInvites(eventId) {
  const box = document.getElementById('event-invites-list');
  if (!box) return [];
  if (!eventId || !_isSupabaseConfigured()) {
    box.innerHTML = '<div class="draft-empty">Još nema javnih poziva za ovaj događaj.</div>';
    return [];
  }
  try {
    const rows = await _supaGet('invites', {
      select: 'id,event_id,title,spots_total,status,creator_id,profiles!creator_id(id,username,display_name,avatar_url,avg_rating)',
      event_id: `eq.${eventId}`,
      status: 'eq.open',
      order: 'created_at.desc',
      limit: '12'
    });
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      box.innerHTML = '<div class="draft-empty">Još nema javnih poziva za ovaj događaj.</div>';
      return [];
    }
    box.innerHTML = items.map(item => {
      const profile = item.profiles || {};
      const name = profile.display_name || profile.username || 'mitmi korisnik';
      const rating = Number(profile.avg_rating || 0).toFixed(1);
      const avatar = profile.avatar_url
        ? `<div class="av av-32 av-purple" style="cursor:pointer;background-image:url('${_escHtml(profile.avatar_url)}');background-size:cover;background-position:center" onclick="openOtherProfile('${_escHtml(profile.id || '')}')"></div>`
        : `<div class="av av-32 av-purple" style="cursor:pointer" onclick="openOtherProfile('${_escHtml(profile.id || '')}')">${_escHtml((name || 'M').charAt(0).toUpperCase())}</div>`;
      const isOwn = item.creator_id === getUser()?.id;
      return `<div class="inv-row">
        ${avatar}
        <div style="flex:1">
          <div class="inv-row-title">${_escHtml(item.title || 'Poziv za događaj')}</div>
          <div class="inv-row-meta">${_escHtml(name)} · ★ ${_escHtml(rating)} · <span class="tag tag-purple" style="padding:1px 7px;font-size:10px">${_escHtml(String(item.spots_total ?? 1))} mesta</span></div>
        </div>
        ${isOwn
          ? `<span class="tag tag-outline">Tvoj poziv</span>`
          : `<div style="display:flex;gap:8px"><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openDirectChat('${_escHtml(profile.id || '')}','${_escHtml(name).replace(/'/g, '&#39;')}')">Poruka</button><button class="btn btn-purple btn-sm" onclick="event.stopPropagation();applyToInvite('${_escHtml(item.id)}','${_escHtml(profile.id || '')}','${_escHtml(name).replace(/'/g, '&#39;')}','${_escHtml(item.title || 'Poziv')}')">Prijavi se</button></div>`}
      </div>`;
    }).join('');
    return items;
  } catch (e) {
    box.innerHTML = '<div class="draft-empty">Pozivi će se pojaviti uskoro.</div>';
    return [];
  }
}

async function loadBrowseInvites() {
  const box = document.getElementById('browse-invites-list');
  if (!box) return [];
  if (!_isSupabaseConfigured()) return [];
  try {
    const rows = await _supaGet('invites', {
      select: 'id,title,description,spots_total,status,event_id,creator_id,created_at,events!event_id(id,title,city,location_name,starts_at),profiles!creator_id(id,username,display_name,avatar_url,avg_rating)',
      status: 'eq.open',
      order: 'created_at.desc',
      limit: '24'
    });
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      box.innerHTML = '<div class="draft-empty">Još nema aktivnih poziva.</div>';
      return [];
    }
    box.innerHTML = items.map(item => {
      const profile = item.profiles || {};
      const event = item.events || {};
      const name = profile.display_name || profile.username || 'mitmi korisnik';
      const label = [event.location_name || event.city || 'Lokacija', event.starts_at ? _formatEventMeta(event) : 'Uskoro'].filter(Boolean).join(' · ');
      const avatar = profile.avatar_url
        ? `<div class="av av-40 av-purple" style="background-image:url('${_escHtml(profile.avatar_url)}');background-size:cover;background-position:center"></div>`
        : `<div class="av av-40 av-purple">${_escHtml((name || 'M').charAt(0).toUpperCase())}</div>`;
      const isOwn = item.creator_id === getUser()?.id;
      return `<div class="inv-card" onclick="openEventById('${_escHtml(item.event_id || event.id || '')}')">${avatar}<div style="flex:1;min-width:0"><div class="inv-title">${_escHtml(item.title || 'Poziv')}</div><div class="inv-meta">📍 ${_escHtml(label)} · <span class="tag tag-purple" style="padding:2px 7px;font-size:10px">${_escHtml(String(item.spots_total ?? 1))} mesta</span></div><div style="display:flex;align-items:center;gap:6px;margin-top:8px"><div class="av av-32 av-purple">${_escHtml((name || 'M').charAt(0).toUpperCase())}</div><span style="font-size:12px;font-weight:500;color:var(--ink2)">${_escHtml(name)} · ★ ${_escHtml(Number(profile.avg_rating || 0).toFixed(1))}</span></div><div style="display:flex;gap:8px;margin-top:10px">${isOwn ? `<span class="tag tag-outline">Tvoj poziv</span>` : `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openDirectChat('${_escHtml(profile.id || '')}','${_escHtml(name).replace(/'/g, '&#39;')}')">Poruka</button><button class="btn btn-purple btn-sm" onclick="event.stopPropagation();applyToInvite('${_escHtml(item.id)}','${_escHtml(profile.id || '')}','${_escHtml(name).replace(/'/g, '&#39;')}','${_escHtml(item.title || 'Poziv')}')">Prijavi se</button>`}</div></div></div>`;
    }).join('');
    return items;
  } catch (e) {
    console.warn('[mitmi] loadBrowseInvites:', e.message);
    box.innerHTML = '<div class="draft-empty">Aktivni pozivi će se pojaviti uskoro.</div>';
    return [];
  }
}

async function applyToInvite(inviteId, creatorId, creatorName = 'mitmi korisnik', inviteTitle = 'Poziv') {
  if (!isLoggedIn()) {
    showToast('Prijavi se da bi se prijavio/la na poziv', 'info', 1800);
    nav('login');
    return;
  }
  if (!inviteId || !creatorId) {
    showToast('Poziv trenutno nije dostupan', 'error');
    return;
  }
  if (creatorId === getUser()?.id) {
    showToast('Ne možeš da se prijaviš na svoj poziv', 'info');
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
          message: `Zdravo! Voleo/la bih da se priključim pozivu: ${inviteTitle}`,
          app_status: 'pending'
        })
      });
      showToast('Prijava je poslata', 'success');
    } else {
      showToast('Već si se prijavio/la na ovaj poziv', 'info');
    }
    await openDirectChat(creatorId, creatorName);
  } catch (e) {
    console.warn('[mitmi] applyToInvite:', e.message);
    showToast('Prijava na poziv trenutno nije uspela', 'error');
  }
}

function _eventVisualCategory(category = '') {
  const normalized = String(category || '').toLowerCase();
  if (['muzika','sport','kultura','kafa','priroda'].includes(normalized)) return normalized;
  return 'drugo';
}

function _eventEmoji(category = '') {
  return CAT_EMOJI[_eventVisualCategory(category)] || '📅';
}

function _eventSpotsLabel(value) {
  if (value == null || value === '') return 'novo';
  const raw = String(value).trim();
  if (!raw) return 'novo';
  return /^\d+$/.test(raw) ? `${raw} mesta` : (raw.toLowerCase() === 'novo' ? 'novo' : raw);
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
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
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
  const dayLabel = startsAt ? dateLabel(startsAt) : 'Uskoro';
  const timeLabel = date && !Number.isNaN(date.getTime())
    ? date.toLocaleTimeString('sr-Latn', { hour: '2-digit', minute: '2-digit' })
    : '';
  const location = event.location_name || event.city || 'Lokacija uskoro';
  return [dayLabel, timeLabel, location].filter(Boolean).join(' · ');
}

function _mapDbEventToCard(event = {}) {
  const startsAt = event.starts_at || new Date().toISOString();
  const dateOnly = startsAt.slice(0, 10);
  const capacity = event.capacity ?? event.spots ?? event.attendee_count ?? null;
  const cat = _eventVisualCategory(event.category);
  const coverUrl = event.cover_url || _getEventCover(event.id);
  return {
    id: event.id || `local-${Date.now()}`,
    title: event.title || 'Novi događaj',
    meta: _formatEventMeta(event),
    date: dateOnly,
    starts_at: startsAt,
    cat,
    bg: _eventBg(cat),
    cover_url: coverUrl,
    spots: capacity != null && capacity !== '' ? String(capacity) : '',
    urgent: false,
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
    .filter(item => !item.date || new Date(item.date) >= new Date(new Date().setHours(0,0,0,0)))
    .sort((a, b) => new Date(a.starts_at || a.date || 0) - new Date(b.starts_at || b.date || 0));
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
    grid.innerHTML = '<div class="draft-empty" style="grid-column:1/-1">Još nema objavljenih događaja.</div>';
    return;
  }
  grid.innerHTML = items.map(event => {
    const emoji = _eventEmoji(event.cat);
    const meta = event.meta || 'Detalji uskoro';
    const spotsLabel = _eventSpotsLabel(event.spots);
    const coverStyle = event.cover_url ? ` style="background-image:url('${_escHtml(event.cover_url)}');background-size:cover;background-position:center"` : '';
    return `<div class="sq-card" data-cat="${_escHtml(event.cat)}" data-day="${_escHtml(_eventDayBucket(event.date || event.starts_at || ''))}" data-date="${_escHtml(event.date || '')}" onclick="openEventById('${_escHtml(event.id)}')">
      <div class="sq-img ${_escHtml(event.bg)}"${coverStyle}>
        <span class="sq-cat">${emoji}</span>
        <span class="sq-spots${event.urgent ? ' urgent' : ''}">${_escHtml(spotsLabel)}</span>
      </div>
      <div class="sq-body">
        <div class="sq-title">${_escHtml(event.title)}</div>
        <div class="sq-meta">${_escHtml(meta)}</div>
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
    const rows = await _supaGet('events', {
      select: 'id,creator_id,title,description,category,city,location_name,starts_at,capacity,attendee_count,cover_url,is_published,is_cancelled,created_at',
      is_published: 'eq.true',
      is_cancelled: 'eq.false',
      order: 'starts_at.asc',
      limit: '24'
    });
    REAL_EVENT_DATA = Array.isArray(rows) ? rows.map(_mapDbEventToCard) : [];
  } catch (e) {
    console.warn('[mitmi] loadPublishedEvents:', e.message);
  }
  renderBrowseEventsGrid();
  return _combinedEventCards();
}

async function loadMyCreatedEvents() {
  if (!isLoggedIn()) return [];
  try {
    const rows = await _supaGet('events', {
      select: 'id,creator_id,title,description,category,city,location_name,starts_at,capacity,attendee_count,cover_url,is_published,is_cancelled,created_at',
      creator_id: `eq.${getUser()?.id}`,
      order: 'starts_at.asc',
      limit: '24'
    });
    return Array.isArray(rows) ? rows.map(_mapDbEventToCard) : [];
  } catch (e) {
    console.warn('[mitmi] loadMyCreatedEvents:', e.message);
    return [];
  }
}

function renderMyCreatedEvents(items = []) {
  const box = document.getElementById('profile-created-events');
  if (!box) return;
  if (!items.length) {
    box.innerHTML = `<div style="font-size:13px;color:var(--ink4);padding:8px 0">Još nema objavljenih događaja.</div>`;
    return;
  }
  box.innerHTML = items.map(item => {
    const label = new Date(item.date || item.starts_at || Date.now()) < new Date(new Date().setHours(0,0,0,0))
      ? 'Bilo'
      : 'Uskoro';
    const tagClass = label === 'Bilo' ? 'tag-gray' : 'tag-purple';
    const coverStyle = item.cover_url ? ` style="background-image:url('${_escHtml(item.cover_url)}');background-size:cover;background-position:center;color:transparent"` : '';
    return `<div class="ev-row" onclick="openEventById('${_escHtml(item.id)}')"><div class="ev-row-img ${_escHtml(item.bg)}"${coverStyle}>${item.cover_url ? '•' : _eventEmoji(item.cat)}</div><div style="flex:1"><div class="ev-row-title">${_escHtml(item.title)}</div><div class="ev-row-meta">${_escHtml(item.meta || 'Detalji uskoro')}</div></div><span class="tag ${tagClass}">${label}</span></div>`;
  }).join('');
}

async function loadMyInvites() {
  const box = document.getElementById('profile-my-invites');
  if (!box) return [];
  if (!isLoggedIn() || !_isSupabaseConfigured()) {
    box.innerHTML = '<div class="draft-empty">Prijavi se da vidiš svoje pozive.</div>';
    return [];
  }
  try {
    const rows = await _supaGet('invites', {
      select: 'id,event_id,title,description,spots_total,status,created_at,events!event_id(id,title,city,location_name,starts_at)',
      creator_id: `eq.${getUser()?.id}`,
      order: 'created_at.desc',
      limit: '50'
    });
    const invites = Array.isArray(rows) ? rows : [];
    if (!invites.length) {
      box.innerHTML = '<div class="draft-empty">Još nemaš aktivnih poziva.</div>';
      return [];
    }
    const inviteIds = invites.map(item => item.id).filter(Boolean);
    let counts = new Map();
    if (inviteIds.length) {
      try {
        const apps = await _supaGet('invite_applications', {
          select: 'invite_id,app_status',
          invite_id: `in.(${inviteIds.join(',')})`,
          limit: '200'
        });
        counts = (Array.isArray(apps) ? apps : []).reduce((acc, item) => {
          const current = acc.get(item.invite_id) || { total: 0, approved: 0 };
          current.total += 1;
          if (item.app_status === 'approved') current.approved += 1;
          acc.set(item.invite_id, current);
          return acc;
        }, new Map());
      } catch (e) {
        console.warn('[mitmi] loadMyInvites applications:', e.message);
      }
    }
    box.innerHTML = invites.map(item => {
      const event = item.events || {};
      const count = counts.get(item.id) || { total: 0, approved: 0 };
      const full = item.spots_total && count.approved >= item.spots_total;
      const meta = [event.location_name || event.city || 'Lokacija', event.starts_at ? _formatEventMeta(event) : 'Uskoro'].filter(Boolean).join(' · ');
      return `<div class="ev-row" onclick="openEventById('${_escHtml(item.event_id || event.id || '')}')"><div style="width:44px;height:44px;background:var(--purple-bg);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${_eventEmoji(event.category || 'drugo')}</div><div style="flex:1"><div class="ev-row-title">${_escHtml(item.title || 'Poziv')}</div><div class="ev-row-meta">${_escHtml(meta)} · ${_escHtml(String(count.total))} prijava · ${_escHtml(String(item.spots_total || 1))} mesta</div></div><span class="tag ${full ? 'tag-green' : 'tag-purple'}">${full ? 'Popunjeno' : `${count.total} →`}</span></div>`;
    }).join('');
    return invites;
  } catch (e) {
    console.warn('[mitmi] loadMyInvites:', e.message);
    box.innerHTML = '<div class="draft-empty">Pozivi trenutno nisu dostupni.</div>';
    return [];
  }
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
  loadMyVenueDashboard().catch(() => {});
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
  _inviteEventId = null;
  _pendingEventCover = '';
  const titleEl = document.getElementById('create-title');
  const categoryEl = document.getElementById('create-category');
  const dateEl = document.getElementById('create-date');
  const timeEl = document.getElementById('create-time');
  const locationEl = document.getElementById('create-location');
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

  if (titleEl) titleEl.value = '';
  if (categoryEl) categoryEl.value = 'muzika';
  if (dateEl) dateEl.value = '';
  if (timeEl) timeEl.value = '';
  if (locationEl) locationEl.value = '';
  if (descEl) descEl.value = '';
  if (spotsEl) spotsEl.value = '';
  if (headerEl) headerEl.textContent = 'Objavi poziv';
  if (saveBtn) saveBtn.textContent = 'Objavi poziv';
  if (fileEl) fileEl.value = '';
  if (contextEl) contextEl.style.display = 'none';
  if (categoryWrap) categoryWrap.style.display = '';
  if (dateWrap) dateWrap.style.display = '';
  if (timeWrap) timeWrap.style.display = '';
  if (locationWrap) locationWrap.style.display = '';
  if (coverWrap) coverWrap.style.display = '';
  _setCreateCoverPreview('');
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

  if (_inviteEventId && !_editingEventId) {
    const card = _combinedEventCards().find(item => item.id === _inviteEventId);
    const raw = card?.raw || {};
    const titleEl = document.getElementById('create-title');
    const descEl = document.getElementById('create-desc');
    const spotsEl = document.getElementById('create-spots');
    if (headerEl) headerEl.textContent = 'Objavi poziv za događaj';
    if (saveBtn) saveBtn.textContent = 'Objavi poziv';
    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    if (spotsEl) spotsEl.value = '';
    if (contextEl) {
      const meta = [card?.date || raw.starts_at?.slice(0, 10) || '', raw.location_name || raw.city || 'Lokacija uskoro'].filter(Boolean).join(' · ');
      contextEl.style.display = '';
      contextEl.innerHTML = `<div style="font-size:12px;color:var(--purple);font-weight:700;margin-bottom:4px">Povezano sa događajem</div><div style="font-size:15px;font-weight:800;color:var(--ink)">${_escHtml(card?.title || 'Događaj')}</div><div style="font-size:13px;color:var(--ink3);margin-top:4px">${_escHtml(meta)}</div>`;
    }
    if (categoryWrap) categoryWrap.style.display = 'none';
    if (dateWrap) dateWrap.style.display = 'none';
    if (timeWrap) timeWrap.style.display = 'none';
    if (locationWrap) locationWrap.style.display = 'none';
    if (coverWrap) coverWrap.style.display = 'none';
    _pendingEventCover = '';
    _setCreateCoverPreview('');
    return;
  }

  if (!_editingEventId) {
    if (headerEl) headerEl.textContent = 'Objavi poziv';
    if (saveBtn) saveBtn.textContent = 'Objavi poziv';
    if (contextEl) contextEl.style.display = 'none';
    if (categoryWrap) categoryWrap.style.display = '';
    if (dateWrap) dateWrap.style.display = '';
    if (timeWrap) timeWrap.style.display = '';
    if (locationWrap) locationWrap.style.display = '';
    if (coverWrap) coverWrap.style.display = '';
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
  const descEl = document.getElementById('create-desc');
  const spotsEl = document.getElementById('create-spots');
  if (headerEl) headerEl.textContent = 'Uredi događaj';
  if (saveBtn) saveBtn.textContent = 'Sačuvaj izmene';
  if (contextEl) contextEl.style.display = 'none';
  if (categoryWrap) categoryWrap.style.display = '';
  if (dateWrap) dateWrap.style.display = '';
  if (timeWrap) timeWrap.style.display = '';
  if (locationWrap) locationWrap.style.display = '';
  if (coverWrap) coverWrap.style.display = '';
  if (titleEl) titleEl.value = raw.title || card?.title || '';
  if (categoryEl) categoryEl.value = _eventVisualCategory(raw.category || card?.cat || 'muzika');
  if (dateEl) dateEl.value = raw.starts_at ? raw.starts_at.slice(0, 10) : (card?.date || '');
  if (timeEl && date && !Number.isNaN(date.getTime())) timeEl.value = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (locationEl) locationEl.value = raw.location_name || '';
  if (descEl) descEl.value = raw.description || '';
  if (spotsEl) spotsEl.value = raw.capacity || '';
  _pendingEventCover = card?.cover_url || _getEventCover(_editingEventId) || '';
  _setCreateCoverPreview(_pendingEventCover);
}

function openCreateInviteForEvent(eventId = null) {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  if (!eventId) {
    showToast('Prvo otvori događaj za koji želiš da objaviš poziv', 'info', 1800);
    return;
  }
  resetCreateForm();
  _inviteEventId = eventId;
  nav('create');
  setTimeout(() => loadCreateForm(), 0);
}

async function openCreateEvent(eventId = null) {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  if (!eventId) {
    resetCreateForm();
    nav('create');
    return;
  }
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

async function handleCreateCover(input) {
  if (!input.files || !input.files[0]) return;
  try {
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

function renderEventDetail(eventCard = null) {
  const event = eventCard || _currentEventCard();
  if (!event) return;
  const raw = event.raw || {};
  const date = raw.starts_at ? new Date(raw.starts_at) : new Date();
  const hero = document.getElementById('event-hero');
  const cat = document.getElementById('event-category');
  const title = document.getElementById('event-title');
  const dateEl = document.getElementById('event-date');
  const timeEl = document.getElementById('event-time');
  const locationEl = document.getElementById('event-location');
  const locationWrap = document.getElementById('event-location-wrap');
  const descEl = document.getElementById('event-description');
  const capEl = document.getElementById('event-capacity');
  const leftEl = document.getElementById('event-capacity-left');
  const fillEl = document.getElementById('event-capacity-fill');
  const ownerBtn = document.getElementById('event-edit-btn');
  const saveBtn = document.getElementById('event-save-btn');
  const socialBtn = document.getElementById('event-social-btn');

  if (hero) {
    hero.className = `ev-hero ${event.bg || 'ev-img-a'}`;
    hero.style.backgroundImage = event.cover_url ? `url(${event.cover_url})` : '';
    hero.style.backgroundSize = event.cover_url ? 'cover' : '';
    hero.style.backgroundPosition = event.cover_url ? 'center' : '';
  }
  if (cat) cat.textContent = `${_eventEmoji(event.cat)} ${event.cat ? event.cat.charAt(0).toUpperCase() + event.cat.slice(1) : 'Dogadjaj'}`;
  if (title) title.textContent = event.title || 'Dogadjaj';
  if (dateEl) dateEl.textContent = date.toLocaleDateString('sr-Latn', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
  if (timeEl) timeEl.textContent = date.toLocaleTimeString('sr-Latn', { hour:'2-digit', minute:'2-digit' });
  if (locationEl) locationEl.textContent = raw.location_name || raw.city || 'Lokacija nije upisana';
  if (locationWrap) {
    const hasVenueTarget = !!(raw.venue_id || raw.organizer_id);
    locationWrap.style.cursor = hasVenueTarget ? 'pointer' : 'default';
    locationWrap.onclick = hasVenueTarget
      ? () => openVenueProfile(
          raw.organizer_id
            ? { id: raw.organizer_id, kind: 'organizer', entity_type: 'organizer' }
            : { id: raw.venue_id, kind: 'venue', entity_type: 'venue' }
        )
      : null;
  }
  if (descEl) descEl.textContent = raw.description || 'Organizator još nije dodao detaljan opis događaja.';
  const capacity = Number(raw.capacity || raw.attendee_count || 0);
  const attendees = Number(raw.attendee_count || 0);
  const pct = capacity > 0 ? Math.min(100, Math.round((attendees / capacity) * 100)) : 0;
  if (capEl) capEl.textContent = capacity > 0 ? `${attendees} / ${capacity}` : `${attendees} prijavljenih`;
  if (leftEl) leftEl.textContent = capacity > 0 ? `${Math.max(capacity - attendees, 0)} mesta preostalo` : 'Broj mesta nije ogranicen';
  if (fillEl) fillEl.style.width = `${pct}%`;
  if (ownerBtn) {
    ownerBtn.style.display = raw.creator_id === getUser()?.id ? '' : 'none';
    ownerBtn.onclick = () => openCreateEvent(event.id);
  }
  if (saveBtn) {
    const followed = isEventFollowed(event);
    saveBtn.innerHTML = `♡ <span>${followed ? 'Otprati' : 'Sačuvaj'}</span>`;
    saveBtn.onclick = async (ev) => {
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      if (!isLoggedIn()) {
        showToast('Prijavi se da sačuvaš događaj', 'info', 1700);
        nav('login');
        return;
      }
      if (isEventFollowed(event)) {
        await unfollowEventByKey(eventKeyFromData(event));
      } else {
        await followEvent(event);
      }
      renderEventDetail(event);
    };
  }
  if (socialBtn) {
    socialBtn.onclick = () => openEventGroupChat(event.id, event.title || raw.title || 'Događaj', raw.creator_id || null);
  }
  loadEventInvites(event.id).catch(() => {});
  if (typeof loadEventPhotos === 'function') {
    loadEventPhotos(event.id).catch(() => {});
  }
  checkEvPhotoEmpty();
}

async function openEventById(eventId) {
  if (!eventId) {
    nav('event');
    return;
  }
  _currentEventId = eventId;
  let card = _combinedEventCards().find(item => item.id === eventId) || null;
  if (!card && _isSupabaseConfigured()) {
    try {
      const rows = await _supaGet('events', {
        select: 'id,creator_id,venue_id,organizer_id,title,description,category,city,location_name,starts_at,capacity,attendee_count,cover_url,is_published,is_cancelled,created_at',
        id: `eq.${eventId}`,
        limit: '1'
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row) card = _mapDbEventToCard(row);
    } catch(e) {}
  }
  nav('event');
  renderEventDetail(card);
}

let ADMIN_ORGANIZERS = [];
let EVENT_DRAFTS = [];
let FOLLOWED_EVENTS = [];
let PROFILE_DIRECTORY = [];
let FOLLOWED_PROFILE_IDS = [];
let _currentPublicProfileId = null;
let _currentPublicVenueId = null;
let _currentPublicVenueTarget = null;
let _reportContext = { type:'profile', profileId:null, venueId:null, eventId:null, label:'' };
let BLOCKED_PROFILE_IDS = [];

function _dateFromOffset(dayOffset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

function eventKeyFromData(data) {
  if (!data) return '';
  return data.id || [data.title || '', data.meta || '', data.dayOffset ?? '', data.cat || ''].join('|');
}

function dateLabel(dateStr) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const d = new Date(dateStr);
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
    .filter(e => new Date(e.date) >= today)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (upcoming.length === 0) {
    strip.innerHTML = '<div style="font-size:13px;color:var(--ink4);padding:12px 0">Još nema predstojećih događaja.</div>';
    return;
  }

  strip.innerHTML = upcoming.map((ev, i) => {
    const label = dateLabel(ev.date);
    const isToday = label === 'Danas';
    const spotsColor = ev.urgent ? 'var(--amber2)' : 'var(--purple)';
    const emoji = CAT_EMOJI[ev.cat] || '📅';
    const delay = i * 0.07;
    const heroStyle = ev.cover_url ? `background-image:url('${_escHtml(ev.cover_url)}');background-size:cover;background-position:center;position:relative` : 'position:relative';
    return `<div class="hero-ev-card" style="flex-shrink:0;width:155px;animation:cardReveal .3s ease ${delay}s both;opacity:0" onclick="openEventById('${_escHtml(ev.id || '')}')">
      <div class="hero-ev-img ${ev.bg}" style="${heroStyle}">
        ${isToday ? '<span style="position:absolute;top:8px;right:8px;background:var(--amber);color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:10px;letter-spacing:.04em">DANAS</span>' : ''}
      </div>
      <div class="hero-ev-body">
        <div style="font-size:10px;font-weight:700;color:var(--ink3);margin-bottom:3px">${emoji} ${label}</div>
        <div class="hero-ev-title">${ev.title}</div>
        <div class="hero-ev-meta">${ev.meta}</div>
        <div style="font-size:11px;font-weight:700;color:${spotsColor};margin-bottom:6px">${_eventSpotsLabel(ev.spots)}</div>
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
    .filter(e => new Date(e.date) >= today)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!upcoming.length) {
    strip.innerHTML = '<div class="draft-empty">Kad se objave prvi događaji, ovde ćeš ih videti na jednom mestu.</div>';
    return;
  }
  strip.innerHTML = upcoming.map((ev, i) => {
    const label = dateLabel(ev.date);
    const isToday = label === 'Danas';
    const spotsColor = ev.urgent ? 'var(--amber2)' : 'var(--purple)';
    const emoji = CAT_EMOJI[ev.cat] || '📅';
    const delay = i * 0.06;
    const heroStyle = ev.cover_url ? `background-image:url('${_escHtml(ev.cover_url)}');background-size:cover;background-position:center;position:relative` : 'position:relative';
    return `<div class="hero-ev-card" style="flex-shrink:0;width:155px;animation:cardReveal .3s ease ${delay}s both;opacity:0" onclick="openEventById('${_escHtml(ev.id || '')}')">
      <div class="hero-ev-img ${ev.bg}" style="${heroStyle}">
        ${isToday ? '<span style="position:absolute;top:8px;right:8px;background:var(--amber);color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:10px;letter-spacing:.04em">DANAS</span>' : ''}
      </div>
      <div class="hero-ev-body">
        <div style="font-size:10px;font-weight:700;color:var(--ink3);margin-bottom:3px">${emoji} ${label}</div>
        <div class="hero-ev-title">${ev.title}</div>
        <div class="hero-ev-meta">${ev.meta}</div>
        <div style="font-size:11px;font-weight:700;color:${spotsColor};margin-bottom:6px">${_eventSpotsLabel(ev.spots)}</div>
        <button class="hero-ev-btn" onclick="openEventById('${_escHtml(ev.id || '')}');event.stopPropagation()">Nađi društvo</button>
      </div>
    </div>`;
  }).join('');
}

// Pozovi pri init i kad se navigira na home
// renderUskoroStrip se poziva direktno iz nav()
document.addEventListener('DOMContentLoaded', renderUskoroStrip);
document.addEventListener('DOMContentLoaded', () => { loadPublishedEvents().catch(() => {}); });

function isAdminUser() {
  const role = getUser()?.user_metadata?.role || getUser()?.user_role || null;
  return role === 'admin';
}

function syncAdminUI() {
  const section = document.getElementById('admin-settings-section');
  if (section) section.style.display = isAdminUser() ? 'block' : 'none';
  const organizerBtn = document.getElementById('profile-organizer-btn');
  if (organizerBtn) {
    const role = getUser()?.user_metadata?.role || getUser()?.user_role || null;
    const shouldShow = role === 'venue' || role === 'admin';
    organizerBtn.style.display = shouldShow ? '' : 'none';
    organizerBtn.textContent = role === 'venue' ? 'Moj organizer panel' : 'Admin panel';
    organizerBtn.onclick = () => nav(role === 'admin' ? 'admin-drafts' : 'venue');
  }
}

function getOrganizerById(id) {
  return ADMIN_ORGANIZERS.find(org => org.id === id) || null;
}

function organizerLabel(draft) {
  const organizer = draft.organizerId ? getOrganizerById(draft.organizerId) : null;
  return organizer?.name || draft.proposedOrganizerName || 'Organizer nije unet';
}

function organizerStatusTag(draft) {
  const organizer = draft.organizerId ? getOrganizerById(draft.organizerId) : null;
  if (!organizer && draft.proposedOrganizerName) return '<span class="tag tag-amber">Predložen organizer</span>';
  if (!organizer) return '<span class="tag tag-gray">Nije povezan</span>';
  if (organizer.status === 'claimed') return '<span class="tag tag-green">Preuzet</span>';
  return '<span class="tag tag-amber">Ghost organizer</span>';
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

function openAdminDrafts() { renderAdminDrafts(); nav('admin-drafts'); }
function openOrganizerReview() { renderOrganizerReview(); nav('admin-organizers'); }

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
    const coverStyle = ev.cover_url ? ` style="background-image:url('${_escHtml(ev.cover_url)}');background-size:cover;background-position:center;color:transparent"` : '';
    return `<div class="ev-row" onclick="openEventById('${_escHtml(ev.id || '')}')"><div class="ev-row-img ${ev.bg || 'ev-img-b'}"${coverStyle}>${ev.cover_url ? '•' : (CAT_EMOJI[ev.cat] || '🎫')}</div><div style="flex:1;min-width:0"><div class="ev-row-title">${ev.title}</div><div class="ev-row-meta">${dateLabel(date)} · ${ev.meta || 'Detalji uskoro'}</div></div><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();unfollowEventByKey('${key}')">Otprati</button></div>`;
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

function createGhostOrganizerForDraft(draftId) {
  const draft = EVENT_DRAFTS.find(item => item.id === draftId);
  if (!draft) return;
  const existing = possibleOrganizerMatches(draft)[0];
  if (existing) {
    draft.organizerId = existing.id;
    showToast('Draft je povezan sa postojećim organizerom', 'success');
    renderAdminDrafts();
    renderOrganizerReview();
    return;
  }
  const newId = 'org-' + (ADMIN_ORGANIZERS.length + 1);
  ADMIN_ORGANIZERS.unshift({ id:newId, name:draft.proposedOrganizerName || 'Ghost organizer', city:draft.city || 'Novi Sad', instagram:(draft.proposedOrganizerInstagram || '').replace(/^@+/, ''), status:'ghost' });
  draft.organizerId = newId;
  showToast('Ghost organizer je kreiran', 'success');
  renderAdminDrafts();
  renderOrganizerReview();
}

function connectDraftToOrganizer(draftId, organizerId) {
  const draft = EVENT_DRAFTS.find(item => item.id === draftId);
  if (!draft) return;
  draft.organizerId = organizerId;
  showToast('Organizer je povezan sa draftom', 'success', 1400);
  renderAdminDrafts();
  renderOrganizerReview();
}

function approveDraft(draftId) {
  const draft = EVENT_DRAFTS.find(item => item.id === draftId);
  if (!draft) return;
  if (!draft.organizerId && draft.proposedOrganizerName) createGhostOrganizerForDraft(draftId);
  draft.reviewStatus = 'approved';
  _replaceRealEventCard({
    id: `admin-draft-${draft.id}`,
    title: draft.title || 'Odobren događaj',
    meta: `${adminDraftTimeLabel(draft.startsAt)} · ${draft.locationName || draft.city || 'Lokacija uskoro'}`,
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

function rejectDraft(draftId) {
  const draft = EVENT_DRAFTS.find(item => item.id === draftId);
  if (!draft) return;
  draft.reviewStatus = 'rejected';
  renderAdminDrafts();
  showToast('Draft je odbijen', 'info', 1400);
}

function simulateAiImport() {
  const urlEl = document.getElementById('ai-import-url');
  const organizerEl = document.getElementById('ai-import-organizer');
  const sourceUrl = urlEl?.value.trim();
  const organizerHint = organizerEl?.value.trim();
  if (!sourceUrl) { showToast('Prvo nalepi link događaja', 'error'); return; }
  const host = sourceUrl.replace(/^https?:\/\//, '').split('/')[0] || 'source';
  const inferredName = organizerHint || (host.includes('instagram') ? 'Organizer sa Instagrama' : 'Organizer sa linka');
  EVENT_DRAFTS.unshift({ id:'draft-' + (EVENT_DRAFTS.length + 1), sourceType:'ai', reviewStatus:'pending', title:host.includes('instagram') ? 'AI import događaja sa Instagrama' : 'AI import događaja sa spoljnog linka', category:host.includes('ticket') ? 'muzika' : 'kultura', city:'Novi Sad', startsAt:'2026-04-03T20:00:00', locationName:host.includes('instagram') ? 'Lokacija prepoznata iz objave' : 'Lokacija prepoznata sa stranice', sourceUrl, organizerId:null, proposedOrganizerName:inferredName, proposedOrganizerInstagram:organizerHint ? organizerHint.toLowerCase().replace(/^@+/, '') : '', aiConfidence:0.81, aiSummary:'Link je pretvoren u draft za pregled. Pre objave proveri naslov, vreme, lokaciju i organizer podatke.', submittedByLabel:'AI import' });
  if (urlEl) urlEl.value = '';
  if (organizerEl) organizerEl.value = '';
  renderAdminDrafts();
  showToast('AI draft je generisan', 'success');
}

function renderAdminDrafts() {
  syncAdminUI();
  const list = document.getElementById('admin-draft-list');
  if (!list) return;
  const pending = EVENT_DRAFTS.filter(item => item.reviewStatus === 'pending');
  const aiCount = EVENT_DRAFTS.filter(item => item.sourceType === 'ai' && item.reviewStatus === 'pending').length;
  const ghostCount = ADMIN_ORGANIZERS.filter(item => item.status === 'ghost').length;
  const pendingEl = document.getElementById('admin-stat-pending');
  const aiEl = document.getElementById('admin-stat-ai');
  const ghostEl = document.getElementById('admin-stat-ghost');
  const badgeEl = document.getElementById('admin-queue-badge');
  if (pendingEl) pendingEl.textContent = String(pending.length);
  if (aiEl) aiEl.textContent = String(aiCount);
  if (ghostEl) ghostEl.textContent = String(ghostCount);
  if (badgeEl) badgeEl.textContent = `${pending.length} draftova`;
  if (!pending.length) { list.innerHTML = '<div class="draft-empty">Nema draftova na čekanju. Novi AI importi i korisničke prijave će se pojaviti ovde.</div>'; return; }
  list.innerHTML = pending.map(draft => {
    const matches = !draft.organizerId ? possibleOrganizerMatches(draft).slice(0, 2) : [];
    const conf = draft.aiConfidence != null ? `<span class="tag tag-purple">AI ${(draft.aiConfidence * 100).toFixed(0)}%</span>` : '';
    const sourceTag = draft.sourceType === 'ai' ? '<span class="tag tag-purple">AI</span>' : draft.sourceType === 'user' ? '<span class="tag tag-gold">User</span>' : '<span class="tag tag-gray">Manual</span>';
    const matchHtml = matches.map(match => `<div class="draft-match"><div><div style="font-size:13px;font-weight:700;color:var(--ink)">${match.name}</div><div class="admin-mini">${match.city || 'City n/a'}${match.instagram ? ' · @' + match.instagram : ''}</div></div><button class="btn btn-outline btn-sm" onclick="connectDraftToOrganizer('${draft.id}','${match.id}')">Use existing</button></div>`).join('');
    return `<div class="draft-card"><div class="draft-top"><div style="flex:1;min-width:0"><div class="draft-title">${draft.title}</div><div class="draft-meta">${adminDraftTimeLabel(draft.startsAt)} · ${draft.locationName || draft.city || 'Lokacija uskoro'}</div></div><div class="draft-chip-row" style="justify-content:flex-end">${sourceTag}${conf}</div></div><div class="draft-chip-row"><span class="tag tag-outline">${draft.category || 'nekategorisano'}</span><span class="tag tag-outline">${organizerLabel(draft)}</span>${organizerStatusTag(draft)}</div><div class="draft-note">${draft.aiSummary || 'Još nema kratkog opisa.'}</div>${draft.sourceUrl ? `<div class="draft-note">Izvor: ${draft.sourceUrl}</div>` : ''}${matchHtml}<div class="draft-actions"><button class="btn btn-purple btn-sm" onclick="approveDraft('${draft.id}')">Odobri</button><button class="btn btn-outline btn-sm" onclick="createGhostOrganizerForDraft('${draft.id}')">${draft.organizerId ? 'Osveži organizera' : 'Kreiraj ghost organizer'}</button><button class="btn btn-danger btn-sm" onclick="rejectDraft('${draft.id}')">Odbij</button></div><div class="admin-mini" style="margin-top:10px">Poslao/la: ${draft.submittedByLabel || 'Nepoznato'}</div></div>`;
  }).join('');
}

function markOrganizerClaimed(organizerId) {
  const organizer = getOrganizerById(organizerId);
  if (!organizer) return;
  organizer.status = 'claimed';
  showToast('Organizer je označen kao preuzet', 'success', 1400);
  renderAdminDrafts();
  renderOrganizerReview();
}

function archiveOrganizer(organizerId) {
  const organizer = getOrganizerById(organizerId);
  if (!organizer) return;
  organizer.status = 'archived';
  EVENT_DRAFTS.forEach(draft => { if (draft.organizerId === organizerId) draft.organizerId = null; });
  showToast('Organizer je arhiviran', 'info', 1400);
  renderAdminDrafts();
  renderOrganizerReview();
}

function mergeOrganizerInto(fromId, intoId) {
  if (fromId === intoId) return;
  const from = getOrganizerById(fromId);
  const into = getOrganizerById(intoId);
  if (!from || !into) return;
  EVENT_DRAFTS.forEach(draft => { if (draft.organizerId === fromId) draft.organizerId = intoId; });
  from.status = 'merged';
  from.mergedIntoId = intoId;
  showToast(`Spojeno u organizer profil ${into.name}`, 'success');
  renderAdminDrafts();
  renderOrganizerReview();
}

function renderOrganizerReview() {
  syncAdminUI();
  const list = document.getElementById('organizer-review-list');
  if (!list) return;
  const visible = ADMIN_ORGANIZERS.filter(item => item.status !== 'archived');
  const ghosts = visible.filter(item => item.status === 'ghost');
  const claimed = visible.filter(item => item.status === 'claimed');
  const dupCount = ghosts.filter(item => possibleOrganizerDuplicates(item).length > 0).length;
  const ghostStat = document.getElementById('organizer-stat-ghost');
  const claimedStat = document.getElementById('organizer-stat-claimed');
  const dupStat = document.getElementById('organizer-stat-duplicates');
  if (ghostStat) ghostStat.textContent = String(ghosts.length);
  if (claimedStat) claimedStat.textContent = String(claimed.length);
  if (dupStat) dupStat.textContent = String(dupCount);
  if (!visible.length) { list.innerHTML = '<div class="draft-empty">Još nema organizer profila za pregled. Ghost organizatori iz draftova će se pojaviti ovde.</div>'; return; }
  list.innerHTML = visible.map(org => {
    const duplicates = possibleOrganizerDuplicates(org).slice(0, 3);
    const statusTag = org.status === 'claimed' ? '<span class="tag tag-green">Preuzet</span>' : org.status === 'merged' ? '<span class="tag tag-gray">Spojen</span>' : '<span class="tag tag-amber">Ghost</span>';
    const dupHtml = duplicates.length ? `<div class="organizer-merge-list">${duplicates.map(dup => `<div class="draft-match"><div><div style="font-size:13px;font-weight:700;color:var(--ink)">${dup.name}</div><div class="admin-mini">${dup.city || 'Grad nije unet'}${dup.instagram ? ' · @' + dup.instagram : ''}</div></div><button class="btn btn-outline btn-sm" onclick="mergeOrganizerInto('${org.id}','${dup.id}')">Spoji u ovaj profil</button></div>`).join('')}</div>` : '';
    return `<div class="organizer-card"><div class="organizer-head"><div><div class="organizer-name">${org.name}</div><div class="organizer-meta">${org.city || 'Grad nije unet'}${org.instagram ? ' · @' + org.instagram : ''}</div></div>${statusTag}</div><div class="draft-note">Povezani draftovi: ${EVENT_DRAFTS.filter(draft => draft.organizerId === org.id && draft.reviewStatus === 'pending').length}</div>${dupHtml}<div class="organizer-actions">${org.status !== 'claimed' ? `<button class="btn btn-purple btn-sm" onclick="markOrganizerClaimed('${org.id}')">Označi kao preuzet</button>` : ''}${org.status !== 'merged' ? `<button class="btn btn-outline btn-sm" onclick="archiveOrganizer('${org.id}')">Arhiviraj</button>` : ''}</div></div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  syncAdminUI();
  renderSavedEvents();
});
