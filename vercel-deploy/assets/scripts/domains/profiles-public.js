async function loadPublicProfileDirectory() {
  if (!isLoggedIn() || !_isSupabaseConfigured()) {
    _profileDirectoryLoaded = false;
    PROFILE_DIRECTORY = [];
    return [];
  }
  const cached = _getCached('directory', getUser()?.id || 'guest');
  if (cached !== null) {
    PROFILE_DIRECTORY = cached;
    _profileDirectoryLoaded = true;
    return PROFILE_DIRECTORY;
  }
  try {
    const rows = await _supaGet('profiles', {
      select: 'id,username,display_name,city,bio,avatar_url,gender,avg_rating,rating_count,role',
      status: 'eq.active',
      id: `neq.${getUser()?.id}`,
      order: 'created_at.desc',
      limit: '100'
    });
    PROFILE_DIRECTORY = Array.isArray(rows) ? rows : [];
    _setCached('directory', getUser()?.id || 'guest', PROFILE_DIRECTORY, CACHE_TTL.directory);
    _profileDirectoryLoaded = true;
    return PROFILE_DIRECTORY;
  } catch (e) {
    console.warn('[mitmi] loadPublicProfileDirectory:', e.message);
    return PROFILE_DIRECTORY;
  }
}

async function loadMyFollowingIds() {
  if (!isLoggedIn() || !_isSupabaseConfigured()) {
    _followedProfileIdsLoaded = false;
    FOLLOWED_PROFILE_IDS = [];
    return [];
  }
  const cached = _getCached('following', getUser()?.id || 'guest');
  if (cached !== null) {
    FOLLOWED_PROFILE_IDS = cached;
    _followedProfileIdsLoaded = true;
    return FOLLOWED_PROFILE_IDS;
  }
  try {
    const rows = await _supaGet('follows', {
      select: 'following_id',
      follower_id: `eq.${getUser()?.id}`,
      limit: '200'
    });
    FOLLOWED_PROFILE_IDS = Array.isArray(rows) ? rows.map(item => item.following_id).filter(Boolean) : [];
    _setCached('following', getUser()?.id || 'guest', FOLLOWED_PROFILE_IDS, CACHE_TTL.following);
    _followedProfileIdsLoaded = true;
    return FOLLOWED_PROFILE_IDS;
  } catch (e) {
    console.warn('[mitmi] loadMyFollowingIds:', e.message);
    return FOLLOWED_PROFILE_IDS;
  }
}

async function loadBlockedProfileIds() {
  if (!isLoggedIn() || !_isSupabaseConfigured()) {
    _blockedProfileIdsLoaded = false;
    BLOCKED_PROFILE_IDS = [];
    return [];
  }
  const cached = _getCached('blocked', getUser()?.id || 'guest');
  if (cached !== null) {
    BLOCKED_PROFILE_IDS = cached;
    _blockedProfileIdsLoaded = true;
    return BLOCKED_PROFILE_IDS;
  }
  try {
    const rows = await _supaGet('blocks', {
      select: 'blocked_id',
      blocker_id: `eq.${getUser()?.id}`,
      limit: '200'
    });
    BLOCKED_PROFILE_IDS = Array.isArray(rows) ? rows.map(item => item.blocked_id).filter(Boolean) : [];
    _setCached('blocked', getUser()?.id || 'guest', BLOCKED_PROFILE_IDS, CACHE_TTL.blocked);
    _blockedProfileIdsLoaded = true;
    return BLOCKED_PROFILE_IDS;
  } catch (e) {
    console.warn('[mitmi] loadBlockedProfileIds:', e.message);
    return BLOCKED_PROFILE_IDS;
  }
}

async function _loadFollowCount(type, profileId) {
  if (!profileId || !_isSupabaseConfigured()) return 0;
  try {
    const field = type === 'followers' ? 'following_id' : 'follower_id';
    const rows = await _supaGet('follows', {
      select: 'follower_id',
      [field]: `eq.${profileId}`,
      limit: '200'
    });
    return Array.isArray(rows) ? rows.length : 0;
  } catch (e) {
    return 0;
  }
}

