function _applyProfileToSession(profile = {}) {
  if (!_session) return;
  const nextUser = {
    ...(_session.user || {}),
    id: profile.id ?? _session.user?.id ?? _session.user_id,
    email: _profileEmail() || _session.user?.email || null,
    city: profile.city ?? _session.user?.city ?? null,
    username: profile.username ?? _session.user?.username ?? null,
    display_name: profile.display_name ?? _session.user?.display_name ?? null,
    bio: profile.bio ?? _session.user?.bio ?? null,
    avatar_url: profile.avatar_url ?? _session.user?.avatar_url ?? null,
    gender: profile.gender ?? _session.user?.gender ?? null,
    birth_year: profile.birth_year ?? _session.user?.birth_year ?? null,
    interests: _normalizeProfileInterests(profile.interests ?? _session.user?.interests ?? []),
    social_tempo: _normalizeSocialTempo(profile.social_tempo ?? _session.user?.social_tempo ?? 'povremeno'),
    profile_visibility: profile.profile_visibility ?? _session.user?.profile_visibility ?? 'registered',
    status: profile.status ?? _session.user?.status ?? null,
    avg_rating: profile.avg_rating ?? _session.user?.avg_rating ?? 0,
    rating_count: profile.rating_count ?? _session.user?.rating_count ?? 0,
    user_role: profile.role ?? _session.user?.user_role ?? _session.user_role ?? 'user',
    user_metadata: {
      ...(_session.user?.user_metadata || {}),
      role: profile.role ?? _session.user?.user_metadata?.role ?? _session.user_role ?? 'user',
      gender: profile.gender ?? _session.user?.user_metadata?.gender ?? null,
      birth_year: profile.birth_year ?? _session.user?.user_metadata?.birth_year ?? null,
      interests: _normalizeProfileInterests(profile.interests ?? _session.user?.user_metadata?.interests ?? []),
      social_tempo: _normalizeSocialTempo(profile.social_tempo ?? _session.user?.user_metadata?.social_tempo ?? 'povremeno'),
      profile_visibility: profile.profile_visibility ?? _session.user?.user_metadata?.profile_visibility ?? 'registered'
    }
  };
  _saveSession({
    ..._session,
    user: nextUser
  });
}

function _mergeProfileWithSession(profile = null) {
  const sessionUser = getUser() || {};
  const source = profile || {};
  return {
    ...sessionUser,
    ...source,
    city: source.city ?? sessionUser.city ?? '',
    username: source.username ?? sessionUser.username ?? '',
    display_name: source.display_name ?? sessionUser.display_name ?? '',
    bio: source.bio ?? sessionUser.bio ?? '',
    avatar_url: source.avatar_url ?? sessionUser.avatar_url ?? '',
    gender: source.gender ?? sessionUser.gender ?? 'unspecified',
    birth_year: source.birth_year ?? sessionUser.birth_year ?? null,
    interests: source.interests ?? sessionUser.interests ?? [],
    social_tempo: source.social_tempo ?? sessionUser.social_tempo ?? 'povremeno',
    profile_visibility: source.profile_visibility ?? sessionUser.profile_visibility ?? 'registered',
    role: source.role ?? sessionUser.user_role ?? sessionUser.role ?? 'user'
  };
}

async function _getMyProfile() {
  if (!isLoggedIn()) return null;
  const cached = _getCached('profile', getUser()?.id || 'guest');
  if (cached) return cached;
  const rows = await _supaGet('profiles', {
    id: `eq.${getUser()?.id}`,
    select: 'id,username,display_name,city,bio,avatar_url,gender,birth_year,interests,social_tempo,profile_visibility,role,status,avg_rating,rating_count',
    limit: '1'
  });
  const profile = Array.isArray(rows) ? (rows[0] || null) : null;
  if (profile) _setCached('profile', getUser()?.id || 'guest', profile, CACHE_TTL.profile);
  return profile;
}

