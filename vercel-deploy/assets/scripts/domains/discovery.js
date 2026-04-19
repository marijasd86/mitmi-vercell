// ─── TikTok swipe (Faza 2 upgrade) ───
const TT_BG_MAP = {
  muzika:'ev-img-a', svirka:'ev-img-a', dj:'ev-img-a', festival:'ev-img-a',
  scena_humor:'ev-img-b', standup:'ev-img-b', pozoriste:'ev-img-b',
  kultura_umetnost:'ev-img-b', kultura:'ev-img-b', izlozba:'ev-img-b', film:'ev-img-b',
  sport_rekreacija:'ev-img-c', sport:'ev-img-c',
  izlasci_druzenje:'ev-img-d', kafa:'ev-img-d', kafana:'ev-img-d', bar:'ev-img-d',
  napolju:'ev-img-e', priroda:'ev-img-e',
  hobiji_igre:'ev-img-b',
  edukacija_meetup:'ev-img-b', radionica:'ev-img-b',
  drugo:'ev-img-b'
};
const TT_CAT_EMOJI = {
  muzika:'🎵', svirka:'🎵', dj:'🎧', festival:'🎪',
  scena_humor:'🎭', standup:'🎤', pozoriste:'🎭',
  kultura_umetnost:'🎨', kultura:'🎨', izlozba:'🖼️', film:'🎬',
  sport_rekreacija:'⚽', sport:'⚽',
  izlasci_druzenje:'🍸', kafa:'☕', kafana:'🥂', bar:'🍸',
  napolju:'🌿', priroda:'🌿',
  hobiji_igre:'🎲',
  edukacija_meetup:'📚', radionica:'🛠️',
  drugo:'✨'
};

function _swipeKind(kind = 'event') {
  return kind === 'plan' ? 'plan' : 'event';
}

function _swipeTypeLabel(kind = 'event') {
  return _swipeKind(kind) === 'plan'
    ? _langText('Plan', 'Plan')
    : _langText('Događaj', 'Event');
}

function _swipeMetaCopy(data = {}) {
  const kind = _swipeKind(data.swipeType || 'event');
  const venue = data.venue || data.location_name || _langText('Lokacija uskoro', 'Location soon');
  if (kind === 'plan') {
    return {
      meta: `💬 ${venue}`,
      going: _langText('Ako ti deluje zanimljivo, javi se i otvori chat', 'If it looks interesting, reach out and open a chat')
    };
  }
  return {
    meta: `📍 ${venue}`,
    going: data.going || _langText('Sačuvaj događaj pa odluči kasnije', 'Save the event and decide later')
  };
}

function ttAction(event, action) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const current = _currentSwipeEvent();
  if (!current) return;
  if (action === 'follow') return followCurrentSwipeEvent();
  if (action === 'skip') return ttSwipe('left');
  if (action === 'info') {
    if ((current.swipeType || 'event') === 'plan' && !current.eventId) {
      showToast('Ovaj plan nema poseban događaj. Javi se direktno osobi koja ga je objavila.', 'info', 2200);
      return;
    }
    return openEventById(current.eventId || current.id);
  }
}