function isProfileFollowed(profileId) {
  return !!profileId && FOLLOWED_PROFILE_IDS.includes(profileId);
}

function isProfileBlocked(profileId) {
  return !!profileId && BLOCKED_PROFILE_IDS.includes(profileId);
}

function _publicProfileInitial(profile = {}) {
  const source = profile.display_name || profile.username || 'P';
  return source.trim().charAt(0).toUpperCase() || 'P';
}

function _profileAvatarFallback(profile = {}) {
  const gender = String(profile.gender || '').toLowerCase();
  if (gender === 'female') return '👩';
  if (gender === 'male') return '👨';
  return '👤';
}

function _publicProfileLabel(profile = {}) {
  return profile.display_name || (profile.username ? '@' + profile.username : _langText('Korisnik', 'User'));
}

const _profileDirectoryFilter = { query: '', mode: 'all' };

function _profileSearchText(profile = {}) {
  return [
    profile.display_name,
    profile.username ? '@' + String(profile.username).replace(/^@+/, '') : '',
    profile.username,
    profile.city,
    profile.bio,
    profile.role === 'venue' ? 'organizator venue organizer' : ''
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function _profileMatchesSearch(profile = {}, query = '') {
  const q = String(query || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!q) return true;
  return _profileSearchText(profile).includes(q);
}

function _renderBrowseProfileSearchRow(profile = {}) {
  const username = profile.username ? '@' + String(profile.username).replace(/^@+/, '') : '';
  const meta = [username, profile.city || ''].filter(Boolean).join(' · ');
  const badge = _profileRoleBadge(profile);
  const followedNow = FOLLOWED_PROFILE_IDS.includes(profile.id);
  const blockedNow = BLOCKED_PROFILE_IDS.includes(profile.id);
  const label = _publicProfileLabel(profile);
  const safeLabel = _escHtml(label).replace(/'/g, '&#39;');
  return `
    <button type="button" class="browse-profile-result" onclick="openOtherProfile('${_escHtml(profile.id)}')">
      <div class="av av-40 av-purple">${_escHtml(_publicProfileInitial(profile))}</div>
      <div class="browse-profile-result-copy">
        <div class="browse-profile-result-title">${_escHtml(_publicProfileLabel(profile))}${badge}</div>
        <div class="browse-profile-result-meta">${_escHtml(meta || _langText('Javni profil', 'Public profile'))}</div>
      </div>
      <div class="browse-profile-result-actions">
        ${blockedNow ? '' : `<button type="button" class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openDirectChat('${_escHtml(profile.id)}','${safeLabel}')">${_langText('Poruka', 'Message')}</button>`}
        ${blockedNow ? '' : `<button type="button" class="${followedNow ? 'btn btn-ghost btn-sm' : 'btn btn-outline btn-sm'}" onclick="event.stopPropagation();toggleProfileFollow('${_escHtml(profile.id)}', this)">${followedNow ? _langText('Pratiš', 'Following') : _langText('Prati', 'Follow')}</button>`}
      </div>
    </button>
  `;
}

async function renderBrowseProfileSearchResults(query = '') {
  const box = document.getElementById('browse-profile-search-results');
  if (!box) return;
  const q = String(query || '').trim();
  if (!q || q.length < 2 || !isLoggedIn() || !_isSupabaseConfigured()) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  try {
    if (!_profileDirectoryLoaded) await loadPublicProfileDirectory();
    if (!_blockedProfileIdsLoaded) await loadBlockedProfileIds();
  } catch (e) {}
  const results = PROFILE_DIRECTORY
    .filter(profile => !BLOCKED_PROFILE_IDS.includes(profile.id) && _profileMatchesSearch(profile, q))
    .slice(0, 5);
  if (!results.length) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `
    <div class="browse-profile-search-head">${_langText('Osobe', 'People')}</div>
    ${results.map(_renderBrowseProfileSearchRow).join('')}
  `;
  box.style.display = 'block';
}

function _profileRoleBadge(profile = {}) {
  if (profile.role === 'venue') return '<span class="tag tag-purple" style="font-size:10px">Organizer</span>';
  if (profile.role === 'admin') return '<span class="tag tag-outline" style="font-size:10px">Admin</span>';
  return '';
}

function _renderProfileDirectoryRow(profile = {}) {
  const followedNow = FOLLOWED_PROFILE_IDS.includes(profile.id);
  const blockedNow = BLOCKED_PROFILE_IDS.includes(profile.id);
  const buttonLabel = followedNow ? _langText('Pratiš', 'Following') : _langText('Prati', 'Follow');
  const buttonClass = followedNow ? 'btn btn-ghost btn-sm' : 'btn btn-outline btn-sm';
  const meta = [Number(profile.avg_rating || 0).toFixed(1), profile.city || _langText('Srbija', 'Serbia')].filter(Boolean).join(' · ');
  const badge = _profileRoleBadge(profile);
  const actionHtml = blockedNow
    ? `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();toggleBlockProfile('${_escHtml(profile.id)}')">${_langText('Odblokiraj', 'Unblock')}</button>`
    : `${followedNow ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openDirectChat('${_escHtml(profile.id)}','${_escHtml(_publicProfileLabel(profile)).replace(/'/g, '&#39;')}')">${_langText('Poruka', 'Message')}</button>` : ''}<button class="${buttonClass}" onclick="event.stopPropagation();toggleProfileFollow('${_escHtml(profile.id)}', this)">${buttonLabel}</button>`;
  return `<div class="ev-row" onclick="openOtherProfile('${_escHtml(profile.id)}')"><div class="av av-40 av-purple">${_escHtml(_publicProfileInitial(profile))}</div><div style="flex:1"><div class="ev-row-title" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${_escHtml(_publicProfileLabel(profile))}${badge}</div><div class="ev-row-meta">${_escHtml(meta)}</div></div><div style="display:flex;gap:8px;align-items:center">${actionHtml}</div></div>`;
}

function filterProfileDirectory(query = '') {
  _profileDirectoryFilter.query = String(query || '');
  renderFollowingProfiles();
}

function setProfileDirectoryMode(mode = 'all', btn = null) {
  _profileDirectoryFilter.mode = mode || 'all';
  const root = btn?.parentElement || document;
  root.querySelectorAll?.('[data-people-mode]').forEach(el => el.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderFollowingProfiles();
}

function renderFollowingProfiles() {
  const box = document.getElementById('profile-following-list');
  if (!box) return;
  const query = _profileDirectoryFilter.query;
  let list = PROFILE_DIRECTORY.filter(profile => !BLOCKED_PROFILE_IDS.includes(profile.id) && _profileMatchesSearch(profile, query));
  if (_profileDirectoryFilter.mode === 'following') {
    list = list.filter(profile => FOLLOWED_PROFILE_IDS.includes(profile.id));
  } else if (_profileDirectoryFilter.mode === 'venue') {
    list = list.filter(profile => profile.role === 'venue');
  }
  const followed = list.filter(profile => FOLLOWED_PROFILE_IDS.includes(profile.id));
  const others = list.filter(profile => !FOLLOWED_PROFILE_IDS.includes(profile.id));
  if (!followed.length && !others.length) {
    box.innerHTML = `<div class="draft-empty">${query ? _langText('Nema profila za ovu pretragu.', 'No profiles match this search.') : _langText('Ovde će ti stajati ljudi koje pratiš i koje možeš da otkriješ.', 'People you follow and people you can discover will appear here.')}</div>`;
    return;
  }
  box.innerHTML = `
    ${followed.length ? `<div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink4);margin:2px 0 10px">${_langText('Pratiš', 'Following')}</div>${followed.map(_renderProfileDirectoryRow).join('')}` : ''}
    ${others.length ? `<div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink4);margin:${followed.length ? '16px' : '2px'} 0 10px">${_langText('Otkrij ljude', 'Discover people')}</div>${others.map(_renderProfileDirectoryRow).join('')}` : ''}
  `;
}

async function loadBlockedProfiles() {
  if (!_profileDirectoryLoaded) await loadPublicProfileDirectory();
  if (!_blockedProfileIdsLoaded) await loadBlockedProfileIds();
  const box = document.getElementById('blocked-users-list');
  const countEl = document.getElementById('settings-blocked-count');
  if (countEl) {
    countEl.textContent = BLOCKED_PROFILE_IDS.length
      ? _langText(
          `${BLOCKED_PROFILE_IDS.length} blokiran` + (BLOCKED_PROFILE_IDS.length > 1 ? 'a' : ''),
          `${BLOCKED_PROFILE_IDS.length} blocked`
        )
      : _langText('Nema blokiranih', 'No blocked users');
  }
  if (!box) return;
  const blockedProfiles = PROFILE_DIRECTORY.filter(profile => BLOCKED_PROFILE_IDS.includes(profile.id));
  if (!blockedProfiles.length) {
    box.innerHTML = `<div class="draft-empty">${_langText('Nema blokiranih profila.', 'No blocked profiles yet.')}</div>`;
    return;
  }
  box.innerHTML = blockedProfiles.map(profile => {
    const meta = [Number(profile.avg_rating || 0).toFixed(1), profile.city || _langText('Srbija', 'Serbia')].filter(Boolean).join(' · ');
    return `<div class="ev-row" onclick="openOtherProfile('${_escHtml(profile.id)}')"><div class="av av-40 av-gray">${_escHtml(_publicProfileInitial(profile))}</div><div style="flex:1"><div class="ev-row-title">${_escHtml(_publicProfileLabel(profile))}</div><div class="ev-row-meta">${_escHtml(meta)}</div></div><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();toggleBlockProfile('${_escHtml(profile.id)}')">${_langText('Odblokiraj', 'Unblock')}</button></div>`;
  }).join('');
}