async function _upsertMyProfile(profileFields = {}) {
  if (!isLoggedIn()) throw new Error('Moraš biti prijavljen/a');
  const currentProfile = await _getMyProfile().catch(() => null);
  const merged = _mergeProfileWithSession(currentProfile);
  const email = _profileEmail();
  const displayName = (profileFields.display_name ?? merged.display_name ?? '').trim() || _deriveDisplayName(email);
  const usernameSeed = (profileFields.username ?? merged.username ?? displayName ?? email ?? 'mitmi_user');
  const username = _defaultUsername(usernameSeed);
  const resolvedBirthYear = profileFields.birth_year !== undefined
    ? _normalizeBirthYear(profileFields.birth_year)
    : (merged.birth_year ?? null);
  const resolvedInterests = profileFields.interests !== undefined
    ? _normalizeProfileInterests(profileFields.interests)
    : _normalizeProfileInterests(merged.interests || []);
  const resolvedSocialTempo = profileFields.social_tempo !== undefined
    ? _normalizeSocialTempo(profileFields.social_tempo)
    : _normalizeSocialTempo(merged.social_tempo || 'povremeno');
  const payload = {
    id: getUser()?.id,
    username,
    display_name: displayName,
    city: profileFields.city ?? merged.city ?? '',
    bio: profileFields.bio ?? merged.bio ?? '',
    avatar_url: profileFields.avatar_url ?? merged.avatar_url ?? null,
    gender: profileFields.gender ?? merged.gender ?? 'unspecified',
    birth_year: resolvedBirthYear,
    interests: resolvedInterests,
    social_tempo: resolvedSocialTempo,
    profile_visibility: profileFields.profile_visibility ?? merged.profile_visibility ?? 'registered',
    role: profileFields.role ?? merged.role ?? 'user'
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

function _normalizeBirthYear(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const year = Number(raw);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(year)) return null;
  if (year < 1940 || year > currentYear - 18) return null;
  return year;
}

function _syncBirthYearInputBounds() {
  const maxYear = new Date().getFullYear() - 18;
  ['reg-birth-year', 'ob-birth-year', 'edit-profile-birth-year'].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.setAttribute('max', String(maxYear));
  });
}

const PROFILE_INTEREST_OPTIONS = ['koncerti_klubovi', 'kafane_barovi', 'kultura', 'sport', 'mirnija_druzenja'];

function _normalizeProfileInterests(values) {
  const list = Array.isArray(values) ? values : [];
  return Array.from(new Set(
    list
      .map((item) => String(item || '').trim())
      .filter((item) => PROFILE_INTEREST_OPTIONS.includes(item))
  ));
}

function _normalizeSocialTempo(value) {
  const tempo = String(value || '').trim().toLowerCase();
  return ['retko', 'povremeno', 'cesto'].includes(tempo) ? tempo : 'povremeno';
}

function _socialTempoLabel(value = '') {
  const tempo = _normalizeSocialTempo(value);
  if (tempo === 'retko') return _langText('Retko izlazim', 'Rarely go out');
  if (tempo === 'cesto') return _langText('Često sam za plan', 'Often up for plans');
  return _langText('Povremeno izlazim', 'Sometimes go out');
}

function _interestLabel(value = '') {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'koncerti_klubovi') return _langText('Koncerti i klubovi', 'Concerts and clubs');
  if (key === 'kafane_barovi') return _langText('Kafane i barovi', 'Bars and nightlife');
  if (key === 'kultura') return _langText('Kultura', 'Culture');
  if (key === 'sport') return _langText('Sport i rekreacija', 'Sports and recreation');
  if (key === 'mirnija_druzenja') return _langText('Mirnija druženja', 'Low-key hangouts');
  return key;
}

function _renderProfileBasicsSummary(profile = null) {
  const shell = document.getElementById('profile-basics-summary');
  if (!shell) return;
  const data = profile || {};
  const birthYear = data.birth_year || data.user_metadata?.birth_year || '';
  const interests = _normalizeProfileInterests(data.interests || data.user_metadata?.interests || []);
  const socialTempo = String(data.social_tempo || data.user_metadata?.social_tempo || '').trim();
  const items = [];
  if (birthYear) items.push(`Godište ${birthYear}`);
  if (socialTempo) items.push(_socialTempoLabel(socialTempo));
  if (interests.length) items.push(interests.slice(0, 2).map(_interestLabel).join(' · '));
  shell.style.display = items.length ? 'flex' : 'none';
  shell.innerHTML = items
    .slice(0, 3)
    .map((item) => `<span class="tag tag-outline">${_escHtml(item)}</span>`)
    .join('');
}

