// --- nav() ---
const HISTORY_MAX = 30;
const navHistory = [];
const DATA_CACHE = new Map();
let PENDING_REVIEW_TASKS = [];
let _activeReviewTaskId = null;
const CACHE_TTL = {
  profile: 30000,
  venue: 30000,
  organizer: 30000,
  inbox: 12000,
  notifications: 12000,
  directory: 45000,
  following: 20000,
  blocked: 20000,
  venueAnalytics: 15000
};

function _cacheKey(scope = '', id = 'default') {
  return `${scope}:${id}`;
}

function _getCached(scope, id = 'default') {
  const entry = DATA_CACHE.get(_cacheKey(scope, id));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    DATA_CACHE.delete(_cacheKey(scope, id));
    return null;
  }
  return entry.value;
}

function _setCached(scope, id = 'default', value = null, ttl = 15000) {
  DATA_CACHE.set(_cacheKey(scope, id), {
    value,
    expiresAt: Date.now() + ttl
  });
  return value;
}

function _clearCache(scope = '', id = null) {
  if (!scope) {
    DATA_CACHE.clear();
    return;
  }
  if (id !== null) {
    DATA_CACHE.delete(_cacheKey(scope, id));
    return;
  }
  Array.from(DATA_CACHE.keys()).forEach(key => {
    if (key.startsWith(`${scope}:`)) DATA_CACHE.delete(key);
  });
}

function getCurrentRole() {
  return (
    getUser()?.user_metadata?.role ||
    getUser()?.user_role ||
    _session?.user?.user_metadata?.role ||
    _session?.user_role ||
    'user'
  );
}

function getRoleCapabilities(role = getCurrentRole()) {
  const resolvedRole = role || 'user';
  const isAdmin = resolvedRole === 'admin';
  const isVenue = resolvedRole === 'venue';
  const isUser = !isAdmin && !isVenue;
  return {
    role: resolvedRole,
    isAdmin,
    isVenue,
    isUser,
    canModerate: isAdmin,
    canManageOrganizerProfile: isAdmin || isVenue,
    canPublishManagedEvents: isAdmin || isVenue,
    canSubmitEventLead: true,
    canCreateInvites: true,
    needsReviewForStandaloneCreate: isUser
  };
}

function _canLoadVenueDashboard(role = null) {
  return getRoleCapabilities(role).canManageOrganizerProfile;
}

function nav(id, opts = {}) {
  const requestedId = id;
  const goUnifiedHome = id === 'home';
  const currentActivePage = document.querySelector('.page.active');
  const currentActiveId = currentActivePage?.id?.replace(/^page-/, '') || '';
  if (goUnifiedHome) id = 'browse';
  if (id === 'venue-register') id = 'register';
  const authRequiredPages = new Set(['profile','edit-profile','password-security','edit-venue','create','chats','chat','notif','settings','venue','venue-public','report','review','blocked-users']);
  const adminRequiredPages = new Set(['admin-drafts','admin-organizers','admin-moderation']);
  const venueRequiredPages = new Set(['venue','edit-venue']);
  if (authRequiredPages.has(id) && !isLoggedIn()) {
    showToast('Prijavi se da nastaviš', 'info', 1800);
    id = 'login';
  }
  if (adminRequiredPages.has(id) && !isAdminUser()) {
    showToast('Admin pristup nije dostupan za ovaj nalog.', 'error', 2200);
    id = isLoggedIn() ? 'settings' : 'login';
  }
  if (venueRequiredPages.has(id)) {
    const role = getCurrentRole();
    if (!getRoleCapabilities(role).canManageOrganizerProfile) {
      showToast('Organizer panel je dostupan samo organizer ili admin nalozima.', 'info', 2200);
      id = isLoggedIn() ? 'profile' : 'login';
    }
  }
  if (id === 'notif') { setTimeout(loadNotifications, 100); }
  if (id === 'review' && typeof loadPendingReviewTasks === 'function') {
    setTimeout(() => loadPendingReviewTasks({ sync:true, render:true }), 100);
  }
  const isAdminToAdminSwitch = currentActiveId.startsWith('admin-') && id.startsWith('admin-');
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.classList.remove('no-page-anim');
  });
  const target = document.getElementById('page-' + id);
  if (!target) { console.warn('[mitmi] nav: page-' + id + ' not found'); return; }
  if (id !== 'chat' && typeof _unsubscribeChat === 'function') {
    _unsubscribeChat();
  }
  if (isAdminToAdminSwitch || opts.noPageAnim) target.classList.add('no-page-anim');
  target.classList.add('active');
  if (id === 'register') {
    setTimeout(() => selectRegType(requestedId === 'venue-register' ? 'venue' : 'user'), 0);
  }
  if (id === 'login') {
    setTimeout(() => {
      const pendingNotice = _consumePendingAuthNotice();
      _renderAuthNotice('login-auth-notice', pendingNotice);
      if (pendingNotice?.email) {
        const loginEmail = document.getElementById('login-email');
        if (loginEmail && !loginEmail.value) loginEmail.value = pendingNotice.email;
      }
    }, 0);
  } else {
    _renderAuthNotice('login-auth-notice', null);
  }
  if (!isAdminToAdminSwitch && !opts.preserveScroll) {
    window.scrollTo(0, 0);
  }
  // History: ne dupliraj isti id uzastopno
  if (!opts.skipHistory && navHistory[navHistory.length - 1] !== id) {
    navHistory.push(id);
    if (navHistory.length > HISTORY_MAX) navHistory.shift();
  }
  const hideNav = ['landing','login','register','onboarding','venue-register','venue-onboarding'].includes(id);
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.classList.toggle('show', isLoggedIn() && !hideNav);
  syncBrowseGuestActions();
  if (typeof syncAdminUI === 'function') {
    setTimeout(() => syncAdminUI(), 0);
  }
  if (goUnifiedHome) {
    setBN(0);
    setTimeout(() => {
      renderBrowseHomeStrip();
      switchBrowseTab('home');
    }, 0);
  }
  if (id === 'profile') {
    setTimeout(() => loadMyProfile(), 0);
  }
  if (id === 'edit-profile') {
    setTimeout(() => loadEditProfileForm(), 0);
  }
  if (id === 'password-security') {
    setTimeout(() => loadPasswordSecurityForm(), 0);
  }
  if (id === 'edit-venue') {
    setTimeout(() => loadEditVenueForm(), 0);
  }
  if (id === 'create') {
    setTimeout(() => loadCreateForm(), 0);
  }
  if (id === 'settings') {
    setTimeout(() => syncSettingsPreferenceUI(), 0);
  }
  if (id === 'chats') {
    setTimeout(() => loadChatsInbox?.(), 0);
  }
  if (id === 'blocked-users') {
    setTimeout(() => loadBlockedProfiles(), 0);
  }
  if (id === 'venue') {
    setTimeout(() => loadMyVenueDashboard(), 0);
  }
  if (id === 'venue-public') {
    setTimeout(() => {
      if (typeof renderPublicVenueProfile === 'function') {
        renderPublicVenueProfile().catch(() => {});
      }
    }, 0);
  }
}

function syncBrowseGuestActions() {
  const guestActions = document.getElementById('browse-guest-actions');
  if (!guestActions) return;
  guestActions.style.display = isLoggedIn() ? 'none' : 'flex';
}

async function loadPublicProfileDirectory() {
  if (!isLoggedIn() || !_isSupabaseConfigured()) return [];
  const cached = _getCached('directory', getUser()?.id || 'guest');
  if (cached) {
    PROFILE_DIRECTORY = cached;
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
    return PROFILE_DIRECTORY;
  } catch (e) {
    console.warn('[mitmi] loadPublicProfileDirectory:', e.message);
    return PROFILE_DIRECTORY;
  }
}

async function loadMyFollowingIds() {
  if (!isLoggedIn() || !_isSupabaseConfigured()) return [];
  const cached = _getCached('following', getUser()?.id || 'guest');
  if (cached) {
    FOLLOWED_PROFILE_IDS = cached;
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
    return FOLLOWED_PROFILE_IDS;
  } catch (e) {
    console.warn('[mitmi] loadMyFollowingIds:', e.message);
    return FOLLOWED_PROFILE_IDS;
  }
}

async function loadBlockedProfileIds() {
  if (!isLoggedIn() || !_isSupabaseConfigured()) return [];
  const cached = _getCached('blocked', getUser()?.id || 'guest');
  if (cached) {
    BLOCKED_PROFILE_IDS = cached;
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
  return profile.display_name || (profile.username ? '@' + profile.username : 'Korisnik');
}

const _profileDirectoryFilter = { query: '', mode: 'all' };

function _profileMatchesSearch(profile = {}, query = '') {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const text = [
    profile.display_name,
    profile.username,
    profile.city,
    profile.bio,
    profile.role === 'venue' ? 'organizator venue organizer' : ''
  ].filter(Boolean).join(' ').toLowerCase();
  return text.includes(q);
}

function _profileRoleBadge(profile = {}) {
  if (profile.role === 'venue') return '<span class="tag tag-purple" style="font-size:10px">Organizer</span>';
  if (profile.role === 'admin') return '<span class="tag tag-outline" style="font-size:10px">Admin</span>';
  return '';
}

function _renderProfileDirectoryRow(profile = {}) {
  const followedNow = FOLLOWED_PROFILE_IDS.includes(profile.id);
  const blockedNow = BLOCKED_PROFILE_IDS.includes(profile.id);
  const buttonLabel = followedNow ? 'Pratiš' : 'Prati';
  const buttonClass = followedNow ? 'btn btn-ghost btn-sm' : 'btn btn-outline btn-sm';
  const meta = [Number(profile.avg_rating || 0).toFixed(1), profile.city || 'Srbija'].filter(Boolean).join(' · ');
  const badge = _profileRoleBadge(profile);
  const actionHtml = blockedNow
    ? `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();toggleBlockProfile('${_escHtml(profile.id)}')">Odblokiraj</button>`
    : `${followedNow ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openDirectChat('${_escHtml(profile.id)}','${_escHtml(_publicProfileLabel(profile)).replace(/'/g, '&#39;')}')">Poruka</button>` : ''}<button class="${buttonClass}" onclick="event.stopPropagation();toggleProfileFollow('${_escHtml(profile.id)}', this)">${buttonLabel}</button>`;
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
    box.innerHTML = `<div class="draft-empty">${query ? 'Nema profila za ovu pretragu.' : 'Ovde će ti stajati ljudi koje pratiš i koje možeš da otkriješ.'}</div>`;
    return;
  }
  box.innerHTML = `
    ${followed.length ? `<div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink4);margin:2px 0 10px">Pratiš</div>${followed.map(_renderProfileDirectoryRow).join('')}` : ''}
    ${others.length ? `<div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink4);margin:${followed.length ? '16px' : '2px'} 0 10px">Otkrij ljude</div>${others.map(_renderProfileDirectoryRow).join('')}` : ''}
  `;
}

async function loadBlockedProfiles() {
  if (!PROFILE_DIRECTORY.length) await loadPublicProfileDirectory();
  if (!BLOCKED_PROFILE_IDS.length) await loadBlockedProfileIds();
  const box = document.getElementById('blocked-users-list');
  const countEl = document.getElementById('settings-blocked-count');
  if (countEl) countEl.textContent = BLOCKED_PROFILE_IDS.length ? `${BLOCKED_PROFILE_IDS.length} blokiran` + (BLOCKED_PROFILE_IDS.length > 1 ? 'a' : '') : 'Nema blokiranih';
  if (!box) return;
  const blockedProfiles = PROFILE_DIRECTORY.filter(profile => BLOCKED_PROFILE_IDS.includes(profile.id));
  if (!blockedProfiles.length) {
    box.innerHTML = `<div class="draft-empty">Nema blokiranih profila.</div>`;
    return;
  }
  box.innerHTML = blockedProfiles.map(profile => {
    const meta = [Number(profile.avg_rating || 0).toFixed(1), profile.city || 'Srbija'].filter(Boolean).join(' · ');
    return `<div class="ev-row" onclick="openOtherProfile('${_escHtml(profile.id)}')"><div class="av av-40 av-gray">${_escHtml(_publicProfileInitial(profile))}</div><div style="flex:1"><div class="ev-row-title">${_escHtml(_publicProfileLabel(profile))}</div><div class="ev-row-meta">${_escHtml(meta)}</div></div><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();toggleBlockProfile('${_escHtml(profile.id)}')">Odblokiraj</button></div>`;
  }).join('');
}

async function renderPublicProfile(profile = null) {
  const data = profile || PROFILE_DIRECTORY.find(item => item.id === _currentPublicProfileId) || null;
  if (!data) return;
  const followers = await _loadFollowCount('followers', data.id);
  const following = await _loadFollowCount('following', data.id);
  const events = await _loadPublicProfileEvents(data.id);

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const ratingCount = Number(data.rating_count || 0);
  const ratingWrap = document.getElementById('other-profile-rating-summary');
  _renderAvatarBubble(document.getElementById('other-profile-avatar'), data, _profileAvatarFallback(data));
  setText('other-profile-name', _publicProfileLabel(data));
  setText('other-profile-bio', data.bio || 'Još nema kratkog opisa profila.');
  setText('other-profile-events', String(events.length));
  setText('other-profile-followers', String(followers));
  setText('other-profile-following', String(following));
  setText('other-profile-rating', Number(data.avg_rating || 0).toFixed(1));
  setText('other-profile-rating-count', ratingCount > 0 ? `${ratingCount} ocena` : 'Još nema ocena');
  if (ratingWrap) {
    ratingWrap.style.display = ratingCount > 0 ? 'flex' : 'none';
    ratingWrap.classList.toggle('is-empty', ratingCount === 0);
  }
  const socials = document.getElementById('other-profile-socials');
  if (socials) {
    const socialBits = [];
    if (data.username) socialBits.push(`<div class="soc-chip">👤 @${_escHtml(String(data.username).replace(/^@+/, ''))}</div>`);
    if (data.city) socialBits.push(`<div class="soc-chip">📍 ${_escHtml(data.city)}</div>`);
    if (events.length > 0) socialBits.push(`<div class="soc-chip">🎟 ${events.length} događaja</div>`);
    if (Number(data.rating_count || 0) > 0) socialBits.push(`<div class="soc-chip">★ ${_escHtml(String(Number(data.rating_count || 0)))} ocena</div>`);
    if (!socialBits.length) socialBits.push('<div class="soc-chip">🌱 Nov profil</div>');
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
      followBtn.textContent = isProfileFollowed(data.id) ? 'Pratiš' : 'Prati';
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
    blockBtn.textContent = isProfileBlocked(data.id) ? 'Odblokiraj' : 'Blokiraj';
    blockBtn.onclick = () => toggleBlockProfile(data.id);
  }
  const reportBtn = document.getElementById('other-profile-report-btn');
  if (reportBtn) reportBtn.onclick = () => openReportPage({ type:'profile', profileId: data.id, label: _publicProfileLabel(data) });
  renderOtherProfileEvents(events);
}

