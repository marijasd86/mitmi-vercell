(async function init() {
  window.safeLandingNav = function safeLandingNav(id) {
    try {
      if (typeof nav === 'function') {
        nav(id);
        return;
      }
    } catch (err) {
      console.error('[mitmi] safeLandingNav fallback:', err);
    }

    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const target = document.getElementById(`page-${id}`);
    if (target) target.classList.add('active');
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) {
      const hideNav = ['landing','login','register','onboarding','venue-onboarding'].includes(id);
      const loggedIn = typeof isLoggedIn === 'function' ? isLoggedIn() : false;
      bottomNav.classList.toggle('show', loggedIn && !hideNav);
    }
    window.scrollTo(0, 0);
  };

  ['city-picker-overlay','mod-overlay','cancel-overlay','create-entry-overlay'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const lang = typeof getCurrentLang === 'function'
    ? getCurrentLang()
    : (localStorage.getItem('mitmi_lang') || window.curLang || 'sr');
  const btn = document.querySelector(`.lbtn[onclick*="${lang}"]`);
  if (btn) {
    document.querySelectorAll('.lbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  applyLang(lang);

  const redirected = typeof _consumeAuthRedirectSession === 'function'
    ? _consumeAuthRedirectSession()
    : false;
  const restored = redirected || _restoreSession();
  if (restored && isLoggedIn()) {
    if (typeof _hydrateCurrentUserFromAuth === 'function' && !getUser()?.id) {
      await _hydrateCurrentUserFromAuth();
    }
    if (typeof loadUserPrefs === 'function') {
      await loadUserPrefs().catch(() => {});
    }

    const postAuthTarget = typeof _consumePostAuthTarget === 'function'
      ? _consumePostAuthTarget()
      : '';
    if (postAuthTarget === 'password-security') {
      nav('password-security');
      return;
    }

    let role = typeof _resolveCurrentRole === 'function'
      ? _resolveCurrentRole()
      : (getUser()?.user_metadata?.role || getUser()?.user_role || 'user');
    let profile = null;
    try {
      profile = await loadMyProfile();
      if (typeof _resolveCurrentRole === 'function') {
        role = _resolveCurrentRole(profile);
      } else {
        role = profile?.role || role;
      }
    } catch (profileErr) {
      console.warn('[mitmi] init profile bootstrap warning:', profileErr);
    }
    if (typeof _routeAfterAuth === 'function') {
      _routeAfterAuth(profile, role);
    } else {
      _goToRoleHome(role);
    }
  } else {
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) bottomNav.classList.remove('show');
  }
  syncBrowseGuestActions();
  syncSettingsPreferenceUI();
  if (typeof syncAdminUI === 'function') {
    syncAdminUI();
  }
})();
