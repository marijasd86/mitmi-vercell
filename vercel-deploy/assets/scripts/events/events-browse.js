const BROWSE_PAGE_SIZE = 20;

const _browsePageState = {
  offset: 0,
  isLoading: false,
  hasMore: true,
  items: []
};

function _resetBrowsePageState() {
  _browsePageState.offset = 0;
  _browsePageState.isLoading = false;
  _browsePageState.hasMore = true;
  _browsePageState.items = [];
}

function _renderBrowseEventsEmptyState() {
  return `
    <div class="empty-state browse-empty-state" style="grid-column:1/-1">
      <div class="empty-ico" aria-hidden="true">📅</div>
      <div class="empty-title">${_langText('Nema događaja za ovaj filter', 'No events match this filter')}</div>
      <div class="empty-sub">${_langText('Probaj drugi datum, kategoriju ili se vrati malo kasnije kad stignu nove objave.', 'Try a different date or category, or come back a little later when new posts arrive.')}</div>
    </div>
  `;
}

function _renderBrowseEventCard(event) {
  const categoryLabel = event.category_label || _eventCategoryLabel(event.raw_category || event.cat || 'drugo');
  const dateLine = _formatEventDateTimeLine(event.raw || event);
  const locationLine = _formatEventLocationLine(event.raw || event);
  const priceLine = _formatEventTicketPrice(event.raw || event);
  const spotsLabel = event.spotsLabel || _eventSpotsLabel(event.spots, event.attendee_count);
  const spotsVariant = event.spotsVariant || _eventSpotsState(event.spots, event.attendee_count).variant;
  const tagLine = _renderEventTagPills(event.tags || [], 2);
  const coverStyle = event.cover_url ? ` style="background-image:url('${_safeCssUrl(event.cover_url)}');background-size:cover;background-position:center"` : '';
  return `<div class="sq-card" data-cat="${_escHtml(event.raw_category || event.cat)}" data-bucket="${_escHtml(event.cat)}" data-tags="${_escAttr((event.tags || []).join(','))}" data-day="${_escHtml(_eventDayBucket(event.date || event.starts_at || ''))}" data-date="${_escHtml(event.date || '')}" data-city="${_escHtml((event.raw?.city || event.city || '').trim())}" onclick="openEventById('${_escHtml(event.id)}')">
    <div class="sq-img ${_escHtml(event.bg)}"${coverStyle}>
      <span class="sq-cat">${_escHtml(categoryLabel)}</span>
      <span class="sq-spots sq-spots-${_escHtml(spotsVariant)}">${_escHtml(spotsLabel)}</span>
    </div>
    <div class="sq-body">
      <div class="sq-title">${_escHtml(event.title)}</div>
      <div class="sq-meta sq-meta-primary">${_escHtml(dateLine)}</div>
      <div class="sq-meta">${_escHtml(locationLine)}</div>
      ${priceLine ? `<div class="sq-meta">${_escHtml(priceLine)}</div>` : ''}
      ${tagLine ? `<div class="event-tag-row">${tagLine}</div>` : ''}
    </div>
  </div>`;
}

function _showBrowseLoadMore() {
  const wrap = document.getElementById('browse-load-more-wrap');
  const allLoaded = document.getElementById('browse-all-loaded');
  if (wrap) wrap.style.display = 'block';
  if (allLoaded) allLoaded.style.display = 'none';
}

function _hideBrowseLoadMore() {
  const wrap = document.getElementById('browse-load-more-wrap');
  const allLoaded = document.getElementById('browse-all-loaded');
  if (wrap) wrap.style.display = 'none';
  if (allLoaded) allLoaded.style.display = _browsePageState.items.length ? 'block' : 'none';
}

function _setBrowseLoadMoreLoading(loading) {
  const btn = document.getElementById('browse-load-more-btn');
  const spinner = document.getElementById('browse-load-more-spinner');
  if (btn) btn.style.display = loading ? 'none' : 'inline-flex';
  if (spinner) spinner.style.display = loading ? 'inline-flex' : 'none';
}