function _setInterestSelectionState(containerId, values = []) {
  const selected = new Set(_normalizeProfileInterests(values));
  document.querySelectorAll(`#${containerId} .int-item`).forEach((item) => {
    item.classList.toggle('sel', selected.has(item.getAttribute('data-interest')));
  });
}

function _collectInterestSelection(containerId) {
  return _normalizeProfileInterests(
    Array.from(document.querySelectorAll(`#${containerId} .int-item.sel`))
      .map((item) => item.getAttribute('data-interest'))
  );
}

function toggleProfileInterest(el) {
  if (!el) return;
  el.classList.toggle('sel');
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
  const signals = [];
  if (username) signals.push(`<div class="soc-chip">👤 ${_escHtml(username)}</div>`);
  if (profile.city) signals.push(`<div class="soc-chip">📍 ${_escHtml(profile.city)}</div>`);
  if (!signals.length) signals.push(`<div class="soc-chip">${_langText('mitmi profil', 'mitmi profile')}</div>`);
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
  let title = _langText('Profil je nov', 'This profile is new');
  let helper = _langText('Dodaj sliku, grad i prvi događaj da profil deluje potpunije i pouzdanije.', 'Add a photo, city, and first event so the profile feels more complete and trustworthy.');
  if (score >= 75) {
    title = _langText('Profil deluje jako pouzdano', 'This profile feels highly trustworthy');
    helper = _langText('Profil je popunjen i ima dovoljno signala poverenja.', 'The profile is filled in and has strong trust signals.');
  } else if (score >= 50) {
    title = _langText('Profil deluje pouzdano', 'This profile feels trustworthy');
    helper = _langText('Imaš dobru osnovu, još jedan ili dva signala dosta pomažu.', 'You already have a solid foundation, and one or two more signals would help a lot.');
  } else if (score >= 25) {
    title = _langText('Profil se lepo popunjava', 'The profile is coming together nicely');
    helper = _langText('Još malo sadržaja i profil će delovati mnogo jače.', 'A bit more content will make the profile feel much stronger.');
  }
  return { score, title, helper };
}

function _renderTopTrustChips(containerId, profile = {}, options = {}) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const eventsCount = Number(options.eventsCount ?? profile._events_count ?? 0);
  const ratingCount = Number(profile.rating_count || 0);
  const chips = [];
  if (options.isOwn) chips.push(`<span class="trust-badge trust-email">${_langText('✉ Email potvrđen', '✉ Email confirmed')}</span>`);
  if (profile.avatar_url) chips.push(`<span class="trust-badge trust-selfie" style="opacity:1">${_langText('🖼 Ima sliku', '🖼 Has photo')}</span>`);
  if (eventsCount > 0) chips.push(`<span class="trust-badge trust-email" style="opacity:1">${_langText(`🎟 ${eventsCount} događaja`, `🎟 ${eventsCount} events`)}</span>`);
  if (ratingCount > 0) chips.push(`<span class="trust-badge trust-email">${_langText(`★ ${ratingCount} ocena`, `★ ${ratingCount} reviews`)}</span>`);
  if (!chips.length) chips.push(`<span class="trust-badge trust-selfie" style="opacity:.8">${_langText('🌱 Nov profil', '🌱 New profile')}</span>`);
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
      ? _langText('Imaš jedan plan koji čeka tvoju ocenu.', 'You have one plan waiting for your review.')
      : _langText(`Imaš ${pending.length} planova koji čekaju tvoju ocenu.`, `You have ${pending.length} plans waiting for your review.`);
    return;
  }
  copyEl.textContent = pending.length === 1
    ? _langText('Imaš jedno iskustvo koje čeka tvoju ocenu.', 'You have one experience waiting for your review.')
    : _langText(`Imaš ${pending.length} iskustava koja čekaju tvoju ocenu.`, `You have ${pending.length} experiences waiting for your review.`);
}