function ttLoadCard(data) {
  const shell = document.getElementById('tiktok-swipe');
  if (shell) shell.classList.toggle('tt-empty', !data);
  if (!data) {
    const bg = document.getElementById('tt-front-bg');
    if (bg) {
      bg.className = 'tt-bg ev-img-b';
      bg.style.backgroundImage = '';
      bg.style.backgroundSize = '';
      bg.style.backgroundPosition = '';
    }
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('tt-cat', `📅 ${_langText('Otkrij', 'Discover')}`);
    set('tt-title', _langText('Još nema događaja za otkrivanje', 'No events to discover yet'));
    set('tt-meta', _langText('Kad se pojave novi događaji, ovde ćeš ih brzo pregledati.', 'New events will show up here for quick browsing.'));
    set('tt-date', _langText('Sačuvaj ono što ti deluje zanimljivo', 'Save whatever looks interesting'));
    set('tt-desc', _langText('Otkrij je lagani pregled događaja pre nego što otvoriš detalje i odlučiš da li želiš da ideš.', 'Discover is a lightweight event preview before you open details and decide if you want to go.'));
    set('tt-going-txt', _langText('Pojaviće se čim stignu novi događaji', 'It will appear as soon as new events arrive'));
    const followBtn = document.getElementById('tt-follow-btn');
    if (followBtn) followBtn.textContent = 'Sačuvaj';
    const backTitle = document.getElementById('tt-back-title');
    const backCat = document.getElementById('tt-back-cat');
    if (backTitle) backTitle.textContent = 'Očekujemo nove događaje';
    if (backCat) backCat.textContent = '📅 Mitmi';
    return;
  }
  const bg = document.getElementById('tt-front-bg');
  if (bg) {
    bg.className = 'tt-bg ' + (TT_BG_MAP[data.cat] || 'ev-img-a');
    bg.style.backgroundImage = data.cover_url ? `url(${data.cover_url})` : '';
    bg.style.backgroundSize = data.cover_url ? 'cover' : '';
    bg.style.backgroundPosition = data.cover_url ? 'center' : '';
  }
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const emoji = TT_CAT_EMOJI[data.cat] || '📅';
  const categoryName = data.category_label || ((data.cat ? data.cat.charAt(0).toUpperCase() + data.cat.slice(1) : ''));
  const typeKind = _swipeKind(data.swipeType || 'event');
  const typeLabel = _swipeTypeLabel(typeKind);
  const metaCopy = _swipeMetaCopy(data);
  set('tt-cat',        `${typeLabel} · ${emoji} ${categoryName}`.trim());
  set('tt-title',      data.title || '');
  set('tt-meta',       metaCopy.meta);
  set('tt-date',       '📅 ' + (data.date || ''));
  set('tt-desc',       data.desc || '');
  set('tt-going-txt',  metaCopy.going);
  const catEl = document.getElementById('tt-cat');
  if (catEl) catEl.dataset.kind = typeKind;
  const followBtn = document.getElementById('tt-follow-btn');
  if (followBtn) {
    const followTarget = (data.swipeType || 'event') === 'plan' ? { ...data, id: data.eventId || data.id } : data;
    followBtn.textContent = isEventFollowed(followTarget) ? 'Sačuvano' : 'Sačuvaj';
  }
  // Back kartica
  const backBg = document.getElementById('tt-back-bg');
  const swipeDataNow = _getSwipeData();
  const nextData = swipeDataNow.length > 1 ? swipeDataNow[(swipeIdx + 1) % swipeDataNow.length] : data;
  if (backBg && nextData) {
    backBg.className = 'tt-bg ' + (TT_BG_MAP[nextData.cat] || 'ev-img-b');
    backBg.style.backgroundImage = nextData.cover_url ? `url(${nextData.cover_url})` : '';
    backBg.style.backgroundSize = nextData.cover_url ? 'cover' : '';
    backBg.style.backgroundPosition = nextData.cover_url ? 'center' : '';
  }
  const backTitle = document.getElementById('tt-back-title');
  const backCat = document.getElementById('tt-back-cat');
  if (backTitle) backTitle.textContent = nextData?.title || data.title || '';
  if (backCat) {
    const nextTypeKind = _swipeKind(nextData?.swipeType || data.swipeType || 'event');
    const nextTypeLabel = _swipeTypeLabel(nextTypeKind);
    const nextCategoryName = nextData?.category_label || data.category_label || ((nextData?.cat || data.cat || '').replace(/^./, c => c.toUpperCase()));
    backCat.textContent = `${nextTypeLabel} · ${(TT_CAT_EMOJI[nextData?.cat || data.cat] || '📅')} ${nextCategoryName}`;
    backCat.dataset.kind = nextTypeKind;
  }
}

