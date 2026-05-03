const USER_PREFS_KEY = 'mitmi_user_prefs';
let _userPrefsBackendState = {
  userId: null,
  loaded: false,
  prefs: {}
};

function _userPrefsStorageKey(userId = null) {
  const resolvedUserId = userId || getUser()?.id || 'guest';
  return `${USER_PREFS_KEY}_${resolvedUserId}`;
}

function _legacyUserPrefsStorageKey() {
  return USER_PREFS_KEY;
}

function _readStoredPrefs(key = '') {
  if (!key) return {};
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') || {};
  } catch (e) {
    return {};
  }
}

function _defaultUserPrefs() {
  return {
    show_location: true,
    event_visibility: 'profile',
    invite_visibility: 'profile',
    notif_events: true,
    notif_messages: true,
    notif_plans: true,
    notif_invites: true
  };
}

function _normalizeUserPrefs(nextPrefs = {}) {
  const current = _defaultUserPrefs();
  const normalized = {
    show_location: nextPrefs.show_location !== false,
    event_visibility: nextPrefs.event_visibility === 'hidden' ? 'hidden' : current.event_visibility,
    invite_visibility: nextPrefs.invite_visibility === 'hidden' ? 'hidden' : current.invite_visibility,
    plan_visibility: nextPrefs.plan_visibility === 'hidden' ? 'hidden' : (nextPrefs.plan_visibility || nextPrefs.invite_visibility || current.invite_visibility),
    notif_events: nextPrefs.notif_events !== false,
    notif_messages: nextPrefs.notif_messages !== false,
    notif_plans: nextPrefs.notif_plans !== false,
    notif_invites: nextPrefs.notif_invites !== false
  };
  if (typeof nextPrefs.notif_plans === 'boolean' && typeof nextPrefs.notif_invites !== 'boolean') {
    normalized.notif_invites = nextPrefs.notif_plans;
  }
  if (typeof nextPrefs.notif_invites === 'boolean' && typeof nextPrefs.notif_plans !== 'boolean') {
    normalized.notif_plans = nextPrefs.notif_invites;
  }
  return normalized;
}

function _setUserPrefsBackendCache(prefs = {}, userId = null) {
  _userPrefsBackendState = {
    userId: userId || getUser()?.id || null,
    loaded: true,
    prefs: _normalizeUserPrefs(prefs)
  };
}

function _getUserPrefs() {
  const scopedKey = _userPrefsStorageKey();
  const scopedPrefs = _readStoredPrefs(scopedKey);
  const legacyPrefs = _readStoredPrefs(_legacyUserPrefsStorageKey());

  if (!Object.keys(scopedPrefs).length && Object.keys(legacyPrefs).length) {
    try {
      localStorage.setItem(scopedKey, JSON.stringify({
        ...legacyPrefs,
        ...scopedPrefs
      }));
    } catch (e) {}
  }

  return {
    ..._defaultUserPrefs(),
    ...(_userPrefsBackendState.userId === (getUser()?.id || null) ? _userPrefsBackendState.prefs : {}),
    ...legacyPrefs,
    ...scopedPrefs
  };
}

async function loadUserPrefs({ force = false } = {}) {
  const userId = getUser()?.id || null;
  if (!userId || !_isSupabaseConfigured()) {
    return _getUserPrefs();
  }
  if (!force && _userPrefsBackendState.loaded && _userPrefsBackendState.userId === userId) {
    return _getUserPrefs();
  }
  try {
    const rows = await _supaGet('user_settings', {
      id: `eq.${userId}`,
      select: 'id,show_location,event_visibility,invite_visibility,plan_visibility,notif_events,notif_messages,notif_plans,notif_invites',
      limit: '1'
    });
    const backendPrefs = Array.isArray(rows) ? (rows[0] || {}) : {};
    _setUserPrefsBackendCache(backendPrefs, userId);
    syncSettingsPreferenceUI();
    return _getUserPrefs();
  } catch (e) {
    console.warn('[svita] loadUserPrefs:', e?.message || e);
    _userPrefsBackendState = {
      userId,
      loaded: true,
      prefs: {}
    };
    return _getUserPrefs();
  }
}