function _syncBrowseLoadMoreUi() {
  if (_browsePageState.isLoading) {
    _showBrowseLoadMore();
    _setBrowseLoadMoreLoading(true);
    return;
  }
  _setBrowseLoadMoreLoading(false);
  if (_browsePageState.hasMore) _showBrowseLoadMore();
  else _hideBrowseLoadMore();
}

async function _fetchNextBrowsePage() {
  if (_browsePageState.isLoading || !_browsePageState.hasMore) return [];
  _browsePageState.isLoading = true;
  _syncBrowseLoadMoreUi();
  try {
    if (!_isSupabaseConfigured()) {
      _browsePageState.hasMore = false;
      _syncBrowseLoadMoreUi();
      return [];
    }
    if (typeof loadBlockedProfileIds === 'function') {
      await loadBlockedProfileIds();
    }
    const rows = await _supaGet('events', {
      select: 'id,creator_id,title,description,category,event_tags,city,location_name,public_address,starts_at,capacity,attendee_count,ticket_price_rsd,cover_url,is_published,is_cancelled,is_hidden,created_at',
      is_published: 'eq.true',
      order: 'starts_at.asc',
      limit: String(BROWSE_PAGE_SIZE),
      offset: String(_browsePageState.offset)
    });
    const mappedRows = Array.isArray(rows)
      ? rows
          .filter(row => row?.is_cancelled !== true && row?.is_hidden !== true)
          .filter(row => !BLOCKED_PROFILE_IDS.includes(row.creator_id))
          .map(_mapDbEventToCard)
      : [];
    _browsePageState.offset += BROWSE_PAGE_SIZE;
    if (!mappedRows.length || mappedRows.length < BROWSE_PAGE_SIZE) {
      _browsePageState.hasMore = false;
    }
    _browsePageState.items.push(...mappedRows);
    REAL_EVENT_DATA = _browsePageState.items.slice();
    globalThis.REAL_EVENT_DATA = REAL_EVENT_DATA.slice();
    return mappedRows;
  } catch (e) {
    console.warn('[svita] _fetchNextBrowsePage:', e.message);
    showToast(_langText('Greška pri učitavanju. Pokušaj ponovo.', 'Failed to load. Please try again.'), 'error', 2500);
    return [];
  } finally {
    _browsePageState.isLoading = false;
    _syncBrowseLoadMoreUi();
  }
}

function _appendBrowseEventCards(items) {
  const grid = document.getElementById('browse-grid');
  if (!grid) return;
  if (!Array.isArray(items) || !items.length) return;
  const empty = document.getElementById('browse-empty');
  if (empty) empty.style.display = 'none';
  const markup = items.map(_renderBrowseEventCard).join('');
  grid.insertAdjacentHTML('beforeend', markup);
}

function renderBrowseEventsGrid() {
  const grid = document.getElementById('browse-grid');
  if (!grid) return;
  const items = _combinedEventCards();
  const fallbackItems = Array.isArray(globalThis._browseHomePreviewEvents) ? globalThis._browseHomePreviewEvents : [];
  const renderItems = items.length ? items : fallbackItems;
  if (!renderItems.length) {
    grid.innerHTML = _renderBrowseEventsEmptyState();
    _hideBrowseLoadMore();
    return;
  }
  grid.innerHTML = renderItems.map(_renderBrowseEventCard).join('');
  _applyBrowseFilters();
  _syncBrowseLoadMoreUi();
}

async function loadPublishedEvents() {
  const grid = document.getElementById('browse-grid');
  if (grid) grid.innerHTML = '';
  _resetBrowsePageState();

  if (!_isSupabaseConfigured()) {
    renderBrowseEventsGrid();
    return _combinedEventCards();
  }

  const firstPage = await _fetchNextBrowsePage();
  if (!Array.isArray(firstPage) || !firstPage.length) {
    renderBrowseEventsGrid();
    return _combinedEventCards();
  }
  _appendBrowseEventCards(firstPage);
  _applyBrowseFilters();
  _syncBrowseLoadMoreUi();
  return REAL_EVENT_DATA || _combinedEventCards();
}

async function loadMoreBrowseEvents() {
  if (_browsePageState.isLoading || !_browsePageState.hasMore) return;
  const rows = await _fetchNextBrowsePage();
  _appendBrowseEventCards(rows);
  _applyBrowseFilters();
}