function _renderMyProfile(profile = null) {
  const data = _mergeProfileWithSession(profile);
  const email = _profileEmail();
  const displayName = (data.display_name ?? '').trim() || _deriveDisplayName(email);
  const username = data.username ? '@' + data.username.replace(/^@+/, '') : '';
  const profileCode = username || '@' + _defaultUsername(displayName || email || 'mitmi');
  const bio = data.bio || _langText('Dodaj par reči o sebi da bi ljudi znali kakvo društvo tražiš.', 'Add a few words about yourself so people know what kind of company you are looking for.');
  const city = data.city || _langText('Srbija', 'Serbia');
  const prefs = _getUserPrefs();
  const profileVisibility = data.profile_visibility || getUser()?.profile_visibility || 'registered';
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
  const profileCodeEl = document.getElementById('profile-code-value');

  _renderAvatarBubble(avatar, data, _profileAvatarFallback(data));
  if (nameEl) nameEl.textContent = displayName;
  if (bioEl) bioEl.textContent = bio;
  if (emailEl) emailEl.textContent = email || _langText('Email nije dostupan', 'Email is unavailable');
  if (cityEl) cityEl.textContent = prefs.show_location ? city : _langText('Lokacija je sakrivena', 'Location is hidden');
  if (ratingEl) ratingEl.textContent = ratingCount > 0 ? rating : '0.0';
  if (ratingCountEl) ratingCountEl.textContent = ratingCount > 0
    ? _langText(`${ratingCount} ocena`, `${ratingCount} reviews`)
    : _langText('Još nema ocena', 'No reviews yet');
  if (ratingWrap) {
    ratingWrap.style.display = ratingCount > 0 ? 'flex' : 'none';
    ratingWrap.classList.toggle('is-empty', ratingCount === 0);
  }
  if (settingsSummary) settingsSummary.textContent = `${username || displayName} · ${email || _langText('bez emaila', 'no email')}`;
  if (profileCodeEl) profileCodeEl.textContent = profileCode;
  const profileVisibilityEl = document.getElementById('settings-profile-visibility');
  if (profileVisibilityEl) profileVisibilityEl.textContent = _profileVisibilityLabel(profileVisibility);
  if (ownFollowersEl) ownFollowersEl.textContent = String(data._followers_count ?? 0);
  if (ownFollowingEl) ownFollowingEl.textContent = String(data._following_count ?? 0);
  if (ownEventsEl) ownEventsEl.textContent = String(data._events_count ?? 0);

  _renderProfileBasicsSummary(data);
  _renderProfileSocials(data);
  _renderProfileTrustScore(data);
  _renderProfileReviewCard(PENDING_REVIEW_TASKS);
  _renderProfileCompletionCard(data);
  syncSettingsPreferenceUI();
  if (typeof syncAdminUI === 'function') syncAdminUI();
}

async function copyMyProfileCode() {
  const profile = _mergeProfileWithSession(await _getMyProfile().catch(() => null));
  const code = profile.username
    ? '@' + String(profile.username).replace(/^@+/, '')
    : '@' + _defaultUsername(profile.display_name || _profileEmail() || 'mitmi');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(code);
      showToast(_langText('Kod profila je kopiran', 'Profile code copied'), 'success', 1600);
      return;
    }
  } catch (e) {
    console.warn('[mitmi] copyMyProfileCode:', e.message);
  }
  showToast(code, 'info', 2200);
}

function _missingUserOnboardingFields(profile = null) {
  const source = profile || getUser() || {};
  const missing = [];
  const city = String(source.city || source.user_metadata?.city || '').trim();
  const birthYear = source.birth_year ?? source.user_metadata?.birth_year ?? null;
  const interests = Array.isArray(source.interests)
    ? source.interests
    : (Array.isArray(source.user_metadata?.interests) ? source.user_metadata.interests : []);
  const socialTempo = String(source.social_tempo || source.user_metadata?.social_tempo || '').trim();
  if (!city) missing.push(_langText('grad', 'city'));
  if (!birthYear) missing.push(_langText('godište', 'birth year'));
  if (interests.length < 3) missing.push(_langText('interesovanja', 'interests'));
  if (!socialTempo) missing.push(_langText('socijalni tempo', 'social pace'));
  return missing;
}

