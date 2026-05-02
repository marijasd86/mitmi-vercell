(async function init() {
  let _browseInfiniteObserver = null;
  let _browseInfiniteInitialized = false;
  let _browseInfiniteWired = false;
  let _browseInfiniteTicking = false;

  function _initBrowseInfiniteScroll() {
    if (_browseInfiniteInitialized) return;
    const sentinel = document.getElementById('browse-load-more-wrap');
    if (!sentinel || !('IntersectionObserver' in window)) return;

    _browseInfiniteObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (_browseInfiniteTicking) return;
        _browseInfiniteTicking = true;
        if (typeof loadMoreBrowseEvents === 'function') {
          Promise.resolve(loadMoreBrowseEvents())
            .catch?.(() => {})
            .finally(() => {
              setTimeout(() => { _browseInfiniteTicking = false; }, 180);
            });
          return;
        }
        _browseInfiniteTicking = false;
      });
    }, { rootMargin: '200px' });

    _browseInfiniteObserver.observe(sentinel);
    _browseInfiniteInitialized = true;
  }

  function _wireBrowseInfiniteScrollAfterFirstLoad() {
    if (_browseInfiniteWired) return true;
    if (typeof loadPublishedEvents !== 'function') return false;
    const originalLoadPublishedEvents = loadPublishedEvents;
    if (typeof originalLoadPublishedEvents !== 'function') return false;

    window.loadPublishedEvents = async function loadPublishedEventsWithInfiniteScroll(...args) {
      const result = await originalLoadPublishedEvents.apply(this, args);
      _initBrowseInfiniteScroll();
      return result;
    };
    _browseInfiniteWired = true;
    return true;
  }

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
        console.error('[svita] global error:', message, event?.filename, event?.lineno, event?.colno);
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
        console.error('[svita] unhandled rejection:', reason);
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

    console.error('[svita] runtime health check failed. Missing globals:', missing);
    const role = typeof getCurrentRole === 'function' ? getCurrentRole() : 'user';
    if ((role === 'admin' || role === 'venue') && typeof showToast === 'function') {
      showToast(`Aplikacija nije potpuno učitana (${missing.length} modula). Osveži stranicu.`, 'error', 4200);
    }
  }

  function _consumeIncomingDeepLink() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const open = String(params.get('open') || '').trim().toLowerCase();
      const id = String(params.get('id') || '').trim();
      if (!open || !id) return null;
      return { open, id };
    } catch (e) {
      return null;
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
    console.error('[svita] backend health check failed:', failed);
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
      console.error('[svita] safeLandingNav fallback:', err);
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
  _wireBrowseInfiniteScrollAfterFirstLoad();
  setTimeout(_wireBrowseInfiniteScrollAfterFirstLoad, 0);
  setTimeout(_wireBrowseInfiniteScrollAfterFirstLoad, 500);

  const redirected = typeof _consumeAuthRedirectSession === 'function'
    ? _consumeAuthRedirectSession()
    : false;
  const restored = redirected || await _restoreSession();
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
      console.warn('[svita] init profile bootstrap warning:', profileErr);
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

  const deepLink = _consumeIncomingDeepLink();
  if (deepLink && isLoggedIn()) {
    if (window.history?.replaceState) {
      const cleanUrl = window.location.pathname + (window.location.hash || '');
      window.history.replaceState({}, document.title, cleanUrl);
    }
    setTimeout(() => {
      if (deepLink.open === 'profile' && typeof openOtherProfile === 'function') {
        openOtherProfile(deepLink.id);
        return;
      }
      if (deepLink.open === 'venue' && typeof openVenueProfile === 'function') {
        openVenueProfile({ id: deepLink.id, kind: 'venue', entity_type: 'venue' });
      }
    }, 120);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
        console.log('[Svita] Service Worker temporarily disabled and unregistered.');
      } catch (err) {
        console.warn('[Svita] SW cleanup failed:', err);
      }
    });
  }

  runRuntimeHealthChecks();
  runBackendHealthChecks().catch(() => {});
})();
