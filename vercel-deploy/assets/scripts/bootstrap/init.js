(async function init() {
  function wireCreateSubmitFallback() {
    const btn = document.getElementById('create-submit-btn');
    if (!btn || btn.dataset.mitmiCreateBound === '1') return;
    const inlineHandler = String(btn.getAttribute('onclick') || '').trim();
    if (inlineHandler.includes('submitCreateFromUi')) return;
    btn.dataset.mitmiCreateBound = '1';
    btn.addEventListener('click', (event) => {
      if (event?.defaultPrevented) return;
      event.preventDefault();
      if (typeof submitCreateFromUi !== 'function') {
        if (typeof showToast === 'function') {
          showToast('Objava trenutno nije dostupna jer forma nije potpuno učitana. Osveži stranicu.', 'error', 3600);
        }
        return;
      }
      Promise.resolve(submitCreateFromUi()).catch((err) => {
        const message = String(err?.message || err || 'Objava trenutno nije uspela.');
        if (typeof showToast === 'function') {
          showToast(`Objava nije uspela: ${message}`, 'error', 3600);
        }
      });
    });
  }

  if (!window.__mitmiGlobalErrorGuardInstalled) {
    window.__mitmiGlobalErrorGuardInstalled = true;
    window.addEventListener('error', (event) => {
      try {
        const message = String(event?.message || 'Unknown runtime error');
        console.error('[mitmi] global error:', message, event?.filename, event?.lineno, event?.colno);
        if (typeof getCurrentRole === 'function' && typeof showToast === 'function') {
          const role = getCurrentRole();
          if (role === 'admin' || role === 'venue') {
            showToast(`Greška u aplikaciji: ${message}`, 'error', 4200);
          }
        }
      } catch (_) {}
    });
    window.addEventListener('unhandledrejection', (event) => {
      try {
        const reason = event?.reason;
        const message = String(reason?.message || reason || 'Unknown async error');
        console.error('[mitmi] unhandled rejection:', reason);
        if (typeof getCurrentRole === 'function' && typeof showToast === 'function') {
          const role = getCurrentRole();
          if (role === 'admin' || role === 'venue') {
            showToast(`Async greška: ${message}`, 'error', 4200);
          }
        }
      } catch (_) {}
    });
  }

  function runRuntimeHealthChecks() {
    const requiredGlobals = [
      'openCreateEvent',
      'submitCreateFromUi',
      'handleCreatePlan',
      'renderCreateOrganizerSuggestions',
      'toggleCreateVibe',
      'handleCreateCover',
      'clearCreateCover',
      'renderAdminDrafts',
      'loadAdminDraftQueueFromBackend',
      'openOrganizerReview',
      'simulateAiImport'
    ];
    const missing = requiredGlobals.filter((name) => typeof window[name] !== 'function');
    window.__mitmiHealth = {
      ok: missing.length === 0,
      missingGlobals: missing
    };
    if (!missing.length) return;

    console.error('[mitmi] runtime health check failed. Missing globals:', missing);
    const role = typeof getCurrentRole === 'function' ? getCurrentRole() : 'user';
    if ((role === 'admin' || role === 'venue') && typeof showToast === 'function') {
      showToast(`Aplikacija nije potpuno učitana (${missing.length} modula). Osveži stranicu.`, 'error', 4200);
    }
  }

  async function runBackendHealthChecks() {
    if (typeof isLoggedIn !== 'function' || !isLoggedIn()) return;
    if (typeof getCurrentRole !== 'function' || getCurrentRole() !== 'admin') return;
    if (typeof _isSupabaseConfigured !== 'function' || !_isSupabaseConfigured()) return;
    if (typeof _supaGet !== 'function') return;
    const onceKey = 'mitmi_backend_health_checked_v3';
    try {
      if (sessionStorage.getItem(onceKey) === '1') return;
      sessionStorage.setItem(onceKey, '1');
    } catch (_) {}

    const failed = [];
    try {
      await _supaGet('events', {
        select: 'id,ticket_price_rsd,public_address,is_hidden',
        limit: '1'
      });
    } catch (e) {
      failed.push('events columns (ticket_price_rsd/public_address/is_hidden)');
    }
    try {
      await _supaGet('chats', {
        select: 'id,direct_pair_key',
        limit: '1'
      });
    } catch (e) {
      failed.push('chats.direct_pair_key');
    }
    try {
      await _supaGet('event_drafts', {
        select: 'id,starts_at,review_status,raw_payload',
        limit: '1'
      });
    } catch (e) {
      failed.push('event_drafts columns (starts_at/review_status/raw_payload)');
    }

    if (!failed.length) return;
    const message = `Backend schema mismatch: ${failed.join(', ')}`;
    console.error('[mitmi] backend health check failed:', failed);
    if (typeof showToast === 'function') {
      showToast(message, 'error', 5200);
    }
  }

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
  wireCreateSubmitFallback();

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
  runRuntimeHealthChecks();
  runBackendHealthChecks().catch(() => {});
})();
