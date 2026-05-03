function _venueBadgeText(status = '') {
  if (status === 'verified') return _langText('Profil pregledan', 'Reviewed');
  if (status === 'pending') return _langText('Na proveri', 'Under review');
  if (status === 'rejected') return _langText('Potrebna dopuna', 'Needs update');
  return _langText('Organizator', 'Organizer');
}

function _organizerBadgeText(status = '') {
  if (status === 'claimed') return _langText('Profil povezan', 'Claimed');
  if (status === 'unclaimed') return _langText('Organizator', 'Organizer');
  if (status === 'merged') return _langText('Spojen organizer', 'Merged');
  return _langText('Organizator', 'Organizer');
}

function _venueTypeLabel(venue = {}) {
  const parts = [_organizerTypeLabel(venue.venue_type), venue.city].filter(Boolean);
  const meta = parts.join(' · ');
  const badge = _venueBadgeText(venue.status);
  return [meta, badge].filter(Boolean).join(' · ');
}

function _isOrganizerEntity(entity = null) {
  return !!entity && (entity.kind === 'organizer' || entity.entity_type === 'organizer');
}

let _adminEditingOrganizerId = null;

function _venueMissingOrganizerColumnFromError(error) {
  const msg = String(error?.message || error?.data?.message || '');
  const match = msg.match(/Could not find the '([^']+)' column of 'organizers'/i);
  return match?.[1] || null;
}

