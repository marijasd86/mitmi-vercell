async function loadAdminDraftQueueFromBackend(opts = {}) {
  if (!_isSupabaseConfigured() || _adminDraftQueueLoading) return EVENT_DRAFTS;
  _adminDraftQueueLoading = true;
  try {
    const rows = await _supaGet('event_drafts', {
      select: 'id,source_type,review_status,source_url,source_label,title,description,category,event_tags,city,location_name,starts_at,updated_at,created_at,organizer_id,proposed_organizer_name,proposed_organizer_instagram,ai_summary,ai_confidence,admin_notes,submitted_by,profiles!submitted_by(username,display_name),organizers!organizer_id(id,name,city,instagram_handle,status)',
      review_status: 'eq.pending',
      order: 'created_at.desc',
      limit: '200'
    });
    const backendDrafts = (Array.isArray(rows) ? rows : []).map(_mapDbDraftToUi);
    const localOnly = EVENT_DRAFTS.filter((item) => !_isBackendDraft(item));
    EVENT_DRAFTS = [...backendDrafts, ...localOnly];
    if (!opts.silent) renderAdminDrafts();
  } catch (e) {
    console.warn('[svita] loadAdminDraftQueueFromBackend:', e.message);
  } finally {
    _adminDraftQueueLoading = false;
  }
  return EVENT_DRAFTS;
}

