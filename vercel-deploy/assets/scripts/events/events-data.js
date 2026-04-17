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
    organizer_type: row.organizer_type || '',
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
    eventTags: _normalizeEventTags(row.event_tags || []),
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

function _mapDbEventToCard(event = {}) {
  const startsAt = event.starts_at || new Date().toISOString();
  const dateOnly = _eventDateToken(startsAt);
  const capacity = event.capacity ?? event.spots ?? null;
  const attendeeCount = Number(event.attendee_count || 0);
  const rawCategory = _normalizeEventCategoryKey(event.category || 'drugo');
  const cat = _eventVisualCategory(rawCategory);
  const coverUrl = event.cover_url || _getEventCover(event.id);
  const tags = _normalizeEventTags(event.tags || event.event_tags || _getEventTags(event.id));
  const spotsState = _eventSpotsState(capacity, attendeeCount);
  return {
    id: event.id || `local-${Date.now()}`,
    title: event.title || 'Novi događaj',
    meta: _formatEventMeta(event),
    date: dateOnly,
    starts_at: startsAt,
    cat,
    raw_category: rawCategory,
    category_label: _eventCategoryLabel(rawCategory, { bucket: true }),
    bg: _eventBg(cat),
    cover_url: coverUrl,
    tags,
    spots: capacity != null && capacity !== '' ? String(capacity) : '',
    capacity: Number.isFinite(Number(capacity)) ? Number(capacity) : null,
    attendee_count: attendeeCount,
    spotsLabel: spotsState.label,
    spotsVariant: spotsState.variant,
    urgent: spotsState.variant === 'urgent',
    location_name: event.location_name || '',
    public_address: event.public_address || '',
    ticket_price_rsd: event.ticket_price_rsd ?? null,
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