globalThis.loadMoreBrowseEvents = loadMoreBrowseEvents;
globalThis._syncBrowseLoadMoreUi = _syncBrowseLoadMoreUi;

function renderUskoroStrip() {
  const strip = document.getElementById('uskoro-strip');
  if (!strip) return;
  const today = new Date();
  today.setHours(0,0,0,0);

  const upcoming = _combinedEventCards()
    .map(e => ({ ...e, date: e.date || _dateFromOffset(e.dayOffset || 0) }))
    .filter(e => (_parseEventDateLocal(e.date) || new Date(0)) >= today)
    .sort((a, b) => (_parseEventDateLocal(a.date)?.getTime() || 0) - (_parseEventDateLocal(b.date)?.getTime() || 0));

  if (upcoming.length === 0) {
    strip.innerHTML = `<div style="font-size:13px;color:var(--ink4);padding:12px 0">${_langText('Još nema predstojećih događaja.', 'There are no upcoming events yet.')}</div>`;
    return;
  }

  strip.innerHTML = upcoming.map((ev, i) => {
    const evDate = _parseEventDateLocal(ev.date);
    const isToday = !!evDate && evDate.getTime() === today.getTime();
    const spotsLabel = ev.spotsLabel || _eventSpotsLabel(ev.spots, ev.attendee_count);
    const spotsVariant = ev.spotsVariant || _eventSpotsState(ev.spots, ev.attendee_count).variant;
    const emoji = _eventEmoji(ev.raw_category || ev.cat);
    const delay = i * 0.07;
    const heroStyle = ev.cover_url ? `background-image:url('${_safeCssUrl(ev.cover_url)}');background-size:cover;background-position:center;position:relative` : 'position:relative';
    return `<div class="hero-ev-card" style="flex-shrink:0;width:155px;animation:cardReveal .3s ease ${delay}s both;opacity:0" onclick="openEventById('${_escHtml(ev.id || '')}')">
      <div class="hero-ev-img ${ev.bg}" style="${heroStyle}">
        ${isToday ? `<span style="position:absolute;top:8px;right:8px;background:var(--amber);color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:10px;letter-spacing:.04em">${_langText('DANAS', 'TODAY')}</span>` : ''}
      </div>
      <div class="hero-ev-body">
        <div style="font-size:10px;font-weight:700;color:var(--ink3);margin-bottom:3px">${emoji} ${_escHtml(ev.category_label || _eventCategoryLabel(ev.raw_category || ev.cat || 'drugo'))}</div>
        <div class="hero-ev-title">${ev.title}</div>
        <div class="hero-ev-meta">${ev.meta}</div>
        <div class="hero-ev-spots hero-ev-spots-${_escHtml(spotsVariant)}">${_escHtml(spotsLabel)}</div>
        <button class="hero-ev-btn" onclick="openEventById('${_escHtml(ev.id || '')}');event.stopPropagation()">${_langText('Nađi društvo', 'Find company')}</button>
      </div>
    </div>`;
  }).join('');
}