function ttSwipe(dir) {
  const swipeDataNow = _getSwipeData();
  if (!swipeDataNow.length) return;
  if (swipeDataNow.length === 1) {
    showToast('Za ovu kategoriju je trenutno prikazan jedan događaj', 'info', 1800);
    return;
  }
  const front = document.getElementById('tt-front');
  const back  = document.getElementById('tt-back');
  if (!front) return;

  // Indicator
  const likeInd = document.getElementById('tt-like-ind');
  const skipInd = document.getElementById('tt-skip-ind');
  if ((dir === 'right' || dir === 'up') && likeInd) { likeInd.style.opacity = '1'; }
  if ((dir === 'left' || dir === 'down')  && skipInd) { skipInd.style.opacity = '1'; }

  // Mikro poruka
  if (dir === 'right' || dir === 'up') {
    const current = _currentSwipeEvent();
    if ((current?.swipeType || 'event') === 'plan' && current?.eventId) {
      followEvent({ ...current, id: current.eventId }, { silent: true });
    } else if (current) {
      followEvent(current, { silent: true });
    }
    const btn = document.getElementById('tt-follow-btn');
    if (btn) btn.textContent = _langText('Sačuvano', 'Saved');
    showToast(_langText('Sačuvano za kasnije', 'Saved for later'), 'success', 1400);
  }

  // Animiraj back ka naprijed
  if (back) {
    back.style.transform = 'scale(1) translateY(0)';
    back.style.transition = 'transform .32s ease';
  }

  const motionClass = dir === 'right' ? 'go-right'
    : dir === 'left' ? 'go-left'
    : dir === 'up' ? 'go-up'
    : 'go-down';
  front.classList.add(motionClass);

  setTimeout(() => {
    front.classList.remove('go-right', 'go-left', 'go-up', 'go-down');
    if (likeInd) likeInd.style.opacity = '0';
    if (skipInd) skipInd.style.opacity = '0';
    if (back)   { back.style.transform = ''; back.style.transition = ''; }
    swipeIdx = (swipeIdx + 1) % swipeDataNow.length;
    ttLoadCard(swipeDataNow[swipeIdx]);
    const info = document.querySelector('#tt-front .tt-info');
    if (info) {
      info.animate(
        [{ opacity:.65, transform:'translateY(6px)' }, { opacity:1, transform:'translateY(0)' }],
        { duration:220, easing:'ease-out' }
      );
    }
  }, 360);
}

// Override doSwipe za TikTok mod
function doSwipe(dir) {
  // Provjeri da li je TikTok mod aktivan
  const ttFront = document.getElementById('tt-front');
  if (ttFront) {
    ttSwipe(dir);
    return;
  }
  // Fallback stari swipe
  const front = document.getElementById('swipe-front');
  if (!front) return;
  front.classList.add(dir === 'right' ? 'go-right' : 'go-left');
  if (dir === 'right') showToast('Zainteresovan/a', 'success', 1500);
  const data = _getSwipeData();
  if (!data.length) return;
  setTimeout(() => {
    swipeIdx = (swipeIdx + 1) % data.length;
    if (typeof loadSwipeCard === 'function') loadSwipeCard(front, data[swipeIdx]);
    front.classList.remove('go-right','go-left');
  }, 380);
}

// Touch na TikTok kartici
let ttTouchStartX = 0, ttTouchStartY = 0, ttTouching = false;

