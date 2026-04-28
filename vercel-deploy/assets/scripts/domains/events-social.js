if (!Array.isArray(globalThis.BROWSE_PLAN_DATA)) {
  globalThis.BROWSE_PLAN_DATA = [];
}

async function _loadPlans(params = {}) {
  if (!_isSupabaseConfigured()) return [];
  try {
    const rows = await _supaGet('plans', {
      select: 'id,title,description,spots_total,status,created_at,creator_id,event_id,organizer_id,venue_id,category,event_tags,city,location_name,starts_at,source_url,events!event_id(id,creator_id,organizer_id,venue_id,title,description,category,event_tags,city,location_name,starts_at,cover_url,is_published,is_cancelled),profiles!creator_id(id,username,display_name,avatar_url,avg_rating),organizers!organizer_id(id,name,city)',
      ...params
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn('[mitmi] _loadPlans:', e.message);
    return [];
  }
}

function _mapPlanToCardLike(item = {}) {
  const event = item.events || {};
  const profile = item.profiles || {};
  return {
    id: item.id || '',
    source_type: 'plan',
    title: item.title || _langText('Plan', 'Plan'),
    description: item.description || '',
    spots_total: Number(item.spots_total || 1) || 1,
    status: item.status || 'open',
    created_at: item.created_at || '',
    creator_id: item.creator_id || '',
    event_id: item.event_id || event.id || '',
    organizer_id: item.organizer_id || event.organizer_id || null,
    venue_id: item.venue_id || event.venue_id || null,
    category: item.category || event.category || 'drugo',
    event_tags: item.event_tags || event.event_tags || [],
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

function _planMeta(item = {}) {
  const event = item.events || {};
  const organizer = item.organizers || {};
  const place = event.location_name || item.location_name || organizer.name || event.city || item.city || _langText('Lokacija nije upisana', 'Location not added');
  const timeLabel = event.starts_at
    ? _formatEventMeta(event)
    : (item.starts_at ? _formatEventMeta({ starts_at: item.starts_at, city: item.city, location_name: item.location_name }) : _langText('Termin će biti dodat', 'Time will be added'));
  return [place, timeLabel].filter(Boolean).join(' · ');
}

function _planCreatorLabel(profile = {}) {
  return profile.display_name || profile.username || _langText('mitmi korisnik', 'mitmi user');
}

function _planAvatar(profile = {}, name = '', sizeClass = 'av av-40 av-purple', clickable = false) {
  const clickAttr = clickable ? ` onclick="openOtherProfile('${_escHtml(profile.id || '')}')"` : '';
  if (profile.avatar_url) {
    return `<div class="${sizeClass}" style="background-image:url('${_safeCssUrl(profile.avatar_url)}');background-size:cover;background-position:center;${clickable ? 'cursor:pointer' : ''}"${clickAttr}></div>`;
  }
  return `<div class="${sizeClass}"${clickAttr}${clickable ? ' style="cursor:pointer"' : ''}>${_escHtml((name || 'M').charAt(0).toUpperCase())}</div>`;
}

function _planActionButtons(item = {}, options = {}) {
  const profile = item.profiles || {};
  const name = _planCreatorLabel(profile);
  const isOwn = item.creator_id === getUser()?.id;
  if (isOwn) return `<span class="tag tag-outline">${_langText('Tvoj plan', 'Your plan')}</span>`;

  const safeProfileId = _escHtml(profile.id || '');
  const safeName = options.jsName || _escJsArg(name);
  const safeTitle = options.jsTitle || _escJsArg(item.title || _langText('Plan', 'Plan'));
  const safeEventTitle = options.jsEventTitle || _escJsArg(options.eventTitle || item.events?.title || _langText('Događaj', 'Event'));
  const safeEventId = _escHtml(item.event_id || item.events?.id || '');
  const safePlanId = _escHtml(item.id || '');
  const safeHtmlName = options.htmlName || _escHtml(name).replace(/'/g, '&#39;');

  if (safeEventId) {
    return `<div style="display:flex;gap:8px"><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openPlanDirectChat('${safeProfileId}','${safeName}','','${safeEventId}','${safeTitle}','${safeEventTitle}','${safePlanId}')">${_langText('Poruka', 'Message')}</button><button class="btn btn-purple btn-sm" onclick="event.stopPropagation();applyToPlan('','${safeProfileId}','${safeName}','${safeTitle}','${safeEventId}','${safeEventTitle}','${safePlanId}','plan')">${_langText('Javi se', 'Reach out')}</button></div>`;
  }

  return `<div style="display:flex;gap:8px"><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openDirectChat('${safeProfileId}','${safeHtmlName}')">${_langText('Poruka', 'Message')}</button><button class="btn btn-purple btn-sm" onclick="event.stopPropagation();openDirectChat('${safeProfileId}','${safeHtmlName}')">${_langText('Javi se', 'Reach out')}</button></div>`;
}

function _renderEventPlanRow(item = {}, eventTitle = _langText('Događaj', 'Event')) {
  const profile = item.profiles || {};
  const name = _planCreatorLabel(profile);
  const rating = Number(profile.avg_rating || 0).toFixed(1);
  const avatar = _planAvatar(profile, name, 'av av-32 av-purple', true);
  const tagHtml = typeof _renderEventTagPills === 'function' ? _renderEventTagPills(item.event_tags || [], 3) : '';
  const buttons = _planActionButtons(item, {
    eventTitle,
    jsName: _escJsArg(name),
    jsTitle: _escJsArg(item.title || _langText('Plan', 'Plan')),
    jsEventTitle: _escJsArg(eventTitle)
  });
  return `<div class="inv-row">
    ${avatar}
    <div style="flex:1">
      <div class="inv-row-title">${_escHtml(item.title || _langText('Plan za događaj', 'Event plan'))}</div>
      <div class="inv-row-meta">${_escHtml(name)} · ★ ${_escHtml(rating)} · <span class="tag tag-purple" style="padding:1px 7px;font-size:10px">${_escHtml(String(item.spots_total ?? 1))} ${_langText('mesta', 'spots')}</span></div>
      ${_renderInviteVibes(item.vibe_tags)}
      ${tagHtml ? `<div class="event-tag-row" style="margin-top:8px">${tagHtml}</div>` : ''}
    </div>
    ${buttons}
  </div>`;
}

function _renderBrowsePlanCard(item = {}) {
  const profile = item.profiles || {};
  const event = item.events || {};
  const name = _planCreatorLabel(profile);
  const label = _planMeta(item);
  const avatar = _planAvatar(profile, name);
  const eventId = item.event_id || event.id || '';
  const openAction = eventId ? `openEventById('${_escHtml(eventId)}')` : `openOtherProfile('${_escHtml(profile.id || '')}')`;
  const contextBadge = eventId
    ? `<span class="tag tag-outline">${_langText('Za događaj', 'For event')}</span>`
    : (item.organizer_id ? `<span class="tag tag-outline">${_langText('Za mesto', 'For venue')}</span>` : `<span class="tag tag-outline">${_langText('Samostalni plan', 'Standalone plan')}</span>`);
  const htmlName = _escHtml(name).replace(/'/g, '&#39;');
  const tagHtml = typeof _renderEventTagPills === 'function' ? _renderEventTagPills(item.event_tags || [], 3) : '';
  const buttons = _planActionButtons(item, {
    eventTitle: event.title || _langText('Događaj', 'Event'),
    htmlName,
    jsName: _escJsArg(name),
    jsTitle: _escJsArg(item.title || _langText('Plan', 'Plan')),
    jsEventTitle: _escJsArg(event.title || _langText('Događaj', 'Event'))
  });
  return `<div class="inv-card" onclick="${openAction}">${avatar}<div style="flex:1;min-width:0"><div class="inv-title">${_escHtml(item.title || _langText('Plan', 'Plan'))}</div><div class="inv-meta">📍 ${_escHtml(label)} · <span class="tag tag-purple" style="padding:2px 7px;font-size:10px">${_escHtml(String(item.spots_total ?? 1))} ${_langText('mesta', 'spots')}</span></div>${_renderInviteVibes(item.vibe_tags)}${tagHtml ? `<div class="event-tag-row" style="margin-top:8px">${tagHtml}</div>` : ''}<div style="display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap"><div class="av av-32 av-purple">${_escHtml((name || 'M').charAt(0).toUpperCase())}</div><span style="font-size:12px;font-weight:500;color:var(--ink2)">${_escHtml(name)} · ★ ${_escHtml(Number(profile.avg_rating || 0).toFixed(1))}</span>${contextBadge}</div><div style="display:flex;gap:8px;margin-top:10px">${buttons}</div></div></div>`;
}

function _renderMyPlanRow(item = {}) {
  const event = item.events || {};
  const meta = _planMeta(item);
  const label = item.event_id ? _langText('Otvoreno', 'Open') : (item.organizer_id ? _langText('Za mesto', 'For venue') : _langText('Samostalno', 'Standalone'));
  const tagClass = item.event_id ? 'tag-purple' : 'tag-outline';
  const clickAction = item.event_id ? `openEventById('${_escHtml(item.event_id || event.id || '')}')` : 'void(0)';
  const tagHtml = typeof _renderEventTagPills === 'function' ? _renderEventTagPills(item.event_tags || [], 3) : '';
  return `<div class="ev-row" onclick="${clickAction}"><div style="width:44px;height:44px;background:var(--purple-bg);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${_eventEmoji(item.category || event.category || 'drugo')}</div><div style="flex:1"><div class="ev-row-title">${_escHtml(item.title || _langText('Plan', 'Plan'))}</div><div class="ev-row-meta">${_escHtml(meta)} · ${_escHtml(String(item.spots_total || 1))} ${_langText('mesta', 'spots')}</div>${_renderInviteVibes(item.vibe_tags)}${tagHtml ? `<div class="event-tag-row" style="margin-top:8px">${tagHtml}</div>` : ''}</div><span class="tag ${tagClass}">${label}</span></div>`;
}

async function loadEventPlans(eventId) {
  const box = document.getElementById('event-plans-list');
  if (!box) return [];
  if (!eventId || !_isSupabaseConfigured()) {
    box.innerHTML = `<div class="draft-empty">${_langText('Još nema javnih planova za ovaj događaj.', 'There are no public plans for this event yet.')}</div>`;
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
    items = items.filter(item => !isProfileBlocked(item.creator_id));
    if (!items.length) {
      box.innerHTML = `<div class="draft-empty">${_langText('Još nema javnih planova za ovaj događaj.', 'There are no public plans for this event yet.')}</div>`;
      return [];
    }
    const eventTitle = document.getElementById('event-title')?.textContent || items[0]?.events?.title || _langText('Događaj', 'Event');
    box.innerHTML = items.map(item => _renderEventPlanRow(item, eventTitle)).join('');
    return items;
  } catch (e) {
    console.warn('[mitmi] loadEventPlans:', e.message);
    box.innerHTML = `<div class="draft-empty">${_langText('Planovi trenutno nisu dostupni.', 'Plans are currently unavailable.')}</div>`;
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
    if (isLoggedIn()) await loadBlockedProfileIds();
    items = items.filter(item => !isProfileBlocked(item.creator_id));
    globalThis.BROWSE_PLAN_DATA = items;
    if (!items.length) {
      box.innerHTML = `<div class="draft-empty">${_langText('Još nema aktivnih planova.', 'There are no active plans yet.')}</div>`;
      return [];
    }
    box.innerHTML = items.map(_renderBrowsePlanCard).join('');
    return items;
  } catch (e) {
    console.warn('[mitmi] loadBrowsePlans:', e.message);
    globalThis.BROWSE_PLAN_DATA = [];
    box.innerHTML = `<div class="draft-empty">${_langText('Aktivni planovi trenutno nisu dostupni.', 'Active plans are currently unavailable.')}</div>`;
    return [];
  }
}

const loadBrowseInvites = loadBrowsePlans;

function getSwipePlanCards() {
  const plans = Array.isArray(globalThis.BROWSE_PLAN_DATA) ? globalThis.BROWSE_PLAN_DATA : [];
  return plans.map(item => {
    const event = item.events || {};
    const profile = item.profiles || {};
    const name = _planCreatorLabel(profile);
    const cat = _eventVisualCategory(item.category || event.category || 'drugo');
    const eventId = item.event_id || event.id || '';
    return {
      id: eventId || `plan-${item.id || ''}`,
      swipe_key: `plan-${item.id || eventId || ''}`,
      swipeType: 'plan',
      inviteId: '',
      planId: item.id || '',
      eventId,
      creatorId: item.creator_id || '',
      creatorName: name,
      title: item.title || _langText('Plan', 'Plan'),
      meta: _planMeta(item),
      date: event.starts_at ? _formatEventMeta(event) : (item.starts_at ? _formatEventMeta({ starts_at: item.starts_at, city: item.city, location_name: item.location_name }) : _langText('Termin će biti dodat', 'Time will be added')),
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
      raw: { ...item, event }
    };
  });
}

const getSwipeInviteCards = getSwipePlanCards;

async function loadMyPlans() {
  const box = document.getElementById('profile-my-plans');
  if (!box) return [];
  const prefs = typeof _getUserPrefs === 'function' ? _getUserPrefs() : { plan_visibility: 'profile', invite_visibility: 'profile' };
  const planVisibility = typeof _planVisibilityValue === 'function'
    ? _planVisibilityValue(prefs)
    : (prefs.plan_visibility || prefs.invite_visibility || 'profile');
  if (planVisibility === 'hidden') {
    box.innerHTML = `<div class="draft-empty">${_langText('Planovi su trenutno sakriveni sa tvog profila.', 'Plans are currently hidden from your profile.')}</div>`;
    return [];
  }
  if (!isLoggedIn() || !_isSupabaseConfigured()) {
    box.innerHTML = `<div class="draft-empty">${_langText('Prijavi se da vidiš svoje planove.', 'Sign in to see your plans.')}</div>`;
    return [];
  }
  try {
    const plans = (await _loadPlans({
      creator_id: `eq.${getUser()?.id}`,
      order: 'created_at.desc',
      limit: '50'
    })).map(_mapPlanToCardLike);
    if (!plans.length) {
      box.innerHTML = `<div class="draft-empty">${_langText('Još nemaš aktivnih planova.', 'You do not have any active plans yet.')}</div>`;
      return [];
    }
    box.innerHTML = plans.map(_renderMyPlanRow).join('');
    return plans;
  } catch (e) {
    console.warn('[mitmi] loadMyPlans:', e.message);
    box.innerHTML = `<div class="draft-empty">${_langText('Planovi trenutno nisu dostupni.', 'Plans are currently unavailable.')}</div>`;
    return [];
  }
}

const loadMyInvites = loadMyPlans;