function renderBrowseHomeStrip() {
  const strip = document.getElementById('browse-home-strip');
  if (!strip) return;
  const today = new Date();
  today.setHours(0,0,0,0);
  const normalizeCity = (value = '') => (typeof _normalizeBrowseCityLabel === 'function'
    ? _normalizeBrowseCityLabel(value)
    : String(value || '').trim().toLowerCase());
  const activeCity = normalizeCity(globalThis._browseState?.city || '');
  const upcomingAll = _combinedEventCards()
    .map(e => ({ ...e, date: e.date || _dateFromOffset(e.dayOffset || 0) }))
    .filter(e => (_parseEventDateLocal(e.date) || new Date(0)) >= today)
    .filter(e => {
      if (!activeCity) return true;
      const eventCity = normalizeCity(e.raw?.city || e.city || '');
      return !eventCity || eventCity === activeCity;
    })
    .sort((a, b) => (_parseEventDateLocal(a.date)?.getTime() || 0) - (_parseEventDateLocal(b.date)?.getTime() || 0));
  globalThis._browseHomePreviewEvents = upcomingAll;
  const upcoming = upcomingAll.slice(0, 2);
  if (!upcoming.length) {
    strip.innerHTML = `<div class="draft-empty">${_langText('Kad se pojave prvi događaji, ovde ćeš videti kratak pregled najbližih izlazaka.', 'Once the first events appear, you will see a short preview of the nearest plans here.')}</div>`;
    return;
  }
  strip.innerHTML = upcoming.map((ev, i) => {
    const label = dateLabel(ev.date);
    const evDate = _parseEventDateLocal(ev.date);
    const isToday = !!evDate && evDate.getTime() === today.getTime();
    const spotsLabel = ev.spotsLabel || _eventSpotsLabel(ev.spots, ev.attendee_count);
    const spotsVariant = ev.spotsVariant || _eventSpotsState(ev.spots, ev.attendee_count).variant;
    const emoji = _eventEmoji(ev.raw_category || ev.cat);
    const delay = i * 0.06;
    const coverStyle = ev.cover_url
      ? `background-image:url('${_safeCssUrl(ev.cover_url)}');background-size:cover;background-position:center`
      : '';
    const title = _escHtml(ev.title || _langText('Događaj', 'Event'));
    const meta = _escHtml(ev.meta || _langText('Detalji uskoro', 'Details soon'));
    return `<article class="browse-preview-card" style="animation:cardReveal .3s ease ${delay}s both;opacity:0" onclick="openEventById('${_escHtml(ev.id || '')}')">
      <div class="browse-preview-media ${_escHtml(ev.bg || 'ev-img-a')}"${coverStyle ? ` style="${coverStyle}"` : ''}>
        <span class="browse-preview-kicker">${emoji} ${_escHtml(label)}</span>
        ${isToday ? `<span class="browse-preview-badge">${_langText('Danas', 'Today')}</span>` : ''}
      </div>
      <div class="browse-preview-body">
        <div class="browse-preview-title">${title}</div>
        <div class="browse-preview-meta">${meta}</div>
        <div class="browse-preview-footer">
          <div class="browse-preview-spots browse-preview-spots-${_escHtml(spotsVariant)}">${_escHtml(spotsLabel)}</div>
          <button class="browse-preview-btn" onclick="openEventById('${_escHtml(ev.id || '')}');event.stopPropagation()">${_langText('Detalji', 'Details')}</button>
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
    const dateLine = _formatEventDateTimeLine(ev.raw || ev);
    const locationLine = _formatEventLocationLine(ev.raw || ev);
    const priceLine = _formatEventTicketPrice(ev.raw || ev);
    const locationAndPrice = [locationLine, priceLine].filter(Boolean).join(' · ');
    const coverStyle = ev.cover_url
      ? `background-image:url('${_safeCssUrl(ev.cover_url)}');background-size:cover;background-position:center`
      : '';
    return `<div class="hero-ev-card" style="animation:cardReveal .3s ease ${i * 0.06}s both;opacity:0" onclick="openEventById('${_escHtml(ev.id || '')}')">
      <div class="hero-ev-img ${_escHtml(ev.bg)}"${coverStyle ? ` style="${coverStyle}"` : ''}>
        <span class="hero-cat-tag"><span class="hero-tag-icon" aria-hidden="true">${emoji}</span>${_escHtml(ev.category_label || _eventCategoryLabel(ev.raw_category || ev.cat || 'drugo'))}</span>
      </div>
      <div class="hero-ev-body">
        <div class="hero-ev-title">${_escHtml(ev.title || _langText('Događaj', 'Event'))}</div>
        <div class="hero-ev-meta">
          <div class="hero-ev-meta-line">${_escHtml(dateLine || _langText('Termin uskoro', 'Time soon'))}</div>
          <div class="hero-ev-meta-line hero-ev-meta-line-secondary">${_escHtml(locationAndPrice || _langText('Detalji nisu upisani', 'Details have not been added'))}</div>
        </div>
        <button class="hero-ev-btn" onclick="openEventById('${_escHtml(ev.id || '')}');event.stopPropagation()">${_langText('Pogledaj', 'View')}</button>
      </div>
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', renderUskoroStrip);
document.addEventListener('DOMContentLoaded', renderLandingHeroEvents);
document.addEventListener('DOMContentLoaded', () => { loadPublishedEvents().then(() => renderLandingHeroEvents()).catch(() => {}); });
