function _appBaseUrl() {
  return window.location.origin + window.location.pathname;
}

function _buildProfileShareUrl() {
  const profile = typeof _getMyProfileSnapshot === 'function' ? _getMyProfileSnapshot() : (getUser?.() || {});
  const id = profile?.id || getUser?.()?.id || '';
  return id ? `${_appBaseUrl()}?open=profile&id=${encodeURIComponent(id)}` : `${_appBaseUrl()}#profile`;
}

function _buildVenueShareUrl() {
  const venueId = globalThis._currentPublicVenueId || '';
  return venueId ? `${_appBaseUrl()}?open=venue&id=${encodeURIComponent(venueId)}` : _appBaseUrl();
}

function _qrImageUrl(url = '') {
  return `https://api.qrserver.com/v1/create-qr-code/?size=720x720&data=${encodeURIComponent(url)}`;
}

function _closeShareQrModal() {
  const modal = document.getElementById('share-qr-modal');
  if (modal) modal.remove();
}

async function _copyTextWithToast(value = '', okSr = 'Kopirano', okEn = 'Copied') {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      showToast(_langText(okSr, okEn), 'success', 1500);
      return true;
    }
  } catch (e) {}
  showToast(_langText('Kopiranje nije dostupno na ovom uređaju.', 'Copy is not available on this device.'), 'info', 1800);
  return false;
}

function _openShareQrModal({ title = 'Svita', subtitle = '', shareUrl = '' } = {}) {
  if (!shareUrl) return;
  _closeShareQrModal();
  const modal = document.createElement('div');
  modal.id = 'share-qr-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(15,14,13,.62);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="width:min(420px,96vw);background:#fffdf8;border:1px solid var(--border);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.24);padding:16px 16px 14px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px">
        <div>
          <div style="font-size:18px;font-weight:800;color:var(--ink)">${_escHtml(title)}</div>
          <div style="font-size:12px;color:var(--ink3);line-height:1.5">${_escHtml(subtitle || _langText('Skeniraj QR i otvori profil u Svita.', 'Scan the QR code to open this profile in Svita.'))}</div>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" onclick="_closeShareQrModal()">✕</button>
      </div>
      <div style="display:flex;justify-content:center;padding:10px 0 12px;flex-direction:column;align-items:center;gap:8px">
        <div id="share-qr-image-wrap" style="width:min(280px,78vw);min-height:160px;border-radius:14px;border:1px solid var(--border2);background:#fff;display:flex;align-items:center;justify-content:center;padding:10px">
          <img
            id="share-qr-image"
            src="${_qrImageUrl(shareUrl)}"
            alt="${_escAttr(_langText('QR kod za deljenje', 'Share QR code'))}"
            style="display:block;width:100%;height:auto;max-width:240px;border-radius:10px"
            onerror="const i=this;const w=document.getElementById('share-qr-image-wrap');if(i)i.style.display='none';if(w)w.innerHTML='<div style=&quot;padding:12px;text-align:center;font-size:12px;color:var(--ink3);line-height:1.5&quot;>${_escAttr(_langText('QR trenutno nije mogao da se učita. Koristi dugme &quot;Otvori QR&quot; ispod.', 'QR could not be loaded right now. Use the \"Open QR\" button below.'))}</div>';"
          />
        </div>
      </div>
      <div style="font-size:11px;color:var(--ink4);line-height:1.45;margin-bottom:10px;word-break:break-all">${_escHtml(shareUrl)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-purple btn-sm" type="button" onclick="shareQrLink('${_escAttr(shareUrl)}','${_escAttr(title)}')">${_langText('Podeli', 'Share')}</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="copyQrLink('${_escAttr(shareUrl)}')">${_langText('Kopiraj link', 'Copy link')}</button>
        <a class="btn btn-ghost btn-sm" href="${_qrImageUrl(shareUrl)}" target="_blank" rel="noopener">${_langText('Otvori QR', 'Open QR')}</a>
      </div>
    </div>
  `;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) _closeShareQrModal();
  });
  document.body.appendChild(modal);
}

async function shareQrLink(url = '', title = 'Svita') {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
  } catch (e) {}
  await _copyTextWithToast(url, 'Link je kopiran', 'Link copied');
}

async function copyQrLink(url = '') {
  await _copyTextWithToast(url, 'Link je kopiran', 'Link copied');
}

function openMyProfileQr() {
  const profile = typeof _getMyProfileSnapshot === 'function' ? _getMyProfileSnapshot() : (getUser?.() || {});
  const label = profile?.display_name || (profile?.username ? `@${String(profile.username).replace(/^@+/, '')}` : _langText('Moj profil', 'My profile'));
  _openShareQrModal({
    title: _langText('QR profila', 'Profile QR'),
    subtitle: _langText('Podeli ga da te drugi brzo pronađu i zaprate.', 'Share it so others can quickly find and follow you.'),
    shareUrl: _buildProfileShareUrl(),
    label
  });
}

function openCurrentVenueQr() {
  const name = document.getElementById('vp-title')?.textContent?.trim() || _langText('Organizer profil', 'Organizer profile');
  _openShareQrModal({
    title: _langText('QR organizatora', 'Organizer QR'),
    subtitle: _langText('Odlično za postere, stories i događaje.', 'Great for posters, stories, and event promos.'),
    shareUrl: _buildVenueShareUrl(),
    label: name
  });
}

async function shareMyProfile() {
  const shareUrl = _buildProfileShareUrl();
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Svita profil', url: shareUrl });
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      showToast(_langText('Link profila je kopiran', 'Profile link copied'), 'success', 1500);
      return;
    }
  } catch (e) {
    // User canceled native share dialog (expected on many devices).
    if (String(e?.name || '').toLowerCase() !== 'aborterror') {
      console.warn('[svita] shareMyProfile:', e.message);
    }
  }
  _openShareQrModal({
    title: _langText('Podeli profil', 'Share profile'),
    subtitle: _langText('Skeniraj QR ili podeli link.', 'Scan the QR code or share the link.'),
    shareUrl
  });
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
          .filter(item => typeof _isEventUpcoming === 'function' ? _isEventUpcoming(item) : true)
      : [];
  } catch (e) {
    console.warn('[svita] loadFollowedEvents:', e.message);
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
    console.warn('[svita] followEvent:', e.message);
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
    console.warn('[svita] unfollowEventByKey:', e.message);
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
