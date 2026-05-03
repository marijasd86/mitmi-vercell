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

function _sortOrganizersByActivity(items = []) {
  const list = Array.isArray(items) ? [...items] : [];
  return list.sort((a, b) => {
    const scoreA = Number(a?.activityScore || 0);
    const scoreB = Number(b?.activityScore || 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    const upcomingA = Number(a?.activityUpcomingEvents || 0);
    const upcomingB = Number(b?.activityUpcomingEvents || 0);
    if (upcomingB !== upcomingA) return upcomingB - upcomingA;
    const createdA = new Date(a?.createdAt || 0).getTime() || 0;
    const createdB = new Date(b?.createdAt || 0).getTime() || 0;
    if (createdB !== createdA) return createdB - createdA;
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'sr-Latn');
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

function _ghostOrganizerAddressFromDraft(draft = {}) {
  return String(
    draft.locationName
    || draft.proposedVenueName
    || draft.city
    || ''
  ).trim();
}

function _ghostOrganizerAddressFromEvent(item = {}) {
  return String(
    item.locationName
    || item.city
    || ''
  ).trim();
}

function _safeGhostOrganizerName(item = {}) {
  const titleNorm = _normalizeAdminQuery(item.title || '');
  const candidates = [
    item.organizerName,
    item.locationName
  ].map(value => String(value || '').trim()).filter(Boolean);
  const picked = candidates.find(value => _normalizeAdminQuery(value) !== titleNorm);
  return picked || 'Organizator u pripremi';
}

function _normalizeGhostOrganizerSignal(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function _ghostOrganizerSignalsFromSource(source = {}) {
  const tags = Array.isArray(source.eventTags)
    ? source.eventTags
    : Array.isArray(source.event_tags)
      ? source.event_tags
      : [];
  return [
    source.proposedOrganizerName,
    source.organizerName,
    source.proposedVenueName,
    source.locationName,
    source.location_name,
    source.title,
    source.category,
    source.city,
    ...tags
  ].map(_normalizeGhostOrganizerSignal).filter(Boolean);
}

function _missingOrganizerColumnFromError(error) {
  const msg = String(error?.message || error?.data?.message || '');
  const match = msg.match(/Could not find the '([^']+)' column of 'organizers'/i);
  return match?.[1] || null;
}

function _adminUnsupportedOrganizerColumnsCache() {
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

function _adminPersistUnsupportedOrganizerColumns(columns = new Set()) {
  const arr = Array.from(columns).filter(Boolean);
  globalThis.__mitmiUnsupportedOrganizerColumns = arr;
  try {
    sessionStorage.setItem('mitmi_unsupported_organizer_columns', arr.join(','));
  } catch (e) {}
}

function _adminStripUnsupportedOrganizerColumns(payload = {}) {
  const unsupported = _adminUnsupportedOrganizerColumnsCache();
  if (!unsupported.size) return { ...payload };
  const next = { ...payload };
  unsupported.forEach((col) => {
    if (Object.prototype.hasOwnProperty.call(next, col)) delete next[col];
  });
  return next;
}

async function _adminCreateOrganizerWithSchemaFallback(payload = {}) {
  let safePayload = _adminStripUnsupportedOrganizerColumns(payload);
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
      const unsupported = _adminUnsupportedOrganizerColumnsCache();
      unsupported.add(missingColumn);
      _adminPersistUnsupportedOrganizerColumns(unsupported);
      const { [missingColumn]: _removed, ...nextPayload } = safePayload;
      safePayload = nextPayload;
    }
  }
  throw lastError || new Error('Organizer create failed');
}

function _ghostSignalIncludes(signals = [], patterns = []) {
  return patterns.some((pattern) => {
    const needle = _normalizeGhostOrganizerSignal(pattern);
    return needle && signals.some(signal => signal.includes(needle));
  });
}

function _inferGhostOrganizerType(source = {}) {
  const signals = _ghostOrganizerSignalsFromSource(source);
  if (!signals.length) return 'organizator događaja';

  if (_ghostSignalIncludes(signals, [
    'stadion', 'arena', 'hala', 'sportski centar', 'sportski objekat', 'sport center'
  ])) return 'stadion / arena';

  if (_ghostSignalIncludes(signals, [
    'pozoriste', 'pozorište', 'teatar', 'theatre', 'theater', 'scene', 'scena'
  ])) return 'pozorište';

  if (_ghostSignalIncludes(signals, [
    'bioskop', 'cinema', 'cineplexx'
  ])) return 'bioskop';

  if (_ghostSignalIncludes(signals, [
    'galerija', 'gallery'
  ])) return 'galerija';

  if (_ghostSignalIncludes(signals, [
    'muzej', 'museum'
  ])) return 'muzej';

  if (_ghostSignalIncludes(signals, [
    'kulturni centar', 'cultural center', 'cultural centre', 'dom kulture'
  ])) return 'kulturni centar';

  if (_ghostSignalIncludes(signals, [
    'ngo', 'udruzenje', 'udruženje', 'fondacija', 'foundation', 'humanitar'
  ])) return 'udruženje / NGO';

  if (_ghostSignalIncludes(signals, [
    'cowork', 'coworking', 'community', 'zajednica', 'hub'
  ])) return 'zajednica / coworking';

  if (_ghostSignalIncludes(signals, [
    'kafana', 'etno bar', 'tamburasi', 'tamburaši', 'sevdah', 'starogradska'
  ])) return 'kafana / etno bar';

  if (_ghostSignalIncludes(signals, [
    'restoran', 'restaurant', 'bistro', 'trattoria', 'picerija', 'picerija', 'pizza', 'burger', 'grill', 'brunch'
  ])) return 'restoran / kafić';

  if (_ghostSignalIncludes(signals, [
    'kafic', 'kafić', 'cafe', 'coffee', 'espresso', 'roastery'
  ])) return 'restoran / kafić';

  if (_ghostSignalIncludes(signals, [
    'klub', 'club', 'bar', 'pub', 'lounge'
  ])) return 'klub / bar';

  if (_ghostSignalIncludes(signals, [
    'festival', 'open air'
  ])) return 'festival / događaj';

  if (_ghostSignalIncludes(signals, [
    'meetup', 'networking', 'konferencija', 'conference', 'predavanje', 'panel'
  ])) return 'organizator događaja';

  const category = _normalizeGhostOrganizerSignal(source.category || '');
  if (category === 'edukacija_meetup') return 'organizator događaja';
  if (category === 'kultura_umetnost') return 'kulturni centar';
  if (category === 'scena_humor') return 'organizator događaja';
  if (category === 'muzika') return 'organizator događaja';
  if (category === 'sport_rekreacija') return 'sport';
  if (category === 'izlasci_druzenje') return 'organizator događaja';

  return 'organizator događaja';
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

async function openOrganizerReview() {
  if (!isAdminUser() && isLoggedIn() && typeof loadMyProfile === 'function') {
    await loadMyProfile().catch(() => {});
  }
  if (!isAdminUser()) {
    nav(isLoggedIn() ? 'settings' : 'login');
    showToast('Admin pristup nije dostupan za ovaj nalog.', 'error', 2200);
    return;
  }
  nav('admin-organizers', { noPageAnim: true, preserveScroll: true });
  const results = await Promise.allSettled([
    loadAdminOrganizersFromBackend({ silent: true }),
    loadAdminClaimRequestsFromBackend({ silent: true }),
    loadAdminDraftQueueFromBackend({ silent: true }),
    loadAdminOrphanPublishedEvents({ silent: true })
  ]);
  if (results.some(result => result.status === 'rejected')) {
    showToast('Organizer panel je delimično učitan. Osveži stranicu ako nešto nedostaje.', 'info', 2800);
  }
  renderOrganizerReview();
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
      const orgRows = await _adminCreateOrganizerWithSchemaFallback({
        name: draft.proposedOrganizerName || 'Organizer u pripremi',
        city: draft.city || '',
        organizer_type: _inferGhostOrganizerType(draft),
        cover_url: draft.coverUrl || draft.cover_url || null,
        public_address: _ghostOrganizerAddressFromDraft(draft) || null,
        instagram_handle: (draft.proposedOrganizerInstagram || '').replace(/^@+/, '') || null,
        source_notes: draft.sourceUrl
          ? `Auto-created from event draft: ${draft.sourceUrl}`
          : 'Auto-created from admin draft flow.',
        status: 'unclaimed',
        created_by: getUser()?.id || null,
        updated_by: getUser()?.id || null
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
      console.warn('[svita] createGhostOrganizerForDraft:', e.message);
      showToast(_adminErrorMessage(e, 'Organizer trenutno nije moguće kreirati'), 'error', 3400);
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
  ADMIN_ORGANIZERS.unshift({
    id: newId,
    name: draft.proposedOrganizerName || 'Organizer u pripremi',
    city: draft.city || '',
    organizer_type: _inferGhostOrganizerType(draft),
    public_address: _ghostOrganizerAddressFromDraft(draft) || '',
    instagram: (draft.proposedOrganizerInstagram || '').replace(/^@+/, ''),
    status: 'ghost'
  });
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
    console.warn('[svita] connectPublishedEventToOrganizer:', e.message);
    showToast(_adminErrorMessage(e, 'Povezivanje događaja trenutno nije uspelo'), 'error', 3400);
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
    const orgRows = await _adminCreateOrganizerWithSchemaFallback({
      name: _safeGhostOrganizerName(item),
      city: item.city || '',
      organizer_type: _inferGhostOrganizerType(item),
      cover_url: item.coverUrl || item.cover_url || null,
      public_address: _ghostOrganizerAddressFromEvent(item) || null,
      source_notes: `Auto-created from published event ${item.id || ''}`.trim(),
      status: 'unclaimed',
      created_by: getUser()?.id || null,
      updated_by: getUser()?.id || null
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
    console.warn('[svita] createGhostOrganizerForPublishedEvent:', e.message);
    showToast(_adminErrorMessage(e, 'Organizer trenutno nije moguće kreirati za ovaj događaj'), 'error', 3400);
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
      console.warn('[svita] connectDraftToOrganizer:', e.message);
      showToast(_adminErrorMessage(e, 'Povezivanje trenutno nije uspelo'), 'error', 3400);
      return;
    }
  }
  draft.organizerId = organizerId;
  _persistAdminDraftState();
  showToast('Organizer je povezan sa draftom', 'success', 1400);
  renderAdminDrafts();
  renderOrganizerReview();
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
      console.warn('[svita] markOrganizerClaimed:', e.message);
      showToast(_adminErrorMessage(e, 'Organizer trenutno nije moguće označiti kao preuzet'), 'error', 3400);
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
      console.warn('[svita] archiveOrganizer:', e.message);
      showToast(_adminErrorMessage(e, 'Organizer trenutno nije moguće arhivirati'), 'error', 3400);
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
      console.warn('[svita] mergeOrganizerInto:', e.message);
      showToast(_adminErrorMessage(e, 'Spajanje organizer profila trenutno nije uspelo'), 'error', 3400);
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
  const visible = _sortOrganizersByActivity(ADMIN_ORGANIZERS.filter(item => item.status !== 'archived'));
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
          return `<div class="organizer-card"><div class="organizer-head"><div><div class="organizer-name">${_escHtml(item.organizerName || item.title)}</div><div class="organizer-meta">${_escHtml(item.city || 'Grad nije unet')}${item.locationName ? ' · ' + _escHtml(item.locationName) : ''}</div></div><span class="tag tag-amber">Bez organizera</span></div><div class="draft-note"><strong>Događaj:</strong> ${_escHtml(item.title)}</div>${item.creatorName ? `<div class="draft-note" style="margin-top:8px"><strong>Objavio/la:</strong> ${_escHtml(item.creatorName)}</div>` : ''}<div class="draft-note" style="margin-top:8px"><strong>Termin:</strong> ${_escHtml(item.startsAt ? adminDraftTimeLabel(item.startsAt) : 'Termin nije upisan')}</div>${matchHtml}<div class="organizer-actions"><button class="btn btn-purple btn-sm" onclick="createGhostOrganizerForPublishedEvent('${item.id}')">Kreiraj organizer profil</button><button class="btn btn-outline btn-sm" onclick="openCreateEvent('${_escHtml(item.id)}','managed')">Uredi događaj</button><button class="btn btn-outline btn-sm" onclick="openEventById('${_escHtml(item.id)}')">Otvori događaj</button></div></div>`;
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
    console.warn('[svita] approveOrganizerClaimRequest:', e.message);
    showToast(_adminErrorMessage(e, 'Odobravanje claim zahteva nije uspelo'), 'error', 3400);
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
    console.warn('[svita] rejectOrganizerClaimRequest:', e.message);
    showToast(_adminErrorMessage(e, 'Odbijanje claim zahteva nije uspelo'), 'error', 3400);
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
    console.warn('[svita] revokeOrganizerClaim:', e.message);
    showToast(_adminErrorMessage(e, 'Uklanjanje upravljanja trenutno nije uspelo'), 'error', 3400);
  }
}