document.addEventListener('DOMContentLoaded', () => {
  ttLoadCard(_getSwipeData()[0]);

  const ttFront = document.getElementById('tt-front');
  if (!ttFront) return;

  ttFront.addEventListener('touchstart', e => {
    ttTouchStartX = e.touches[0].clientX;
    ttTouchStartY = e.touches[0].clientY;
    ttTouching = true;
  }, { passive:true });

  ttFront.addEventListener('touchmove', e => {
    if (!ttTouching) return;
    const dx = e.touches[0].clientX - ttTouchStartX;
    const dy = e.touches[0].clientY - ttTouchStartY;
    if (Math.abs(dy) <= Math.abs(dx)) return;
    const lift = Math.min(1, Math.abs(dy) / 140);
    ttFront.style.transform = `translateY(${dy}px) scale(${1 - lift * 0.03})`;
    const likeInd = document.getElementById('tt-like-ind');
    const skipInd = document.getElementById('tt-skip-ind');
    if (likeInd) likeInd.style.opacity = String(Math.min(1, -dy / 90));
    if (skipInd) skipInd.style.opacity = '0';
  }, { passive:true });

  ttFront.addEventListener('touchend', e => {
    if (!ttTouching) return;
    ttTouching = false;
    const dx = e.changedTouches[0].clientX - ttTouchStartX;
    const dy = e.changedTouches[0].clientY - ttTouchStartY;
    ttFront.style.transform = '';
    document.getElementById('tt-like-ind').style.opacity = '0';
    document.getElementById('tt-skip-ind').style.opacity = '0';
    if (Math.abs(dy) > Math.abs(dx) && dy < -70) {
      ttSwipe('up');
    }
  }, { passive:true });

  // Mouse drag za desktop
  let mouseStartX = 0, mouseDragging = false;
  ttFront.addEventListener('mousedown', e => { mouseStartX = e.clientX; mouseDragging = true; });
  ttFront.addEventListener('mousemove', e => {
    if (!mouseDragging) return;
    const dx = e.clientX - mouseStartX;
    ttFront.style.transform = `translateX(${dx}px) rotate(${dx * 0.04}deg)`;
    const likeInd = document.getElementById('tt-like-ind');
    const skipInd = document.getElementById('tt-skip-ind');
    if (likeInd) likeInd.style.opacity = String(Math.min(1, dx / 80));
    if (skipInd) skipInd.style.opacity = String(Math.min(1, -dx / 80));
  });
  document.addEventListener('mouseup', e => {
    if (!mouseDragging) return;
    mouseDragging = false;
    const dx = e.clientX - mouseStartX;
    ttFront.style.transform = '';
    const likeInd = document.getElementById('tt-like-ind');
    const skipInd = document.getElementById('tt-skip-ind');
    if (likeInd) likeInd.style.opacity = '0';
    if (skipInd) skipInd.style.opacity = '0';
    if (Math.abs(dx) > 70) ttSwipe(dx > 0 ? 'right' : 'left');
  });
});

// setSwipeFilter za TikTok
const _origSetSwipeFilter = setSwipeFilter;
function setSwipeFilter(el, cat) {
  // Azuriraj pills
  el.closest('.tt-filters, .pills').querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  // Filter data
  _activeSwipeCat = cat;
  const eventSource = _combinedEventCards().map(e => ({ ...e, swipeType: 'event' }));
  const planSource = typeof getSwipePlanCards === 'function' ? getSwipePlanCards() : [];
  const combined = [...eventSource, ...planSource];
  const resolvedCat = typeof _eventVisualCategory === 'function' ? _eventVisualCategory(cat) : cat;
  if (cat === 'all') {
    _swipeFiltered = null;
  } else if (cat === 'tonight') {
    _swipeFiltered = combined.filter(e => typeof _isTonightEvent === 'function' ? _isTonightEvent(e.starts_at || e.date || '') : false);
  } else {
    _swipeFiltered = combined.filter((e) => {
      const eventCat = typeof _eventVisualCategory === 'function'
        ? _eventVisualCategory(e.cat || e.raw_category || '')
        : (e.cat || '');
      return eventCat === resolvedCat;
    });
  }
  if (_swipeFiltered && _swipeFiltered.length === 0) {
    showToast(_langText('Nema događaja ili planova u ovoj kategoriji', 'No events or plans in this category'), 'info', 2000);
    _swipeFiltered = null;
    return;
  }
  swipeIdx = 0;
  ttLoadCard(_getSwipeData()[0]);
}