function _renderProfileCompletionCard(profile = null) {
  const card = document.getElementById('profile-completion-card');
  const copyEl = document.getElementById('profile-completion-copy');
  const countEl = document.getElementById('profile-completion-count');
  if (!card) return;
  const role = _resolveCurrentRole(profile);
  if (role !== 'user') {
    card.style.display = 'none';
    return;
  }
  const missing = _missingUserOnboardingFields(profile);
  card.style.display = missing.length ? '' : 'none';
  if (countEl) countEl.textContent = String(missing.length);
  if (copyEl) {
    copyEl.textContent = missing.length
      ? _langText(
          `Fali još: ${missing.join(', ')}. Dodaj ove podatke da preporuke i povezivanje budu smisleniji.`,
          `Still missing: ${missing.join(', ')}. Add these details to make recommendations and matching more useful.`
        )
      : _langText(
          'Osnovni onboarding podaci su popunjeni.',
          'Your core onboarding details are complete.'
        );
  }
}

function _syncAccountCompletionUI(profile = null, organizer = null) {
  const onboardingRow = document.getElementById('settings-onboarding-row');
  const onboardingStatus = document.getElementById('settings-onboarding-status');
  const organizerRow = document.getElementById('settings-organizer-row');
  const organizerStatus = document.getElementById('settings-organizer-status');
  const role = _resolveCurrentRole(profile);

  if (onboardingRow) {
    if (role === 'user') {
      const missing = _missingUserOnboardingFields(profile);
      onboardingRow.style.display = '';
      if (onboardingStatus) {
        onboardingStatus.textContent = missing.length
          ? _langText(`Fali još: ${missing.join(', ')}`, `Still missing: ${missing.join(', ')}`)
          : _langText('Grad, godište i preference su kompletirani', 'City, birth year and preferences are complete');
      }
    } else {
      onboardingRow.style.display = 'none';
    }
  }

  if (organizerRow) {
    if (organizer) {
      const normalizedOrganizer = _normalizeVenueTarget(organizer);
      organizerRow.style.display = '';
      if (organizerStatus) {
        organizerStatus.textContent = [normalizedOrganizer?.venue_type, normalizedOrganizer?.city, _isOrganizerEntity(normalizedOrganizer) ? _organizerBadgeText(normalizedOrganizer?.status) : _venueBadgeText(normalizedOrganizer?.status)]
          .filter(Boolean)
          .join(' · ');
      }
    } else {
      organizerRow.style.display = 'none';
    }
  }
}

function _renderProfileOrganizerSummary(venue = null) {
  const data = _normalizeVenueTarget(venue);
  const card = document.getElementById('profile-organizer-summary');
  const nameEl = document.getElementById('profile-organizer-summary-name');
  const metaEl = document.getElementById('profile-organizer-summary-meta');
  const descEl = document.getElementById('profile-organizer-summary-desc');
  const publicEl = document.getElementById('profile-organizer-summary-public');
  if (!card) return;

  if (!data) {
    card.style.display = 'none';
    if (publicEl) {
      publicEl.style.display = 'none';
      publicEl.innerHTML = '';
    }
    return;
  }

  card.style.display = '';
  if (nameEl) nameEl.textContent = data.venue_name || _langText('Organizer profil', 'Organizer profile');
  if (metaEl) {
    metaEl.textContent = [data.venue_type, data.city, _isOrganizerEntity(data) ? _organizerBadgeText(data.status) : _venueBadgeText(data.status)]
      .filter(Boolean)
      .join(' · ');
  }
  if (descEl) {
    descEl.textContent = data.description || _langText('Dodaj opis organizatora da bi profil delovao potpunije.', 'Add an organizer description to make the profile feel complete.');
  }
  if (publicEl) {
    const rows = _buildOrganizerPublicRows(data);
    publicEl.style.display = rows.length ? 'flex' : 'none';
    publicEl.innerHTML = rows.map(item => `<div style="font-size:13px;color:var(--ink3);line-height:1.5">${_escHtml(item)}</div>`).join('');
  }
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
    if (profile?.status === 'deleted') {
      _storePendingAuthNotice({
        type: 'info',
        message: 'Ovaj nalog je zatvoren.'
      });
      await handleLogout();
      return null;
    }
    profile._followers_count = await _loadFollowCount('followers', getUser()?.id);
    profile._following_count = await _loadFollowCount('following', getUser()?.id);
    const ownEvents = await loadMyCreatedEvents();
    profile._events_count = ownEvents.length;
    _renderMyProfile(profile);
    renderMyCreatedEvents(ownEvents);
    loadMyPlans().catch(() => {});
    if (_canLoadVenueDashboard(profile?.role)) {
      _getMyManagedOrganizerTarget().then(target => {
        _renderProfileOrganizerSummary(target);
        _syncAccountCompletionUI(profile, target);
      }).catch(() => {
        _renderProfileOrganizerSummary(null);
        _syncAccountCompletionUI(profile, null);
      });
      loadMyVenueDashboard().catch(() => {});
    } else {
      _renderProfileOrganizerSummary(null);
      _syncAccountCompletionUI(profile, null);
    }
    loadPublicProfileDirectory().then(() => loadMyFollowingIds()).then(() => renderFollowingProfiles()).catch(() => {});
    loadBlockedProfileIds().then(() => loadBlockedProfiles()).catch(() => {});
    loadFollowedEvents().catch(() => {});
    loadPendingReviewTasks({ sync: true, render: false }).then(tasks => _renderProfileReviewCard(tasks)).catch(() => {});
    if (typeof syncAdminUI === 'function') syncAdminUI();
    return profile;
  } catch (e) {
    console.warn('[mitmi] loadMyProfile:', e.message);
    _renderMyProfile({});
    _renderProfileOrganizerSummary(null);
    _syncAccountCompletionUI(null, null);
    renderMyCreatedEvents([]);
    if (typeof syncAdminUI === 'function') syncAdminUI();
    return null;
  }
}