async function _saveUserPrefs(nextPrefs = {}) {
  const prefs = _normalizeUserPrefs({ ..._getUserPrefs(), ...nextPrefs });
  try {
    localStorage.setItem(_userPrefsStorageKey(), JSON.stringify(prefs));
  } catch (e) {}
  _setUserPrefsBackendCache(prefs);
  syncSettingsPreferenceUI();
  _renderMyProfile(getUser() || {});

  if (isLoggedIn() && _isSupabaseConfigured()) {
    try {
      const rows = await _supaFetch('/rest/v1/user_settings', {
        method: 'POST',
        headers: {
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify({
          id: getUser()?.id,
          ...prefs
        })
      });
      const saved = Array.isArray(rows) ? (rows[0] || prefs) : prefs;
      _setUserPrefsBackendCache(saved);
    } catch (e) {
      console.warn('[svita] saveUserPrefs backend fallback:', e?.message || e);
    }
  }
  return prefs;
}

function _profileVisibilityLabel(value) {
  return value === 'public'
    ? _langText('Javno', 'Public')
    : _langText('Samo prijavljeni korisnici', 'Signed-in users only');
}

function _planVisibilityValue(prefs = {}) {
  return prefs.plan_visibility || prefs.invite_visibility || 'profile';
}

function _planVisibilityLabel(value) {
  return value === 'hidden'
    ? _langText('Skriveno sa profila', 'Hidden from profile')
    : _langText('Vidljivo na profilu', 'Visible on profile');
}

function _planNotificationValue(prefs = {}) {
  if (typeof prefs.notif_plans === 'boolean') return prefs.notif_plans;
  return prefs.notif_invites !== false;
}

function _eventVisibilityLabel(value) {
  return value === 'hidden'
    ? _langText('Skriveno sa profila', 'Hidden from profile')
    : _langText('Vidljivo na profilu', 'Visible on profile');
}

async function toggleUserPref(key, btnEl) {
  const current = _getUserPrefs();
  const nextValue = !current[key];
  if (btnEl) btnEl.classList.toggle('on', nextValue);
  if (key === 'notif_plans') {
    await _saveUserPrefs({ notif_plans: nextValue, notif_invites: nextValue });
    return;
  }
  await _saveUserPrefs({ [key]: nextValue });
}

async function cycleProfileVisibility() {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  const current = getUser()?.profile_visibility || 'registered';
  const nextValue = current === 'registered' ? 'public' : 'registered';
  try {
    const profile = await _upsertMyProfile({ profile_visibility: nextValue });
    _renderMyProfile(profile);
    showToast(
      nextValue === 'public'
        ? _langText('Profil je sada javan', 'Your profile is now public')
        : _langText('Profil vide samo prijavljeni korisnici', 'Only signed-in users can see your profile'),
      'info',
      1800
    );
  } catch (e) {
    console.warn('[svita] cycleProfileVisibility:', e?.message || e);
    showToast(_langText('Promena vidljivosti profila trenutno nije uspela', 'Changing profile visibility failed right now'), 'error', 2000);
  }
}

async function cyclePlanVisibility() {
  const current = _getUserPrefs();
  const nextValue = _planVisibilityValue(current) === 'profile' ? 'hidden' : 'profile';
  await _saveUserPrefs({ invite_visibility: nextValue, plan_visibility: nextValue });
  showToast(
    nextValue === 'hidden'
      ? _langText('Planovi su sakriveni sa profila', 'Plans are hidden from your profile')
      : _langText('Planovi su vidljivi na profilu', 'Plans are visible on your profile'),
    'info',
    1800
  );
}

const cycleInviteVisibility = cyclePlanVisibility;

async function cycleEventVisibility() {
  const current = _getUserPrefs();
  const nextValue = current.event_visibility === 'profile' ? 'hidden' : 'profile';
  await _saveUserPrefs({ event_visibility: nextValue });
  showToast(
    nextValue === 'hidden'
      ? _langText('Događaji su sakriveni sa profila', 'Events are hidden from your profile')
      : _langText('Događaji su vidljivi na profilu', 'Events are visible on your profile'),
    'info',
    1800
  );
}

function syncSettingsPreferenceUI() {
  const prefs = _getUserPrefs();
  const toggleMap = [
    ['pref-toggle-location', prefs.show_location],
    ['pref-toggle-events', prefs.notif_events],
    ['pref-toggle-messages', prefs.notif_messages],
    ['pref-toggle-plans', _planNotificationValue(prefs)]
  ];
  toggleMap.forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', !!value);
  });

  const profileVis = document.getElementById('settings-profile-visibility');
  const eventVis = document.getElementById('settings-event-visibility');
  const planVis = document.getElementById('settings-plan-visibility');
  const locationState = document.getElementById('profile-location-state');
  const locationText = document.getElementById('settings-location-copy');
  const eventsTab = document.getElementById('profile-events-tab');
  const eventsPane = document.getElementById('pt1');
  const planTab = document.getElementById('profile-plans-tab');
  const planPane = document.getElementById('pt4');
  const activeEventsTab = eventsTab?.classList.contains('active');
  const activePlanTab = planTab?.classList.contains('active');
  const profileVisibility = getUser()?.profile_visibility || 'registered';
  const planVisibility = _planVisibilityValue(prefs);

  if (profileVis) profileVis.textContent = _profileVisibilityLabel(profileVisibility);
  if (eventVis) eventVis.textContent = _eventVisibilityLabel(prefs.event_visibility);
  if (planVis) planVis.textContent = _planVisibilityLabel(planVisibility);
  if (locationState) locationState.textContent = prefs.show_location ? _langText('Prikazano', 'Shown') : _langText('Skriveno', 'Hidden');
  if (locationText) {
    locationText.textContent = prefs.show_location
      ? _langText('Prikazuje se samo okvirni grad', 'Only your approximate city is shown')
      : _langText('Lokacija je sakrivena na profilu', 'Location is hidden on your profile');
  }
  if (eventsTab) eventsTab.style.display = prefs.event_visibility === 'hidden' ? 'none' : '';
  if (eventsPane && prefs.event_visibility === 'hidden') {
    eventsPane.classList.remove('active');
    if (activeEventsTab) {
      const fallbackTab = planTab && planVisibility !== 'hidden'
        ? planTab
        : document.querySelector('#page-profile .prof-tabs .ptab:not([style*="display: none"])');
      const fallbackPane = fallbackTab?.id === 'profile-plans-tab'
        ? document.getElementById('pt4')
        : document.getElementById('pt3');
      if (fallbackTab && fallbackPane) switchPTab(fallbackTab, fallbackPane.id);
    }
  }
  if (planTab) planTab.style.display = planVisibility === 'hidden' ? 'none' : '';
  if (planPane && planVisibility === 'hidden') {
    planPane.classList.remove('active');
    if (activePlanTab) {
      const firstTab = document.querySelector('#page-profile .prof-tabs .ptab');
      if (firstTab) switchPTab(firstTab, 'pt1');
    }
  }
}