// ─── Browse tab switching ───
async function switchBrowseTab(tab, preserveInput = false) {
  const hmPanel   = document.getElementById('browse-panel-home');
  const evPanel   = document.getElementById('browse-panel-events');
  const vpPanel   = document.getElementById('browse-panel-venues');
  const dcPanel   = document.getElementById('browse-panel-discover');
  const plPanel   = document.getElementById('browse-panel-plans');
  const pillsWrap = document.getElementById('br-pills-wrap');
  const btHm      = document.getElementById('bt-home');
  const btEv      = document.getElementById('bt-events');
  const btVn      = document.getElementById('bt-venues');
  const btDc      = document.getElementById('bt-discover');
  const btPl      = document.getElementById('bt-plans');
  const si        = document.getElementById('browse-search');
  if (!hmPanel || !evPanel || !vpPanel || !dcPanel || !plPanel) return;

  hmPanel.style.display = tab === 'home' ? '' : 'none';
  evPanel.style.display = tab === 'events' ? '' : 'none';
  vpPanel.style.display = tab === 'venues' ? '' : 'none';
  dcPanel.style.display = tab === 'discover' ? '' : 'none';
  plPanel.style.display = tab === 'plans' ? '' : 'none';
  if (pillsWrap) pillsWrap.style.display = tab === 'events' ? '' : 'none';

  if (si) {
    if (tab === 'home') {
      si.placeholder = _langText('Pretraži događaje ili osobe...', 'Search events or people...');
      si.oninput = function() {
        const q = this.value;
        switchBrowseTab('events', true);
        this.value = q;
        doSearch(q);
      };
    } else if (tab === 'events') {
      si.placeholder = _langText('Pretraži događaje ili osobe...', 'Search events or people...');
      si.oninput = function() { doSearch(this.value); };
    } else if (tab === 'venues') {
      si.placeholder = _langText('Pretraži organizatore ili osobe...', 'Search organizers or people...');
      si.oninput = function() {
        doVenueSearch(this.value);
        renderBrowseProfileSearchResults?.(this.value);
      };
    } else if (tab === 'plans') {
      si.placeholder = _langText('Pretraži planove ili osobe...', 'Search plans or people...');
      si.oninput = function() {
        doPlanSearch(this.value);
        renderBrowseProfileSearchResults?.(this.value);
      };
    } else {
      si.placeholder = _langText('Otkrij događaje...', 'Discover events...');
      si.oninput = function() {
        renderBrowseProfileSearchResults?.(this.value);
      };
    }
    if (!preserveInput) {
      si.value = '';
      renderBrowseProfileSearchResults?.('');
    }
  }

  if (btHm) btHm.classList.toggle('active', tab === 'home');
  if (btEv) btEv.classList.toggle('active', tab === 'events');
  if (btVn) btVn.classList.toggle('active', tab === 'venues');
  if (btDc) btDc.classList.toggle('active', tab === 'discover');
  if (btPl) btPl.classList.toggle('active', tab === 'plans');
  if (tab === 'events') {
    if (typeof resetBrowseFilters === 'function') {
      resetBrowseFilters({ preserveQuery: preserveInput, apply: false });
    }
    if (typeof loadPublishedEvents === 'function') {
      try { await loadPublishedEvents(); } catch (e) {}
    }
    if (typeof renderBrowseEventsGrid === 'function') {
      renderBrowseEventsGrid();
    }
  }
  if (tab === 'home') renderBrowseHomeStrip();
  if (tab === 'venues') loadBrowseVenues().catch(() => {});
  if (tab === 'discover') {
    if (typeof loadPublishedEvents === 'function') {
      try { await loadPublishedEvents(); } catch (e) {}
    }
    let swipeData = _getSwipeData();
    if (!swipeData.length && typeof resetBrowseFilters === 'function') {
      resetBrowseFilters({ preserveQuery: true, apply: false });
      swipeData = _getSwipeData();
    }
    swipeIdx = 0;
    ttLoadCard(swipeData[0] || null);
  }
  if (tab === 'plans') loadBrowsePlans().catch(() => {});
}