async function renderPublicProfile(profile = null) {
  const data = profile || PROFILE_DIRECTORY.find(item => item.id === _currentPublicProfileId) || null;
  if (!data) return;
  const followers = await _loadFollowCount('followers', data.id);
  const following = await _loadFollowCount('following', data.id);
  const events = await _loadPublicProfileEvents(data.id);

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  const ratingCount = Number(data.rating_count || 0);
  const ratingWrap = document.getElementById('other-profile-rating-summary');
  _renderAvatarBubble(document.getElementById('other-profile-avatar'), data, _profileAvatarFallback(data));
  setText('other-profile-name', _publicProfileLabel(data));
  setText('other-profile-bio', data.bio || _langText('Još nema kratkog opisa profila.', 'There is no short profile description yet.'));
  setText('other-profile-events', String(events.length));
  setText('other-profile-followers', String(followers));
  setText('other-profile-following', String(following));
  setText('other-profile-rating', Number(data.avg_rating || 0).toFixed(1));
  setText('other-profile-rating-count', ratingCount > 0 ? _langText(`${ratingCount} ocena`, `${ratingCount} ratings`) : _langText('Još nema ocena', 'No ratings yet'));
  if (ratingWrap) {
    ratingWrap.style.display = ratingCount > 0 ? 'flex' : 'none';
    ratingWrap.classList.toggle('is-empty', ratingCount === 0);
  }
  const socials = document.getElementById('other-profile-socials');
  if (socials) {
    const socialBits = [];
    if (data.username) socialBits.push(`<div class="soc-chip">👤 @${_escHtml(String(data.username).replace(/^@+/, ''))}</div>`);
    if (data.city) socialBits.push(`<div class="soc-chip">📍 ${_escHtml(data.city)}</div>`);
    if (events.length > 0) socialBits.push(`<div class="soc-chip">🎟 ${_langText(`${events.length} događaja`, `${events.length} events`)}</div>`);
    if (Number(data.rating_count || 0) > 0) socialBits.push(`<div class="soc-chip">★ ${_langText(`${_escHtml(String(Number(data.rating_count || 0)))} ocena`, `${_escHtml(String(Number(data.rating_count || 0)))} ratings`)}</div>`);
    if (!socialBits.length) socialBits.push(`<div class="soc-chip">🌱 ${_langText('Nov profil', 'New profile')}</div>`);
    socials.innerHTML = socialBits.join('');
  }
  _renderTopTrustChips('other-profile-top-trust', data, { isOwn: false, eventsCount: events.length });
  const blockedNow = isProfileBlocked(data.id);
  const followBtn = document.getElementById('other-profile-follow-btn');
  if (followBtn) {
    if (blockedNow) {
      followBtn.style.display = 'none';
    } else {
      followBtn.style.display = '';
      followBtn.textContent = isProfileFollowed(data.id) ? _langText('Pratiš', 'Following') : _langText('Prati', 'Follow');
      followBtn.className = isProfileFollowed(data.id) ? 'btn btn-ghost btn-sm' : 'btn btn-purple btn-sm';
      followBtn.onclick = () => toggleProfileFollow(data.id, followBtn);
    }
  }
  const messageBtn = document.getElementById('other-profile-message-btn');
  if (messageBtn) {
    messageBtn.style.display = blockedNow ? 'none' : '';
    messageBtn.onclick = () => openDirectChat(data.id, _publicProfileLabel(data));
  }
  const blockBtn = document.getElementById('other-profile-block-btn');
  if (blockBtn) {
    blockBtn.textContent = isProfileBlocked(data.id) ? _langText('Odblokiraj', 'Unblock') : _langText('Blokiraj', 'Block');
    blockBtn.onclick = () => toggleBlockProfile(data.id);
  }
  const reportBtn = document.getElementById('other-profile-report-btn');
  if (reportBtn) reportBtn.onclick = () => openReportPage({ type: 'profile', profileId: data.id, label: _publicProfileLabel(data) });
  const adminActions = document.getElementById('other-profile-admin-actions');
  const adminFlagBtn = document.getElementById('other-profile-admin-flag-btn');
  const adminPanelBtn = document.getElementById('other-profile-admin-panel-btn');
  const canAdmin = typeof isAdminUser === 'function' && isAdminUser();
  if (adminActions) adminActions.style.display = canAdmin ? 'flex' : 'none';
  if (adminFlagBtn) {
    adminFlagBtn.onclick = () => adminFlagProfileForReview(data.id, _publicProfileLabel(data));
  }
  if (adminPanelBtn) {
    adminPanelBtn.onclick = () => nav('admin-moderation');
  }
  renderOtherProfileEvents(events);
}