async function closeMyAccount() {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }

  const confirmed = typeof appConfirm === 'function'
    ? await appConfirm(
        'Da li si sigurna da želiš da zatvoriš nalog? Tvoj profil će biti uklonjen iz javnog prikaza, a bićeš odjavljena iz aplikacije.',
        'Are you sure you want to close your account? Your profile will be removed from public view and you will be signed out.'
      )
    : true;
  if (!confirmed) return;

  const secondConfirm = typeof appConfirm === 'function'
    ? await appConfirm(
        'Potvrdi zatvaranje naloga. Aktivne objave će biti zatvorene, a ocene i istorija potrebni za bezbednost i reputaciju ostaće sačuvani.',
        'Please confirm account closure. Active posts will be closed, while safety and reputation history will be retained.'
      )
    : true;
  if (!secondConfirm) return;

  try {
    await _supaFetch('/rest/v1/rpc/close_my_account', {
      method: 'POST',
      body: JSON.stringify({})
    });
    _clearCache();
    showToast('Nalog je zatvoren', 'success', 2200);
    _storePendingAuthNotice({
      type: 'info',
      message: 'Tvoj nalog je zatvoren. Ako budeš želela povratak, biće potreban novi nalog ili ručna obnova.'
    });
    await handleLogout();
  } catch (e) {
    console.warn('[svita] closeMyAccount:', e.message);
    showToast('Zatvaranje naloga trenutno nije uspelo', 'error', 2200);
  }
}