async function loadBrowseVenues() {
  const list = document.getElementById('venues-list');
  if (!list) return [];
  if (!_isSupabaseConfigured()) {
    list.innerHTML = `<div class="draft-empty">${_langText('Organizatori će se pojaviti kada povežeš organizer profile.', 'Organizers will appear once organizer profiles are connected.')}</div>`;
    return [];
  }
  try {
    const venueRows = await _supaGet('v_venue_profile', {
      select: '*',
      order: 'created_at.desc',
      limit: '48'
    }).catch(() => []);
    let organizerRows = [];
    try {
      organizerRows = await _supaGet('organizers', {
        select: 'id,name,city,organizer_type,public_address,public_description,instagram_handle,website_url,public_contact_email,public_contact_phone,source_notes,cover_url,status,claimed_by_profile_id,created_at',
        order: 'created_at.desc',
        limit: '48'
      });
    } catch (e) {
      organizerRows = await _supaGet('organizers', {
        select: 'id,name,city,organizer_type,public_address,public_description,instagram_handle,website_url,public_contact_email,public_contact_phone,source_notes,status,claimed_by_profile_id,created_at',
        order: 'created_at.desc',
        limit: '48'
      }).catch(() => []);
    }
    const venues = Array.isArray(venueRows) ? venueRows.map(venue => ({
      ...venue,
      kind: 'venue',
      entity_type: 'venue',
      card_name: venue.venue_name || 'Organizer',
      card_type: venue.venue_type || 'Organizer',
      followers_count: Number(venue.followers_count || 0),
      public_events_count: Number(venue.public_events_count || venue.upcoming_events_count || 0),
      badge_label: _venueBadgeText(venue.status),
      description: venue.description || ''
    })) : [];
    const organizers = Array.isArray(organizerRows) ? organizerRows
      .filter(item => item && item.status !== 'merged' && item.status !== 'archived')
      .map(organizer => ({
        ...organizer,
        kind: 'organizer',
        entity_type: 'organizer',
        venue_name: organizer.name,
        card_name: organizer.name || 'Organizer',
        card_type: _organizerTypeLabel(organizer.organizer_type || (organizer.status === 'claimed' ? 'Organizer profil' : 'Organizer u pripremi')),
        followers_count: 0,
        public_events_count: 0,
        badge_label: _organizerBadgeText(organizer.status),
        description: organizer.public_description || organizer.source_notes || '',
        public_address: organizer.public_address || '',
        public_contact_email: organizer.public_contact_email || '',
        public_contact_phone: organizer.public_contact_phone || ''
      })) : [];
    const combined = [...venues, ...organizers];
    if (!combined.length) {
      list.innerHTML = `<div class="draft-empty">${_langText('Još nema javnih profila organizatora. Kada prvi profil organizatora bude povezan ili potvrđen, pojaviće se ovde.', 'There are no public organizer profiles yet. Once the first organizer profile is linked or approved, it will appear here.')}</div>`;
      return [];
    }
    list.innerHTML = combined.map(venue => {
      const typeValue = venue.card_type || venue.venue_type || '';
      const categoryMeta = _organizerCategoryMeta(typeValue);
      const category = categoryMeta.key;
      const rating = Number(venue.avg_rating || 0).toFixed(1);
      const followers = Number(venue.followers_count || 0);
      const events = Number(venue.public_events_count || venue.upcoming_events_count || 0);
      const coverStyle = venue.cover_url ? ` style="background-image:url('${_safeCssUrl(venue.cover_url)}');background-size:cover;background-position:center"` : '';
      const emoji = categoryMeta.emoji;
      const typeLabel = venue.card_type || _organizerTypeLabel(venue.venue_type) || 'Organizer';
      const cityLabel = venue.city || _langText('Srbija', 'Serbia');
      const secondaryStat = venue.kind === 'organizer'
        ? _langText(`${events} događaja`, `${events} events`)
        : _langText(`${events} događaja · ${followers} prati`, `${events} events · ${followers} followers`);
      return `<div class="venue-row-card" data-cat="${_escHtml(category)}" onclick="openVenueProfile(${_escAttr(JSON.stringify(venue))})">
        <div class="vrc-img ${_escHtml(categoryMeta.bg)}"${coverStyle}></div>
        <div class="vrc-info">
          <div class="vrc-name">${_escHtml(venue.card_name || venue.venue_name || 'Organizer')}</div>
          <div class="vrc-meta">${_escHtml(typeLabel)} · ${_escHtml(cityLabel)}</div>
          <div class="vrc-tags">
            <span class="tag ${venue.kind === 'organizer' ? 'tag-outline' : 'tag-green'}" style="font-size:9px">${_escHtml(venue.badge_label)}</span>
            <span class="tag tag-purple" style="font-size:9px">${emoji} ${_escHtml(typeLabel)}</span>
          </div>
        </div>
        <div class="vrc-stats">
          <div class="vrc-rating">★ ${_escHtml(rating)}</div>
          <div class="vrc-count">${_escHtml(secondaryStat)}</div>
        </div>
      </div>`;
    }).join('');
    return combined;
  } catch (e) {
    console.warn('[mitmi] loadBrowseVenues:', e.message);
    list.innerHTML = '<div class="draft-empty">Lokali trenutno nisu dostupni.</div>';
    return [];
  }
}
// ─── Venue search ───
function doVenueSearch(val) {
  const list = document.getElementById('venues-list');
  if (!list) return;
  const q = val.toLowerCase().trim();
  list.querySelectorAll('.venue-row-card, .venue-card-pub').forEach(card => {
    card.style.display = (!q || card.textContent.toLowerCase().includes(q)) ? '' : 'none';
  });
}
// ─── Plan search ───
function doPlanSearch(val) {
  const list = document.getElementById('browse-plans-list');
  if (!list) return;
  const q = val.toLowerCase().trim();
  list.querySelectorAll('.inv-card').forEach(card => {
    card.style.display = (!q || card.textContent.toLowerCase().includes(q)) ? '' : 'none';
  });
}

