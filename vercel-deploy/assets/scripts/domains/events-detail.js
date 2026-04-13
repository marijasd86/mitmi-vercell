function _renderEventDetailUnavailable(message = 'Događaj trenutno nije dostupan.') {
  const hero = document.getElementById('event-hero');
  const cat = document.getElementById('event-category');
  const title = document.getElementById('event-title');
  const tagsEl = document.getElementById('event-tags');
  const dateEl = document.getElementById('event-date');
  const timeEl = document.getElementById('event-time');
  const primaryMetaEl = document.getElementById('event-primary-meta');
  const locationEl = document.getElementById('event-location');
  const locationWrap = document.getElementById('event-location-wrap');
  const statusSummaryEl = document.getElementById('event-status-summary');
  const descEl = document.getElementById('event-description');
  const ratingWrap = document.getElementById('event-rating-summary');
  const ownerBtn = document.getElementById('event-edit-btn');
  const adminHideBtn = document.getElementById('event-admin-hide-btn');
  const saveBtn = document.getElementById('event-save-btn');
  const orphanNote = document.getElementById('event-admin-orphan-note');
  const eventPlansList = document.getElementById('event-plans-list');
  const capEl = document.getElementById('event-capacity');
  const leftEl = document.getElementById('event-capacity-left');
  const fillEl = document.getElementById('event-capacity-fill');
  const photoGrid = document.getElementById('ev-photo-grid');
  const photoEmpty = document.getElementById('ev-photo-empty');
  const photoAddBtn = document.getElementById('ev-photo-add-btn');
  const photoManageCopy = document.getElementById('ev-photo-manage-copy');

  if (hero) {
    hero.className = 'ev-hero ev-img-a';
    hero.style.backgroundImage = '';
    hero.style.backgroundSize = '';
    hero.style.backgroundPosition = '';
  }
  if (cat) cat.textContent = '⚠️ Događaj';
  if (title) title.textContent = 'Događaj nije dostupan';
  if (tagsEl) {
    tagsEl.innerHTML = '';
    tagsEl.style.display = 'none';
  }
  if (dateEl) dateEl.textContent = 'Proveri događaje';
  if (timeEl) timeEl.textContent = 'u tvom gradu';
  if (primaryMetaEl) primaryMetaEl.textContent = 'Ovaj događaj više nije dostupan ili nije mogao da se učita.';
  if (locationEl) locationEl.textContent = 'Vrati se na listu događaja i pokušaj ponovo.';
  if (locationWrap) {
    locationWrap.style.cursor = 'default';
    locationWrap.onclick = null;
  }
  if (statusSummaryEl) statusSummaryEl.textContent = 'Detalji trenutno nisu dostupni';
  if (descEl) descEl.textContent = message;
  if (ratingWrap) ratingWrap.style.display = 'none';
  if (ownerBtn) {
    ownerBtn.style.display = 'none';
    ownerBtn.onclick = null;
  }
  if (adminHideBtn) {
    adminHideBtn.style.display = 'none';
    adminHideBtn.onclick = null;
  }
  if (saveBtn) {
    saveBtn.innerHTML = '♡ <span>Sačuvaj</span>';
    saveBtn.onclick = null;
  }
  if (orphanNote) orphanNote.style.display = 'none';
  if (eventPlansList) eventPlansList.innerHTML = '<div class="draft-empty">Nema dostupnih planova za ovaj događaj.</div>';
  if (capEl) capEl.textContent = '—';
  if (leftEl) leftEl.textContent = 'Broj mesta trenutno nije dostupan';
  if (fillEl) fillEl.style.width = '0%';
  if (photoGrid) photoGrid.innerHTML = '';
  if (photoEmpty) photoEmpty.textContent = 'Fotografije trenutno nisu dostupne.';
  if (photoAddBtn) photoAddBtn.style.display = 'none';
  if (photoManageCopy) photoManageCopy.textContent = 'Vrati se na pregled događaja i pokušaj ponovo.';
}