function _venueUnsupportedOrganizerColumnsCache() {
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

function _venuePersistUnsupportedOrganizerColumns(columns = new Set()) {
  const arr = Array.from(columns).filter(Boolean);
  globalThis.__mitmiUnsupportedOrganizerColumns = arr;
  try {
    sessionStorage.setItem('mitmi_unsupported_organizer_columns', arr.join(','));
  } catch (e) {}
}

function _venueStripUnsupportedOrganizerColumns(payload = {}) {
  const unsupported = _venueUnsupportedOrganizerColumnsCache();
  if (!unsupported.size) return { ...payload };
  const next = { ...payload };
  unsupported.forEach((col) => {
    if (Object.prototype.hasOwnProperty.call(next, col)) delete next[col];
  });
  return next;
}

async function _patchOrganizerWithSchemaFallback(organizerId, payload = {}) {
  let safePayload = _venueStripUnsupportedOrganizerColumns(payload);
  let lastError = null;
  for (let i = 0; i < 6; i += 1) {
    try {
      return await _supaFetch(`/rest/v1/organizers?id=eq.${organizerId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(safePayload)
      });
    } catch (error) {
      lastError = error;
      const missingColumn = _venueMissingOrganizerColumnFromError(error);
      if (!missingColumn || !Object.prototype.hasOwnProperty.call(safePayload, missingColumn)) {
        throw error;
      }
      const unsupported = _venueUnsupportedOrganizerColumnsCache();
      unsupported.add(missingColumn);
      _venuePersistUnsupportedOrganizerColumns(unsupported);
      const { [missingColumn]: _removed, ...nextPayload } = safePayload;
      safePayload = nextPayload;
    }
  }
  throw lastError || new Error('Organizer update failed');
}

async function openAdminEditOrganizerProfile(organizerId = '') {
  if (!(typeof isAdminUser === 'function' && isAdminUser())) return;
  const id = String(organizerId || _currentPublicVenueTarget?.id || '').trim();
  if (!id) {
    showToast(_langText('Organizer profil nije pronađen', 'Organizer profile not found'), 'error');
    return;
  }
  _adminEditingOrganizerId = id;
  nav('edit-venue');
  setTimeout(() => loadEditVenueForm(), 0);
}

function _normalizeVenueTarget(entity = null) {
  if (!entity) return null;
  if (_isOrganizerEntity(entity)) {
    const publicType = _organizerTypeLabel(
      entity.organizer_type || entity.venue_type || _langText('Profil organizatora', 'Organizer profile')
    );
    return {
      ...entity,
      id: entity.id,
      kind: 'organizer',
      entity_type: 'organizer',
      venue_name: entity.name || entity.venue_name || _langText('Organizator', 'Organizer'),
      venue_type: publicType,
      city: entity.city || '',
      description: entity.public_description || entity.source_notes || entity.description || '',
      public_address: entity.public_address || '',
      public_contact_email: entity.public_contact_email || '',
      public_contact_phone: entity.public_contact_phone || '',
      instagram_handle: entity.instagram_handle || '',
      website_url: entity.website_url || '',
      cover_url: entity.cover_url || '',
      status: entity.status || 'unclaimed',
      followers_count: 0
    };
  }
  return {
    ...entity,
    kind: entity.kind || 'venue',
    entity_type: entity.entity_type || 'venue'
  };
}

function _venueInitial(name = '') {
  return (name || 'O').trim().charAt(0).toUpperCase() || 'O';
}

async function _loadVenueProfile(target = null) {
  if (!_isSupabaseConfigured()) return null;
  const lookup = target || _currentPublicVenueTarget || _currentPublicVenueId || null;
  const params = { select: '*', limit: '1' };
  if (!lookup) return null;
  if (_isOrganizerEntity(lookup)) return _normalizeVenueTarget(lookup);
  const cacheId = typeof lookup === 'object' ? (lookup.id || lookup.profile_id || lookup.venue_name || 'lookup') : String(lookup);
  const cached = _getCached('venuePublic', cacheId);
  if (cached) return cached;

  if (typeof lookup === 'object' && lookup.id) params.id = `eq.${lookup.id}`;
  else if (typeof lookup === 'object' && lookup.profile_id) params.profile_id = `eq.${lookup.profile_id}`;
  else if (_looksLikeUuid(lookup)) params.id = `eq.${lookup}`;
  else params.venue_name = `eq.${lookup}`;

  try {
    const rows = await _supaGet('v_venue_profile', params);
    const profile = Array.isArray(rows) ? (rows[0] || null) : null;
    _setCached('venuePublic', cacheId, profile, CACHE_TTL.venue);
    return profile;
  } catch (e) {
    try {
      const fallback = await _supaGet('venues', {
        ...params,
        select: 'id,profile_id,venue_name,venue_type,city,description,cover_url,status,followers_count'
      });
      const venue = Array.isArray(fallback) ? (fallback[0] || null) : null;
      _setCached('venuePublic', cacheId, venue, CACHE_TTL.venue);
      return venue;
    } catch (_) {
      return null;
    }
  }
}

async function _loadOrganizerProfile(target = null) {
  if (!_isSupabaseConfigured()) return null;
  const lookup = target || _currentPublicVenueTarget || null;
  if (!lookup) return null;
  const params = { limit: '1' };
  if (typeof lookup === 'object' && lookup.id) params.id = `eq.${lookup.id}`;
  else if (_looksLikeUuid(lookup)) params.id = `eq.${lookup}`;
  else params.name = `eq.${lookup}`;
  try {
    const selectVariants = [
      'id,name,city,organizer_type,public_address,public_description,instagram_handle,website_url,public_contact_email,public_contact_phone,source_notes,status,created_at',
      'id,name,city,organizer_type,instagram_handle,status,created_at',
      'id,name,city,organizer_type,status,created_at',
      'id,name,status,created_at'
    ];
    let rows = [];
    for (const select of selectVariants) {
      try {
        rows = await _supaGet('organizers', { ...params, select });
        break;
      } catch (e) {
        rows = [];
      }
    }
    const organizer = Array.isArray(rows) ? (rows[0] || null) : null;
    return organizer ? _normalizeVenueTarget(organizer) : null;
  } catch (e) {
    return null;
  }
}

async function _loadMyOrganizerClaimRequest(organizerId) {
  if (!organizerId || !isLoggedIn() || !_isSupabaseConfigured()) return null;
  try {
    const rows = await _supaGet('organizer_claim_requests', {
      select: 'id,status,created_at,organizer_id,requester_id',
      organizer_id: `eq.${organizerId}`,
      requester_id: `eq.${getUser()?.id}`,
      order: 'created_at.desc',
      limit: '1'
    });
    return Array.isArray(rows) ? (rows[0] || null) : null;
  } catch (e) {
    return null;
  }
}

async function requestOrganizerClaim() {
  const target = _currentPublicVenueTarget;
  if (!_isOrganizerEntity(target) || !target?.id) return;
  if (!isLoggedIn()) {
    showToast('Prijavi se da zatražiš preuzimanje profila', 'info', 2200);
    nav('login');
    return;
  }
  try {
    const existing = await _loadMyOrganizerClaimRequest(target.id);
    if (existing?.status === 'pending') {
      showToast('Zahtev je već poslat adminu', 'info', 1800);
      return;
    }
    await _supaFetch('/rest/v1/organizer_claim_requests', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        organizer_id: target.id,
        requester_id: getUser()?.id,
        claim_message: 'Zahtev za preuzimanje organizer profila poslat sa javnog profila.'
      })
    });
    showToast('Zahtev za preuzimanje je poslat adminu', 'success', 2200);
    renderPublicVenueProfile().catch(() => {});
  } catch (e) {
    console.warn('[svita] requestOrganizerClaim:', e.message);
    showToast('Slanje zahteva trenutno nije uspelo', 'error');
  }
}

async function _loadVenueFollowersCount(venueId) {
  if (!venueId || !_isSupabaseConfigured()) return 0;
  try {
    const analytics = await _supaGet('v_venue_analytics', {
      select: 'followers_count',
      venue_id: `eq.${venueId}`,
      limit: '1'
    });
    const count = Array.isArray(analytics) ? analytics[0]?.followers_count : null;
    if (Number.isFinite(Number(count))) return Number(count);
  } catch (e) {}
  try {
    const rows = await _supaGet('venues', {
      select: 'followers_count',
      id: `eq.${venueId}`,
      limit: '1'
    });
    const count = Array.isArray(rows) ? rows[0]?.followers_count : null;
    return Number.isFinite(Number(count)) ? Number(count) : 0;
  } catch (e) {
    return 0;
  }
}

async function _isVenueFollowedByMe(venueId) {
  if (!venueId || !isLoggedIn() || !_isSupabaseConfigured()) return false;
  try {
    const rows = await _supaGet('venue_follows', {
      select: 'user_id',
      venue_id: `eq.${venueId}`,
      user_id: `eq.${getUser()?.id}`,
      limit: '1'
    });
    return !!(Array.isArray(rows) && rows[0]);
  } catch (e) {
    return false;
  }
}

async function _loadVenuePublicEvents(venue = null) {
  const data = _normalizeVenueTarget(venue || _currentPublicVenueTarget || _currentPublicVenueId);
  const venueId = typeof data === 'object' ? data.id : data;
  const profileId = typeof data === 'object' ? data.profile_id : null;
  const organizerId = _isOrganizerEntity(data) ? data.id : null;
  if (!venueId || !_isSupabaseConfigured()) return [];
  try {
    const orClause = organizerId
      ? `(organizer_id.eq.${organizerId})`
      : profileId
        ? `(venue_id.eq.${venueId},creator_id.eq.${profileId})`
        : `(venue_id.eq.${venueId})`;
    const rows = await _supaGet('events', {
      select: 'id,creator_id,venue_id,organizer_id,title,description,category,event_tags,city,location_name,public_address,starts_at,capacity,attendee_count,ticket_price_rsd,cover_url,avg_rating,rating_count,is_published,is_cancelled,created_at',
      or: orClause,
      is_published: 'eq.true',
      is_cancelled: 'eq.false',
      is_hidden: 'eq.false',
      order: 'starts_at.asc',
      limit: '24'
    });
    return Array.isArray(rows) ? rows.map(_mapDbEventToCard) : [];
  } catch (e) {
    return [];
  }
}

async function loadMyVenueAnalytics(venue = null) {
  const currentVenue = venue || await _getMyManagedOrganizerTarget();
  const followersEl = document.getElementById('venue-stat-followers');
  const activeEl = document.getElementById('venue-stat-active-events');
  const regsEl = document.getElementById('venue-stat-registrations');
  const followersLabelEl = document.getElementById('venue-stat-followers-label');
  const activeLabelEl = document.getElementById('venue-stat-active-events-label');
  const regsLabelEl = document.getElementById('venue-stat-registrations-label');
  const summaryEl = document.getElementById('venue-insights-summary');
  const noteEl = document.getElementById('venue-insights-note');

  const setLabels = (mode = 'venue') => {
    if (followersLabelEl) followersLabelEl.textContent = mode === 'organizer' ? 'prosek' : 'pratilaca';
    if (activeLabelEl) activeLabelEl.textContent = 'aktivnih';
    if (regsLabelEl) regsLabelEl.textContent = 'prijavljenih';
  };

  const summarizeEventRatings = (items = []) => {
    const rows = Array.isArray(items) ? items : [];
    const rated = rows.filter(item => Number(item?.raw?.rating_count || 0) > 0);
    const ratingCount = rated.reduce((sum, item) => sum + Number(item?.raw?.rating_count || 0), 0);
    const weightedSum = rated.reduce((sum, item) => {
      const count = Number(item?.raw?.rating_count || 0);
      const avg = Number(item?.raw?.avg_rating || 0);
      return sum + (avg * count);
    }, 0);
    return {
      ratingCount,
      avgRating: ratingCount > 0 ? weightedSum / ratingCount : 0,
      ratedEvents: rated.length
    };
  };

  const renderInsights = (items = [], analytics = null) => {
    if (!summaryEl || !noteEl) return;
    const totalEvents = Array.isArray(items) ? items.length : 0;
    const ratingSummary = summarizeEventRatings(items);
    if (ratingSummary.ratingCount > 0) {
      summaryEl.textContent = _langText(
        `${ratingSummary.avgRating.toFixed(1)} / 5 na ${ratingSummary.ratingCount} ocena`,
        `${ratingSummary.avgRating.toFixed(1)} / 5 from ${ratingSummary.ratingCount} ratings`
      );
      noteEl.textContent = ratingSummary.ratedEvents === 1
        ? _langText('Jedan događaj već ima ocene publike i utiče na ukupni utisak o organizer profilu.', 'One event already has audience ratings and shapes the overall impression of your organizer profile.')
        : _langText(`${ratingSummary.ratedEvents} događaja već imaju ocene publike. Prati utiske posle događaja da vidiš šta najbolje prolazi.`, `${ratingSummary.ratedEvents} events already have audience ratings. Follow post-event feedback to see what performs best.`);
      return;
    }
    const registrations = Number(analytics?.upcoming_registrations ?? analytics?.total_registrations ?? 0);
    if (totalEvents > 0 || registrations > 0) {
      summaryEl.textContent = totalEvents > 0
        ? _langText(`${totalEvents} aktivna događaja trenutno grade tvoj profil`, `${totalEvents} active events are currently building your profile`)
        : _langText('Organizer profil je aktivan', 'Organizer profile is active');
      noteEl.textContent = registrations > 0
        ? _langText(`Za sada imaš ${registrations} prijavljenih na aktuelne događaje. Ocene će se pojaviti kada posetioci pošalju utiske.`, `You currently have ${registrations} registrations on active events. Ratings will appear once visitors send feedback.`)
        : _langText('Ocene će se pojaviti kada posetioci posle događaja počnu da šalju utiske.', 'Ratings will appear once visitors start leaving feedback after events.');
      return;
    }
    summaryEl.textContent = _langText('Još nema dovoljno podataka za sažetak.', 'There is not enough data for a summary yet.');
    noteEl.textContent = _langText('Detaljnija analitika će se pojaviti kada tvoji događaji dobiju više stvarnih prijava, sačuvanih događaja i interakcija.', 'More detailed analytics will appear when your events receive more real registrations, saves and interactions.');
  };

  if (!currentVenue) {
    if (followersEl) followersEl.textContent = '0';
    if (activeEl) activeEl.textContent = '0';
    if (regsEl) regsEl.textContent = '0';
    setLabels('venue');
    renderInsights([], null);
    return null;
  }

  if (_isOrganizerEntity(currentVenue)) {
    const items = await loadMyVenueEvents(currentVenue);
    const upcoming = items.filter(item => new Date(item.date || item.starts_at || Date.now()) >= new Date(new Date().setHours(0, 0, 0, 0)));
    const registrations = items.reduce((sum, item) => sum + Number(item.raw?.attendee_count || 0), 0);
    const ratingSummary = summarizeEventRatings(items);
    setLabels('organizer');
    if (followersEl) followersEl.textContent = ratingSummary.ratingCount > 0 ? ratingSummary.avgRating.toFixed(1) : '—';
    if (activeEl) activeEl.textContent = String(upcoming.length);
    if (regsEl) regsEl.textContent = String(registrations);
    const organizerAnalytics = {
      followers_count: 0,
      active_events_count: upcoming.length,
      upcoming_registrations: registrations,
      avg_rating: ratingSummary.avgRating,
      rating_count: ratingSummary.ratingCount,
      rated_events_count: ratingSummary.ratedEvents
    };
    renderInsights(items, organizerAnalytics);
    return organizerAnalytics;
  }

  const cached = _getCached('venueAnalytics', currentVenue.id);
  if (cached) {
    setLabels('venue');
    if (followersEl) followersEl.textContent = String(cached.followers_count ?? 0);
    if (activeEl) activeEl.textContent = String(cached.active_events_count ?? 0);
    if (regsEl) regsEl.textContent = String(cached.upcoming_registrations ?? cached.total_registrations ?? 0);
    loadMyVenueEvents(currentVenue).then(items => renderInsights(items, cached)).catch(() => renderInsights([], cached));
    return cached;
  }

  try {
    const rows = await _supaGet('v_venue_analytics', {
      select: '*',
      venue_id: `eq.${currentVenue.id}`,
      limit: '1'
    });
    const analytics = Array.isArray(rows) ? (rows[0] || null) : null;
    if (analytics) {
      setLabels('venue');
      if (followersEl) followersEl.textContent = String(analytics.followers_count ?? 0);
      if (activeEl) activeEl.textContent = String(analytics.active_events_count ?? 0);
      if (regsEl) regsEl.textContent = String(analytics.upcoming_registrations ?? analytics.total_registrations ?? 0);
      _setCached('venueAnalytics', currentVenue.id, analytics, CACHE_TTL.venueAnalytics);
      loadMyVenueEvents(currentVenue).then(items => renderInsights(items, analytics)).catch(() => renderInsights([], analytics));
      return analytics;
    }
  } catch (e) {
    console.warn('[svita] loadMyVenueAnalytics:', e.message);
  }

  const items = await loadMyVenueEvents(currentVenue);
  const followers = await _loadVenueFollowersCount(currentVenue.id);
  const upcoming = items.filter(item => new Date(item.date || item.starts_at || Date.now()) >= new Date(new Date().setHours(0, 0, 0, 0)));
  const registrations = items.reduce((sum, item) => sum + Number(item.raw?.attendee_count || 0), 0);
  setLabels('venue');
  if (followersEl) followersEl.textContent = String(followers);
  if (activeEl) activeEl.textContent = String(upcoming.length);
  if (regsEl) regsEl.textContent = String(registrations);
  const fallback = { followers_count: followers, active_events_count: upcoming.length, upcoming_registrations: registrations };
  _setCached('venueAnalytics', currentVenue.id, fallback, CACHE_TTL.venueAnalytics);
  renderInsights(items, fallback);
  return fallback;
}

async function loadMyVenueEvents(target = null) {
  if (!isLoggedIn()) return [];
  try {
    target = target || await _getMyManagedOrganizerTarget();
    const params = {
      select: 'id,creator_id,venue_id,organizer_id,title,description,category,event_tags,city,location_name,public_address,starts_at,capacity,attendee_count,ticket_price_rsd,cover_url,avg_rating,rating_count,is_published,is_cancelled,created_at',
      order: 'starts_at.asc',
      limit: '24'
    };
    if (_isOrganizerEntity(target) && target?.id) {
      params.organizer_id = `eq.${target.id}`;
    } else {
      params.creator_id = `eq.${getUser()?.id}`;
    }
    const rows = await _supaGet('events', params);
    return Array.isArray(rows) ? rows.map(_mapDbEventToCard) : [];
  } catch (e) {
    console.warn('[svita] loadMyVenueEvents:', e.message);
    return [];
  }
}

function renderVenueEvents(items = []) {
  const dashGrid = document.getElementById('venue-events-list');
  const publicGrid = document.getElementById('vp-events-grid');
  const publicCount = document.getElementById('vp-events-count');

  if (publicCount) publicCount.textContent = String(items.length);

  const cardsHtml = !items.length
    ? `<div class="draft-empty">${_langText('Još nema objavljenih događaja.', 'There are no published events yet.')}</div>`
    : items.map(item => {
        const raw = item.raw || {};
        const capacity = Number(raw.capacity || 0);
        const attendees = Number(raw.attendee_count || 0);
        const pct = capacity > 0 ? Math.min(100, Math.round((attendees / capacity) * 100)) : 0;
        const badgeClass = new Date(item.date || item.starts_at || Date.now()) < new Date(new Date().setHours(0, 0, 0, 0)) ? 'tag-gray' : 'tag-green';
        const badgeLabel = badgeClass === 'tag-gray' ? _langText('Završen', 'Finished') : _langText('Aktivan', 'Active');
        const coverStyle = item.cover_url ? ` style="background-image:url('${_safeCssUrl(item.cover_url)}');background-size:cover;background-position:center"` : '';
        const tagHtml = typeof _renderEventTagPills === 'function' ? _renderEventTagPills(item.tags || item.raw?.event_tags || [], 3) : '';
        return `<div class="venue-ev-card" onclick="openEventById('${_escHtml(item.id)}')">
          <div class="venue-ev-h"><div class="venue-ev-title">${_escHtml(item.title)}</div><span class="tag ${badgeClass}">${badgeLabel}</span></div>
          <div class="venue-ev-meta">${_escHtml(item.meta || _langText('Detalji nisu upisani', 'Details have not been added'))}</div>
          ${tagHtml ? `<div class="event-tag-row" style="margin-top:8px;margin-bottom:8px">${tagHtml}</div>` : ''}
          ${Number(raw.rating_count || 0) > 0 ? `<div class="admin-mini" style="margin-bottom:8px">★ ${_escHtml(Number(raw.avg_rating || 0).toFixed(1))} · ${_langText(`${_escHtml(String(Number(raw.rating_count || 0)))} ocena`, `${_escHtml(String(Number(raw.rating_count || 0)))} ratings`)}</div>` : ''}
          <div class="venue-bar-row"><span class="venue-bar-lbl">${_langText('Prijavljeni', 'Attendees')}</span><div class="venue-bar"><div class="venue-bar-fill" style="width:${pct}%"></div></div><span class="venue-bar-pct">${capacity > 0 ? `${attendees}/${capacity}` : `${attendees}`}</span></div>
        </div>`;
      }).join('');

  if (dashGrid) dashGrid.innerHTML = cardsHtml;

  if (publicGrid) {
    publicGrid.innerHTML = !items.length
      ? `<div class="draft-empty" style="grid-column:1/-1">${_langText('Još nema objavljenih događaja.', 'There are no published events yet.')}</div>`
      : items.map(item => {
          const coverStyle = item.cover_url ? ` style="background-image:url('${_safeCssUrl(item.cover_url)}');background-size:cover;background-position:center"` : '';
          const spotsLabel = item.spotsLabel || _eventSpotsLabel(item.spots, item.attendee_count);
          const spotsVariant = item.spotsVariant || 'neutral';
          return `<div class="ev-card" onclick="openEventById('${_escHtml(item.id)}')">
            <div class="ev-img ${_escHtml(item.bg)}"${coverStyle}><span class="tag tag-purple" style="font-size:10px">${_eventEmoji(item.cat)}</span></div>
            <div class="ev-body">
              <div class="ev-title">${_escHtml(item.title)}</div>
              <div class="ev-meta">${_escHtml(item.meta || _langText('Detalji nisu upisani', 'Details have not been added'))}</div>
              <div class="ev-footer"><span class="ev-spots ev-spots-${_escHtml(spotsVariant)}">${_escHtml(spotsLabel)}</span></div>
            </div>
          </div>`;
        }).join('');
  }
}

async function renderPublicVenueProfile(venue = null) {
  let data = _normalizeVenueTarget(venue || _currentPublicVenueTarget || null);
  if (!data) {
    data = await _loadVenueProfile(_currentPublicVenueTarget || _currentPublicVenueId);
    if (!data && _looksLikeUuid(_currentPublicVenueId || '')) {
      data = await _loadOrganizerProfile(_currentPublicVenueId);
    }
  }
  if (!data) return;
  _currentPublicVenueTarget = data;
  _currentPublicVenueId = data.id;
  const ownVenue = isLoggedIn() ? await _getMyVenue().catch(() => null) : null;
  const isOrganizer = _isOrganizerEntity(data);
  const isOwner = isOrganizer
    ? !!(data.claimed_by_profile_id && data.claimed_by_profile_id === getUser()?.id)
    : !!(ownVenue?.id && ownVenue.id === data.id);
  const followersCount = isOrganizer
    ? 0
    : Number(data.followers_count ?? await _loadVenueFollowersCount(data.id) ?? 0);
  const followed = isOwner || isOrganizer ? false : await _isVenueFollowedByMe(data.id);
  const items = await _loadVenuePublicEvents(data);
  const organizerRatingCount = items.reduce((sum, item) => sum + Number(item?.raw?.rating_count || 0), 0);
  const organizerWeightedRating = items.reduce((sum, item) => {
    const count = Number(item?.raw?.rating_count || 0);
    const avg = Number(item?.raw?.avg_rating || 0);
    return sum + (avg * count);
  }, 0);
  const ratingCount = isOrganizer ? organizerRatingCount : Number(data.rating_count || 0);
  const avgRating = isOrganizer
    ? (ratingCount > 0 ? (organizerWeightedRating / ratingCount).toFixed(1) : '0.0')
    : Number(data.avg_rating || data.rating || 0).toFixed(1);
  const claimRequest = isOrganizer ? await _loadMyOrganizerClaimRequest(data.id) : null;

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText('vp-name', data.venue_name || _langText('Organizator', 'Organizer'));
  setText('vp-title', data.venue_name || _langText('Organizator', 'Organizer'));
  setText('vp-type', isOrganizer
    ? [_organizerTypeLabel(data.organizer_type || data.venue_type), data.city, _organizerBadgeText(data.status)].filter(Boolean).join(' · ')
    : _venueTypeLabel(data));
  setText('vp-av', _venueInitial(data.venue_name));
  setText('vp-desc', data.description || (isOrganizer
    ? _langText('Opis organizatora još nije dodat.', 'Organizer description has not been added yet.')
    : _langText('Opis mesta još nije dodat.', 'Venue description has not been added yet.')));
  setText('vp-events-count', String(items.length));
  setText('vp-followers', String(followersCount));
  setText('vp-followers-label', isOrganizer ? _langText('profil', 'profile') : _langText('pratilaca', 'followers'));
  setText('vp-followers', isOrganizer ? _langText('Organizator', 'Organizer') : String(followersCount));
  setText('vp-rating', avgRating);
  setText('vp-rating-meta', ratingCount > 0 ? _langText(`${ratingCount} ocena`, `${ratingCount} ratings`) : _langText('Još nema ocena', 'No ratings yet'));
  const publicMetaBox = document.getElementById('vp-public-meta');
  if (publicMetaBox) {
    const metaRows = _buildOrganizerPublicRows(data);
    if (isOrganizer && data.status === 'unclaimed') {
      metaRows.push(_langText('Status profila: u pripremi', 'Profile status: in setup'));
    }
    publicMetaBox.style.display = metaRows.length ? 'flex' : 'none';
    publicMetaBox.innerHTML = metaRows.map(item => `<div style="font-size:13px;color:var(--ink3);line-height:1.5">${_escHtml(item)}</div>`).join('');
  }

  const badge = document.getElementById('vp-verified-badge');
  if (badge) badge.textContent = isOrganizer ? _organizerBadgeText(data.status) : _venueBadgeText(data.status);

  const hero = document.getElementById('vp-hero-inner');
  if (hero) {
    const fallbackEventCover = Array.isArray(items)
      ? (items.find(item => item?.cover_url)?.cover_url || '')
      : '';
    const heroCover = data.cover_url || fallbackEventCover;
    hero.style.backgroundImage = heroCover ? `url(${heroCover})` : '';
    hero.style.backgroundSize = heroCover ? 'cover' : '';
    hero.style.backgroundPosition = heroCover ? 'center' : '';
  }

  const coverBtn = document.getElementById('vp-cover-btn');
  const canAdminOrganizer = typeof isAdminUser === 'function' && isAdminUser() && isOrganizer;
  const canEditCover = isOrganizer ? (isOwner || canAdminOrganizer) : isOwner;
  if (coverBtn) coverBtn.style.display = canEditCover ? '' : 'none';

  const ratingCard = document.getElementById('vp-rating-card');
  if (ratingCard) ratingCard.style.display = ratingCount > 0 ? '' : 'none';

  const followBtn = document.getElementById('vp-follow-btn');
  if (followBtn) {
    if (isOwner || isOrganizer) {
      followBtn.style.display = 'none';
    } else {
      followBtn.style.display = '';
      followBtn.textContent = followed ? `✓ ${_langText('Pratiš', 'Following')}` : `+ ${_langText('Prati', 'Follow')}`;
      followBtn.className = followed ? 'btn btn-purple btn-sm' : 'btn btn-ghost btn-sm';
    }
  }

  const secondaryBtn = document.getElementById('vp-secondary-btn');
  const claimNote = document.getElementById('vp-claim-note');
  const claimBenefits = document.getElementById('vp-claim-benefits');
  const disputeNote = document.getElementById('vp-dispute-note');
  const adminActions = document.getElementById('vp-admin-actions');
  const adminEditBtn = document.getElementById('vp-admin-edit-btn');
  const adminReviewBtn = document.getElementById('vp-admin-review-btn');
  const adminHideBtn = document.getElementById('vp-admin-hide-btn');
  if (secondaryBtn) {
    secondaryBtn.style.display = 'none';
    secondaryBtn.onclick = null;
    secondaryBtn.disabled = false;
    secondaryBtn.className = 'btn btn-outline btn-sm';
    secondaryBtn.style.opacity = '.85';
    if (isOrganizer && data.status === 'unclaimed') {
      secondaryBtn.style.display = '';
      secondaryBtn.textContent = !isLoggedIn()
        ? _langText('Prijavi se za preuzimanje', 'Log in to claim')
        : (claimRequest?.status === 'pending'
          ? _langText('Zahtev poslat', 'Request sent')
          : _langText('Zatraži preuzimanje', 'Request claim'));
      secondaryBtn.disabled = !!(isLoggedIn() && claimRequest?.status === 'pending');
      secondaryBtn.onclick = () => requestOrganizerClaim();
    }
  }
  if (claimNote) {
    claimNote.style.display = (isOrganizer && data.status === 'unclaimed') ? '' : 'none';
    if (isOrganizer && data.status === 'unclaimed') {
      claimNote.textContent = !isLoggedIn()
        ? _langText('Ako si vlasnik ovog mesta, prijavi se i pošalji zahtev adminu da profil pređe na tvoj nalog.', 'If you own this place, log in and send a request so admins can transfer this profile to your account.')
        : (claimRequest?.status === 'pending'
          ? _langText('Tvoj zahtev je evidentiran. Admin proverava podatke i javlja odluku kroz aplikaciju.', 'Your request is recorded. Admins are reviewing the details and will notify you in the app.')
          : _langText('Ako si vlasnik ovog mesta, pošalji zahtev i admin će proveriti podatke pre povezivanja profila.', 'If you own this place, send a request and admins will verify details before linking the profile.'));
    }
  }
  if (claimBenefits) {
    claimBenefits.style.display = (isOrganizer && data.status === 'unclaimed') ? '' : 'none';
    if (isOrganizer && data.status === 'unclaimed') {
      claimBenefits.innerHTML = `
        <div style="font-weight:700;color:var(--ink2);margin-bottom:4px">${_langText('Prepoznao/la si svoj lokal ili organizaciju?', 'Recognized your venue or organization?')}</div>
        <div>${_langText('Preuzmi profil i nastavi gde je publika već stala.', 'Claim this profile and continue where your audience already is.')}</div>
        <div style="margin-top:6px">${_langText('• Zadržavaš postojeću vidljivost i poverenje profila', '• Keep existing visibility and profile trust')}</div>
        <div>${_langText('• Objavljuješ događaje sa svog zvaničnog mesta', '• Publish events from your official venue profile')}</div>
        <div>${_langText('• Lakše okupljaš pratioce na jednom profilu', '• Bring followers together on one profile')}</div>
      `;
    } else {
      claimBenefits.innerHTML = '';
    }
  }
  if (adminActions) adminActions.style.display = canAdminOrganizer ? 'flex' : 'none';
  if (adminEditBtn) {
    adminEditBtn.onclick = () => openAdminEditOrganizerProfile(data?.id || '');
  }
  if (adminReviewBtn) {
    adminReviewBtn.onclick = () => {
      nav('admin-organizers', { noPageAnim: true, preserveScroll: true });
    };
  }
  if (adminHideBtn) {
    adminHideBtn.onclick = () => adminHideOrganizerProfile(data);
  }
  if (disputeNote) disputeNote.style.display = (isOrganizer && !(typeof isAdminUser === 'function' && isAdminUser())) ? '' : 'none';

  renderVenueEvents(items);
}

async function adminHideOrganizerProfile(target = null) {
  const data = _normalizeVenueTarget(target || _currentPublicVenueTarget || _currentPublicVenueId);
  if (!_isSupabaseConfigured() || !data?.id || !_isOrganizerEntity(data) || !(typeof isAdminUser === 'function' && isAdminUser())) return;
  const label = data.venue_name || 'ovaj organizer profil';
  const shouldHide = typeof appConfirm === 'function'
    ? await appConfirm(`Da li želiš da sakriješ "${label}" iz javnog prikaza?`, `Do you want to hide "${label}" from public view?`)
    : true;
  if (!shouldHide) return;
  try {
    await _supaFetch('/rest/v1/rpc/soft_hide_entity', {
      method: 'POST',
      body: JSON.stringify({
        p_entity_type: 'organizer',
        p_entity_id: data.id,
        p_reason: 'Sakriveno kroz admin quick action na organizer profilu'
      })
    });
    showToast(_langText('Organizer profil je sakriven', 'Organizer profile hidden'), 'success', 1800);
    nav('admin-organizers', { noPageAnim: true, preserveScroll: true });
  } catch (e) {
    console.warn('[svita] adminHideOrganizerProfile:', e.message);
    showToast(_langText('Sakrivanje organizer profila trenutno nije uspelo', 'Hiding the organizer profile failed right now'), 'error');
  }
}

function _renderVenueDashboard(venue = null) {
  const empty = document.getElementById('venue-empty-state');
  const content = document.getElementById('venue-dashboard-content');
  const pendingBanner = document.getElementById('venue-pending-banner');
  const av = document.getElementById('venue-dashboard-avatar');
  const name = document.getElementById('venue-dashboard-name');
  const type = document.getElementById('venue-dashboard-type');
  const dashDesc = document.getElementById('venue-dashboard-desc');
  const publicName = document.getElementById('vp-name');
  const publicMeta = document.getElementById('vp-type');
  const publicTitle = document.getElementById('vp-title');
  const publicAvatar = document.getElementById('vp-av');
  const publicAbout = document.getElementById('vp-desc');
  const publicDetails = document.getElementById('vp-public-meta');

  if (!venue) {
    _currentPublicVenueId = null;
    _currentPublicVenueTarget = null;
    if (empty) empty.style.display = '';
    if (content) content.style.display = 'none';
    if (pendingBanner) pendingBanner.style.display = 'none';
    loadMyVenueAnalytics(null).catch(() => {});
    return;
  }

  _currentPublicVenueId = venue.id;
  _currentPublicVenueTarget = _normalizeVenueTarget(venue);
  if (empty) empty.style.display = 'none';
  if (content) content.style.display = '';
  if (pendingBanner) pendingBanner.style.display = venue.status === 'pending' ? '' : 'none';
  if (av) av.textContent = _venueInitial(venue.venue_name);
  if (name) name.textContent = venue.venue_name || _langText('Organizator', 'Organizer');
  const dashboardType = _isOrganizerEntity(venue)
    ? [venue.venue_type, venue.city, _organizerBadgeText(venue.status)].filter(Boolean).join(' · ')
    : _venueTypeLabel(venue);
  if (type) type.textContent = dashboardType;
  if (dashDesc) dashDesc.textContent = venue.description || _langText('Dodaj opis organizatora događaja da bi profil delovao potpunije.', 'Add an organizer description to make the profile feel more complete.');
  if (publicName) publicName.textContent = venue.venue_name || _langText('Organizator', 'Organizer');
  if (publicTitle) publicTitle.textContent = venue.venue_name || _langText('Organizator', 'Organizer');
  if (publicAvatar) publicAvatar.textContent = _venueInitial(venue.venue_name);
  if (publicMeta) publicMeta.textContent = dashboardType;
  if (publicAbout) publicAbout.textContent = venue.description || _langText('Dodaj opis organizatora događaja tokom onboardinga.', 'Add an organizer description during onboarding.');
  if (publicDetails) {
    const detailRows = _buildOrganizerPublicRows(venue);
    publicDetails.style.display = detailRows.length ? 'flex' : 'none';
    publicDetails.innerHTML = detailRows.map(item => `<div style="font-size:13px;color:var(--ink3);line-height:1.5">${_escHtml(item)}</div>`).join('');
  }

  const hero = document.getElementById('vp-hero-inner');
  if (hero) {
    if (venue.cover_url) {
      hero.style.backgroundImage = `url(${venue.cover_url})`;
      hero.style.backgroundSize = 'cover';
      hero.style.backgroundPosition = 'center';
    } else {
      hero.style.backgroundImage = '';
    }
  }
  renderPublicVenueProfile(venue).catch(() => {});
}

async function loadMyVenueDashboard() {
  if (!isLoggedIn()) return null;
  try {
    const venue = await _getMyManagedOrganizerTarget();
    _renderVenueDashboard(venue);
    await loadMyVenueAnalytics(venue);
    const items = await loadMyVenueEvents(venue);
    renderVenueEvents(items);
    return venue;
  } catch (e) {
    console.warn('[svita] loadMyVenueDashboard:', e.message);
    _renderVenueDashboard(null);
    loadMyVenueAnalytics(null).catch(() => {});
    renderVenueEvents([]);
    return null;
  }
}

async function loadEditVenueForm() {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  try {
    const canAdminEditOrganizer = !!(
      _adminEditingOrganizerId
      && (typeof isAdminUser === 'function' && isAdminUser())
    );
    const claimedOrganizer = canAdminEditOrganizer ? null : await _getMyClaimedOrganizer();
    const venue = canAdminEditOrganizer
      ? await _loadOrganizerProfile(_adminEditingOrganizerId)
      : (claimedOrganizer ? _normalizeVenueTarget(claimedOrganizer) : await _getMyVenue());
    if (!venue) {
      _adminEditingOrganizerId = null;
      nav('venue');
      showToast(_langText('Prvo završi onboarding organizatora', 'Finish organizer onboarding first'), 'info', 1800);
      return;
    }
    const nameEl = document.getElementById('edit-venue-name');
    const typeEl = document.getElementById('edit-venue-type');
    const cityEl = document.getElementById('edit-venue-city');
    const descEl = document.getElementById('edit-venue-description');
    const addressEl = document.getElementById('edit-venue-public-address');
    const websiteEl = document.getElementById('edit-venue-website');
    const instagramEl = document.getElementById('edit-venue-instagram');
    const publicEmailEl = document.getElementById('edit-venue-public-email');
    const publicPhoneEl = document.getElementById('edit-venue-public-phone');
    if (nameEl) nameEl.value = venue.venue_name || '';
    if (typeEl) typeEl.value = venue.venue_type || '';
    if (cityEl) cityEl.value = venue.city || '';
    if (descEl) descEl.value = venue.description || '';
    if (addressEl) addressEl.value = venue.public_address || '';
    if (websiteEl) websiteEl.value = venue.website_url || '';
    if (instagramEl) instagramEl.value = venue.instagram_handle || '';
    if (publicEmailEl) publicEmailEl.value = venue.public_contact_email || '';
    if (publicPhoneEl) publicPhoneEl.value = venue.public_contact_phone || '';
    const saveBtn = document.getElementById('edit-venue-save-btn');
    if (saveBtn) {
      saveBtn.textContent = canAdminEditOrganizer
        ? _langText('Sačuvaj izmene profila', 'Save profile changes')
        : _langText('Sačuvaj', 'Save');
    }
    if (typeEl) {
      typeEl.dataset.userTouched = venue.venue_type ? 'true' : 'false';
      typeEl.dataset.autoSuggested = 'false';
    }
    if (typeof _applyOrganizerTypeSuggestion === 'function') {
      _applyOrganizerTypeSuggestion({
        nameId: 'edit-venue-name',
        typeId: 'edit-venue-type',
        cityId: 'edit-venue-city',
        descriptionId: 'edit-venue-description',
        addressId: 'edit-venue-public-address',
        websiteId: 'edit-venue-website',
        instagramId: 'edit-venue-instagram'
      });
    }
  } catch (e) {
    showToast(_langText('Greška pri učitavanju organizer profila', 'Error loading organizer profile'), 'error');
  }
}

async function saveEditedVenue() {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  const btn = document.getElementById('edit-venue-save-btn');
  const nameEl = document.getElementById('edit-venue-name');
  const typeEl = document.getElementById('edit-venue-type');
  const cityEl = document.getElementById('edit-venue-city');
  const descEl = document.getElementById('edit-venue-description');
  const addressEl = document.getElementById('edit-venue-public-address');
  const websiteEl = document.getElementById('edit-venue-website');
  const instagramEl = document.getElementById('edit-venue-instagram');
  const publicEmailEl = document.getElementById('edit-venue-public-email');
  const publicPhoneEl = document.getElementById('edit-venue-public-phone');

  const venue_name = nameEl?.value?.trim() || '';
  const venue_type = typeEl?.value || '';
  const city = cityEl?.value?.trim() || '';
  const description = descEl?.value?.trim() || '';
  const public_address = addressEl?.value?.trim() || '';
  const website_url = websiteEl?.value?.trim() || '';
  const instagram_handle = _normalizeOrganizerInstagram(instagramEl?.value?.trim() || '');
  const public_contact_email = publicEmailEl?.value?.trim() || '';
  const public_contact_phone = publicPhoneEl?.value?.trim() || '';

  if (!venue_name || venue_name.length < 2) {
    showToast(_langText('Naziv organizatora mora imati bar 2 karaktera', 'Organizer name must have at least 2 characters'), 'error');
    return;
  }
  if (!city) {
    showToast(_langText('Unesi grad organizatora ili mesta', 'Enter the organizer or venue city'), 'error');
    return;
  }
  if (_containsRestrictedContactInfo(description)) {
    showToast(_langText('U javnom opisu organizatora ne objavljuj telefon, email ili profile sa mreža.', 'Do not publish phone numbers, emails or social handles in the public organizer description.'), 'error', 2800);
    return;
  }
  if (!_isValidOptionalUrl(website_url)) {
    showToast(_langText('Unesi ispravan website link koji počinje sa http:// ili https://', 'Enter a valid website URL starting with http:// or https://'), 'error');
    return;
  }
  if (!_isValidOptionalEmail(public_contact_email)) {
    showToast(_langText('Unesi ispravan javni email', 'Enter a valid public email'), 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = _langText('Čuvam...', 'Saving...');
  }

  try {
    const canAdminEditOrganizer = !!(
      _adminEditingOrganizerId
      && (typeof isAdminUser === 'function' && isAdminUser())
    );
    const claimedOrganizer = canAdminEditOrganizer ? null : await _getMyClaimedOrganizer();
    if (canAdminEditOrganizer) {
      const rows = await _patchOrganizerWithSchemaFallback(_adminEditingOrganizerId, {
        name: venue_name,
        city,
        public_description: description || null,
        public_address: public_address || null,
        instagram_handle: instagram_handle || null,
        website_url: website_url || null,
        public_contact_email: public_contact_email || null,
        public_contact_phone: public_contact_phone || null,
        organizer_type: venue_type || null,
        updated_by: getUser()?.id || null
      });
      const updated = Array.isArray(rows) ? rows[0] : rows;
      _adminEditingOrganizerId = null;
      showToast(_langText('Organizer profil je sačuvan', 'Organizer profile saved'), 'success');
      if (updated?.id && typeof openVenueProfile === 'function') {
        openVenueProfile({ id: updated.id, kind: 'organizer', entity_type: 'organizer' });
      } else {
        nav('admin-organizers', { noPageAnim: true, preserveScroll: true });
      }
      return;
    }
    if (!claimedOrganizer) {
      const existingOrganizer = await _findExistingOrganizerMatch(venue_name, city);
      if (existingOrganizer?.id) {
        showToast(_langText('Profil sa ovim nazivom već postoji. Otvaram postojeći organizer profil da pošalješ zahtev za preuzimanje.', 'A profile with this name already exists. Opening the existing organizer profile so you can send a claim request.'), 'info', 3200);
        if (typeof openVenueProfile === 'function') {
          openVenueProfile({ id: existingOrganizer.id, kind: 'organizer', entity_type: 'organizer' });
        }
        return;
      }
    }

    const savedEntity = claimedOrganizer
      ? await _saveMyClaimedOrganizerProfile({
          venue_name,
          venue_type,
          city,
          description,
          public_address,
          website_url,
          instagram_handle,
          public_contact_email,
          public_contact_phone,
          organizer_type: venue_type
        })
      : await _upsertMyVenue({
          venue_name,
          venue_type,
          city,
          description,
          public_address,
          website_url,
          instagram_handle,
          public_contact_email,
          public_contact_phone
        });
    const venue = claimedOrganizer
      ? _normalizeVenueTarget(savedEntity)
      : savedEntity;
    _renderVenueDashboard(venue);
    showToast(_langText('Organizer profil je sačuvan', 'Organizer profile saved'), 'success');
    nav('venue');
  } catch (e) {
    showToast(_langText('Greška pri čuvanju organizer profila', 'Error saving organizer profile'), 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = _langText('Sačuvaj', 'Save');
    }
  }
}