async function loadEditProfileForm() {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  const profile = await _getMyProfile().catch(() => null);
  const user = _mergeProfileWithSession(profile);
  const displayName = user.display_name || _deriveDisplayName(_profileEmail());
  const username = user.username || _defaultUsername(displayName || _profileEmail());
  const bio = user.bio || '';
  const city = user.city || 'Srbija';
  const gender = user.gender || 'unspecified';
  const birthYear = user.birth_year || '';
  const interests = _normalizeProfileInterests(user.interests || []);
  const socialTempo = _normalizeSocialTempo(user.social_tempo || 'povremeno');
  const avatarUrl = user.avatar_url || '';

  const nameEl = document.getElementById('edit-profile-name');
  const usernameEl = document.getElementById('edit-profile-username');
  const bioEl = document.getElementById('edit-profile-bio');
  const cityEl = document.getElementById('edit-profile-city');
  const genderEl = document.getElementById('edit-profile-gender');
  const birthYearEl = document.getElementById('edit-profile-birth-year');
  const socialTempoEl = document.getElementById('edit-profile-social-tempo');
  const previewEl = document.getElementById('edit-profile-avatar-preview');
  const removeBtn = document.getElementById('edit-profile-avatar-remove');

  if (nameEl) nameEl.value = displayName;
  if (usernameEl) usernameEl.value = username;
  if (bioEl) bioEl.value = bio;
  if (cityEl) cityEl.value = city;
  if (genderEl) genderEl.value = gender;
  if (birthYearEl) birthYearEl.value = birthYear;
  if (socialTempoEl) socialTempoEl.value = socialTempo;
  _setInterestSelectionState('edit-profile-interest-grid', interests);
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
  const birthYearEl = document.getElementById('edit-profile-birth-year');
  const socialTempoEl = document.getElementById('edit-profile-social-tempo');

  const displayName = nameEl?.value?.trim() || _deriveDisplayName(_profileEmail());
  const username = _normalizeUsername(usernameEl?.value || '');
  const bio = bioEl?.value?.trim() || '';
  const city = cityEl?.value || 'Srbija';
  const gender = genderEl?.value || 'unspecified';
  const birthYear = _normalizeBirthYear(birthYearEl?.value);
  const interests = _collectInterestSelection('edit-profile-interest-grid');
  const socialTempo = _normalizeSocialTempo(socialTempoEl?.value || 'povremeno');
  const avatarUrl = document.getElementById('edit-profile-avatar-preview')?.dataset.avatarUrl || getUser()?.avatar_url || null;
  const existingProfile = await _getMyProfile().catch(() => null);
  const mergedProfile = _mergeProfileWithSession(existingProfile);
  const resolvedBirthYear = birthYearEl?.value?.trim() ? birthYear : (mergedProfile.birth_year ?? null);
  const resolvedInterests = interests.length
    ? interests
    : _normalizeProfileInterests(mergedProfile.interests || []);

  if (!displayName || displayName.length < 2) {
    showToast(_langText('Ime mora imati bar 2 karaktera', 'Name must be at least 2 characters long'), 'error');
    return;
  }
  if (!username || username.length < 3) {
    showToast(_langText('Korisničko ime mora imati bar 3 karaktera', 'Username must be at least 3 characters long'), 'error');
    return;
  }
  if (_containsRestrictedContactInfo(bio)) {
    showToast(_publicContactSafetyMessage(), 'error', 2600);
    return;
  }
  if (!city?.trim()) {
    showToast(_langText('Unesi grad', 'Enter a city'), 'error');
    return;
  }
  if (birthYearEl?.value?.trim() && !birthYear) {
    showToast(_langText('Unesi ispravno godište', 'Enter a valid birth year'), 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = _langText('Čuvam...', 'Saving...');
  }

  try {
    const profile = await _upsertMyProfile({
      display_name: displayName,
      username,
      bio,
      city,
      gender,
      birth_year: resolvedBirthYear,
      interests: resolvedInterests,
      social_tempo: socialTempo,
      avatar_url: avatarUrl,
      role: getUser()?.user_role || 'user'
    });
    try {
      localStorage.setItem(`mitmi_user_prefs_${getUser()?.id || 'guest'}`, JSON.stringify({
        interests: resolvedInterests,
        social_tempo: socialTempo
      }));
    } catch (e) {}
    ['city-label', 'home-city-display', 'browse-city-label', 'browse-home-city-label'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = city;
    });
    _browseState.city = _normalizeBrowseCityLabel(city);
    _renderMyProfile(profile);
    if (!resolvedBirthYear || resolvedInterests.length < 3) {
      showToast(
        _langText(
          'Osnovne izmene su sačuvane. Kasnije dodaj godište i još interesovanja da preporuke budu bolje.',
          'Your basic changes were saved. Add your birth year and more interests later to improve recommendations.'
        ),
        'info',
        2800
      );
    } else {
      showToast(_langText('Profil je sačuvan', 'Profile saved'), 'success');
    }
    nav('profile');
  } catch (e) {
    console.error('[mitmi] saveEditedProfile:', e);
    const msg = String(e.data?.message || e.message || '').toLowerCase();
    if (msg.includes('username')) showToast(_langText('Korisničko ime je zauzeto', 'Username is already taken'), 'error');
    else showToast(_langText('Greška pri čuvanju profila', 'Error saving profile'), 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = _langText('Sačuvaj izmene', 'Save changes');
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
    showToast(_langText('Profilna slika je dodata', 'Profile photo added'), 'success', 1500);
  } catch (e) {
    showToast(_langText('Profilna slika nije uspela da se obradi', 'Profile photo could not be processed'), 'error');
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
    showToast(_langText('Nova lozinka mora imati bar 8 karaktera', 'New password must be at least 8 characters long'), 'error');
    return;
  }
  if (nextPassword !== confirmPassword) {
    showToast(_langText('Lozinke se ne poklapaju', 'Passwords do not match'), 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = _langText('Čuvam...', 'Saving...');
  }

  try {
    await _supaFetch('/auth/v1/user', {
      method: 'PUT',
      body: JSON.stringify({ password: nextPassword })
    });
    if (nextPassEl) nextPassEl.value = '';
    if (confirmPassEl) confirmPassEl.value = '';
    showToast(_langText('Lozinka je uspešno promenjena', 'Password changed successfully'), 'success');
    nav('settings');
  } catch (e) {
    showToast(_friendlyAuthError(
      e.data?.error_description || e.message,
      _langText('Promena lozinke nije uspela.', 'Password change failed.')
    ), 'error', 2600);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = _langText('Sačuvaj lozinku', 'Save password');
    }
  }
}
