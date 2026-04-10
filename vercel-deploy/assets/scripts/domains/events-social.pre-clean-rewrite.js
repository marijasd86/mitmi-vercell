async function _loadPlans(params = {}) {
  if (!_isSupabaseConfigured()) return [];
  try {
    const rows = await _supaGet('plans', {
      select: 'id,title,description,spots_total,status,created_at,creator_id,event_id,organizer_id,venue_id,category,city,location_name,starts_at,source_url,events!event_id(id,creator_id,organizer_id,venue_id,title,description,category,city,location_name,starts_at,cover_url,is_published,is_cancelled),profiles!creator_id(id,username,display_name,avatar_url,avg_rating),organizers!organizer_id(id,name,city)',
      ...params
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn('[mitmi] _loadPlans:', e.message);
    return [];
  }
}

function _planMeta(item = {}) {
  const event = item.events || {};
  const organizer = item.organizers || {};
  const place = event.location_name || item.location_name || organizer.name || event.city || item.city || 'Lokacija nije upisana';
  const timeLabel = event.starts_at
    ? _formatEventMeta(event)
    : (item.starts_at ? _formatEventMeta({ starts_at: item.starts_at, city: item.city, location_name: item.location_name }) : 'Termin će biti dodat');
  return [place, timeLabel].filter(Boolean).join(' · ');
}

function _mapPlanToCardLike(item = {}) {
  const event = item.events || {};
  const profile = item.profiles || {};
  return {
    id: item.id || '',
    source_type: 'plan',
    title: item.title || 'Plan',
    description: item.description || '',
    spots_total: item.spots_total || 1,
    status: item.status || 'open',
    created_at: item.created_at || '',
    creator_id: item.creator_id || '',
    event_id: item.event_id || event.id || '',
    organizer_id: item.organizer_id || event.organizer_id || null,
    venue_id: item.venue_id || event.venue_id || null,
    category: item.category || event.category || 'drugo',
    city: item.city || event.city || '',
    location_name: item.location_name || event.location_name || '',
    starts_at: item.starts_at || event.starts_at || '',
    source_url: item.source_url || null,
    profiles: profile,
    events: event.id ? event : null,
    organizers: item.organizers || null,
    vibe_tags: []
  };
}

function _isLegacyInviteItem(item = {}) {
  return String(item?.source_type || '').toLowerCase() === 'invite';
}

async function loadEventPlans(eventId) {
  const box = document.getElementById('event-plans-list');
  if (!box) return [];
  if (!eventId || !_isSupabaseConfigured()) {
    box.innerHTML = '<div class="draft-empty">Još nema javnih planova za ovaj događaj.</div>';
    return [];
  }
  try {
    let items = (await _loadPlans({
      event_id: `eq.${eventId}`,
      status: 'eq.open',
      order: 'created_at.desc',
      limit: '12'
    })).map(_mapPlanToCardLike);
    if (isLoggedIn()) await loadBlockedProfileIds();
    let legacyItems = [];
    if (LEGACY_INVITE_COMPAT_MODE) {
      const rows = await _supaGet('invites', {
        select: 'id,event_id,title,spots_total,status,creator_id,vibe_tags,profiles!creator_id(id,username,display_name,avatar_url,avg_rating)',
        event_id: `eq.${eventId}`,
        status: 'eq.open',
        order: 'created_at.desc',
        limit: '24'
      });
      legacyItems = Array.isArray(rows) ? rows : [];
    }
    const safeLegacyItems = Array.isArray(legacyItems) ? legacyItems.filter(item => !isProfileBlocked(item.creator_id)) : [];
    items = items.filter(item => !isProfileBlocked(item.creator_id));
    const eventTitle = document.getElementById('event-title')?.textContent || 'Događaj';
    if (!items.length) items = safeLegacyItems;
    if (!items.length) {
      box.innerHTML = '<div class="draft-empty">Još nema javnih planova za ovaj događaj.</div>';
      return [];
    }
    const legacyInviteMap = new Map();
    safeLegacyItems.forEach(item => {
      const exactKey = `${item.creator_id || ''}::${item.event_id || ''}::${String(item.title || '').trim().toLowerCase()}`;
      if (!legacyInviteMap.has(exactKey)) legacyInviteMap.set(exactKey, item);
      const looseKey = `${item.creator_id || ''}::${item.event_id || ''}`;
      if (!legacyInviteMap.has(looseKey)) legacyInviteMap.set(looseKey, item);
    });
    box.innerHTML = items.map(item => {
      const profile = item.profiles || {};
      const name = profile.display_name || profile.username || 'mitmi korisnik';
      const rating = Number(profile.avg_rating || 0).toFixed(1);
      const exactKey = `${item.creator_id || ''}::${item.event_id || ''}::${String(item.title || '').trim().toLowerCase()}`;
      const looseKey = `${item.creator_id || ''}::${item.event_id || ''}`;
      const linkedInvite = legacyInviteMap.get(exactKey) || legacyInviteMap.get(looseKey) || null;
      const actionInviteId = _isLegacyInviteItem(item) ? (item.id || '') : (linkedInvite?.id || '');
      const isLegacySource = _isLegacyInviteItem(item);
      const avatar = profile.avatar_url
        ? `<div class="av av-32 av-purple" style="cursor:pointer;background-image:url('${_safeCssUrl(profile.avatar_url)}');background-size:cover;background-position:center" onclick="openOtherProfile('${_escHtml(profile.id || '')}')"></div>`
        : `<div class="av av-32 av-purple" style="cursor:pointer" onclick="openOtherProfile('${_escHtml(profile.id || '')}')">${_escHtml((name || 'M').charAt(0).toUpperCase())}</div>`;
      const isOwn = item.creator_id === getUser()?.id;
      const safeProfileId = _escHtml(profile.id || '');
      const safeName = _escJsArg(name);
      const safeInviteId = _escHtml(actionInviteId);
      const safeEventId = _escHtml(item.event_id || '');
      const safeTitle = _escJsArg(item.title || 'Plan');
      const safeEventTitle = _escJsArg(eventTitle);
      const safeItemId = _escHtml(item.id || '');
      return `<div class="inv-row">
        ${avatar}
        <div style="flex:1">
          <div class="inv-row-title">${_escHtml(item.title || 'Plan za događaj')}</div>
          <div class="inv-row-meta">${_escHtml(name)} · ★ ${_escHtml(rating)} · <span class="tag tag-purple" style="padding:1px 7px;font-size:10px">${_escHtml(String(item.spots_total ?? 1))} mesta</span></div>
          ${_renderInviteVibes(item.vibe_tags)}
        </div>
        ${isOwn
          ? `<span class="tag tag-outline">Tvoj plan</span>`
          : `<div style="display:flex;gap:8px"><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openPlanDirectChat('${safeProfileId}','${safeName}','${safeInviteId}','${safeEventId}','${safeTitle}','${safeEventTitle}','${safeItemId}')">Poruka</button><button class="btn btn-purple btn-sm" onclick="event.stopPropagation();applyToPlan('${safeInviteId}','${safeProfileId}','${safeName}','${safeTitle}','${safeEventId}','${safeEventTitle}','${safeItemId}','${isLegacySource ? 'legacy' : 'plan'}')">${isLegacySource ? 'Prijavi se' : 'Javi se'}</button></div>`}
      </div>`;
    }).join('');
    return items;
  } catch (e) {
    box.innerHTML = '<div class="draft-empty">Planovi trenutno nisu dostupni.</div>';
    return [];
  }
}

const loadEventInvites = loadEventPlans;

async function loadBrowsePlans() {
  const box = document.getElementById('browse-plans-list');
  if (!box) return [];
  if (!_isSupabaseConfigured()) return [];
  try {
    let items = (await _loadPlans({
      status: 'eq.open',
      order: 'created_at.desc',
      limit: '24'
    })).map(_mapPlanToCardLike);
    if (!items.length && LEGACY_INVITE_COMPAT_MODE) {
      const rows = await _supaGet('invites', {
        select: 'id,title,description,spots_total,status,event_id,creator_id,created_at,vibe_tags,events!event_id(id,title,city,location_name,starts_at),profiles!creator_id(id,username,display_name,avatar_url,avg_rating)',
        status: 'eq.open',
        order: 'created_at.desc',
        limit: '24'
      });
      items = Array.isArray(rows) ? rows : [];
    }
    if (isLoggedIn()) await loadBlockedProfileIds();
    items = items.filter(item => !isProfileBlocked(item.creator_id));
    BROWSE_PLAN_DATA = items;
    if (!items.length) {
      box.innerHTML = '<div class="draft-empty">Još nema aktivnih planova.</div>';
      return [];
    }
    box.innerHTML = items.map(item => {
      const profile = item.profiles || {};
      const event = item.events || {};
      const isLegacySource = _isLegacyInviteItem(item);
      const name = profile.display_name || profile.username || 'mitmi korisnik';
      const label = _planMeta(item);
      const avatar = profile.avatar_url
        ? `<div class="av av-40 av-purple" style="background-image:url('${_safeCssUrl(profile.avatar_url)}');background-size:cover;background-position:center"></div>`
        : `<div class="av av-40 av-purple">${_escHtml((name || 'M').charAt(0).toUpperCase())}</div>`;
      const isOwn = item.creator_id === getUser()?.id;
      const eventId = item.event_id || event.id || '';
      const openAction = eventId ? `openEventById('${_escHtml(eventId)}')` : `openOtherProfile('${_escHtml(profile.id || '')}')`;
      const contextBadge = eventId
        ? '<span class="tag tag-outline">Za događaj</span>'
        : (item.organizer_id ? '<span class="tag tag-outline">Za mesto</span>' : '<span class="tag tag-outline">Samostalni plan</span>');
      const safeName = _escHtml(name).replace(/'/g, '&#39;');
      const safeTitle = _escHtml(item.title || 'Plan').replace(/'/g, '&#39;');
      const safeEventTitle = _escHtml(event.title || 'Događaj').replace(/'/g, '&#39;');
      const actionButtons = isOwn
        ? `<span class="tag tag-outline">Tvoj plan</span>`
        : eventId
          ? `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openPlanDirectChat('${_escHtml(profile.id || '')}','${safeName}','${isLegacySource ? _escHtml(item.id) : ''}','${_escHtml(eventId)}','${safeTitle}','${safeEventTitle}','${_escHtml(item.id || '')}')">Poruka</button><button class="btn btn-purple btn-sm" onclick="event.stopPropagation();applyToPlan('${isLegacySource ? _escHtml(item.id) : ''}','${_escHtml(profile.id || '')}','${safeName}','${safeTitle}','${_escHtml(eventId)}','${safeEventTitle}','${_escHtml(item.id || '')}','${isLegacySource ? 'legacy' : 'plan'}')">${isLegacySource ? 'Prijavi se' : 'Javi se'}</button>`
          : `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openDirectChat('${_escHtml(profile.id || '')}','${safeName}')">Poruka</button><button class="btn btn-purple btn-sm" onclick="event.stopPropagation();openDirectChat('${_escHtml(profile.id || '')}','${safeName}')">Javi se</button>`;
      return `<div class="inv-card" onclick="${openAction}">${avatar}<div style="flex:1;min-width:0"><div class="inv-title">${_escHtml(item.title || 'Plan')}</div><div class="inv-meta">📍 ${_escHtml(label)} · <span class="tag tag-purple" style="padding:2px 7px;font-size:10px">${_escHtml(String(item.spots_total ?? 1))} mesta</span></div>${_renderInviteVibes(item.vibe_tags)}<div style="display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap"><div class="av av-32 av-purple">${_escHtml((name || 'M').charAt(0).toUpperCase())}</div><span style="font-size:12px;font-weight:500;color:var(--ink2)">${_escHtml(name)} · ★ ${_escHtml(Number(profile.avg_rating || 0).toFixed(1))}</span>${contextBadge}</div><div style="display:flex;gap:8px;margin-top:10px">${actionButtons}</div></div></div>`;
    }).join('');
    return items;
  } catch (e) {
    console.warn('[mitmi] loadBrowsePlans:', e.message);
    BROWSE_PLAN_DATA = [];
    box.innerHTML = '<div class="draft-empty">Aktivni planovi trenutno nisu dostupni.</div>';
    return [];
  }
}

const loadBrowseInvites = loadBrowsePlans;

function getSwipePlanCards() {
  return (Array.isArray(BROWSE_PLAN_DATA) ? BROWSE_PLAN_DATA : []).map(item => {
    const event = item.events || {};
    const profile = item.profiles || {};
    const name = profile.display_name || profile.username || 'mitmi korisnik';
    const cat = _eventVisualCategory(item.category || event.category || 'drugo');
    const eventId = item.event_id || event.id || '';
    return {
      id: eventId || `plan-${item.id || ''}`,
      swipe_key: `plan-${item.id || eventId || ''}`,
      swipeType: 'plan',
      inviteId: eventId ? (item.id || '') : '',
      planId: item.id || '',
      eventId,
      creatorId: item.creator_id || '',
      creatorName: name,
      title: item.title || 'Plan',
      meta: _planMeta(item),
      date: event.starts_at ? _formatEventMeta(event) : (item.starts_at ? _formatEventMeta({ starts_at: item.starts_at, city: item.city, location_name: item.location_name }) : 'Termin će biti dodat'),
      starts_at: item.starts_at || event.starts_at || '',
      cat,
      raw_category: _normalizeEventCategoryKey(item.category || event.category || 'drugo'),
      category_label: _eventCategoryLabel(item.category || event.category || 'drugo'),
      bg: _eventBg(cat),
      cover_url: event.cover_url || _getEventCover(eventId || item.id || ''),
      spots: String(item.spots_total ?? 1),
      urgent: false,
      location_name: item.location_name || event.location_name || event.city || item.city || '',
      venue: item.location_name || event.location_name || event.city || item.city || '',
      raw: {
        ...item,
        event
      }
    };
  });
}

const getSwipeInviteCards = getSwipePlanCards;

async function loadMyPlans() {
  const box = document.getElementById('profile-my-plans');
  if (!box) return [];
  const prefs = typeof _getUserPrefs === 'function' ? _getUserPrefs() : { plan_visibility: 'profile', invite_visibility: 'profile' };
  if ((typeof _planVisibilityValue === 'function' ? _planVisibilityValue(prefs) : (prefs.plan_visibility || prefs.invite_visibility || 'profile')) === 'hidden') {
    box.innerHTML = '<div class="draft-empty">Planovi su trenutno sakriveni sa tvog profila.</div>';
    return [];
  }
  if (!isLoggedIn() || !_isSupabaseConfigured()) {
    box.innerHTML = '<div class="draft-empty">Prijavi se da vidiš svoje planove.</div>';
    return [];
  }
  try {
    let plans = (await _loadPlans({
      creator_id: `eq.${getUser()?.id}`,
      order: 'created_at.desc',
      limit: '50'
    })).map(_mapPlanToCardLike);
    if (!plans.length && LEGACY_INVITE_COMPAT_MODE) {
      const rows = await _supaGet('invites', {
        select: 'id,event_id,title,description,spots_total,status,created_at,vibe_tags,events!event_id(id,title,city,location_name,starts_at)',
        creator_id: `eq.${getUser()?.id}`,
        order: 'created_at.desc',
        limit: '50'
      });
      plans = Array.isArray(rows) ? rows : [];
    }
    if (!plans.length) {
      box.innerHTML = '<div class="draft-empty">Još nemaš aktivnih planova.</div>';
      return [];
    }
    const legacyInviteIds = LEGACY_INVITE_COMPAT_MODE
      ? plans.filter(item => _isLegacyInviteItem(item) && item.event_id && item.events).map(item => item.id).filter(Boolean)
      : [];
    let counts = new Map();
    if (legacyInviteIds.length) {
      try {
        const apps = await _supaGet('invite_applications', {
          select: 'invite_id,app_status',
          invite_id: `in.(${legacyInviteIds.join(',')})`,
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
        console.warn('[mitmi] loadMyPlans applications:', e.message);
      }
    }
    box.innerHTML = plans.map(item => {
      const event = item.events || {};
      const count = counts.get(item.id) || { total: 0, approved: 0 };
      const full = item.event_id && item.spots_total && count.approved >= item.spots_total;
      const meta = _planMeta(item);
      const label = item.event_id
        ? (_isLegacyInviteItem(item) ? (full ? 'Popunjeno' : `${count.total} →`) : 'Otvoreno')
        : (item.organizer_id ? 'Za mesto' : 'Samostalno');
      const tagClass = item.event_id ? (full ? 'tag-green' : 'tag-purple') : 'tag-outline';
      const clickAction = item.event_id ? `openEventById('${_escHtml(item.event_id || event.id || '')}')` : 'void(0)';
      const signupMeta = item.event_id && _isLegacyInviteItem(item)
        ? `${_escHtml(String(count.total))} prijava · `
        : '';
      return `<div class="ev-row" onclick="${clickAction}"><div style="width:44px;height:44px;background:var(--purple-bg);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${_eventEmoji(item.category || event.category || 'drugo')}</div><div style="flex:1"><div class="ev-row-title">${_escHtml(item.title || 'Plan')}</div><div class="ev-row-meta">${_escHtml(meta)} · ${signupMeta}${_escHtml(String(item.spots_total || 1))} mesta</div>${_renderInviteVibes(item.vibe_tags)}</div><span class="tag ${tagClass}">${label}</span></div>`;
    }).join('');
    return plans;
  } catch (e) {
    console.warn('[mitmi] loadMyPlans:', e.message);
    box.innerHTML = '<div class="draft-empty">Planovi trenutno nisu dostupni.</div>';
    return [];
  }
}

const loadMyInvites = loadMyPlans;