function renderEventDetail(eventCard = null) {
  const event = eventCard || _currentEventCard();
  if (!event) {
    _renderEventDetailUnavailable();
    return;
  }
  const raw = event.raw || {};
  const date = raw.starts_at ? new Date(raw.starts_at) : new Date();
  const hero = document.getElementById('event-hero');
  const cat = document.getElementById('event-category');
  const title = document.getElementById('event-title');
  const tagsEl = document.getElementById('event-tags');
  const dateEl = document.getElementById('event-date');
  const timeEl = document.getElementById('event-time');
  const primaryMetaEl = document.getElementById('event-primary-meta');
  const locationEl = document.getElementById('event-location');
  const locationWrap = document.getElementById('event-location-wrap');
  const statusSummaryEl = document.getElementById('event-status-summary');
  const descEl = document.getElementById('event-description');
  const ratingWrap = document.getElementById('event-rating-summary');
  const ratingBadge = document.getElementById('event-rating-badge');
  const ratingCountEl = document.getElementById('event-rating-count');
  const capEl = document.getElementById('event-capacity');
  const leftEl = document.getElementById('event-capacity-left');
  const fillEl = document.getElementById('event-capacity-fill');
  const ownerBtn = document.getElementById('event-edit-btn');
  const adminHideBtn = document.getElementById('event-admin-hide-btn');
  const saveBtn = document.getElementById('event-save-btn');
  const socialBtn = document.getElementById('event-social-btn');
  const chatBtn = document.getElementById('event-chat-btn');
  const photoAddBtn = document.getElementById('ev-photo-add-btn');
  const photoManageCopy = document.getElementById('ev-photo-manage-copy');
  const photoEmpty = document.getElementById('ev-photo-empty');
  const orphanNote = document.getElementById('event-admin-orphan-note');
  const orphanCopy = document.getElementById('event-admin-orphan-copy');
  const orphanActions = document.getElementById('event-admin-orphan-actions');

  if (hero) {
    hero.className = `ev-hero ${event.bg || 'ev-img-a'}`;
    hero.style.backgroundImage = event.cover_url ? `url(${event.cover_url})` : '';
    hero.style.backgroundSize = event.cover_url ? 'cover' : '';
    hero.style.backgroundPosition = event.cover_url ? 'center' : '';
  }
  if (cat) cat.textContent = `${_eventEmoji(raw.category || event.raw_category || event.cat)} ${_eventCategoryLabel(raw.category || event.raw_category || event.cat || 'drugo')}`;
  if (title) title.textContent = event.title || 'Dogadjaj';
  if (tagsEl) {
    const tagHtml = typeof _renderEventTagPills === 'function' ? _renderEventTagPills(event.tags || raw.tags || [], 4) : '';
    tagsEl.innerHTML = tagHtml;
    tagsEl.style.display = tagHtml ? 'flex' : 'none';
  }
  const dateText = date.toLocaleDateString('sr-Latn', { weekday:'long', day:'numeric', month:'long' });
  const timeText = date.toLocaleTimeString('sr-Latn', { hour:'2-digit', minute:'2-digit' });
  if (dateEl) dateEl.textContent = dateText;
  if (timeEl) timeEl.textContent = timeText;
  if (primaryMetaEl) primaryMetaEl.textContent = `${dateText} u ${timeText}`;
  if (locationEl) locationEl.textContent = _formatEventLocationLine(raw);
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
  if (descEl) descEl.textContent = raw.description || 'Opis događaja još nije dodat.';
  const ratingCount = Number(raw.rating_count || 0);
  const avgRating = Number(raw.avg_rating || 0).toFixed(1);
  if (ratingWrap) {
    ratingWrap.style.display = ratingCount > 0 ? 'flex' : 'none';
    ratingWrap.classList.toggle('is-empty', ratingCount === 0);
  }
  if (ratingBadge) ratingBadge.textContent = avgRating;
  if (ratingCountEl) ratingCountEl.textContent = ratingCount > 0 ? `${ratingCount} ocena` : 'Još nema ocena';
  const capacity = Number(raw.capacity || 0);
  const attendees = Number(raw.attendee_count || 0);
  const pct = capacity > 0 ? Math.min(100, Math.round((attendees / capacity) * 100)) : 0;
  const statusSummary = _eventStatusSummary(raw);
  if (capEl) capEl.textContent = capacity > 0 ? `${attendees} / ${capacity}` : `${attendees} prijavljenih`;
  if (leftEl) leftEl.textContent = capacity > 0 ? `${Math.max(capacity - attendees, 0)} mesta preostalo` : 'Broj mesta nije ograničen';
  if (statusSummaryEl) statusSummaryEl.textContent = statusSummary;
  if (fillEl) fillEl.style.width = `${pct}%`;
  if (ownerBtn) {
    ownerBtn.style.display = 'none';
    ownerBtn.onclick = null;
    Promise.resolve(_canEditEventFromDetail(event))
      .then(canEdit => {
        ownerBtn.style.display = canEdit ? '' : 'none';
        ownerBtn.onclick = canEdit ? () => openCreateEvent(event.id) : null;
      })
      .catch(() => {});
  }
  if (adminHideBtn) {
    adminHideBtn.style.display = isAdminUser() ? '' : 'none';
    adminHideBtn.onclick = () => adminHideEventFromDetail(event);
  }
  if (orphanNote && orphanCopy && orphanActions) {
    const orphanItem = isAdminUser() ? (ADMIN_ORPHAN_EVENTS.find(item => item.id === event.id) || null) : null;
    orphanNote.style.display = orphanItem ? '' : 'none';
    orphanActions.innerHTML = '';
    if (orphanItem) {
      const matches = possibleOrganizerMatchesForOrphanEvent(orphanItem);
      orphanCopy.textContent = matches.length
        ? 'Ovaj događaj još nije povezan sa organizer profilom. Možeš odmah da ga povežeš sa postojećim organizerom ili da napraviš organizer u pripremi.'
        : 'Ovaj događaj još nije povezan sa organizer profilom. Napravi organizer u pripremi da se događaj više ne vodi kao orphan objava.';
      if (matches[0]?.id) {
        orphanActions.innerHTML += `<button type="button" class="btn btn-outline btn-sm" onclick="connectPublishedEventToOrganizer('${_escAttr(event.id)}','${_escAttr(matches[0].id)}')">Poveži sa ${_escHtml(matches[0].name || 'organizerom')}</button>`;
      }
      orphanActions.innerHTML += `<button type="button" class="btn btn-purple btn-sm" onclick="createGhostOrganizerForPublishedEvent('${_escAttr(event.id)}')">Kreiraj organizer profil</button>`;
    }
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
    socialBtn.onclick = () => openCreatePlanForEvent(event.id);
  }
  if (chatBtn) {
    chatBtn.onclick = () => openEventGroupChat(event.id, event.title || raw.title || 'Događaj', raw.creator_id || null);
  }
  if (photoAddBtn) photoAddBtn.style.display = 'none';
  if (photoManageCopy) photoManageCopy.textContent = 'Fotografije sa događaja ostaju ovde kao mala galerija utisaka.';
  if (photoEmpty) photoEmpty.textContent = 'Još nema fotografija za ovaj događaj.';
  if (typeof _canManageEventPhotos === 'function') {
    Promise.resolve(_canManageEventPhotos(event.id))
      .then(canManage => {
        if (photoAddBtn) photoAddBtn.style.display = canManage ? 'inline-flex' : 'none';
        if (photoManageCopy) {
          photoManageCopy.textContent = canManage
            ? 'Najviše 3 dodatne slike po događaju. Velike slike se automatski smanjuju pre uploada.'
            : 'Fotografije sa događaja ostaju ovde kao mala galerija utisaka.';
        }
        if (photoEmpty) {
          photoEmpty.textContent = canManage
            ? 'Još nema fotografija za ovaj događaj.'
            : 'Još nema fotografija iz ove večeri.';
        }
      })
      .catch(() => {});
  }
  loadEventPlans(event.id).catch(() => {});
  if (typeof loadEventPhotos === 'function') {
    loadEventPhotos(event.id).catch(() => {});
  }
  checkEvPhotoEmpty();
}