async function loadAdminPlanSignalsFromBackend(opts = {}) {
  if (!_isSupabaseConfigured()) return ADMIN_PLAN_SIGNALS;
  try {
    const mapPlan = (typeof _mapPlanToInviteLike === 'function')
      ? _mapPlanToInviteLike
      : ((typeof _mapPlanToCardLike === 'function') ? _mapPlanToCardLike : (item => item));
    const rows = (await _loadPlans({
      status: 'eq.open',
      order: 'created_at.desc',
      limit: '200'
    })).map(mapPlan);
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
        creatorName: profile.display_name || profile.username || 'svita korisnik',
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
    console.warn('[svita] loadAdminPlanSignalsFromBackend:', e.message);
  }
  return ADMIN_PLAN_SIGNALS;
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
    console.warn('[svita] createDraftFromPlanSignal:', e.message);
    showToast(_adminErrorMessage(e, 'Signal iz plana trenutno nije poslat u draftove'), 'error', 3400);
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

function organizerLabel(draft) {
  const organizer = draft.organizerId ? getOrganizerById(draft.organizerId) : null;
  return organizer?.name || draft.proposedOrganizerName || 'Organizer nije unet';
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

function possibleOrganizerMatches(draft) {
  const normalized = (draft.proposedOrganizerName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ig = (draft.proposedOrganizerInstagram || '').toLowerCase().replace(/^@+/, '');
  return ADMIN_ORGANIZERS.filter(org => {
    const orgName = (org.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const orgIg = (org.instagram || '').toLowerCase().replace(/^@+/, '');
    return (!!ig && orgIg === ig) || (!!normalized && (orgName === normalized || orgName.includes(normalized) || normalized.includes(orgName)));
  });
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

function adminDraftTimeLabel(startsAt) {
  if (!startsAt) return 'Vreme nije uneto';
  const d = new Date(startsAt);
  return d.toLocaleString('sr-Latn', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

function _draftSupplementInputId(field = '', draftId = '') {
  return `draft-supp-${field}-${draftId}`;
}

function _draftSupplementInputValue(field = '', draftId = '') {
  return String(document.getElementById(_draftSupplementInputId(field, draftId))?.value || '').trim();
}

function _draftStartsAtToInputValue(startsAt = '') {
  if (!startsAt) return '';
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _draftStartsAtFromInputValue(value = '') {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

function _draftMissingPublishFields(draft = {}) {
  const missing = [];
  if (!String(draft.startsAt || '').trim()) missing.push('datum i vreme');
  if (!String(draft.locationName || '').trim()) missing.push('lokacija');
  if (!String(draft.city || '').trim()) missing.push('grad');
  return missing;
}

function _draftSupplementPayloadFromInputs(draft = {}) {
  const payload = {};
  const startsAtInput = _draftSupplementInputValue('starts', draft.id);
  const startsAtIso = _draftStartsAtFromInputValue(startsAtInput);
  if (startsAtInput && startsAtIso) payload.starts_at = startsAtIso;

  const locationName = _draftSupplementInputValue('location', draft.id);
  if (locationName) payload.location_name = locationName;

  const city = _draftSupplementInputValue('city', draft.id);
  if (city) payload.city = city;

  const organizerName = _draftSupplementInputValue('organizer', draft.id);
  if (organizerName) payload.proposed_organizer_name = organizerName;
  return payload;
}

function _adminDraftFallbackStartsAtIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return d.toISOString();
}

async function _patchBackendDraft(draftId, payload = {}) {
  if (!draftId || !_isSupabaseConfigured()) return;
  if (!payload || !Object.keys(payload).length) return;
  await _supaFetch(`/rest/v1/event_drafts?id=eq.${draftId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload)
  });
}

async function saveDraftSupplement(draftId, opts = {}) {
  const draft = EVENT_DRAFTS.find(item => item.id === draftId);
  if (!draft || !_isBackendDraft(draft) || !_isSupabaseConfigured()) return null;
  const payload = _draftSupplementPayloadFromInputs(draft);
  if (!Object.keys(payload).length) {
    if (!opts.silent) showToast('Nema novih dopuna za čuvanje', 'info', 1700);
    return draft;
  }
  try {
    await _patchBackendDraft(draftId, payload);
    await loadAdminDraftQueueFromBackend({ silent: true });
    if (!opts.skipRender) renderAdminDrafts();
    const updated = EVENT_DRAFTS.find(item => item.id === draftId) || draft;
    if (!opts.silent) showToast('Dopune drafta su sačuvane', 'success', 1600);
    return updated;
  } catch (e) {
    console.warn('[svita] saveDraftSupplement:', e.message);
    if (!opts.silent) showToast(_adminErrorMessage(e, 'Dopuna drafta nije sačuvana'), 'error', 3200);
    return null;
  }
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

async function approveDraft(draftId) {
  let draft = EVENT_DRAFTS.find(item => item.id === draftId);
  if (!draft) return;
  if (_isBackendDraft(draft) && _isSupabaseConfigured()) {
    try {
      await saveDraftSupplement(draftId, { silent: true, skipRender: true });
      draft = EVENT_DRAFTS.find(item => item.id === draftId) || draft;
      if (!draft.startsAt) {
        const shouldUseFallbackTime = typeof appConfirm === 'function'
          ? await appConfirm(
              'Draft nema datum i vreme. Klikni Potvrdi da objavimo sa okvirnim terminom (sutra u 20:00), ili Odustani da prvo ručno dopuniš.',
              'This draft has no date/time. Confirm to publish with a fallback slot (tomorrow at 20:00), or cancel to complete it manually first.'
            )
          : true;
        if (!shouldUseFallbackTime) {
          showToast('Dopuni datum/vreme ili potvrdi automatski termin', 'info', 2200);
          return;
        }
        const fallbackStartsAt = _adminDraftFallbackStartsAtIso();
        await _patchBackendDraft(draftId, {
          starts_at: fallbackStartsAt,
          admin_notes: [draft.adminNotes || '', 'Auto-fallback termin dodat iz admin panela.'].filter(Boolean).join(' ')
        });
        await loadAdminDraftQueueFromBackend({ silent: true });
        draft = EVENT_DRAFTS.find(item => item.id === draftId) || draft;
        showToast('Dodat je okvirni termin (sutra u 20:00). Posle objave možeš da izmeniš događaj.', 'info', 3200);
      }
    } catch (e) {
      console.warn('[svita] approveDraft preflight:', e.message);
      showToast(_adminErrorMessage(e, 'Dopuna pre objave nije uspela'), 'error', 3400);
      return;
    }
  }
  const duplicateCandidates = possibleEventDuplicates(draft);
  if (duplicateCandidates.length) {
    const duplicateSummary = duplicateCandidates
      .map(item => `• ${item.title || 'Događaj'}${item.meta ? ` (${item.meta})` : ''}`)
      .join('\n');
    const shouldContinue = typeof appConfirm === 'function'
      ? await appConfirm(
          `Već postoje slični događaji:\n\n${duplicateSummary}\n\nKlikni Potvrdi samo ako želiš da ipak objaviš ovaj događaj kao poseban unos.`,
          `Similar events already exist:\n\n${duplicateSummary}\n\nConfirm only if you still want to publish this as a separate event.`
        )
      : true;
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
      console.warn('[svita] approveDraft:', e.message);
      showToast(_adminErrorMessage(e, 'Odobravanje drafta trenutno nije uspelo'), 'error', 3400);
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
      console.warn('[svita] rejectDraft:', e.message);
      showToast(_adminErrorMessage(e, 'Odbijanje drafta trenutno nije uspelo'), 'error', 3400);
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
    showToast('Čuvanje linka kao draft trenutno nije dostupno bez povezane baze', 'error', 2400);
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
    showToast('Draft sa linka je sačuvan za ručnu proveru', 'success');
  } catch (e) {
    console.warn('[svita] simulateAiImport:', e.message);
    showToast(_adminErrorMessage(e, 'Link draft trenutno nije sačuvan. Proveri bazu i pokušaj ponovo.'), 'error', 3600);
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
  if (!pending.length) { list.innerHTML = '<div class="draft-empty">Nema draftova na čekanju. Novi link draftovi i korisničke prijave će se pojaviti ovde.</div>'; return; }
  if (!visibleDrafts.length) { list.innerHTML = '<div class="draft-empty">Nema rezultata za ovu pretragu. Probaj naziv događaja, organizer, grad ili submitter ime.</div>'; return; }
	  list.innerHTML = visibleDrafts.map(draft => {
	    const matches = !draft.organizerId ? possibleOrganizerMatches(draft).slice(0, 2) : [];
	    const duplicateEvents = possibleEventDuplicates(draft);
    const missingFields = _draftMissingPublishFields(draft);
	    const conf = draft.aiConfidence != null ? `<span class="tag tag-purple">AI ${(draft.aiConfidence * 100).toFixed(0)}%</span>` : '';
	    const sourceTag = draft.sourceType === 'ai' ? '<span class="tag tag-purple">AI</span>' : draft.sourceType === 'user' ? '<span class="tag tag-gold">User</span>' : '<span class="tag tag-gray">Manual</span>';
	    const staleTag = _isStaleDraft(draft) ? '<span class="tag tag-amber">Zastareo</span>' : '';
    const missingTag = missingFields.length ? '<span class="tag tag-amber">Treba dopuna</span>' : '';
	    const matchHtml = matches.map(match => `<div class="draft-match"><div><div style="font-size:13px;font-weight:700;color:var(--ink)">${match.name}</div><div class="admin-mini">${match.city || 'Grad nije unet'}${match.instagram ? ' · @' + match.instagram : ''}</div></div><button class="btn btn-outline btn-sm" onclick="connectDraftToOrganizer('${draft.id}','${match.id}')">Poveži</button></div>`).join('');
	    const duplicateHtml = duplicateEvents.map(item => `<div class="draft-match"><div><div style="font-size:13px;font-weight:700;color:var(--ink)">${_escHtml(item.title || _langText('Događaj', 'Event'))}</div><div class="admin-mini">${_escHtml(item.meta || item.location_name || _langText('Detalji nisu upisani', 'Details have not been added'))}</div></div><button class="btn btn-outline btn-sm" onclick="openEventById('${_escHtml(item.id || '')}')">${_langText('Otvori', 'Open')}</button></div>`).join('');
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
	    const draftTags = typeof _renderEventTagPills === 'function' ? _renderEventTagPills(draft.eventTags || [], 4) : '';
    const warningHtml = missingFields.length
      ? `<div class="draft-note" style="margin-top:8px;background:#fff8eb;border:1px solid rgba(186,108,23,.22)"><strong>Nedostaje:</strong> ${_escHtml(missingFields.join(', '))}. Možeš dopuniti ispod ili objaviti odmah. Ako datum/vreme ostane prazno, admin publish će dodati okvirni termin.</div>`
      : '';
    const supplementHtml = _isBackendDraft(draft)
      ? `<div style="margin-top:10px;padding:10px;border:1px solid var(--border2);border-radius:12px;background:var(--bg2)">
          <div class="admin-mini" style="margin-bottom:8px">Brza dopuna pre objave</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <input class="form-input" type="datetime-local" id="${_escAttr(_draftSupplementInputId('starts', draft.id))}" value="${_escAttr(_draftStartsAtToInputValue(draft.startsAt))}" placeholder="Datum i vreme">
            <input class="form-input" type="text" id="${_escAttr(_draftSupplementInputId('city', draft.id))}" value="${_escAttr(draft.city || '')}" placeholder="Grad">
            <input class="form-input" type="text" id="${_escAttr(_draftSupplementInputId('location', draft.id))}" value="${_escAttr(draft.locationName || '')}" placeholder="Lokacija (mesto održavanja)">
            <input class="form-input" type="text" id="${_escAttr(_draftSupplementInputId('organizer', draft.id))}" value="${_escAttr(draft.proposedOrganizerName || '')}" placeholder="Naziv organizatora">
          </div>
          <div class="draft-actions" style="margin-top:8px">
            <button class="btn btn-outline btn-sm" onclick="saveDraftSupplement('${draft.id}')">Sačuvaj dopunu</button>
          </div>
        </div>`
      : '';
    return `<div class="draft-card"><div class="draft-top"><div style="flex:1;min-width:0"><div class="draft-title">${draft.title}</div><div class="draft-meta">${adminDraftTimeLabel(draft.startsAt)} · ${draft.locationName || draft.city || 'Lokacija nije upisana'}</div></div><div class="draft-chip-row" style="justify-content:flex-end">${sourceTag}${conf}${staleTag}${missingTag}</div></div><div class="draft-chip-row"><span class="tag tag-outline">${draft.category || 'nekategorisano'}</span><span class="tag tag-outline">${organizerLabel(draft)}</span>${organizerStatusTag(draft)}${duplicateEvents.length ? '<span class="tag tag-amber">Mogući duplikat</span>' : ''}</div>${draftTags ? `<div class="event-tag-row" style="margin-top:10px">${draftTags}</div>` : ''}${detailsHtml}${warningHtml}<div class="draft-note"><strong>${noteTitle}:</strong> ${_escHtml(noteBody)}</div>${supplementHtml}${matchHtml ? `<div style="margin-top:8px"><div class="admin-mini" style="margin-bottom:6px">Moguća poklapanja organizera</div>${matchHtml}</div>` : ''}${duplicateHtml ? `<div style="margin-top:8px"><div class="admin-mini" style="margin-bottom:6px">Slični događaji</div>${duplicateHtml}</div>` : ''}<div class="draft-actions"><button class="btn btn-purple btn-sm" onclick="approveDraft('${draft.id}')">${duplicateEvents.length ? 'Ipak objavi' : 'Odobri'}</button><button class="btn btn-outline btn-sm" onclick="createGhostOrganizerForDraft('${draft.id}')">${draft.organizerId ? 'Osveži organizera' : 'Kreiraj organizer profil'}</button><button class="btn btn-danger btn-sm" onclick="rejectDraft('${draft.id}')">Odbij</button></div><div class="admin-mini" style="margin-top:10px">Poslao/la: ${draft.submittedByLabel || 'Nepoznato'} · starost drafta: ${_draftAgeDays(draft)} dana</div></div>`;
	  }).join('');
}

async function openAdminDrafts() {
  if (!isAdminUser() && isLoggedIn() && typeof loadMyProfile === 'function') {
    await loadMyProfile().catch(() => {});
  }
  if (!isAdminUser()) {
    nav(isLoggedIn() ? 'settings' : 'login');
    showToast('Admin pristup nije dostupan za ovaj nalog.', 'error', 2200);
    return;
  }
  nav('admin-drafts', { noPageAnim: true, preserveScroll: true });
  const results = await Promise.allSettled([
    loadAdminOrganizersFromBackend({ silent: true }),
    loadAdminClaimRequestsFromBackend({ silent: true }),
    loadAdminDraftQueueFromBackend({ silent: true }),
    loadAdminOrphanPublishedEvents({ silent: true }),
    loadAdminPlanSignalsFromBackend({ silent: true })
  ]);
  if (results.some(result => result.status === 'rejected')) {
    showToast('Admin podaci su delimično učitani. Osveži stranicu ako nešto nedostaje.', 'info', 2800);
  }
  renderAdminDrafts();
}