async function _loadPublicProfileEvents(profileId) {
  if (!profileId || !_isSupabaseConfigured()) return [];
  try {
    const rows = await _supaGet('events', {
      select: 'id,creator_id,title,description,category,city,location_name,starts_at,capacity,attendee_count,cover_url,is_published,is_cancelled,created_at',
      creator_id: `eq.${profileId}`,
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
    box.innerHTML = `<div class="draft-empty">Još nema javnih događaja.</div>`;
    return;
  }
  box.innerHTML = items.map(item => {
    const coverStyle = item.cover_url ? ` style="background-image:url('${_escHtml(item.cover_url)}');background-size:cover;background-position:center;color:transparent"` : '';
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
  if (!PROFILE_DIRECTORY.length) await loadPublicProfileDirectory();
  if (!FOLLOWED_PROFILE_IDS.length) await loadMyFollowingIds();
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

function _looksLikeUuid(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function scrollLandingSection(sectionId) {
  nav('landing');
  requestAnimationFrame(() => {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
  });
}

function navBack() {
  navHistory.pop();
  const prev = navHistory.length > 0
    ? navHistory[navHistory.length - 1]
    : 'home';
  nav(prev, { skipHistory: true });
}

// --- setBN() - active state na bottom nav ---
function setBN(idx) {
  document.querySelectorAll('.bn-item').forEach((b,i) => b.classList.toggle('active', i === idx));
}

// --- i18n ---
function applyLang(l) {
  document.querySelectorAll('[data-t]').forEach(el => {
    try { const t = JSON.parse(el.getAttribute('data-t')); if (t[l]) el.textContent = t[l]; } catch(e) {}
  });
  document.querySelectorAll('[data-t-html]').forEach(el => {
    try { const t = JSON.parse(el.getAttribute('data-t-html')); if (t[l]) el.innerHTML = t[l]; } catch(e) {}
  });
  document.querySelectorAll('[data-t-ph]').forEach(el => {
    try { const t = JSON.parse(el.getAttribute('data-t-ph')); if (t[l]) el.placeholder = t[l]; } catch(e) {}
  });
  // Settings lang checkmarks
  const srCheck = document.getElementById('sr-check');
  const enCheck = document.getElementById('en-check');
  if (srCheck) srCheck.textContent = l === 'sr' ? 'v' : '';
  if (enCheck) enCheck.textContent = l === 'en' ? 'v' : '';
  document.querySelectorAll('[data-legal-lang]').forEach(el => {
    el.style.display = el.getAttribute('data-legal-lang') === l ? '' : 'none';
  });
}
function setLang(l, el) {
  document.querySelectorAll('.lbtn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.lbtn[onclick*="${l}"]`);
  if (btn) btn.classList.add('active');
  applyLang(l);
  localStorage.setItem('mitmi_lang', l);
}

// --- Toast ---
function showToast(msg, type = 'success', duration = 3000) {
  const icons = { success:'ok', error:'x', info:'i', warning:'!' };
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const ico = document.createElement('span');
  ico.className = 'toast-ico';
  ico.textContent = icons[type] || '•';
  const msg_el = document.createElement('span');
  msg_el.className = 'toast-msg';
  msg_el.textContent = msg; // textContent = XSS safe
  t.appendChild(ico);
  t.appendChild(msg_el);
  container.appendChild(t);
  setTimeout(() => { t.classList.add('hiding'); setTimeout(() => t.remove(), 250); }, duration);
}

const USER_PREFS_KEY = 'mitmi_user_prefs';

function _defaultUserPrefs() {
  return {
    show_location: true,
    profile_visibility: 'registered',
    invite_visibility: 'profile',
    notif_events: true,
    notif_messages: true,
    notif_invites: true
  };
}

function _getUserPrefs() {
  try {
    return {
      ..._defaultUserPrefs(),
      ...(JSON.parse(localStorage.getItem(USER_PREFS_KEY) || '{}') || {})
    };
  } catch(e) {
    return _defaultUserPrefs();
  }
}

function _saveUserPrefs(nextPrefs = {}) {
  const prefs = { ..._getUserPrefs(), ...nextPrefs };
  try { localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs)); } catch(e) {}
  syncSettingsPreferenceUI();
  _renderMyProfile(getUser() || {});
  return prefs;
}

function _profileVisibilityLabel(value) {
  return value === 'public' ? 'Javno' : 'Samo prijavljeni korisnici';
}

function _inviteVisibilityLabel(value) {
  return value === 'hidden' ? 'Skriveno sa profila' : 'Vidljivo na profilu';
}

function toggleUserPref(key, btnEl) {
  const current = _getUserPrefs();
  const nextValue = !current[key];
  if (btnEl) btnEl.classList.toggle('on', nextValue);
  _saveUserPrefs({ [key]: nextValue });
}

function cycleProfileVisibility() {
  const current = _getUserPrefs();
  const nextValue = current.profile_visibility === 'registered' ? 'public' : 'registered';
  _saveUserPrefs({ profile_visibility: nextValue });
  showToast(nextValue === 'public' ? 'Profil je sada javan' : 'Profil vide samo prijavljeni korisnici', 'info', 1800);
}

function cycleInviteVisibility() {
  const current = _getUserPrefs();
  const nextValue = current.invite_visibility === 'profile' ? 'hidden' : 'profile';
  _saveUserPrefs({ invite_visibility: nextValue });
  showToast(nextValue === 'hidden' ? 'Pozivi su sakriveni sa profila' : 'Pozivi su vidljivi na profilu', 'info', 1800);
}

function syncSettingsPreferenceUI() {
  const prefs = _getUserPrefs();
  const toggleMap = [
    ['pref-toggle-location', prefs.show_location],
    ['pref-toggle-events', prefs.notif_events],
    ['pref-toggle-messages', prefs.notif_messages],
    ['pref-toggle-invites', prefs.notif_invites]
  ];
  toggleMap.forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', !!value);
  });

  const profileVis = document.getElementById('settings-profile-visibility');
  const inviteVis = document.getElementById('settings-invite-visibility');
  const locationState = document.getElementById('profile-location-state');
  const locationText = document.getElementById('settings-location-copy');
  const inviteTab = document.getElementById('profile-invites-tab');
  const invitePane = document.getElementById('pt4');
  const activeInviteTab = inviteTab?.classList.contains('active');

  if (profileVis) profileVis.textContent = _profileVisibilityLabel(prefs.profile_visibility);
  if (inviteVis) inviteVis.textContent = _inviteVisibilityLabel(prefs.invite_visibility);
  if (locationState) locationState.textContent = prefs.show_location ? 'Prikazano' : 'Skriveno';
  if (locationText) locationText.textContent = prefs.show_location ? 'Prikazuje se samo okvirni grad' : 'Lokacija je sakrivena na profilu';
  if (inviteTab) inviteTab.style.display = prefs.invite_visibility === 'hidden' ? 'none' : '';
  if (invitePane && prefs.invite_visibility === 'hidden') {
    invitePane.classList.remove('active');
    if (activeInviteTab) {
      const firstTab = document.querySelector('#page-profile .prof-tabs .ptab');
      if (firstTab) switchPTab(firstTab, 'pt1');
    }
  }
}

// --- Tab switching ---
function openUnifiedHub(mode = 'events', navIndex = 0) {
  nav('browse');
  setBN(navIndex);
  setTimeout(() => {
    loadPublishedEvents().catch(() => {});
    if (mode === 'home') renderBrowseHomeStrip();
    switchBrowseTab(mode);
  }, 0);
}

function openBrowseMode(mode = 'events') {
  openUnifiedHub(mode, 0);
}

function backToHomeEvents() {
  const browseEvents = document.getElementById('bt-events');
  if (browseEvents) {
    switchBrowseTab('events');
    return;
  }
}
function switchPTab(btn, targetId) {
  btn.closest('.prof-tabs, .page').querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  const page = btn.closest('.page');
  page.querySelectorAll('.ptab-pane').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const el = document.getElementById(targetId);
  if (el) el.classList.add('active');
}

// --- Pill / filter ---
function setPill(el, cat) {
  // Active state
  el.closest('.pills').querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  // Filter kartice u tab-events
  const grid = document.querySelector('#tab-events .ev-grid-2');
  if (!grid) return;
  const cards = grid.querySelectorAll('.ev-card');
  let visible = 0;
  cards.forEach(card => {
    const cardCat = card.getAttribute('data-cat') || '';
    const cardDay = card.getAttribute('data-day') || '';
    let show = false;
    if (!cat || cat === 'all') {
      show = true;
    } else if (cat === 'danas') {
      show = cardDay === 'danas';
    } else if (cat === 'vikend') {
      show = cardDay === 'vikend' || cardDay === 'danas';
    } else {
      show = cardCat === cat;
    }
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  // Animiraj vidljive kartice
  grid.querySelectorAll('.ev-card:not([style*="none"])').forEach((c, i) => {
    c.style.animation = 'none';
    c.offsetHeight; // reflow
    c.style.animation = `cardReveal .3s ease ${i * 0.06}s both`;
  });
}

function setBrowsePill(el, cat) {
  // closest('.pills') — kompatibilno sa br-pills-wrap strukturom
  const pillContainer = el.closest('.pills') || el.closest('.filter-row') || el.closest('.br-pills-wrap');
  if (pillContainer) pillContainer.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  _browseState.range = '';
  const dateInput = document.getElementById('browse-date-input');
  if (dateInput) dateInput.value = '';
  document.querySelectorAll('[data-range-filter]').forEach(btn => btn.classList.remove('active'));
  _browseState.cat = cat || 'all';
  _applyBrowseFilters();
}

// --- City picker ---
function showCityPicker() {
  const ov = document.getElementById('city-picker-overlay');
  ov.style.display = 'flex';
}
function hideCityPicker() {
  document.getElementById('city-picker-overlay').style.display = 'none';
}
function setCity(city) {
  ['city-label','browse-city-label','browse-home-city-label'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = city;
  });
  hideCityPicker();
  showToast(city, 'success', 1500);
}

function applyCustomCity() {
  const input = document.getElementById('custom-city-input');
  const city = input?.value?.trim();
  if (!city || city.length < 2) {
    showToast('Unesi naziv grada', 'info', 1500);
    return;
  }
  setCity(city);
  if (input) input.value = '';
}

// --- Date filter ---
function toggleDateFilter() {
  const row = document.getElementById('date-filter-row');
  // br-date-pill je stvarni element u HTML-u (date-filter-btn ne postoji)
  const btn = document.getElementById('br-date-pill') || document.getElementById('date-filter-btn');
  if (!row) return;
  const visible = row.style.display !== 'none';
  row.style.display = visible ? 'none' : 'block';
  if (btn) {
    btn.style.borderColor = visible ? '' : 'var(--purple)';
    btn.style.color       = visible ? '' : 'var(--purple)';
    btn.classList.toggle('active', !visible);
  }
}
function filterByDate(dateVal) {
  _browseState.range = '';
  document.querySelectorAll('[data-range-filter]').forEach(btn => btn.classList.remove('active'));
  _browseState.date = dateVal || '';
  const grid = document.getElementById('browse-grid');
  const empty = document.getElementById('browse-empty');
  if (!grid) return;
  const cards = grid.querySelectorAll('.sq-card, .ev-card');
  let visible = 0;
  cards.forEach(card => {
    if (!dateVal) {
      card.style.display = '';
      visible++;
      return;
    }
    const cardDate = card.getAttribute('data-date') || '';
    const show = cardDate === dateVal;
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  if (empty) empty.style.display = visible === 0 ? 'block' : 'none';
  // Animacija vidljivih
  grid.querySelectorAll('.sq-card:not([style*="none"]), .ev-card:not([style*="none"])').forEach((c, i) => {
    c.style.animation = 'none';
    c.offsetHeight;
    c.style.animation = `cardReveal .3s ease ${i * 0.06}s both`;
  });
  // Reset date filter ako je prazno
  if (!dateVal) {
    showToast('Filter uklonjen', 'info', 1200);
  } else {
    const d = new Date(dateVal);
    const label = d.toLocaleDateString('sr-Latn', { day:'numeric', month:'long' });
    showToast(visible > 0 ? label + ` - ${visible} događaja` : label + ' - nema događaja', visible > 0 ? 'success' : 'info', 2000);
  }
}

function filterUpcomingRange(rangeKey, btnEl) {
  _browseState.date = '';
  _browseState.cat = 'all';
  _browseState.range = rangeKey || '';
  const dateInput = document.getElementById('browse-date-input');
  if (dateInput) dateInput.value = '';
  document.querySelectorAll('[data-range-filter]').forEach(btn => btn.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  _applyBrowseFilters();
  if (!rangeKey) {
    showToast('Prikazani su svi datumi', 'info', 1500);
    return;
  }
  showToast(rangeKey === '7d' ? 'Prikazani događaji u narednih 7 dana' : 'Prikazani događaji u narednih 30 dana', 'success', 1800);
}

function filterTonight(btnEl = null) {
  _browseState.date = '';
  _browseState.range = '';
  _browseState.cat = 'tonight';
  const dateInput = document.getElementById('browse-date-input');
  if (dateInput) dateInput.value = '';
  document.querySelectorAll('[data-range-filter]').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('#br-pills-wrap .pill').forEach(btn => btn.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  _applyBrowseFilters();
  showToast('Prikazani su događaji u narednih nekoliko sati', 'success', 1800);
}

// --- Onboarding ---
let obStep = 1;
const obTotalSteps = 3;

function obNext() {
  if (obStep < obTotalSteps) {
    document.getElementById('ob' + obStep).classList.remove('active');
    obStep++;
    document.getElementById('ob' + obStep).classList.add('active');
    updateObDots(obStep);
    document.getElementById('ob-bar').style.width = (obStep / obTotalSteps * 100) + '%';
    document.getElementById('ob-back').style.display = obStep > 1 ? 'block' : 'none';
    if (obStep === obTotalSteps) {
      document.getElementById('ob-next').setAttribute('data-t', '{"sr":"Završi","en":"Finish"}');
      document.getElementById('ob-next').textContent = 'Završi';
    }
  } else {
    _submitUserOnboarding();
  }
}
function obBack() {
  if (obStep > 1) {
    document.getElementById('ob' + obStep).classList.remove('active');
    obStep--;
    document.getElementById('ob' + obStep).classList.add('active');
    updateObDots(obStep);
    document.getElementById('ob-bar').style.width = (obStep / obTotalSteps * 100) + '%';
    document.getElementById('ob-back').style.display = obStep > 1 ? 'block' : 'none';
    document.getElementById('ob-next').textContent = 'Nastavi';
  }
}
function updateObDots(step) {
  for (let i = 1; i <= obTotalSteps; i++) {
    const dot = document.getElementById('obdot' + i);
    if (!dot) continue;
    dot.classList.remove('active','done');
    if (i === step) dot.classList.add('active');
    else if (i < step) dot.classList.add('done');
  }
}

function _containsRestrictedContactInfo(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  const emailMatch = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw);
  const phoneMatch = /(?:\+?\d[\d\s()./-]{6,}\d)/.test(raw);
  const contactWords = /(instagram|insta|ig:|viber|whatsapp|wa\b|telegram|tg\b|facebook|fb\b|telefon|phone|broj|kontaktiraj me|pozovi me|piši na)/i.test(lower);
  return emailMatch || phoneMatch || contactWords;
}

function _publicContactSafetyMessage() {
  return 'Ne unosi telefon, email, Instagram, Viber ili druge direktne kontakt podatke u javni opis.';
}

async function _submitUserOnboarding() {
  if (!isLoggedIn()) { nav('login'); return; }

  const usernameEl = document.getElementById('ob-username');
  const aboutEl = document.getElementById('ob-about');
  const cityEl = document.getElementById('ob-city');
  const btn = document.getElementById('ob-next');

  const username = _defaultUsername(usernameEl?.value || _deriveDisplayName(_profileEmail()));
  const bio = aboutEl?.value?.trim() || '';
  const city = cityEl?.value || 'Srbija';

  if (!username || username.length < 3) {
    showToast('Korisničko ime mora imati bar 3 karaktera', 'error');
    return;
  }
  if (_containsRestrictedContactInfo(bio)) {
    showToast(_publicContactSafetyMessage(), 'error', 2600);
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    await _upsertMyProfile({
      username,
      display_name: _deriveDisplayName(_profileEmail()),
      bio,
      city,
      role: 'user'
    });
    ['city-label','home-city-display','browse-city-label','browse-home-city-label'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = city;
    });
    showToast('Profil kreiran!', 'success');
    openUnifiedHub('home', 0);
    document.getElementById('bottom-nav').classList.add('show');
  } catch (e) {
    const msg = e.data?.message || e.message || '';
    if (msg.toLowerCase().includes('username')) showToast('Korisničko ime je zauzeto', 'error');
    else showToast('Greška pri čuvanju profila', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Završi'; }
  }
}

// --- Profile about chip ---
function addToAbout(chip) {
  const lang = localStorage.getItem('mitmi_lang') || 'sr';
  const text = chip.getAttribute('data-' + lang) || chip.textContent;
  const ta = document.getElementById('ob-about');
  if (!ta) return;
  ta.value = ta.value ? ta.value + ' ' + text : text;
}

function _deriveDisplayName(email = '', fallback = 'mitmi korisnik') {
  const raw = (email.split('@')[0] || fallback)
    .replace(/[._-]+/g, ' ')
    .trim();
  const titled = raw
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return titled || fallback;
}

function _normalizeUsername(value = '') {
  return value
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
}

function _defaultUsername(seed = '') {
  const base = _normalizeUsername(seed) || `mitmi_${String(Date.now()).slice(-6)}`;
  return base.length >= 3 ? base : `${base}_user`;
}

function _normalizeEntityName(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function _profileEmail() {
  return getUser()?.email || _session?.user_email || '';
}

function _applyProfileToSession(profile = {}) {
  if (!_session) return;
  const nextUser = {
    ...(_session.user || {}),
    id: profile.id || _session.user?.id || _session.user_id,
    email: _profileEmail() || _session.user?.email || null,
    city: profile.city || _session.user?.city || null,
    username: profile.username || _session.user?.username || null,
    display_name: profile.display_name || _session.user?.display_name || null,
    bio: profile.bio || _session.user?.bio || null,
    avatar_url: profile.avatar_url || _session.user?.avatar_url || null,
    avg_rating: profile.avg_rating ?? _session.user?.avg_rating ?? 0,
    rating_count: profile.rating_count ?? _session.user?.rating_count ?? 0,
    user_role: profile.role || _session.user?.user_role || _session.user_role || 'user',
    user_metadata: {
      ...(_session.user?.user_metadata || {}),
      role: profile.role || _session.user?.user_metadata?.role || _session.user_role || 'user'
    }
  };
  _saveSession({
    ..._session,
    user: nextUser
  });
}

async function _getMyProfile() {
  if (!isLoggedIn()) return null;
  const cached = _getCached('profile', getUser()?.id || 'guest');
  if (cached) return cached;
  const rows = await _supaGet('profiles', {
    id: `eq.${getUser()?.id}`,
    select: 'id,username,display_name,city,bio,avatar_url,gender,role,status,avg_rating,rating_count',
    limit: '1'
  });
  const profile = Array.isArray(rows) ? (rows[0] || null) : null;
  if (profile) _setCached('profile', getUser()?.id || 'guest', profile, CACHE_TTL.profile);
  return profile;
}

async function _getMyVenue() {
  if (!isLoggedIn()) return null;
  const cached = _getCached('venue', getUser()?.id || 'guest');
  if (cached) return cached;
  const rows = await _supaGet('venues', {
    profile_id: `eq.${getUser()?.id}`,
    select: 'id,profile_id,venue_name,venue_type,city,description,cover_url,status,created_at',
    limit: '1'
  });
  const venue = Array.isArray(rows) ? (rows[0] || null) : null;
  if (venue) _setCached('venue', getUser()?.id || 'guest', venue, CACHE_TTL.venue);
  return venue;
}

async function _getMyClaimedOrganizer() {
  if (!isLoggedIn() || !_isSupabaseConfigured()) return null;
  const cacheId = getUser()?.id || 'guest';
  const cached = _getCached('organizer', cacheId);
  if (cached) return cached;
  try {
    const rows = await _supaGet('organizers', {
      claimed_by_profile_id: `eq.${getUser()?.id}`,
      select: 'id,name,city,instagram_handle,website_url,source_notes,status,claimed_by_profile_id,created_at,updated_at',
      order: 'updated_at.desc',
      limit: '1'
    });
    const organizer = Array.isArray(rows) ? (rows[0] || null) : null;
    if (organizer) _setCached('organizer', cacheId, organizer, CACHE_TTL.organizer);
    return organizer;
  } catch (e) {
    return null;
  }
}

async function _findExistingOrganizerMatch(name = '', city = '') {
  if (!_isSupabaseConfigured()) return null;
  const normalizedName = _normalizeEntityName(name);
  if (!normalizedName) return null;
  try {
    const rows = await _supaGet('organizers', {
      select: 'id,name,city,status,claimed_by_profile_id,instagram_handle',
      order: 'updated_at.desc',
      limit: '100'
    });
    const matches = (Array.isArray(rows) ? rows : []).filter((row) => {
      if ((row.status || '') === 'merged' || (row.status || '') === 'archived') return false;
      const sameName = _normalizeEntityName(row.name || '') === normalizedName;
      if (!sameName) return false;
      const rowCity = String(row.city || '').trim().toLowerCase();
      const wantedCity = String(city || '').trim().toLowerCase();
      return !wantedCity || !rowCity || rowCity === wantedCity;
    });
    return matches[0] || null;
  } catch (e) {
    return null;
  }
}

async function _getMyManagedOrganizerTarget() {
  const organizer = await _getMyClaimedOrganizer();
  if (organizer) return _normalizeVenueTarget(organizer);
  const venue = await _getMyVenue();
  return venue ? _normalizeVenueTarget(venue) : null;
}

async function _upsertMyVenue(venueFields = {}) {
  if (!isLoggedIn()) throw new Error('Moraš biti prijavljen/a');
  const existingVenue = await _getMyVenue();
  const payload = {
    profile_id: getUser()?.id,
    venue_name: venueFields.venue_name || existingVenue?.venue_name || 'Organizer',
    venue_type: venueFields.venue_type || existingVenue?.venue_type || null,
    city: venueFields.city || existingVenue?.city || 'Novi Sad',
    description: venueFields.description || existingVenue?.description || null,
    cover_url: venueFields.cover_url ?? existingVenue?.cover_url ?? null,
    status: venueFields.status || existingVenue?.status || 'pending'
  };

  if (existingVenue?.id) {
    const rows = await _supaFetch(`/rest/v1/venues?id=eq.${existingVenue.id}`, {
      method: 'PATCH',
      headers: {
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    return Array.isArray(rows) ? (rows[0] || { ...existingVenue, ...payload }) : { ...existingVenue, ...payload };
  }

  const rows = await _supaFetch('/rest/v1/venues', {
    method: 'POST',
    headers: {
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? (rows[0] || payload) : payload;
}

async function _saveMyClaimedOrganizerProfile(fields = {}) {
  if (!isLoggedIn()) throw new Error('Moraš biti prijavljen/a');
  const organizer = await _getMyClaimedOrganizer();
  if (!organizer?.id) throw new Error('Organizer profil nije povezan');
  const payload = {
    name: fields.venue_name || organizer.name || 'Organizer',
    city: fields.city || organizer.city || 'Novi Sad',
    source_notes: fields.description || organizer.source_notes || null,
    updated_by: getUser()?.id || null
  };
  const rows = await _supaFetch(`/rest/v1/organizers?id=eq.${organizer.id}`, {
    method: 'PATCH',
    headers: {
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });
  _clearCache('organizer', getUser()?.id || 'guest');
  const updated = Array.isArray(rows) ? rows[0] : rows;
  return updated || { ...organizer, ...payload };
}

async function _upsertMyProfile(profileFields = {}) {
  if (!isLoggedIn()) throw new Error('Moraš biti prijavljen/a');
  const email = _profileEmail();
  const displayName = profileFields.display_name || _deriveDisplayName(email);
  const username = _defaultUsername(profileFields.username || displayName || email || 'mitmi_user');
  const payload = {
    id: getUser()?.id,
    username,
    display_name: displayName,
    city: profileFields.city || getUser()?.city || 'Srbija',
    bio: profileFields.bio || '',
    avatar_url: profileFields.avatar_url || null,
    gender: profileFields.gender || getUser()?.gender || 'unspecified',
    role: profileFields.role || getUser()?.user_role || 'user'
  };

  const rows = await _supaFetch('/rest/v1/profiles', {
    method: 'POST',
    headers: {
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(payload)
  });
  const profile = Array.isArray(rows) ? (rows[0] || payload) : payload;
  _clearCache('profile', getUser()?.id || 'guest');
  _applyProfileToSession(profile);
  return profile;
}

function _profileInitial(profile = {}) {
  const source = profile.display_name || profile.username || _profileEmail() || 'M';
  return source.trim().charAt(0).toUpperCase() || 'M';
}

function _renderAvatarBubble(el, profile = {}, fallback = 'M') {
  if (!el) return;
  const avatarUrl = profile.avatar_url || '';
  if (avatarUrl) {
    el.textContent = '';
    el.style.backgroundImage = `url(${avatarUrl})`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.fontSize = '';
  } else {
    el.textContent = fallback || _profileAvatarFallback(profile);
    el.style.backgroundImage = '';
    el.style.backgroundSize = '';
    el.style.backgroundPosition = '';
    el.style.backgroundRepeat = '';
    el.style.fontSize = '30px';
  }
}

function _renderProfileSocials(profile = {}) {
  const container = document.getElementById('profile-socials');
  if (!container) return;
  const username = profile.username ? '@' + profile.username.replace(/^@+/, '') : '';
  const eventsCount = Number(profile._events_count || 0);
  const ratingCount = Number(profile.rating_count || 0);
  const signals = [];
  if (username) signals.push(`<div class="soc-chip">👤 ${_escHtml(username)}</div>`);
  if (profile.avatar_url) signals.push('<div class="soc-chip">🖼 Ima sliku</div>');
  if (profile.city) signals.push(`<div class="soc-chip">📍 ${_escHtml(profile.city)}</div>`);
  if (eventsCount > 0) signals.push(`<div class="soc-chip">🎟 ${eventsCount} događaja</div>`);
  if (ratingCount > 0) signals.push(`<div class="soc-chip">★ ${ratingCount} ocena</div>`);
  if (!signals.length) signals.push('<div class="soc-chip">🌱 Nov profil</div>');
  container.innerHTML = signals.join('');
}

function _profileTrustSummary(profile = {}, options = {}) {
  const eventsCount = Number(options.eventsCount ?? profile._events_count ?? 0);
  const ratingCount = Number(profile.rating_count || 0);
  const hasAvatar = !!profile.avatar_url;
  const hasCity = !!profile.city;
  const score = [
    hasAvatar ? 25 : 0,
    hasCity ? 25 : 0,
    eventsCount > 0 ? 25 : 0,
    ratingCount > 0 ? 25 : 0
  ].reduce((sum, value) => sum + value, 0);
  let title = 'Profil je nov';
  let helper = 'Dodaj sliku, grad i prvi događaj da profil deluje potpunije i pouzdanije.';
  if (score >= 75) {
    title = 'Profil deluje jako pouzdano';
    helper = 'Profil je popunjen i ima dovoljno signala poverenja.';
  } else if (score >= 50) {
    title = 'Profil deluje pouzdano';
    helper = 'Imaš dobru osnovu, još jedan ili dva signala dosta pomažu.';
  } else if (score >= 25) {
    title = 'Profil se lepo popunjava';
    helper = 'Još malo sadržaja i profil će delovati mnogo jače.';
  }
  return { score, title, helper };
}

function _renderTopTrustChips(containerId, profile = {}, options = {}) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const eventsCount = Number(options.eventsCount ?? profile._events_count ?? 0);
  const ratingCount = Number(profile.rating_count || 0);
  const chips = [];
  if (options.isOwn) chips.push('<span class="trust-badge trust-email">✉ Email potvrđen</span>');
  if (profile.avatar_url) chips.push('<span class="trust-badge trust-selfie" style="opacity:1">🖼 Ima sliku</span>');
  if (eventsCount > 0) chips.push(`<span class="trust-badge trust-email" style="opacity:1">🎟 ${eventsCount} događaja</span>`);
  if (ratingCount > 0) chips.push(`<span class="trust-badge trust-email">★ ${ratingCount} ocena</span>`);
  if (!chips.length) chips.push('<span class="trust-badge trust-selfie" style="opacity:.8">🌱 Nov profil</span>');
  box.innerHTML = chips.join('');
}

function _renderProfileTrustScore(profile = {}) {
  const trust = _profileTrustSummary(profile, { eventsCount: profile._events_count });
  const textEl = document.getElementById('profile-trust-text');
  const pctEl = document.getElementById('profile-trust-pct');
  const fillEl = document.getElementById('profile-trust-fill');
  const helperEl = document.getElementById('profile-trust-helper');
  if (textEl) textEl.textContent = trust.title;
  if (pctEl) pctEl.textContent = `${trust.score}%`;
  if (fillEl) fillEl.style.width = `${trust.score}%`;
  if (helperEl) helperEl.textContent = trust.helper;
}

function _renderProfileReviewCard(tasks = []) {
  const card = document.getElementById('profile-review-card');
  const countEl = document.getElementById('profile-review-count');
  const copyEl = document.getElementById('profile-review-card-copy');
  const pending = (Array.isArray(tasks) ? tasks : []).filter(item => item.status === 'pending');
  if (!card || !countEl || !copyEl) return;
  if (!pending.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  countEl.textContent = String(pending.length);
  const standaloneOnly = pending.length > 0 && pending.every(item => !item.event_id);
  if (standaloneOnly) {
    copyEl.textContent = pending.length === 1
      ? 'Imaš jedan plan koji čeka tvoju ocenu.'
      : `Imaš ${pending.length} planova koji čekaju tvoju ocenu.`;
    return;
  }
  copyEl.textContent = pending.length === 1
    ? 'Imaš jedno iskustvo koje čeka tvoju ocenu.'
    : `Imaš ${pending.length} iskustava koja čekaju tvoju ocenu.`;
}

async function syncPendingReviewTasks() {
  if (!isLoggedIn() || !_isSupabaseConfigured()) return 0;
  try {
    const result = await _supaFetch('/rest/v1/rpc/sync_review_tasks_for_user', {
      method: 'POST',
      body: JSON.stringify({})
    });
    return Number(result || 0);
  } catch (e) {
    console.warn('[mitmi] syncPendingReviewTasks:', e.message);
    return 0;
  }
}

async function loadPendingReviewTasks(options = {}) {
  const { sync = false, render = false } = options || {};
  if (!isLoggedIn() || !_isSupabaseConfigured()) {
    PENDING_REVIEW_TASKS = [];
    if (render) {
      _renderProfileReviewCard([]);
      renderReviewPage([]);
    }
    return [];
  }
  try {
    if (sync) await syncPendingReviewTasks();
    const rows = await _supaGet('review_tasks', {
      select: 'id,plan_id,reviewer_id,event_id,target_type,target_user_id,status,available_at,completed_at,created_at',
      reviewer_id: `eq.${getUser()?.id}`,
      order: 'available_at.asc',
      limit: '20'
    });
    const tasks = Array.isArray(rows) ? rows : [];
    const eventIds = Array.from(new Set(tasks.map(item => item.event_id).filter(Boolean)));
    const userIds = Array.from(new Set(tasks.map(item => item.target_user_id).filter(Boolean)));
    const pairPlanIds = Array.from(new Set(tasks.map(item => item.plan_id).filter(Boolean)));
    const [events, users, pairPlans] = await Promise.all([
      eventIds.length ? _supaGet('events', {
        select: 'id,title,venue_id,organizer_id,avg_rating,rating_count',
        id: `in.(${eventIds.join(',')})`,
        limit: String(eventIds.length)
      }).catch(() => []) : Promise.resolve([]),
      userIds.length ? _supaGet('profiles', {
        select: 'id,username,display_name',
        id: `in.(${userIds.join(',')})`,
        limit: String(userIds.length)
      }).catch(() => []) : Promise.resolve([]),
      pairPlanIds.length ? _supaGet('event_pair_plans', {
        select: 'id,source_plan_id,invite_id,event_id',
        id: `in.(${pairPlanIds.join(',')})`,
        limit: String(pairPlanIds.length)
      }).catch(() => []) : Promise.resolve([])
    ]);
    const sourcePlanIds = Array.from(new Set((Array.isArray(pairPlans) ? pairPlans : []).map(item => item.source_plan_id).filter(Boolean)));
    const sourcePlans = sourcePlanIds.length
      ? await _supaGet('plans', {
        select: 'id,title,description,category,city,location_name,starts_at,event_id,organizer_id,venue_id',
        id: `in.(${sourcePlanIds.join(',')})`,
        limit: String(sourcePlanIds.length)
      }).catch(() => [])
      : [];
    const eventMap = new Map((Array.isArray(events) ? events : []).map(item => [item.id, item]));
    const userMap = new Map((Array.isArray(users) ? users : []).map(item => [item.id, item]));
    const pairPlanMap = new Map((Array.isArray(pairPlans) ? pairPlans : []).map(item => [item.id, item]));
    const sourcePlanMap = new Map((Array.isArray(sourcePlans) ? sourcePlans : []).map(item => [item.id, item]));
    const mappedTasks = tasks.map(task => ({
      ...task,
      pairPlan: pairPlanMap.get(task.plan_id) || null,
      event: eventMap.get(task.event_id) || null,
      targetProfile: userMap.get(task.target_user_id) || null,
      sourcePlan: sourcePlanMap.get(pairPlanMap.get(task.plan_id)?.source_plan_id || '') || null
    }));
    PENDING_REVIEW_TASKS = await _skipIrrelevantEventReviewTasks(mappedTasks);
    if (render) {
      _renderProfileReviewCard(PENDING_REVIEW_TASKS);
      renderReviewPage(PENDING_REVIEW_TASKS);
    }
    return PENDING_REVIEW_TASKS;
  } catch (e) {
    console.warn('[mitmi] loadPendingReviewTasks:', e.message);
    if (render) {
      _renderProfileReviewCard([]);
      renderReviewPage([]);
    }
    return [];
  }
}

function openPendingReviews() {
  nav('review');
}

function _activeReviewTask() {
  return PENDING_REVIEW_TASKS.find(item => item.id === _activeReviewTaskId) || null;
}

function _reviewTaskLabel(task = null) {
  if (!task) return '';
  if (task.target_type === 'peer') {
    return task.targetProfile?.display_name || task.targetProfile?.username || 'Ocena osobe';
  }
  if (task.sourcePlan?.title) {
    return task.sourcePlan.title;
  }
  return task.event?.title || 'Ocena događaja';
}

function _reviewTaskMeta(task = null) {
  if (!task) return '';
  if (task.target_type === 'peer') {
    if (task.sourcePlan?.title) {
      return `Osoba · ${task.sourcePlan.title}`;
    }
    return `Osoba · ${task.event?.title || 'Događaj'}`;
  }
  if (task.event?.title) return `Događaj · ${task.event.title}`;
  return 'Plan';
}

function _taskNeedsEventReview(task = null) {
  if (!task || task.target_type !== 'event') return true;
  if (task.sourcePlan && !task.sourcePlan.event_id) return false;
  return !!(task.event?.venue_id || task.event?.organizer_id);
}

async function _skipIrrelevantEventReviewTasks(tasks = []) {
  if (!_isSupabaseConfigured()) return Array.isArray(tasks) ? tasks : [];
  const items = Array.isArray(tasks) ? tasks : [];
  const irrelevant = items.filter(item => item.status === 'pending' && item.target_type === 'event' && !_taskNeedsEventReview(item));
  if (!irrelevant.length) return items;
  await Promise.all(irrelevant.map(item =>
    _supaFetch(`/rest/v1/review_tasks?id=eq.${item.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        status: 'skipped',
        completed_at: new Date().toISOString()
      })
    }).catch(() => null)
  ));
  return items.filter(item => !irrelevant.some(skip => skip.id === item.id));
}

function _renderReviewQueue(tasks = []) {
  const card = document.getElementById('review-queue-card');
  const countEl = document.getElementById('review-queue-count');
  const copyEl = document.getElementById('review-queue-copy');
  const list = document.getElementById('review-queue-list');
  const pending = (Array.isArray(tasks) ? tasks : []).filter(item => item.status === 'pending');
  if (!card || !countEl || !copyEl || !list) return;
  if (!pending.length) {
    card.style.display = 'none';
    list.innerHTML = '';
    countEl.textContent = '0';
    return;
  }
  card.style.display = '';
  countEl.textContent = String(pending.length);
  copyEl.textContent = pending.length === 1
    ? 'Imaš jednu ocenu koja čeka.'
    : `Imaš ${pending.length} iskustva koja čekaju tvoju ocenu.`;
  list.innerHTML = pending.map(task => {
    const activeClass = task.id === _activeReviewTaskId ? ' active' : '';
    return `<button type="button" class="pill${activeClass}" onclick="selectReviewTask('${_escHtml(task.id)}')"><span>${_escHtml(_reviewTaskLabel(task))}</span><span style="font-size:11px;font-weight:600;opacity:.76">${_escHtml(_reviewTaskMeta(task))}</span></button>`;
  }).join('');
}

function selectReviewTask(taskId = '') {
  const task = PENDING_REVIEW_TASKS.find(item => item.id === taskId && item.status === 'pending') || null;
  if (!task) return;
  _setActiveReviewTask(task);
}

function _setActiveReviewTask(task = null) {
  _activeReviewTaskId = task?.id || null;
  const empty = document.getElementById('review-empty');
  const shell = document.getElementById('review-shell');
  const kindEl = document.getElementById('review-kind');
  const titleEl = document.getElementById('review-title');
  const subtitleEl = document.getElementById('review-subtitle');
  const peerFields = document.getElementById('review-peer-fields');
  const eventFields = document.getElementById('review-event-fields');
  if (!task) {
    if (empty) empty.style.display = '';
    if (shell) shell.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (shell) shell.style.display = '';
  const isPeer = task.target_type === 'peer';
  if (kindEl) kindEl.textContent = isPeer ? 'Ocena osobe' : 'Ocena događaja';
  if (titleEl) titleEl.textContent = isPeer
    ? `Kako je bilo sa ${task.targetProfile?.display_name || task.targetProfile?.username || 'ovom osobom'}?`
    : `Kako je prošao ${task.event?.title ? `događaj „${task.event.title}”` : 'ovaj plan'}?`;
  if (subtitleEl) subtitleEl.textContent = isPeer
    ? `Ova ocena se odnosi na zajednički odlazak${task.sourcePlan?.title ? ` za plan „${task.sourcePlan.title}”` : task.event?.title ? ` na događaj „${task.event.title}”` : ''}.`
    : task.sourcePlan?.title
      ? `Tvoja ocena pomaže drugima da znaju kakav je bio događaj iza plana „${task.sourcePlan.title}”.`
      : `Tvoja ocena pomaže drugima da znaju kakav je bio događaj i organizacija.`;
  if (peerFields) peerFields.style.display = isPeer ? '' : 'none';
  if (eventFields) eventFields.style.display = isPeer ? 'none' : '';
  _renderReviewQueue(PENDING_REVIEW_TASKS);
}

function renderReviewPage(tasks = []) {
  const pending = (Array.isArray(tasks) ? tasks : []).filter(item => item.status === 'pending');
  const current = pending.find(item => item.id === _activeReviewTaskId) || null;
  _renderReviewQueue(pending);
  _setActiveReviewTask(current || pending[0] || null);
}

async function skipActiveReviewTask() {
  const task = _activeReviewTask();
  if (!task || !_isSupabaseConfigured()) return;
  try {
    await _supaFetch(`/rest/v1/review_tasks?id=eq.${task.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        status: 'skipped',
        completed_at: new Date().toISOString()
      })
    });
    showToast('Ocena je preskočena', 'info', 1600);
    await loadPendingReviewTasks({ sync:false, render:true });
    if (typeof loadNotifications === 'function') loadNotifications().catch(() => {});
  } catch (e) {
    showToast('Preskakanje ocene trenutno nije uspelo', 'error');
  }
}

async function submitActiveReviewTask() {
  const task = _activeReviewTask();
  if (!task || !_isSupabaseConfigured()) return;
  const btn = document.getElementById('review-submit-btn');
  if (btn) btn.disabled = true;
  try {
    if (task.target_type === 'event' && !_taskNeedsEventReview(task)) {
      await _supaFetch(`/rest/v1/review_tasks?id=eq.${task.id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          status: 'skipped',
          completed_at: new Date().toISOString()
        })
      });
      showToast('Za ovaj plan nije potrebna posebna ocena događaja', 'info', 1800);
      await loadPendingReviewTasks({ sync:false, render:true });
      return;
    }
    if (task.target_type === 'peer') {
      await _supaFetch('/rest/v1/peer_reviews', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          plan_id: task.plan_id,
          reviewer_id: getUser()?.id,
          reviewed_user_id: task.target_user_id,
          event_id: task.event_id,
          did_show_up: (document.getElementById('review-peer-show')?.value || 'yes') === 'yes',
          communication_rating: Number(document.getElementById('review-peer-communication')?.value || 5),
          would_go_again: (document.getElementById('review-peer-again')?.value || 'yes') === 'yes',
          comment: document.getElementById('review-peer-comment')?.value?.trim() || null
        })
      });
    } else {
      await _supaFetch('/rest/v1/event_reviews', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          plan_id: task.plan_id,
          reviewer_id: getUser()?.id,
          event_id: task.event_id,
          venue_id: task.event?.venue_id || null,
          rating_overall: Number(document.getElementById('review-event-overall')?.value || 5),
          rating_atmosphere: document.getElementById('review-event-atmosphere')?.value ? Number(document.getElementById('review-event-atmosphere').value) : null,
          rating_organization: document.getElementById('review-event-organization')?.value ? Number(document.getElementById('review-event-organization').value) : null,
          comment: document.getElementById('review-event-comment')?.value?.trim() || null
        })
      });
    }
    await _supaFetch(`/rest/v1/review_tasks?id=eq.${task.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        status: 'done',
        completed_at: new Date().toISOString()
      })
    });
    showToast('Ocena je sačuvana', 'success', 1700);
    await loadPendingReviewTasks({ sync:false, render:true });
    if (typeof loadNotifications === 'function') loadNotifications().catch(() => {});
    loadMyProfile().catch(() => {});
    _clearCache('venueAnalytics');
    if (_currentEventId && task.event_id && _currentEventId === task.event_id && typeof openEventById === 'function') {
      openEventById(task.event_id).catch(() => {});
    }
    if (_currentPublicVenueTarget) {
      renderPublicVenueProfile(_currentPublicVenueTarget).catch(() => {});
    }
    if (document.getElementById('page-venue')?.classList.contains('active')) {
      loadMyVenueDashboard().catch(() => {});
    }
  } catch (e) {
    const duplicateReview = String(e?.data?.code || '').trim() === '23505' || /duplicate/i.test(String(e?.message || ''));
    if (duplicateReview) {
      try {
        await _supaFetch(`/rest/v1/review_tasks?id=eq.${task.id}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            status: 'done',
            completed_at: new Date().toISOString()
          })
        });
        await loadPendingReviewTasks({ sync:false, render:true });
        if (typeof loadNotifications === 'function') loadNotifications().catch(() => {});
        loadMyProfile().catch(() => {});
        showToast('Ocena je već sačuvana', 'info', 1700);
        return;
      } catch (_markDoneError) {}
    }
    console.warn('[mitmi] submitActiveReviewTask:', e.message);
    showToast('Čuvanje ocene trenutno nije uspelo', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function _renderMyProfile(profile = null) {
  const data = profile || {};
  const email = _profileEmail();
  const displayName = data.display_name || _deriveDisplayName(email);
  const username = data.username ? '@' + data.username.replace(/^@+/, '') : '';
  const bio = data.bio || 'Dodaj par reči o sebi da bi ljudi znali kakvo društvo tražiš.';
  const city = data.city || 'Srbija';
  const prefs = _getUserPrefs();
  const rating = Number(data.avg_rating || 0).toFixed(1);
  const ratingCount = Number(data.rating_count || 0);

  const avatar = document.getElementById('profile-avatar');
  const nameEl = document.getElementById('profile-name');
  const bioEl = document.getElementById('profile-bio');
  const emailEl = document.getElementById('profile-email');
  const cityEl = document.getElementById('profile-location-value');
  const ratingEl = document.getElementById('profile-rating-value');
  const ratingCountEl = document.getElementById('profile-rating-count');
  const ratingWrap = document.getElementById('profile-rating-summary');
  const settingsSummary = document.getElementById('settings-profile-summary');
  const ownFollowersEl = document.getElementById('profile-own-followers');
  const ownFollowingEl = document.getElementById('profile-own-following');
  const ownEventsEl = document.getElementById('profile-own-events');

  _renderAvatarBubble(avatar, data, _profileAvatarFallback(data));
  if (nameEl) nameEl.textContent = displayName;
  if (bioEl) bioEl.textContent = bio;
  if (emailEl) emailEl.textContent = email || 'Email nije dostupan';
  if (cityEl) cityEl.textContent = prefs.show_location ? city : 'Lokacija je sakrivena';
  if (ratingEl) ratingEl.textContent = ratingCount > 0 ? rating : '0.0';
  if (ratingCountEl) ratingCountEl.textContent = ratingCount > 0 ? `${ratingCount} ocena` : 'Još nema ocena';
  if (ratingWrap) {
    ratingWrap.style.display = ratingCount > 0 ? 'flex' : 'none';
    ratingWrap.classList.toggle('is-empty', ratingCount === 0);
  }
  if (settingsSummary) settingsSummary.textContent = `${username || displayName} · ${email || 'bez emaila'}`;
  if (ownFollowersEl) ownFollowersEl.textContent = String(data._followers_count ?? 0);
  if (ownFollowingEl) ownFollowingEl.textContent = String(data._following_count ?? 0);
  if (ownEventsEl) ownEventsEl.textContent = String(data._events_count ?? 0);

  _renderProfileSocials(data);
  _renderTopTrustChips('profile-top-trust', data, { isOwn: true, eventsCount: data._events_count });
  _renderProfileTrustScore(data);
  _renderProfileReviewCard(PENDING_REVIEW_TASKS);
  syncSettingsPreferenceUI();
  if (typeof syncAdminUI === 'function') syncAdminUI();
}

async function loadMyProfile() {
  if (!isLoggedIn()) return null;
  try {
    let profile = await _getMyProfile();
    if (!profile) {
      profile = await _upsertMyProfile({});
    } else {
      _applyProfileToSession(profile);
    }
    profile._followers_count = await _loadFollowCount('followers', getUser()?.id);
    profile._following_count = await _loadFollowCount('following', getUser()?.id);
    const ownEvents = await loadMyCreatedEvents();
    profile._events_count = ownEvents.length;
    _renderMyProfile(profile);
    renderMyCreatedEvents(ownEvents);
    loadMyInvites().catch(() => {});
    if (_canLoadVenueDashboard(profile?.role)) {
      loadMyVenueDashboard().catch(() => {});
    }
    loadPublicProfileDirectory().then(() => loadMyFollowingIds()).then(() => renderFollowingProfiles()).catch(() => {});
    loadBlockedProfileIds().then(() => loadBlockedProfiles()).catch(() => {});
    loadFollowedEvents().catch(() => {});
    loadPendingReviewTasks({ sync:true, render:false }).then(tasks => _renderProfileReviewCard(tasks)).catch(() => {});
    if (typeof syncAdminUI === 'function') syncAdminUI();
    return profile;
  } catch (e) {
    console.warn('[mitmi] loadMyProfile:', e.message);
    _renderMyProfile({});
    renderMyCreatedEvents([]);
    if (typeof syncAdminUI === 'function') syncAdminUI();
    return null;
  }
}

function loadEditProfileForm() {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  const user = getUser() || {};
  const displayName = user.display_name || _deriveDisplayName(_profileEmail());
  const username = user.username || _defaultUsername(displayName || _profileEmail());
  const bio = user.bio || '';
  const city = user.city || 'Srbija';
  const gender = user.gender || 'unspecified';
  const avatarUrl = user.avatar_url || '';

  const nameEl = document.getElementById('edit-profile-name');
  const usernameEl = document.getElementById('edit-profile-username');
  const bioEl = document.getElementById('edit-profile-bio');
  const cityEl = document.getElementById('edit-profile-city');
  const genderEl = document.getElementById('edit-profile-gender');
  const previewEl = document.getElementById('edit-profile-avatar-preview');
  const removeBtn = document.getElementById('edit-profile-avatar-remove');

  if (nameEl) nameEl.value = displayName;
  if (usernameEl) usernameEl.value = username;
  if (bioEl) bioEl.value = bio;
  if (cityEl) cityEl.value = city;
  if (genderEl) genderEl.value = gender;
  if (previewEl) {
    previewEl.dataset.avatarUrl = avatarUrl;
    previewEl.style.backgroundImage = avatarUrl ? `url(${avatarUrl})` : '';
    previewEl.style.backgroundSize = avatarUrl ? 'cover' : '';
    previewEl.style.backgroundPosition = avatarUrl ? 'center' : '';
    previewEl.textContent = avatarUrl ? '' : _profileAvatarFallback(user);
    previewEl.style.fontSize = avatarUrl ? '' : '30px';
  }
  if (removeBtn) removeBtn.style.display = avatarUrl ? '' : 'none';
}

async function saveEditedProfile() {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }

  const btn = document.getElementById('edit-profile-save-btn');
  const nameEl = document.getElementById('edit-profile-name');
  const usernameEl = document.getElementById('edit-profile-username');
  const bioEl = document.getElementById('edit-profile-bio');
  const cityEl = document.getElementById('edit-profile-city');
  const genderEl = document.getElementById('edit-profile-gender');

  const displayName = nameEl?.value?.trim() || _deriveDisplayName(_profileEmail());
  const username = _normalizeUsername(usernameEl?.value || '');
  const bio = bioEl?.value?.trim() || '';
  const city = cityEl?.value || 'Srbija';
  const gender = genderEl?.value || 'unspecified';
  const avatarUrl = document.getElementById('edit-profile-avatar-preview')?.dataset.avatarUrl || getUser()?.avatar_url || null;

  if (!displayName || displayName.length < 2) {
    showToast('Ime mora imati bar 2 karaktera', 'error');
    return;
  }
  if (!username || username.length < 3) {
    showToast('Korisničko ime mora imati bar 3 karaktera', 'error');
    return;
  }
  if (_containsRestrictedContactInfo(bio)) {
    showToast(_publicContactSafetyMessage(), 'error', 2600);
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Čuvam...';
  }

  try {
    const profile = await _upsertMyProfile({
      display_name: displayName,
      username,
      bio,
      city,
      gender,
      avatar_url: avatarUrl,
      role: getUser()?.user_role || 'user'
    });
    ['city-label','home-city-display','browse-city-label','browse-home-city-label'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = city;
    });
    _renderMyProfile(profile);
    showToast('Profil je sačuvan', 'success');
    nav('profile');
  } catch (e) {
    const msg = String(e.data?.message || e.message || '').toLowerCase();
    if (msg.includes('username')) showToast('Korisničko ime je zauzeto', 'error');
    else showToast('Greška pri čuvanju profila', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sačuvaj izmene';
    }
  }
}

async function handleProfileAvatar(input) {
  if (!input.files || !input.files[0]) return;
  try {
    const compressed = await compressImage(input.files[0], 720, 0.82);
    let avatarUrl = compressed;
    if (_isSupabaseConfigured() && isLoggedIn() && typeof _uploadProfileAvatarDataUrl === 'function') {
      try {
        avatarUrl = await _uploadProfileAvatarDataUrl(compressed);
      } catch (uploadErr) {
        console.warn('[mitmi] handleProfileAvatar upload:', uploadErr.message);
      }
    }
    const previewEl = document.getElementById('edit-profile-avatar-preview');
    const removeBtn = document.getElementById('edit-profile-avatar-remove');
    if (previewEl) {
      previewEl.dataset.avatarUrl = avatarUrl;
      previewEl.style.backgroundImage = `url(${avatarUrl})`;
      previewEl.style.backgroundSize = 'cover';
      previewEl.style.backgroundPosition = 'center';
      previewEl.textContent = '';
      previewEl.style.fontSize = '';
    }
    if (removeBtn) removeBtn.style.display = '';
    showToast('Profilna slika je dodata', 'success', 1500);
  } catch (e) {
    showToast('Profilna slika nije uspela da se obradi', 'error');
  } finally {
    input.value = '';
  }
}

function clearProfileAvatar() {
  const previewEl = document.getElementById('edit-profile-avatar-preview');
  const removeBtn = document.getElementById('edit-profile-avatar-remove');
  if (previewEl) {
    previewEl.dataset.avatarUrl = '';
    previewEl.style.backgroundImage = '';
    previewEl.style.backgroundSize = '';
    previewEl.style.backgroundPosition = '';
    previewEl.textContent = _profileAvatarFallback(getUser() || {});
    previewEl.style.fontSize = '30px';
  }
  if (removeBtn) removeBtn.style.display = 'none';
}

function loadPasswordSecurityForm() {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  const emailEl = document.getElementById('security-email');
  const nextPassEl = document.getElementById('security-new-password');
  const confirmPassEl = document.getElementById('security-confirm-password');
  if (emailEl) emailEl.value = _profileEmail();
  if (nextPassEl) nextPassEl.value = '';
  if (confirmPassEl) confirmPassEl.value = '';
}

async function updatePasswordSecurity() {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }

  const btn = document.getElementById('security-save-btn');
  const nextPassEl = document.getElementById('security-new-password');
  const confirmPassEl = document.getElementById('security-confirm-password');

  const nextPassword = nextPassEl?.value || '';
  const confirmPassword = confirmPassEl?.value || '';

  if (!nextPassword || nextPassword.length < 8) {
    showToast('Nova lozinka mora imati bar 8 karaktera', 'error');
    return;
  }
  if (nextPassword !== confirmPassword) {
    showToast('Lozinke se ne poklapaju', 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Čuvam...';
  }

  try {
    await _supaFetch('/auth/v1/user', {
      method: 'PUT',
      body: JSON.stringify({ password: nextPassword })
    });
    if (nextPassEl) nextPassEl.value = '';
    if (confirmPassEl) confirmPassEl.value = '';
    showToast('Lozinka je uspešno promenjena', 'success');
    nav('settings');
  } catch (e) {
    showToast(_friendlyAuthError(e.data?.error_description || e.message, 'Promena lozinke nije uspela.'), 'error', 2600);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sačuvaj lozinku';
    }
  }
}

function _venueBadgeText(status = '') {
  if (status === 'verified') return 'Profil pregledan';
  if (status === 'pending') return 'Na proveri';
  if (status === 'rejected') return 'Potrebna dopuna';
  return 'Organizer';
}

function _organizerBadgeText(status = '') {
  if (status === 'claimed') return 'Profil povezan';
  if (status === 'unclaimed') return 'Profil još nije preuzet';
  if (status === 'merged') return 'Spojen organizer';
  return 'Organizer';
}

function _venueTypeLabel(venue = {}) {
  const parts = [venue.venue_type, venue.city].filter(Boolean);
  const meta = parts.join(' · ');
  const badge = _venueBadgeText(venue.status);
  return [meta, badge].filter(Boolean).join(' · ');
}

function _isOrganizerEntity(entity = null) {
  return !!entity && (entity.kind === 'organizer' || entity.entity_type === 'organizer');
}

function _normalizeVenueTarget(entity = null) {
  if (!entity) return null;
  if (_isOrganizerEntity(entity)) {
    return {
      ...entity,
      id: entity.id,
      kind: 'organizer',
      entity_type: 'organizer',
      venue_name: entity.name || entity.venue_name || 'Organizer',
      venue_type: entity.status === 'claimed' ? 'Organizer profil' : 'Organizer u pripremi',
      city: entity.city || 'Srbija',
      description: entity.source_notes || entity.description || '',
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
  const params = {
    select: 'id,name,city,instagram_handle,website_url,source_notes,status,claimed_by_profile_id,created_at,updated_at',
    limit: '1'
  };
  if (typeof lookup === 'object' && lookup.id) params.id = `eq.${lookup.id}`;
  else if (_looksLikeUuid(lookup)) params.id = `eq.${lookup}`;
  else params.name = `eq.${lookup}`;
  try {
    const rows = await _supaGet('organizers', params);
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
  const role = typeof getCurrentRole === 'function' ? getCurrentRole() : (getUser()?.role || 'user');
  if (!['venue', 'admin'].includes(role)) {
    showToast('Za claim je potreban organizer ili admin nalog', 'info', 2200);
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
    console.warn('[mitmi] requestOrganizerClaim:', e.message);
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
      select: 'id,creator_id,venue_id,organizer_id,title,description,category,city,location_name,starts_at,capacity,attendee_count,cover_url,avg_rating,rating_count,is_published,is_cancelled,created_at',
      or: orClause,
      is_published: 'eq.true',
      is_cancelled: 'eq.false',
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
      summaryEl.textContent = `${ratingSummary.avgRating.toFixed(1)} / 5 na ${ratingSummary.ratingCount} ocena`;
      noteEl.textContent = ratingSummary.ratedEvents === 1
        ? 'Jedan događaj već ima ocene publike i utiče na ukupni utisak o organizer profilu.'
        : `${ratingSummary.ratedEvents} događaja već imaju ocene publike. Prati utiske posle događaja da vidiš šta najbolje prolazi.`;
      return;
    }
    const registrations = Number(analytics?.upcoming_registrations ?? analytics?.total_registrations ?? 0);
    if (totalEvents > 0 || registrations > 0) {
      summaryEl.textContent = totalEvents > 0
        ? `${totalEvents} aktivna događaja trenutno grade tvoj profil`
        : 'Organizer profil je aktivan';
      noteEl.textContent = registrations > 0
        ? `Za sada imaš ${registrations} prijavljenih na aktuelne događaje. Ocene će se pojaviti kada posetioci pošalju utiske.`
        : 'Ocene će se pojaviti kada posetioci posle događaja počnu da šalju utiske.';
      return;
    }
    summaryEl.textContent = 'Još nema dovoljno podataka za sažetak.';
    noteEl.textContent = 'Detaljnija analitika će se pojaviti kada tvoji događaji dobiju više stvarnih prijava, sačuvanih događaja i interakcija.';
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
    console.warn('[mitmi] loadMyVenueAnalytics:', e.message);
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
      select: 'id,creator_id,venue_id,organizer_id,title,description,category,city,location_name,starts_at,capacity,attendee_count,cover_url,avg_rating,rating_count,is_published,is_cancelled,created_at',
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
    console.warn('[mitmi] loadMyVenueEvents:', e.message);
    return [];
  }
}

function renderVenueEvents(items = []) {
  const dashGrid = document.getElementById('venue-events-list');
  const publicGrid = document.getElementById('vp-events-grid');
  const publicCount = document.getElementById('vp-events-count');

  if (publicCount) publicCount.textContent = String(items.length);

  const cardsHtml = !items.length
    ? `<div class="draft-empty">Još nema objavljenih događaja.</div>`
    : items.map(item => {
        const raw = item.raw || {};
        const capacity = Number(raw.capacity || 0);
        const attendees = Number(raw.attendee_count || 0);
        const pct = capacity > 0 ? Math.min(100, Math.round((attendees / capacity) * 100)) : 0;
        const badgeClass = new Date(item.date || item.starts_at || Date.now()) < new Date(new Date().setHours(0,0,0,0)) ? 'tag-gray' : 'tag-green';
        const badgeLabel = badgeClass === 'tag-gray' ? 'Završen' : 'Aktivan';
        const coverStyle = item.cover_url ? ` style="background-image:url('${_escHtml(item.cover_url)}');background-size:cover;background-position:center"` : '';
        return `<div class="venue-ev-card" onclick="openEventById('${_escHtml(item.id)}')">
          <div class="venue-ev-h"><div class="venue-ev-title">${_escHtml(item.title)}</div><span class="tag ${badgeClass}">${badgeLabel}</span></div>
          <div class="venue-ev-meta">${_escHtml(item.meta || 'Detalji nisu upisani')}</div>
          ${Number(raw.rating_count || 0) > 0 ? `<div class="admin-mini" style="margin-bottom:8px">★ ${_escHtml(Number(raw.avg_rating || 0).toFixed(1))} · ${_escHtml(String(Number(raw.rating_count || 0)))} ocena</div>` : ''}
          <div class="venue-bar-row"><span class="venue-bar-lbl">Prijavljeni</span><div class="venue-bar"><div class="venue-bar-fill" style="width:${pct}%"></div></div><span class="venue-bar-pct">${capacity > 0 ? `${attendees}/${capacity}` : `${attendees}`}</span></div>
        </div>`;
      }).join('');

  if (dashGrid) dashGrid.innerHTML = cardsHtml;

  if (publicGrid) {
    publicGrid.innerHTML = !items.length
      ? `<div class="draft-empty" style="grid-column:1/-1">Još nema objavljenih događaja.</div>`
      : items.map(item => {
          const coverStyle = item.cover_url ? ` style="background-image:url('${_escHtml(item.cover_url)}');background-size:cover;background-position:center"` : '';
          return `<div class="ev-card" onclick="openEventById('${_escHtml(item.id)}')">
            <div class="ev-img ${_escHtml(item.bg)}"${coverStyle}><span class="tag tag-purple" style="font-size:10px">${_eventEmoji(item.cat)}</span></div>
            <div class="ev-body">
              <div class="ev-title">${_escHtml(item.title)}</div>
              <div class="ev-meta">${_escHtml(item.meta || 'Detalji nisu upisani')}</div>
              <div class="ev-footer"><span class="ev-spots">${_escHtml(_eventSpotsLabel(item.spots))}</span></div>
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

  setText('vp-name', data.venue_name || 'Organizer');
  setText('vp-title', data.venue_name || 'Organizer');
  setText('vp-type', isOrganizer ? [data.city, _organizerBadgeText(data.status)].filter(Boolean).join(' · ') : _venueTypeLabel(data));
  setText('vp-av', _venueInitial(data.venue_name));
  setText('vp-desc', data.description || (isOrganizer ? 'Ovaj organizer još nema registrovan nalog na platformi, ali događaji su već povezani sa ovim profilom.' : 'Organizer još nije dodao opis.'));
  setText('vp-events-count', String(items.length));
  setText('vp-followers', String(followersCount));
  setText('vp-followers-label', isOrganizer ? 'status' : 'pratilaca');
  setText('vp-followers', isOrganizer ? (data.status === 'claimed' ? 'povezan' : 'u pripremi') : String(followersCount));
  setText('vp-rating', avgRating);
  setText('vp-rating-meta', ratingCount > 0 ? `${ratingCount} ocena` : 'Još nema ocena');

  const badge = document.getElementById('vp-verified-badge');
  if (badge) badge.textContent = isOrganizer ? (data.status === 'claimed' ? 'Profil povezan' : 'Profil još nije preuzet') : _venueBadgeText(data.status);

  const hero = document.getElementById('vp-hero-inner');
  if (hero) {
    hero.style.backgroundImage = data.cover_url ? `url(${data.cover_url})` : '';
    hero.style.backgroundSize = data.cover_url ? 'cover' : '';
    hero.style.backgroundPosition = data.cover_url ? 'center' : '';
  }

  const coverBtn = document.getElementById('vp-cover-btn');
  if (coverBtn) coverBtn.style.display = !isOrganizer && isOwner ? '' : 'none';

  const ratingCard = document.getElementById('vp-rating-card');
  if (ratingCard) ratingCard.style.display = ratingCount > 0 ? '' : 'none';

  const followBtn = document.getElementById('vp-follow-btn');
  if (followBtn) {
    if (isOwner || isOrganizer) {
      followBtn.style.display = 'none';
    } else {
      followBtn.style.display = '';
      followBtn.textContent = followed ? '✓ Pratiš' : '+ Prati';
      followBtn.className = followed ? 'btn btn-purple btn-sm' : 'btn btn-ghost btn-sm';
    }
  }

  const secondaryBtn = document.getElementById('vp-secondary-btn');
  const disputeNote = document.getElementById('vp-dispute-note');
  if (secondaryBtn) {
    secondaryBtn.style.display = 'none';
    secondaryBtn.onclick = null;
    secondaryBtn.disabled = false;
    if (isOrganizer && data.status === 'unclaimed') {
      const role = typeof getCurrentRole === 'function' ? getCurrentRole() : (getUser()?.role || 'user');
      if (isLoggedIn() && ['venue', 'admin'].includes(role)) {
        secondaryBtn.style.display = '';
        secondaryBtn.textContent = claimRequest?.status === 'pending' ? 'Zahtev poslat' : 'Zatraži preuzimanje';
        secondaryBtn.disabled = claimRequest?.status === 'pending';
        secondaryBtn.onclick = () => requestOrganizerClaim();
      }
    }
  }
  if (disputeNote) disputeNote.style.display = isOrganizer ? '' : 'none';

  renderVenueEvents(items);
}

function _renderVenueDashboard(venue = null) {
  const empty = document.getElementById('venue-empty-state');
  const content = document.getElementById('venue-dashboard-content');
  const av = document.getElementById('venue-dashboard-avatar');
  const name = document.getElementById('venue-dashboard-name');
  const type = document.getElementById('venue-dashboard-type');
  const dashDesc = document.getElementById('venue-dashboard-desc');
  const publicName = document.getElementById('vp-name');
  const publicMeta = document.getElementById('vp-type');
  const publicTitle = document.getElementById('vp-title');
  const publicAvatar = document.getElementById('vp-av');
  const publicAbout = document.getElementById('vp-desc');

  if (!venue) {
    _currentPublicVenueId = null;
    _currentPublicVenueTarget = null;
    if (empty) empty.style.display = '';
    if (content) content.style.display = 'none';
    loadMyVenueAnalytics(null).catch(() => {});
    return;
  }

  _currentPublicVenueId = venue.id;
  _currentPublicVenueTarget = _normalizeVenueTarget(venue);
  if (empty) empty.style.display = 'none';
  if (content) content.style.display = '';
  if (av) av.textContent = _venueInitial(venue.venue_name);
  if (name) name.textContent = venue.venue_name || 'Organizer';
  const dashboardType = _isOrganizerEntity(venue)
    ? [venue.venue_type, venue.city, _organizerBadgeText(venue.status)].filter(Boolean).join(' · ')
    : _venueTypeLabel(venue);
  if (type) type.textContent = dashboardType;
  if (dashDesc) dashDesc.textContent = venue.description || 'Dodaj opis organizatora događaja da bi profil delovao potpunije.';
  if (publicName) publicName.textContent = venue.venue_name || 'Organizer';
  if (publicTitle) publicTitle.textContent = venue.venue_name || 'Organizer';
  if (publicAvatar) publicAvatar.textContent = _venueInitial(venue.venue_name);
  if (publicMeta) publicMeta.textContent = dashboardType;
  if (publicAbout) publicAbout.textContent = venue.description || 'Dodaj opis organizatora događaja tokom onboardinga.';

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
    console.warn('[mitmi] loadMyVenueDashboard:', e.message);
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
    const claimedOrganizer = await _getMyClaimedOrganizer();
    const venue = claimedOrganizer ? _normalizeVenueTarget(claimedOrganizer) : await _getMyVenue();
    if (!venue) {
      nav('venue');
      showToast('Prvo završi onboarding organizatora', 'info', 1800);
      return;
    }
    const nameEl = document.getElementById('edit-venue-name');
    const typeEl = document.getElementById('edit-venue-type');
    const cityEl = document.getElementById('edit-venue-city');
    const descEl = document.getElementById('edit-venue-description');
    const typeWrap = typeEl?.closest('.form-group');
    if (nameEl) nameEl.value = venue.venue_name || '';
    if (typeEl) typeEl.value = venue.venue_type || '';
    if (cityEl) cityEl.value = venue.city || 'Novi Sad';
    if (descEl) descEl.value = venue.description || '';
    if (typeWrap) typeWrap.style.display = claimedOrganizer ? 'none' : '';
  } catch (e) {
    showToast('Greška pri učitavanju organizer profila', 'error');
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

  const venue_name = nameEl?.value?.trim() || '';
  const venue_type = typeEl?.value || '';
  const city = cityEl?.value || 'Novi Sad';
  const description = descEl?.value?.trim() || '';

  if (!venue_name || venue_name.length < 2) {
    showToast('Naziv organizatora mora imati bar 2 karaktera', 'error');
    return;
  }
  if (_containsRestrictedContactInfo(description)) {
    showToast('U javnom opisu organizatora ne objavljuj telefon, email ili profile sa mreža.', 'error', 2800);
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Čuvam...';
  }

  try {
    const claimedOrganizer = await _getMyClaimedOrganizer();
    if (!claimedOrganizer) {
      const existingOrganizer = await _findExistingOrganizerMatch(venue_name, city);
      if (existingOrganizer?.id) {
        showToast('Profil sa ovim nazivom već postoji. Otvaram postojeći organizer profil da pošalješ zahtev za preuzimanje.', 'info', 3200);
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
          description
        })
      : await _upsertMyVenue({
          venue_name,
          venue_type,
          city,
          description
        });
    const venue = claimedOrganizer
      ? _normalizeVenueTarget(savedEntity)
      : savedEntity;
    _renderVenueDashboard(venue);
    showToast('Organizer profil je sačuvan', 'success');
    nav('venue');
  } catch (e) {
    showToast('Greška pri čuvanju organizer profila', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sačuvaj';
    }
  }
}

// --- Swipe logic ---
let swipeStartX = 0, swipeCurrentX = 0, isSwiping = false;
const swipeData = [];
let swipeIdx = 0;
let _activeSwipeCat = 'all';
let _swipeFiltered = null;

const CAT_EMOJI_MAP = { muzika:'🎵', sport:'⚽', kultura:'🎨', kafa:'☕', priroda:'🏕️' };
const BG_MAP = { muzika:'ev-img-a', kultura:'ev-img-b', sport:'ev-img-c', kafa:'ev-img-d', priroda:'ev-img-e' };

function _getSwipeData() {
  const eventSource = _combinedEventCards().map(ev => ({ ...ev, swipeType: 'event', swipe_key: `event-${ev.id || ev.title || ''}` }));
  const inviteSource = typeof getSwipeInviteCards === 'function' ? getSwipeInviteCards() : [];
  const source = (_swipeFiltered && _swipeFiltered.length)
    ? _swipeFiltered
    : [...eventSource, ...inviteSource].sort((a, b) => new Date(a.starts_at || a.date || 0) - new Date(b.starts_at || b.date || 0));
  return source.map(ev => ({
    swipeType: ev.swipeType || 'event',
    swipe_key: ev.swipe_key || ev.id || '',
    inviteId: ev.inviteId || '',
    eventId: (ev.swipeType || 'event') === 'invite' ? (ev.eventId || '') : (ev.eventId || ev.id || ''),
    eventTitle: ev.eventTitle || ev.raw?.event?.title || ev.title || '',
    creatorId: ev.creatorId || '',
    creatorName: ev.creatorName || '',
    id: ev.id || '',
    cat: ev.cat || 'muzika',
    title: ev.title || '',
    venue: ev.location_name || (ev.meta || '').split('·').slice(-1)[0]?.trim() || 'Srbija',
    date: ev.meta || '',
    desc: ev.swipeType === 'invite'
      ? (ev.raw?.description || `Objavljen poziv od korisnika ${ev.creatorName || 'mitmi korisnik'} za zajednički odlazak ili dogovor.`)
      : (ev.raw?.description || ev.desc || 'Nađi društvo za ovaj događaj i dogovorite se direktno u aplikaciji.'),
    going: ev.swipeType === 'invite'
      ? `${ev.creatorName || 'mitmi korisnik'} · ${ev.spots || '1'} mesta`
      : (ev.going || `${ev.spots || 'Nekoliko'} mesta · aktivna ekipa`),
    spots: ev.spots || '',
    bg: BG_MAP[ev.cat] || 'ev-img-a',
    cover_url: ev.cover_url || ''
  }));
}

function loadSwipeCard(el, data) {
  if (!el || !data) return;
  const isFront = el.id === 'swipe-front';

  if (isFront) {
    // Full-screen — update ids direktno
    const bg = el.querySelector('.swipe-fs-bg');
    if (bg) {
      bg.className = 'swipe-fs-bg ' + (BG_MAP[data.cat] || 'ev-img-a');
    }
    const catEl  = document.getElementById('sf-cat');
    const titEl  = document.getElementById('sf-title');
    const venEl  = document.getElementById('sf-venue');
    const datEl  = document.getElementById('sf-date');
    const desEl  = document.getElementById('sf-desc');
    const goEl   = document.getElementById('sf-going');
    const spEl   = document.getElementById('sf-spots');
    const emoji  = CAT_EMOJI_MAP[data.cat] || '📅';
    if (catEl) catEl.textContent = emoji + ' ' + (data.cat ? data.cat.charAt(0).toUpperCase() + data.cat.slice(1) : '');
    if (titEl) titEl.textContent = data.title;
    if (venEl) venEl.textContent = '📍 ' + data.venue;
    if (datEl) datEl.textContent = '📅 ' + data.date;
    if (desEl) desEl.textContent = data.desc || '';
    if (goEl)  goEl.textContent  = data.going || '';
    if (spEl)  {
      spEl.textContent = (data.spots || '') + ' mesta';
      spEl.style.background = data.urgent ? 'rgba(245,158,11,.25)' : 'rgba(255,255,255,.15)';
    }
  } else {
    // Back kartica — samo bg i naslov
    const bg = el.querySelector('.swipe-fs-bg');
    if (bg) bg.className = 'swipe-fs-bg ' + (BG_MAP[data.cat] || 'ev-img-a');
    const titEl = el.querySelector('.swipe-fs-title');
    if (titEl) titEl.textContent = data.title;
    const metEl = el.querySelector('.swipe-fs-meta');
    if (metEl) metEl.textContent = data.venue;
  }
}

// Swipe touch events
const swipeStack = document.getElementById('swipe-stack');
if (swipeStack) {
  swipeStack.addEventListener('touchstart', e => {
    swipeStartX = e.touches[0].clientX;
    isSwiping = true;
  }, { passive: true });
  swipeStack.addEventListener('touchmove', e => {
    if (!isSwiping) return;
    swipeCurrentX = e.touches[0].clientX;
    const dx = swipeCurrentX - swipeStartX;
    const front = document.getElementById('swipe-front');
    if (front) {
      front.style.transform = `rotate(${dx * 0.05}deg) translateX(${dx}px)`;
      const likeInd = document.getElementById('swipe-like-ind');
      const skipInd = document.getElementById('swipe-skip-ind');
      if (likeInd) likeInd.style.opacity = Math.max(0, dx / 80);
      if (skipInd) skipInd.style.opacity = Math.max(0, -dx / 80);
    }
  }, { passive: true });
  swipeStack.addEventListener('touchend', e => {
    if (!isSwiping) return;
    isSwiping = false;
    const dx = swipeCurrentX - swipeStartX;
    const front = document.getElementById('swipe-front');
    if (front) front.style.transform = '';
    const likeInd = document.getElementById('swipe-like-ind');
    const skipInd = document.getElementById('swipe-skip-ind');
    if (likeInd) likeInd.style.opacity = 0;
    if (skipInd) skipInd.style.opacity = 0;
    if (Math.abs(dx) > 80) doSwipe(dx > 0 ? 'right' : 'left');
  });
}

// --- Chat moderation (checkMsgContent) ---
let modOnConfirm = null;
const MOD_PATTERNS = [
  /\b(\+?381|06\d)\s*[\d\s\-]{6,}/,
  /@[\w.]+/,
  /\bwhatsapp\b/i, /\bviber\b/i, /\btelegram\b/i,
];
function checkMsgContent(text) {
  return MOD_PATTERNS.some(p => p.test(text));
}
function showModWarning(type, onConfirm) {
  modOnConfirm = onConfirm;
  document.getElementById('mod-overlay').style.display = 'flex';
}
function modDismiss() {
  document.getElementById('mod-overlay').style.display = 'none';
  modOnConfirm = null;
}
function modConfirm() {
  document.getElementById('mod-overlay').style.display = 'none';
  if (modOnConfirm) { modOnConfirm(); modOnConfirm = null; }
}

// --- Send message ---
// _activeChatId: UUID aktivnog chata iz Supabase
let _activeChatId = null;
let _realtimeSub  = null;

function sendMsg() {
  const input = document.getElementById('chat-input');
  if (!input || !input.value.trim()) return;
  const val = input.value.trim();
  if (checkMsgContent(val)) {
    showModWarning('contact', () => _sendMsgToSupabase(val));
    return;
  }
  _sendMsgToSupabase(val);
  input.value = '';
}

async function _sendMsgToSupabase(text) {
  if (!isLoggedIn()) return;
  // Optimistički prikaz odmah
  _doSend(text);

  if (!_activeChatId) return; // demo mod — nema pravog chata

  try {
    await _supaFetch('/rest/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        chat_id:   _activeChatId,
        sender_id: getUser()?.id,
        content:   text
      })
    });
  } catch(e) {
    console.warn('[mitmi] sendMsg failed:', e.message);
    // Poruka je već prikazana lokalno, ne gasimo je
  }
}

// Realtime subscribe za aktivan chat
function _subscribeToChat(chatId) {
  if (!chatId || !window.EventSource) return;
  _activeChatId = chatId;

  // Supabase Realtime via REST polling (bez JS SDK)
  // Za pravi realtime koristiti @supabase/supabase-js
  // Ovo je polling fallback svakih 3s
  if (_realtimeSub) clearInterval(_realtimeSub);
  let lastTs = new Date().toISOString();

  const shouldPoll = () => {
    const chatPage = document.getElementById('page-chat');
    return !!(isLoggedIn() && _activeChatId && chatPage?.classList.contains('active') && document.visibilityState === 'visible');
  };

  _realtimeSub = setInterval(async () => {
    if (!shouldPoll()) return;
    try {
      const msgs = await _supaFetch(
        `/rest/v1/messages?chat_id=eq.${_activeChatId}&created_at=gt.${encodeURIComponent(lastTs)}&order=created_at.asc&select=*,profiles!sender_id(username,avatar_url)`,
        { method: 'GET' }
      );
      if (!Array.isArray(msgs) || msgs.length === 0) return;
      lastTs = msgs[msgs.length-1].created_at;
      const myId = getUser()?.id;
      msgs.forEach(m => {
        if (m.sender_id === myId) return; // već prikazano optimistički
        _renderIncomingMsg(m.content, m.profiles?.username || '?');
      });
    } catch(e) {}
  }, 5000);
}

function _renderIncomingMsg(text, senderName) {
  const msgs = document.getElementById('chat-msgs');
  if (!msgs) return;
  const timeStr = new Date().toLocaleTimeString('sr', { hour:'2-digit', minute:'2-digit' });
  const div = document.createElement('div');
  div.className = 'msg';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  const time = document.createElement('span');
  time.className = 'msg-time';
  time.textContent = senderName + ' · ' + timeStr;
  div.appendChild(bubble);
  div.appendChild(time);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function _unsubscribeChat() {
  if (_realtimeSub) { clearInterval(_realtimeSub); _realtimeSub = null; }
  _activeChatId = null;
}
let _activeChatName = null; // pracenje aktivnog threada

function _doSend(val) {
  const msgs = document.getElementById('chat-msgs');
  if (!msgs) return;

  const timeStr = new Date().toLocaleTimeString('sr', { hour:'2-digit', minute:'2-digit' });

  const div = document.createElement('div');
  div.className = 'msg me';
  const wrap = document.createElement('div');
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = val; // textContent — XSS safe
  const time = document.createElement('span');
  time.className = 'msg-time';
  time.textContent = timeStr;
  wrap.appendChild(bubble);
  wrap.appendChild(time);
  div.appendChild(wrap);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

// --- Swipe doSwipe indicators reset ---
function updateSwipeIndicators(dx) {
  const l = document.getElementById('swipe-like-ind');
  const s = document.getElementById('swipe-skip-ind');
  if (l) l.style.opacity = Math.max(0, dx / 80);
  if (s) s.style.opacity = Math.max(0, -dx / 80);
}

// --- "Idemo zajedno" ---
let _dogovorState = 'idle';


// --- selType ---
function selType(el) {
  el.closest('.type-grid').querySelectorAll('.type-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
}

// --- checkDuplicate ---
function checkDuplicate() {
  const input = document.querySelector('#page-create .form-input');
  if (!input || input.value.length < 4) {
    document.getElementById('dupe-warning').style.display = 'none';
    return;
  }
  const val = input.value.toLowerCase().trim();
  const titles = _combinedEventCards().map(e => String(e.title || '').toLowerCase()).filter(Boolean);
  const isDupe = titles.some(t => {
    const words = val.split(' ').filter(w => w.length > 3);
    return words.length > 0 && words.some(w => t.includes(w));
  });
  document.getElementById('dupe-warning').style.display = isDupe ? 'block' : 'none';
}

function _normalizeCreateDuplicateValue(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function _createDayToken(value = '') {
  return value ? String(value).slice(0, 10) : '';
}

function _findCreateDuplicateCandidates({ title = '', location = '', date = '', organizerId = null } = {}) {
  const normalizedTitle = _normalizeCreateDuplicateValue(title);
  const normalizedLocation = _normalizeCreateDuplicateValue(location);
  const day = _createDayToken(date);
  if (!normalizedTitle && !normalizedLocation && !day) return [];
  return _combinedEventCards().filter(item => {
    const raw = item.raw || {};
    const itemTitle = _normalizeCreateDuplicateValue(item.title || raw.title || '');
    const itemLocation = _normalizeCreateDuplicateValue(item.location_name || raw.location_name || '');
    const itemDay = _createDayToken(item.starts_at || raw.starts_at || item.date || '');
    const sameOrganizer = !!(organizerId && raw.organizer_id && raw.organizer_id === organizerId);
    const sameDay = !!(day && itemDay && day === itemDay);
    const similarTitle = !!(normalizedTitle && itemTitle && (itemTitle === normalizedTitle || itemTitle.includes(normalizedTitle) || normalizedTitle.includes(itemTitle)));
    const similarLocation = !!(normalizedLocation && itemLocation && (itemLocation === normalizedLocation || itemLocation.includes(normalizedLocation) || normalizedLocation.includes(itemLocation)));
    return (sameOrganizer && sameDay) || (similarTitle && sameDay) || (similarTitle && similarLocation);
  }).slice(0, 3);
}

async function _createPlanRecord({
  title = '',
  description = '',
  category = '',
  city = '',
  location = '',
  startsAt = '',
  spots = null,
  sourceUrl = '',
  eventId = null,
  organizerId = null,
  venueId = null
} = {}) {
  if (!_isSupabaseConfigured() || !isLoggedIn()) return null;
  return _supaFetch('/rest/v1/plans', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({
      creator_id: getUser()?.id,
      event_id: eventId || null,
      organizer_id: organizerId || null,
      venue_id: venueId || null,
      title,
      description: description || null,
      category: category || null,
      city: city || null,
      location_name: location || null,
      starts_at: startsAt || null,
      spots_total: spots || 1,
      source_url: sourceUrl || null,
      status: 'open'
    })
  }).catch((e) => {
    console.warn('[mitmi] _createPlanRecord:', e.message);
    return null;
  });
}

// --- rateCat ---
function rateCat(star, catIdx, val) {
  const row = star.closest('.rev-stars');
  row.querySelectorAll('.rev-star').forEach((s, i) => {
    s.classList.toggle('on', i < val);
  });
}

// --- showCancelConfirm ---
function showCancelConfirm() {
  document.getElementById('cancel-overlay').style.display = 'flex';
}

// --- doSearch (basic filter) ---
// --- Unified browse filter state ---
const _browseState = { query: '', cat: 'all', date: '', range: '' };

function _applyBrowseFilters() {
  const grid = document.getElementById('browse-grid');
  const empty = document.getElementById('browse-empty');
  if (!grid) return;
  // Podrzi i sq-card i ev-card
  const cards = grid.querySelectorAll('.sq-card, .ev-card');
  let visible = 0;
  cards.forEach(card => {
    const text    = card.textContent.toLowerCase();
    const cardCat = card.getAttribute('data-cat') || '';
    const cardDay = card.getAttribute('data-day') || '';
    const cardDate= card.getAttribute('data-date') || '';
    const matchQ = !_browseState.query || text.includes(_browseState.query);
    let matchCat = true;
    if (_browseState.cat && _browseState.cat !== 'all') {
      if (_browseState.cat === 'danas')  matchCat = cardDay === 'danas';
      else if (_browseState.cat === 'vikend') matchCat = cardDay === 'vikend' || cardDay === 'danas';
      else if (_browseState.cat === 'tonight') matchCat = typeof _isTonightEvent === 'function' ? _isTonightEvent(cardDate) : false;
      else matchCat = cardCat === _browseState.cat;
    }
    let matchDate = !_browseState.date || cardDate === _browseState.date;
    if (_browseState.range) {
      const cardTs = cardDate ? new Date(cardDate).getTime() : NaN;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const limit = new Date(today);
      if (_browseState.range === '7d') limit.setDate(limit.getDate() + 7);
      if (_browseState.range === '30d') limit.setDate(limit.getDate() + 30);
      matchDate = !Number.isNaN(cardTs) && cardTs >= today.getTime() && cardTs <= limit.getTime();
    }
    const show = matchQ && matchCat && matchDate;
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  if (empty) empty.style.display = visible === 0 ? 'block' : 'none';
  grid.querySelectorAll('.sq-card:not([style*="none"]), .ev-card:not([style*="none"])').forEach((c, i) => {
    c.style.animation = 'none'; c.offsetHeight;
    c.style.animation = `cardReveal .3s ease ${i * 0.06}s both`;
  });
}

function doSearch(val) {
  _browseState.query = val.toLowerCase().trim();
  _applyBrowseFilters();
}

// --- handleCreateInvite — pravi Supabase insert ---
async function handleCreateInvite() {
  if (!isLoggedIn()) { showToast('Prijavi se da bi objavio poziv', 'error'); nav('login'); return; }

  const title    = document.getElementById('create-title')?.value.trim();
  const category = document.getElementById('create-category')?.value;
  const date     = document.getElementById('create-date')?.value;
  const time     = document.getElementById('create-time')?.value;
  const location = document.getElementById('create-location')?.value.trim();
  const city     = document.getElementById('create-city')?.value.trim();
  const desc     = document.getElementById('create-desc')?.value.trim();
  const sourceUrl= document.getElementById('create-source-url')?.value.trim();
  const spotsEl  = document.getElementById('create-spots');
  const spots    = spotsEl?.value ? parseInt(spotsEl.value) : null;
  const vibeTags = typeof getSelectedCreateVibes === 'function' ? getSelectedCreateVibes() : [];
  const contextInput = document.getElementById('create-organizer');
  const selectedContextType = contextInput?.dataset.contextType || '';
  const selectedContextEventId = selectedContextType === 'event' ? (contextInput?.dataset.eventId || '') : '';
  const selectedContextOrganizerId = selectedContextType === 'organizer' ? (contextInput?.dataset.organizerId || '') : '';
  const targetInviteEventId = _inviteEventId || selectedContextEventId;
  const isManagedFlow = _createFlowMode === 'managed';

  if (!title)    { showToast(isManagedFlow ? 'Unesi naziv događaja' : 'Unesi naslov poziva', 'error'); return; }
  if (!targetInviteEventId && !date)     { showToast('Izaberi datum', 'error'); return; }
  if (!targetInviteEventId && !category) { showToast('Izaberi kategoriju', 'error'); return; }
  if (!targetInviteEventId && !city) { showToast('Unesi grad', 'error'); return; }
  if (!isManagedFlow && _containsRestrictedContactInfo(`${title}\n${desc}\n${location}\n${city}`)) {
    showToast('Poziv ne sme da sadrži telefon, email, Instagram, Viber ili druge direktne kontakte.', 'error', 2800);
    return;
  }

  const btn = document.querySelector('#page-create .btn-purple');
  if (btn) { btn.disabled = true; btn.textContent = isManagedFlow ? 'Objavljujemo događaj...' : 'Objavljujemo plan...'; }

  try {
    const isManagedCreate = !_editingEventId && !_inviteEventId && isManagedFlow;
    const managedOrganizer = isManagedFlow ? await _getMyClaimedOrganizer() : null;
    const myVenue = isManagedFlow ? await _getMyVenue().catch(() => null) : null;

    if (targetInviteEventId && !_editingEventId) {
      await _supaFetch('/rest/v1/invites', {
        method: 'POST',
        body: JSON.stringify({
          event_id: targetInviteEventId,
          creator_id: getUser()?.id,
          title,
          description: desc || null,
          spots_total: spots || 1,
          vibe_tags: vibeTags,
          status: 'open'
        })
      });
      await _createPlanRecord({
        title,
        description: desc,
        category,
        city: city || getUser()?.city || 'Novi Sad',
        location,
        startsAt: null,
        spots,
        sourceUrl,
        eventId: targetInviteEventId,
        organizerId: null,
        venueId: null
      });
      showToast('Poziv je objavljen unutar događaja', 'success');
      resetCreateForm();
      await loadEventInvites(targetInviteEventId);
      await loadMyProfile();
      if (typeof openEventById === 'function') {
        await openEventById(targetInviteEventId);
      } else {
        nav('event');
      }
      return;
    }

    const startsAt = time ? `${date}T${time}:00` : `${date}T20:00:00`;
    if (isManagedCreate && !_editingEventId) {
      const duplicateCandidates = _findCreateDuplicateCandidates({
        title,
        location,
        date: startsAt,
        organizerId: managedOrganizer?.id || null
      });
      if (duplicateCandidates.length) {
        const duplicateSummary = duplicateCandidates
          .map(item => `• ${item.title || 'Događaj'}${item.meta ? ` (${item.meta})` : ''}`)
          .join('\n');
        const shouldContinue = window.confirm(
          `Već postoje slični događaji:\n\n${duplicateSummary}\n\nKlikni OK samo ako želiš da ipak objaviš novi događaj.`
        );
        if (!shouldContinue) return;
      }
    }
    const payload = {
      creator_id:    getUser()?.id,
      title,
      category:      category.toLowerCase(),
      city:          city || getUser()?.city || 'Novi Sad',
      location_name: location || null,
      starts_at:     startsAt,
      description:   desc || null,
      capacity:      spots,
      is_published:  true
    };
    if (isManagedFlow) {
      if (managedOrganizer?.id) payload.organizer_id = managedOrganizer.id;
      if (myVenue?.id) payload.venue_id = myVenue.id;
    } else if (selectedContextOrganizerId) {
      payload.organizer_id = selectedContextOrganizerId;
    }

    let event;
    if (_editingEventId) {
      const updated = await _supaFetch(`/rest/v1/events?id=eq.${_editingEventId}&creator_id=eq.${getUser()?.id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(payload)
      });
      event = Array.isArray(updated) ? updated[0] : updated;
      if (!event?.id) throw new Error('Događaj nije izmenjen');
      if (!isManagedFlow) {
        try {
          await _supaFetch(`/rest/v1/invites?event_id=eq.${event.id}&creator_id=eq.${getUser()?.id}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              title,
              description: desc || null,
              spots_total: spots || 1,
              vibe_tags: vibeTags
            })
          });
        } catch(e) {
          console.warn('[mitmi] update related invites:', e.message);
        }
      }
    } else {
      const eventRes = await _supaFetch('/rest/v1/events', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(payload)
      });
      event = Array.isArray(eventRes) ? eventRes[0] : eventRes;
      if (!event?.id) throw new Error('Event nije kreiran');
      if (!isManagedFlow) {
        await _supaFetch('/rest/v1/invites', {
          method: 'POST',
          body: JSON.stringify({
            event_id:    event.id,
            creator_id:  getUser()?.id,
            title,
            description: desc || null,
            spots_total: spots || 1,
            vibe_tags: vibeTags,
            status:      'open'
          })
        });
      }
      if (_createFlowMode === 'social') {
        await _createPlanRecord({
          title,
          description: desc,
          category,
          city: city || getUser()?.city || 'Novi Sad',
          location,
          startsAt,
          spots,
          sourceUrl,
          eventId: selectedContextEventId || null,
          organizerId: selectedContextOrganizerId || null,
          venueId: null
        });
      }
    }

    if (_pendingEventCover) {
      try {
        const persistedCover = (typeof _persistEventCover === 'function')
          ? await _persistEventCover(event.id, _pendingEventCover)
          : _pendingEventCover;
        _setEventCover(event.id, persistedCover);
        event.cover_url = persistedCover;
      } catch (coverErr) {
        console.warn('[mitmi] persist event cover:', coverErr.message);
        _setEventCover(event.id, _pendingEventCover);
        event.cover_url = _pendingEventCover;
      }
    }
    if (!_pendingEventCover) {
      _clearEventCover(event.id);
      if (typeof _clearPersistedEventCover === 'function') {
        try { await _clearPersistedEventCover(event.id); } catch (coverErr) {
          console.warn('[mitmi] clear event cover:', coverErr.message);
        }
      }
      event.cover_url = null;
    }

    const mapped = _mapDbEventToCard({
      ...event,
      ...payload
    });
    _syncEventCollections(mapped);
    _currentEventId = event.id;

    if (_editingEventId) {
      showToast('Događaj je ažuriran', 'success');
      resetCreateForm();
      await loadMyProfile();
      renderEventDetail(mapped);
      nav('event');
      return;
    }

    const isStandaloneSocialCreate = !_editingEventId && !_inviteEventId && _createFlowMode === 'social';

    showToast(
      isManagedCreate ? 'Događaj je objavljen' : (isStandaloneSocialCreate ? 'Plan je objavljen' : 'Poziv je objavljen'),
      'success'
    );
    resetCreateForm();
    await loadMyProfile();
    openUnifiedHub('events', 0);
    setTimeout(() => {
      const searchInput = document.getElementById('browse-search');
      if (searchInput) searchInput.value = title;
      doSearch(title);
      showToast(
        isManagedCreate
          ? 'Novi događaj je dodat u pretragu događaja'
          : (isStandaloneSocialCreate ? 'Novi plan je dodat u Istraži' : 'Poziv je dodat uz događaj'),
        'info',
        2200
      );
    }, 60);

  } catch(e) {
    console.error('[mitmi] handleCreateInvite:', e);
    showToast('Greška pri objavljivanju, pokušaj ponovo', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      if (_editingEventId) {
        btn.textContent = 'Sačuvaj izmene';
      } else if (_createFlowMode === 'managed') {
        btn.textContent = 'Objavi događaj';
      } else if (_createFlowMode === 'suggest') {
        btn.textContent = 'Pošalji predlog';
      } else {
        btn.textContent = 'Objavi plan';
      }
    }
  }
}

// --- handleReport — pravi Supabase insert ---
async function handleReport() {
  if (!isLoggedIn()) { nav('login'); return; }
  const reasonEl = document.getElementById('report-reason');
  const detailsEl = document.getElementById('report-details');
  const rawReason = reasonEl?.value || 'Ostalo';
  const reason = String(rawReason).toLowerCase().replace(/\s+/g, '_');
  const details = detailsEl?.value?.trim() || null;
  const contextType = _reportContext.type || 'profile';
  const entityType = contextType === 'venue' ? 'organizer' : (contextType === 'issue' ? 'report' : contextType);
  const entityId =
    contextType === 'profile' ? _reportContext.profileId :
    contextType === 'venue' ? _reportContext.venueId :
    contextType === 'event' ? _reportContext.eventId :
    null;

  try {
    if (_isSupabaseConfigured() && entityId) {
      await _supaFetch('/rest/v1/rpc/submit_report', {
        method: 'POST',
        body: JSON.stringify({
          p_entity_type: entityType,
          p_entity_id: entityId,
          p_reason: reason,
          p_message: details
        })
      });
    } else {
      const created = await _supaFetch('/rest/v1/reports', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          reporter_id: getUser()?.id,
          reason,
          message: details,
          entity_type: entityType,
          entity_id: null,
          resolved: false,
          status: 'open'
        })
      });
      const report = Array.isArray(created) ? created[0] : created;
      if (report?.id) {
        await _supaFetch('/rest/v1/rpc/create_moderation_item', {
          method: 'POST',
          body: JSON.stringify({
            p_entity_type: 'report',
            p_entity_id: report.id,
            p_reason: reason,
            p_source_type: 'user',
            p_priority: contextType === 'issue' ? 1 : 2,
            p_report_id: report.id,
            p_metadata: {
              label: _reportContext.label || 'mitmi app',
              message: details,
              context_type: contextType,
              category: contextType === 'issue' ? 'bug_report' : 'user_report'
            }
          })
        });
      }
    }
    showToast(contextType === 'issue' ? 'Bag je poslat timu' : 'Prijava poslata', 'success');
  } catch(e) {
    console.warn('[mitmi] handleReport:', e.message);
    showToast(contextType === 'issue' ? 'Greška pri slanju baga' : 'Greška pri slanju prijave', 'error');
  }
  navBack();
}

// --- enterApp (za 1a login placeholder) ---
function enterApp() { handleLogin(); }
