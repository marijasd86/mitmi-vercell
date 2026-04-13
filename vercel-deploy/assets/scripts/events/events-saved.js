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
    title: data.title || 'Dogadjaj',
    meta: data.meta || '',
    dayOffset: data.dayOffset ?? 0,
    date: data.date || _dateFromOffset(data.dayOffset || 0),
    cat: data.cat || 'kultura',
    bg: data.bg || 'ev-img-b',
    spots: data.spots || '',
    urgent: !!data.urgent,
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
    box.innerHTML = `<div class="draft-empty">${_langText('Ovde će ti stajati događaji koje pratiš.', 'Events you follow will appear here.')}</div>`;
    return;
  }
  box.innerHTML = FOLLOWED_EVENTS.map(ev => {
    const key = eventKeyFromData(ev).replace(/'/g, "\\'");
    const date = ev.date || _dateFromOffset(ev.dayOffset || 0);
    const coverStyle = ev.cover_url ? ` style="background-image:url('${_safeCssUrl(ev.cover_url)}');background-size:cover;background-position:center;color:transparent"` : '';
    return `<div class="ev-row" onclick="openEventById('${_escHtml(ev.id || '')}')"><div class="ev-row-img ${ev.bg || 'ev-img-b'}"${coverStyle}>${ev.cover_url ? '•' : (CAT_EMOJI[ev.cat] || '🎫')}</div><div style="flex:1;min-width:0"><div class="ev-row-title">${ev.title}</div><div class="ev-row-meta">${dateLabel(date)} · ${ev.meta || _langText('Detalji nisu upisani', 'Details have not been added')}</div></div><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();unfollowEventByKey('${key}')">${_langText('Otprati', 'Unfollow')}</button></div>`;
  }).join('');
}

async function followCurrentSwipeEvent() {
  const current = _getSwipeData()[swipeIdx] || _getSwipeData()[0];
  await followEvent(current);
  const btn = document.getElementById('tt-follow-btn');
  if (btn) btn.textContent = isEventFollowed(current) ? 'Pratis' : 'Prati';
  if (_currentEventId && current?.id === _currentEventId) renderEventDetail(current);
}