const doInviteSearch = doPlanSearch;
// ─── Venue filter ───
function setVenueFilter(el, cat) {
  // Azuriraj active pill unutar br-venue-cats
  const wrap = el.closest('.br-venue-cats, .pills');
  if (wrap) wrap.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const list = document.getElementById('venues-list');
  if (!list) return;
  // Podrzi i venue-row-card i venue-card-pub
  list.querySelectorAll('.venue-row-card, .venue-card-pub').forEach(card => {
    const cardCat = card.getAttribute('data-cat') || '';
    card.style.display = (cat === 'all' || cardCat === cat) ? '' : 'none';
  });
}

// ─── Otvori venue javni profil ───
async function openVenueProfile(name, type, rating, followers, events) {
  const lookup = typeof name === 'object' ? name : name;
  nav('venue-public');
  _currentPublicVenueTarget = typeof lookup === 'object' ? lookup : null;
  _currentPublicVenueId = typeof lookup === 'object' ? lookup.id : lookup;
  if (_isSupabaseConfigured()) {
    renderPublicVenueProfile(typeof lookup === 'object' ? _normalizeVenueTarget(lookup) : null).catch(() => {});
    return;
  }

  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  _currentPublicVenueTarget = null;
  _currentPublicVenueId = null;
  setEl('vp-name', name);
  setEl('vp-title', name);
  setEl('vp-type', type);
  setEl('vp-rating', rating);
  setEl('vp-followers', followers);
  setEl('vp-events-count', events);
  setEl('vp-av', (name || 'O').charAt(0));
  const followBtn = document.getElementById('vp-follow-btn');
  if (followBtn) {
    followBtn.style.display = '';
    followBtn.textContent = '+ Prati';
    followBtn.className = 'btn btn-ghost btn-sm';
  }
}