async function adminFlagProfileForReview(profileId, label = '') {
  if (!_isSupabaseConfigured() || !profileId || !(typeof isAdminUser === 'function' && isAdminUser())) return;
  try {
    await _supaFetch('/rest/v1/rpc/create_moderation_item', {
      method: 'POST',
      body: JSON.stringify({
        p_entity_type: 'user',
        p_entity_id: profileId,
        p_reason: _langText('Admin pregled profila', 'Admin profile review'),
        p_source_type: 'admin',
        p_priority: 2,
        p_metadata: {
          label: label || _langText('Profil korisnika', 'User profile'),
          context: 'quick_admin_profile_action'
        }
      })
    });
    showToast(_langText('Profil je dodat u moderation inbox', 'Profile added to the moderation inbox'), 'success', 1800);
    if (typeof loadAdminModerationQueue === 'function') {
      loadAdminModerationQueue().catch(() => {});
    }
  } catch (e) {
    console.warn('[mitmi] adminFlagProfileForReview:', e.message);
    showToast(_langText('Dodavanje u moderation trenutno nije uspelo', 'Adding to moderation failed right now'), 'error');
  }
}

async function _loadPublicProfileEvents(profileId) {
  if (!profileId || !_isSupabaseConfigured()) return [];
  try {
    const rows = await _supaGet('events', {
      select: 'id,creator_id,title,description,category,event_tags,city,location_name,public_address,starts_at,capacity,attendee_count,ticket_price_rsd,cover_url,is_published,is_cancelled,created_at',
      creator_id: `eq.${profileId}`,
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

function renderOtherProfileEvents(items = []) {
  const box = document.getElementById('other-profile-events-list');
  if (!box) return;
  if (!items.length) {
    box.innerHTML = `<div class="draft-empty">${_langText('Još nema javnih događaja.', 'There are no public events yet.')}</div>`;
    return;
  }
  box.innerHTML = items.map(item => {
    const coverStyle = item.cover_url ? ` style="background-image:url('${_safeCssUrl(item.cover_url)}');background-size:cover;background-position:center;color:transparent"` : '';
    return `<div class="ev-row" onclick="openEventById('${_escHtml(item.id)}')"><div class="ev-row-img ${_escHtml(item.bg)}"${coverStyle}>${item.cover_url ? '•' : _eventEmoji(item.cat)}</div><div><div class="ev-row-title">${_escHtml(item.title)}</div><div class="ev-row-meta">${_escHtml(item.meta || 'Detalji nisu upisani')}</div></div></div>`;
  }).join('');
}

async function toggleProfileFollow(profileId, btnEl = null) {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  if (!profileId || profileId === getUser()?.id) return;
  const followed = isProfileFollowed(profileId);
  try {
    if (followed) {
      await _supaFetch(`/rest/v1/follows?follower_id=eq.${getUser()?.id}&following_id=eq.${profileId}`, {
        method: 'DELETE'
      });
      FOLLOWED_PROFILE_IDS = FOLLOWED_PROFILE_IDS.filter(id => id !== profileId);
      showToast('Više ne pratiš ovaj profil', 'info', 1600);
    } else {
      await _supaFetch('/rest/v1/follows', {
        method: 'POST',
        body: JSON.stringify({
          follower_id: getUser()?.id,
          following_id: profileId
        })
      });
      FOLLOWED_PROFILE_IDS = Array.from(new Set([profileId, ...FOLLOWED_PROFILE_IDS]));
      showToast('Profil je dodat u Pratim', 'success', 1600);
    }
    _clearCache('following', getUser()?.id || 'guest');
    _clearCache('profile', getUser()?.id || 'guest');
    _clearCache('directory', getUser()?.id || 'guest');
    _clearCache('notifications', getUser()?.id || 'guest');
    renderFollowingProfiles();
    if (_currentPublicProfileId === profileId) renderPublicProfile();
    loadMyProfile().catch(() => {});
  } catch (e) {
    showToast('Praćenje profila trenutno nije uspelo', 'error');
  }
}

async function openOtherProfile(profileId = null) {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  if (!_profileDirectoryLoaded) await loadPublicProfileDirectory();
  if (!_followedProfileIdsLoaded) await loadMyFollowingIds();
  const target = profileId
    ? PROFILE_DIRECTORY.find(item => item.id === profileId)
    : PROFILE_DIRECTORY[0];
  if (!target) {
    showToast('Još nema drugih javnih profila za prikaz', 'info', 1800);
    return;
  }
  _currentPublicProfileId = target.id;
  nav('other-profile');
  renderPublicProfile(target).catch(() => {});
}

function openReportPage(ctx = {}) {
  _reportContext = {
    type: ctx.type || 'profile',
    profileId: ctx.profileId || null,
    venueId: ctx.venueId || null,
    eventId: ctx.eventId || null,
    label: ctx.label || ''
  };
  const titleEl = document.getElementById('report-page-title');
  const targetEl = document.getElementById('report-target-copy');
  const helpEl = document.getElementById('report-help-box');
  const reasonLabelEl = document.getElementById('report-reason-label');
  if (titleEl) {
    titleEl.textContent =
      ctx.type === 'issue' ? 'Prijavi bag' :
      ctx.type === 'venue' ? 'Prijavi organizatora' :
      ctx.type === 'event' ? 'Prijavi događaj' :
      'Prijavi korisnika';
  }
  if (targetEl) {
    targetEl.textContent = ctx.label
      ? `Prijavljuješ: ${ctx.label}`
      : (ctx.type === 'issue' ? 'Pošalji bag našem timu' : 'Pošalji prijavu moderatorima');
  }
  const reasonEl = document.getElementById('report-reason');
  const detailsEl = document.getElementById('report-details');
  const submitEl = document.getElementById('report-submit-btn');
  if (ctx.type === 'issue') {
    if (helpEl) helpEl.textContent = 'Prijavi bag, neobično ponašanje, polomljen ekran ili nešto što ne radi kako očekuješ. Napiši gde si bila u aplikaciji i šta se desilo.';
    if (reasonLabelEl) reasonLabelEl.textContent = 'Tip problema';
    if (reasonEl) {
      reasonEl.innerHTML = `
        <option>Bag u aplikaciji</option>
        <option>Nešto ne radi</option>
        <option>Pogrešan prikaz</option>
        <option>Problem sa prijavom</option>
        <option>Problem sa porukama</option>
        <option>Ostalo</option>
      `;
      reasonEl.value = 'Bag u aplikaciji';
    }
    if (detailsEl) detailsEl.placeholder = 'Opiši korake: gde si kliknula, šta si očekivala i šta se stvarno desilo...';
    if (submitEl) submitEl.textContent = 'Pošalji bag';
  } else {
    if (helpEl) helpEl.textContent = 'Prijavi uznemiravanje, lažno predstavljanje, pretnje, deljenje tuđih podataka ili neprimeren sadržaj. Ako postoji neposredna opasnost, prvo kontaktiraj lokalne službe pomoći.';
    if (reasonLabelEl) reasonLabelEl.textContent = 'Razlog prijave';
    if (reasonEl) {
      reasonEl.innerHTML = `
        <option>Neprikladne poruke</option>
        <option>Lažni profil</option>
        <option>Deljenje kontakt podataka</option>
        <option>Uznemiravanje ili pretnje</option>
        <option>Nije se pojavio/la</option>
        <option>Ostalo</option>
      `;
      reasonEl.value = 'Ostalo';
    }
    if (detailsEl) detailsEl.placeholder = 'Opiši šta se dogodilo...';
    if (submitEl) submitEl.textContent = 'Pošalji prijavu';
  }
  if (detailsEl) detailsEl.value = '';
  nav('report');
}

async function toggleBlockProfile(profileId) {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  if (!profileId || profileId === getUser()?.id) return;
  const blocked = isProfileBlocked(profileId);
  try {
    if (blocked) {
      await _supaFetch(`/rest/v1/blocks?blocker_id=eq.${getUser()?.id}&blocked_id=eq.${profileId}`, {
        method: 'DELETE'
      });
      BLOCKED_PROFILE_IDS = BLOCKED_PROFILE_IDS.filter(id => id !== profileId);
      showToast('Profil je odblokiran', 'success', 1500);
    } else {
      if (isProfileFollowed(profileId)) {
        try {
          await _supaFetch(`/rest/v1/follows?follower_id=eq.${getUser()?.id}&following_id=eq.${profileId}`, {
            method: 'DELETE'
          });
          FOLLOWED_PROFILE_IDS = FOLLOWED_PROFILE_IDS.filter(id => id !== profileId);
        } catch (followErr) {
          console.warn('[mitmi] toggleBlockProfile follow cleanup:', followErr.message);
        }
      }
      await _supaFetch('/rest/v1/blocks', {
        method: 'POST',
        body: JSON.stringify({
          blocker_id: getUser()?.id,
          blocked_id: profileId
        })
      });
      BLOCKED_PROFILE_IDS = Array.from(new Set([profileId, ...BLOCKED_PROFILE_IDS]));
      showToast('Profil je blokiran', 'info', 1600);
    }
    _clearCache('following', getUser()?.id || 'guest');
    _clearCache('directory', getUser()?.id || 'guest');
    _clearCache('profile', getUser()?.id || 'guest');
    if (_currentPublicProfileId === profileId) renderPublicProfile();
    renderFollowingProfiles();
    loadBlockedProfiles().catch(() => {});
  } catch (e) {
    showToast('Blokiranje trenutno nije uspelo', 'error');
  }
}