async function _canEditEventFromDetail(eventCard = null) {
  const event = eventCard || _currentEventCard();
  const raw = event?.raw || {};
  const myId = getUser()?.id || null;
  if (!event?.id || !myId) return false;
  const isStandaloneOwnEvent = raw.creator_id === myId && !raw.organizer_id && !raw.venue_id;
  if (isStandaloneOwnEvent) return true;
  if ((raw.organizer_id || raw.venue_id) && typeof _canManageEventPhotos === 'function') {
    try {
      return !!(await _canManageEventPhotos(event.id));
    } catch (e) {
      return false;
    }
  }
  return false;
}

async function adminHideEventFromDetail(eventCard = null) {
  const event = eventCard || _currentEventCard();
  if (!_isSupabaseConfigured() || !event?.id || !isAdminUser()) return;
  const label = event.title || event.raw?.title || 'ovaj događaj';
  const shouldHide = window.confirm(`Da li želiš da sakriješ "${label}" iz javnog prikaza?`);
  if (!shouldHide) return;
  try {
    await _supaFetch('/rest/v1/rpc/soft_hide_entity', {
      method: 'POST',
      body: JSON.stringify({
        p_entity_type: 'event',
        p_entity_id: event.id,
        p_reason: 'Sakriveno kroz admin quick action na event ekranu'
      })
    });
    showToast('Događaj je sakriven iz javnog prikaza', 'success', 1800);
    if (typeof loadPublishedEvents === 'function') {
      loadPublishedEvents().catch(() => {});
    }
    nav('browse');
  } catch (e) {
    console.warn('[mitmi] adminHideEventFromDetail:', e.message);
    showToast('Sakrivanje događaja trenutno nije uspelo', 'error');
  }
}

async function openEventById(eventId) {
  if (!eventId) {
    nav('event');
    _renderEventDetailUnavailable('Otvori događaj iz pregleda da vidiš njegove detalje.');
    return;
  }
  _currentEventId = eventId;
  let card = _combinedEventCards().find(item => item.id === eventId) || null;
  if (!card && _isSupabaseConfigured()) {
    try {
      const rows = await _supaGet('events', {
        select: 'id,creator_id,venue_id,organizer_id,title,description,category,event_tags,city,location_name,organizer_name_override,starts_at,capacity,attendee_count,cover_url,avg_rating,rating_count,is_published,is_cancelled,created_at',
        id: `eq.${eventId}`,
        limit: '1'
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row) card = _mapDbEventToCard(row);
    } catch (e) {
      console.warn('[mitmi] openEventById:', e.message);
    }
  }
  nav('event');
  if (!card) {
    _renderEventDetailUnavailable('Događaj nije pronađen ili trenutno ne može da se učita.');
    showToast('Događaj trenutno nije dostupan', 'info', 1800);
    return;
  }
  renderEventDetail(card);
}
