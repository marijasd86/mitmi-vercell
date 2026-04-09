// ========================================
// 1c - SUPABASE AUTH + SESSION
// ========================================

// --- Konfiguracija ---
// ⚠️ OBAVEZNO: Zameni sa tvojim Supabase podacima
// Nalaze se na: supabase.com → tvoj projekat → Settings → API
const SUPA_URL  = 'https://iyvzrupdchmlbgwmguxw.supabase.co';  // Project URL
const SUPA_ANON = 'sb_publishable_pQTagpwVAqueJ7cpFTv3pA_VXWXnYn3'; // publishable public key

// --- Session state ---
// Sve u memoriji - ne u localStorage direktno
// Token se cuva u closure, refresh ide proaktivno
let _session = null;       // { access_token, refresh_token, expires_at, user }
let _refreshTimer = null;
let _authGuardRedirecting = false;

function getSession()  { return _session; }
function getUser()     { return _session?.user || null; }
function isLoggedIn()  { return !!_session?.access_token; }

const REGISTER_COPY = {
  user: {
    title: 'Kreiraj nalog',
    sub: 'Nađi društvo za sledeći izlazak',
    cta: 'Napravi nalog za druženje',
    hint: 'Prvo napravi profil, pa biramo grad, interesovanja i tempo izlazaka.',
    rolePill: 'Praviš nalog za druženje',
    emailPlaceholder: 'tvoj@email.com'
  },
  venue: {
    title: 'Registruj organizatora događaja',
    sub: 'Objavljuj događaje i pošalji zahtev za pregled profila',
    cta: 'Nastavi kao organizator',
    hint: 'Posle naloga sledi onboarding za organizatora događaja i ručni pregled profila u roku od 48h.',
    rolePill: 'Praviš nalog za organizatora',
    emailPlaceholder: 'organizator@email.com'
  }
};

const PENDING_AUTH_NOTICE_KEY = 'mitmi_pending_auth_notice';

function _storePendingAuthNotice(payload = {}) {
  try {
    sessionStorage.setItem(PENDING_AUTH_NOTICE_KEY, JSON.stringify(payload));
  } catch(e) {}
}

function _consumePendingAuthNotice() {
  try {
    const raw = sessionStorage.getItem(PENDING_AUTH_NOTICE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_AUTH_NOTICE_KEY);
    return JSON.parse(raw);
  } catch(e) {
    return null;
  }
}

function _renderAuthNotice(targetId, payload = null) {
  const box = document.getElementById(targetId);
  if (!box) return;
  if (!payload?.message) {
    box.style.display = 'none';
    box.textContent = '';
    box.style.background = '';
    box.style.borderColor = '';
    box.style.color = '';
    return;
  }
  const isError = payload.type === 'error';
  box.style.display = 'block';
  box.style.background = isError ? '#fef2f2' : '#f5f3ff';
  box.style.borderColor = isError ? '#fecaca' : '#ddd6fe';
  box.style.color = isError ? '#991b1b' : '#5b21b6';
  box.textContent = payload.message;
}

function _authToast(message, type = 'info', duration = 2200) {
  if (typeof showToast === 'function') {
    showToast(message, type, duration);
    return;
  }
  console[type === 'error' ? 'error' : 'log']('[mitmi auth]', message);
}

function _friendlyAuthError(msg = '', fallback = 'Greška pri registraciji') {
  const text = String(msg || '').trim();
  if (!text) return fallback;
  const lower = text.toLowerCase();
  if (lower.includes('already registered')) return 'Email već postoji. Prijavi se sa postojećim nalogom.';
  if (lower.includes('password')) return 'Lozinka ne prolazi pravila bezbednosti. Probaj jaču lozinku.';
  if (lower.includes('email address') || lower.includes('invalid email')) return 'Email adresa nije validna.';
  if (lower.includes('signup') && lower.includes('disabled')) return 'Email registracija je isključena u Supabase podešavanjima.';
  if (lower.includes('database error')) return 'Supabase je odbio kreiranje naloga zbog podešavanja baze ili Auth triggera.';
  return text;
}

function clearFieldError(id) {
  const field = document.getElementById(id);
  const error = document.getElementById(id + '-error');
  field?.classList.remove('input-error');
  field?.classList.remove('input-error-wrap');
  if (error) {
    error.style.display = 'none';
    error.textContent = '';
  }
}

function showFieldError(id, message) {
  const field = document.getElementById(id);
  const error = document.getElementById(id + '-error');
  field?.classList.add(field.matches?.('.form-input, .form-select, .form-textarea') ? 'input-error' : 'input-error-wrap');
  if (error) {
    error.textContent = message || '';
    error.style.display = message ? 'block' : 'none';
  }
}

function _clearRegisterFieldErrors() {
  ['reg-email', 'reg-pass', 'reg-legal-block'].forEach(clearFieldError);
}

function validateRegisterForm() {
  const email = document.getElementById('reg-email')?.value.trim() || '';
  const pass = document.getElementById('reg-pass')?.value || '';
  const ageChecked = !!document.getElementById('reg-age-check')?.checked;
  const legalChecked = !!document.getElementById('reg-legal-check')?.checked;

  if (!email || !email.includes('@')) {
    return { ok:false, errorField:'reg-email', errorMessage:'Unesite validan email.' };
  }
  if (!pass || pass.length < 8) {
    return { ok:false, errorField:'reg-pass', errorMessage:'Lozinka mora imati najmanje 8 karaktera.' };
  }
  if (!ageChecked) {
    return { ok:false, errorField:'reg-legal-block', errorMessage:'MITMI je trenutno namenjen samo punoletnim korisnicima (18+).' };
  }
  if (!legalChecked) {
    return { ok:false, errorField:'reg-legal-block', errorMessage:'Potvrdi da razumeš pravila, Uslove i Politiku privatnosti.' };
  }
  return { ok:true, errorField:null, errorMessage:'' };
}

function _isSupabaseConfigured() {
  return !SUPA_URL.includes('TVOJ_PROJECT_ID') && SUPA_ANON !== 'TVOJ_ANON_KEY';
}

function _getRoleTarget(role) {
  return role === 'venue'
    ? { page: 'venue', navIndex: 4 }
    : { page: 'home', navIndex: 0 };
}

function _resolveCurrentRole(profile = null) {
  return (
    profile?.role ||
    getUser()?.user_metadata?.role ||
    getUser()?.user_role ||
    _session?.user_role ||
    'user'
  );
}

function _goToRoleHome(role) {
  const target = _getRoleTarget(role);
  nav(target.page);
  setBN(target.navIndex);
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.classList.add('show');
}

function _hideBottomNav() {
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.classList.remove('show');
}

function _normalizeSession(raw = {}) {
  const fallbackRole = raw.user_role || raw.role || 'user';
  const existingUser = raw.user || {};
  const userId = existingUser.id || raw.user_id || null;
  const userEmail = existingUser.email || raw.user_email || null;
  const userCity = existingUser.city || raw.user_city || raw.city || null;
  const userMeta = {
    ...(existingUser.user_metadata || {}),
    role: existingUser.user_metadata?.role || fallbackRole
  };

  return {
    ...raw,
    user: {
      ...existingUser,
      id: userId,
      email: userEmail,
      city: userCity,
      user_role: userMeta.role,
      user_metadata: userMeta
    },
    user_id: userId,
    user_email: userEmail,
    user_role: userMeta.role,
    user_city: userCity
  };
}

// --- Persist session (enkriptovano nije moguce bez backend-a,
//     ali bar ne eksponiramo direktno u globalnoj promenljivoj) ---
function _saveSession(s) {
  _session = _normalizeSession(s);
  try {
    // Cuvamo samo ono sto je potrebno, ne ceo token u globalnom scope
    sessionStorage.setItem('mitmi_sess', JSON.stringify({
      access_token:  _session.access_token,
      refresh_token: _session.refresh_token,
      expires_at:    _session.expires_at,
      user_id:       _session.user?.id,
      user_email:    _session.user?.email,
      user_role:     _session.user?.user_metadata?.role || 'user',
      user_city:     _session.user?.city || null
    }));
  } catch(e) {}
  _scheduleRefresh(_session);
}

function _clearSession() {
  _session = null;
  if (_refreshTimer) clearTimeout(_refreshTimer);
  try { sessionStorage.removeItem('mitmi_sess'); } catch(e) {}
  if (typeof _clearCache === 'function') _clearCache();
  if (typeof window !== 'undefined' && typeof window._clearMitmiUiStorage === 'function') {
    window._clearMitmiUiStorage();
  }
}

function _shouldHandleAuthFailure(path = '', opts = {}) {
  if (opts.authGuard === false) return false;
  const normalized = String(path || '');
  if (!normalized) return false;
  if (normalized.startsWith('/auth/v1/token?grant_type=password')) return false;
  if (normalized.startsWith('/auth/v1/signup')) return false;
  if (normalized.startsWith('/auth/v1/otp')) return false;
  if (normalized.startsWith('/auth/v1/recover')) return false;
  if (normalized.startsWith('/auth/v1/logout')) return false;
  return true;
}

function _handleSupabaseAuthFailure(status = 401, data = {}, path = '') {
  if (_authGuardRedirecting) return;
  _authGuardRedirecting = true;
  const message = status === 403
    ? 'Nemaš pristup ovoj stranici. Prijavi se ponovo.'
    : 'Sesija je istekla. Prijavi se ponovo.';

  _clearSession();
  _hideBottomNav();
  _storePendingAuthNotice({ type: 'error', message });
  try {
    nav('login');
  } catch (e) {
    try { nav('landing'); } catch (_) {}
  }
  _authToast(message, 'info', 2600);
  console.warn('[mitmi] auth guard redirect:', status, path, data?.message || data?.error_description || '');
  setTimeout(() => { _authGuardRedirecting = false; }, 400);
}

function _restoreSession() {
  try {
    const raw = sessionStorage.getItem('mitmi_sess');
    if (!raw) return false;
    const s = JSON.parse(raw);
    // Provjeri da nije istekao
    if (s.expires_at && Date.now() / 1000 > s.expires_at - 60) {
      // Istekao - probaj refresh
      if (s.refresh_token) {
        _refreshToken(s.refresh_token);
        return false; // async, sacekaj
      }
      _clearSession();
      return false;
    }
    _session = _normalizeSession(s);
    _scheduleRefresh(_session);
    return true;
  } catch(e) {
    return false;
  }
}

// --- Proaktivni token refresh ---
// Refresh 2 minute pre isteka - korisnik nikad ne bude tiho izbacen
function _scheduleRefresh(s) {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  if (!s?.expires_at || !s?.refresh_token) return;
  const msLeft = (s.expires_at * 1000) - Date.now() - 120000; // 2 min pre
  if (msLeft <= 0) {
    _refreshToken(s.refresh_token);
    return;
  }
  _refreshTimer = setTimeout(() => _refreshToken(s.refresh_token), msLeft);
}

async function _refreshToken(refreshToken) {
  if (!_isSupabaseConfigured()) return;
  try {
    const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_ANON
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!res.ok) throw new Error('Refresh failed: ' + res.status);
    const data = await res.json();
    _saveSession({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    Math.floor(Date.now() / 1000) + data.expires_in,
      user: _session?.user || null
    });
  } catch(e) {
    console.warn('[mitmi] Token refresh failed:', e.message);
    _clearSession();
    // Tiho ne izbacujemo korisnika - samo pri sledecoj API akciji
  }
}

// --- Supabase API helper ---
async function _supaFetch(path, opts = {}) {
  if (!_isSupabaseConfigured()) {
    throw Object.assign(new Error('Supabase nije još podešen'), { status: 503, data: {} });
  }
  const token = _session?.access_token;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPA_ANON,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(opts.headers || {})
  };
  const res = await fetch(`${SUPA_URL}${path}`, { ...opts, headers });
  const rawText = await res.text();
  let data = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch(e) {
      data = { raw: rawText };
    }
  }
  if (!res.ok) {
    if ((res.status === 401 || res.status === 403) && _shouldHandleAuthFailure(path, opts) && isLoggedIn()) {
      _handleSupabaseAuthFailure(res.status, data, path);
    }
    const message =
      data.error_description ||
      data.message ||
      data.msg ||
      data.error ||
      data.raw ||
      `API error (${res.status})`;
    throw Object.assign(new Error(message), { status: res.status, data });
  }
  return data;
}

// --- Login ---
async function handleLogin() {
  const emailEl = document.getElementById('login-email');
  const passEl  = document.getElementById('login-pass');
  const btn     = document.getElementById('login-submit-btn') || document.querySelector('#page-login .btn-primary');

  try {
    const email = emailEl?.value.trim();
    const pass  = passEl?.value;

    if (!email || !email.includes('@')) {
      _renderAuthNotice('login-auth-notice', { type:'error', message:'Unesite validan email.' });
      _authToast('Unesite validan email', 'error');
      return;
    }
    if (!pass || pass.length < 6) {
      _renderAuthNotice('login-auth-notice', { type:'error', message:'Unesite lozinku.' });
      _authToast('Unesite lozinku', 'error');
      return;
    }

    _renderAuthNotice('login-auth-notice', {
      type: 'info',
      message: 'Prijavljujemo te...'
    });
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Prijavljujemo te...';
      btn.setAttribute('aria-busy', 'true');
    }

    if (!_isSupabaseConfigured()) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Prijavi se';
        btn.removeAttribute('aria-busy');
      }
      _renderAuthNotice('login-auth-notice', {
        type: 'error',
        message: 'Supabase nije podešen za ovu verziju aplikacije. Prijava trenutno nije dostupna.'
      });
      _authToast('Prijava trenutno nije dostupna', 'error');
      return;
    }

    const data = await _supaFetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass })
    });
    _saveSession({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    Math.floor(Date.now() / 1000) + data.expires_in,
      user: data.user
    });
    let role = _resolveCurrentRole();
    try {
      const profile = await loadMyProfile();
      role = _resolveCurrentRole(profile);
    } catch (profileErr) {
      console.warn('[mitmi] login profile bootstrap warning:', profileErr);
    }
    _renderAuthNotice('login-auth-notice', null);
    _authToast('Dobrodošli! 👋', 'success');
    _goToRoleHome(role);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Prijavi se';
      btn.removeAttribute('aria-busy');
    }
  } catch(e) {
    // 3s cooldown nakon greske - osnovna zastita od brute-force
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Pokušaj za 3s';
      btn.removeAttribute('aria-busy');
    }
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Prijavi se';
      }
    }, 3000);
    const msg = e.data?.error_description || e.message;
    if (msg?.includes('Invalid login')) {
      _renderAuthNotice('login-auth-notice', {
        type: 'error',
        message: 'Pogrešan email ili lozinka.'
      });
      _authToast('Pogrešan email ili lozinka', 'error');
    } else {
      _renderAuthNotice('login-auth-notice', {
        type: 'error',
        message: _friendlyAuthError(msg, 'Prijava nije uspela. Pokušaj ponovo.')
      });
      _authToast('Greška pri prijavi', 'error');
    }
  }
}

function handleGoogleLoginPlaceholder() {
  _renderAuthNotice('login-auth-notice', {
    type: 'error',
    message: 'Google prijava još nije povezana. Za sada koristi email i lozinku.'
  });
  _authToast('Google prijava još nije aktivna', 'info', 2200);
}

function _authRedirectUrl() {
  try {
    return window.location.origin;
  } catch (e) {
    return '';
  }
}

async function handleEmailMagicLogin() {
  const emailEl = document.getElementById('login-email');
  const btn = document.getElementById('login-email-link-btn');
  const email = emailEl?.value?.trim();

  if (!email || !email.includes('@')) {
    _authToast('Unesi email adresu za link prijavu', 'error');
    return;
  }
  _renderAuthNotice('login-auth-notice', null);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Šaljem link...';
  }
  try {
    await _supaFetch('/auth/v1/otp', {
      method: 'POST',
      body: JSON.stringify({
        email,
        create_user: false,
        email_redirect_to: _authRedirectUrl()
      })
    });
    _renderAuthNotice('login-auth-notice', {
      type: 'info',
      message: 'Poslali smo ti email link za prijavu. Otvori poruku i vrati se u aplikaciju.'
    });
    _authToast('Link za prijavu je poslat', 'success', 2200);
  } catch (e) {
    _renderAuthNotice('login-auth-notice', {
      type: 'error',
      message: _friendlyAuthError(e.data?.error_description || e.message, 'Slanje login linka nije uspelo.')
    });
    _authToast('Slanje login linka nije uspelo', 'error', 2400);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Pošalji link za prijavu emailom';
    }
  }
}

async function handleForgotPassword() {
  const emailEl = document.getElementById('login-email');
  const email = emailEl?.value?.trim();
  if (!email || !email.includes('@')) {
    _authToast('Unesi email adresu da pošaljemo reset lozinke', 'info', 2200);
    emailEl?.focus();
    return;
  }
  _renderAuthNotice('login-auth-notice', null);
  try {
    await _supaFetch('/auth/v1/recover', {
      method: 'POST',
      body: JSON.stringify({
        email,
        redirect_to: _authRedirectUrl()
      })
    });
    _renderAuthNotice('login-auth-notice', {
      type: 'info',
      message: 'Poslali smo email za reset lozinke. Proveri inbox i spam folder.'
    });
    _authToast('Reset lozinke je poslat', 'success', 2200);
  } catch (e) {
    _renderAuthNotice('login-auth-notice', {
      type: 'error',
      message: _friendlyAuthError(e.data?.error_description || e.message, 'Slanje reset linka nije uspelo.')
    });
    _authToast('Reset lozinke nije poslat', 'error', 2400);
  }
}

// --- Register type selector ---
var regType = 'user';
function _setRegisterLoading(isLoading) {
  const btn = document.getElementById('reg-submit-btn');
  if (!btn) return;
  btn.disabled = isLoading;
  if (!isLoading) {
    btn.textContent = REGISTER_COPY[regType]?.cta || 'Nastavi';
    return;
  }
  btn.textContent = regType === 'venue' ? 'Otvaram onboarding...' : 'Kreiram nalog...';
}

function _syncRegisterUI() {
  const copy = REGISTER_COPY[regType] || REGISTER_COPY.user;
  const title = document.getElementById('register-title');
  const sub = document.getElementById('register-sub');
  const hint = document.getElementById('register-role-hint');
  const rolePill = document.getElementById('register-role-pill');
  const email = document.getElementById('reg-email');
  const btn = document.getElementById('reg-submit-btn');
  if (title) title.textContent = copy.title;
  if (sub) sub.textContent = copy.sub;
  if (hint) hint.textContent = copy.hint;
  if (rolePill) rolePill.textContent = copy.rolePill || '';
  if (email) email.placeholder = copy.emailPlaceholder;
  if (btn && !btn.disabled) btn.textContent = copy.cta;
}

function selectRegType(type) {
  regType = type;
  _clearRegisterFieldErrors();
  const userOpt = document.getElementById('reg-type-user');
  const venueOpt = document.getElementById('reg-type-venue');
  if (userOpt)  userOpt.classList.toggle('sel', type === 'user');
  if (venueOpt) venueOpt.classList.toggle('sel', type === 'venue');
  if (userOpt)  userOpt.setAttribute('aria-pressed', type === 'user' ? 'true' : 'false');
  if (venueOpt) venueOpt.setAttribute('aria-pressed', type === 'venue' ? 'true' : 'false');
  _syncRegisterUI();
}

function openOrganizerRegister(prefill = {}) {
  nav('register', { regType:'venue' });
  setTimeout(() => {
    selectRegType('venue');
    const emailEl = document.getElementById('reg-email');
    const passEl = document.getElementById('reg-pass');
    if (emailEl && prefill.email) emailEl.value = prefill.email;
    if (passEl && prefill.pass) passEl.value = prefill.pass;
  }, 0);
}

// --- Register (korisnik) ---
async function handleRegister() {
  const emailEl = document.getElementById('reg-email');
  const passEl  = document.getElementById('reg-pass');
  const email = emailEl?.value.trim();
  const pass  = passEl?.value;
  const validation = validateRegisterForm();

  _clearRegisterFieldErrors();
  if (!validation.ok) {
    showFieldError(validation.errorField, validation.errorMessage);
    _authToast(validation.errorMessage, 'error');
    const field = document.getElementById(validation.errorField);
    field?.focus?.();
    return;
  }

  _renderAuthNotice('register-auth-notice', null);
  _setRegisterLoading(true);

  if (!_isSupabaseConfigured()) {
    _setRegisterLoading(false);
    _renderAuthNotice('register-auth-notice', {
      type: 'error',
      message: 'Supabase nije podešen za ovu verziju aplikacije. Registracija trenutno nije dostupna.'
    });
    _authToast('Registracija trenutno nije dostupna', 'error');
    return;
  }

  try {
    const data = await _supaFetch('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: pass,
        data: { role: regType, age_confirmed: true, legal_acknowledged: true }
      })
    });
    if (!data.access_token) {
      _storePendingAuthNotice({
        email,
        type: 'info',
        message: 'Nalog je kreiran. Proveri email i potvrdi registraciju, pa se prijavi.'
      });
      _setRegisterLoading(false);
      nav('login');
      return;
    }
    _saveSession({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    Math.floor(Date.now() / 1000) + data.expires_in,
      user: data.user
    });
    await _upsertMyProfile({
      role: regType,
      bio: ''
    });
    _authToast(regType === 'venue' ? 'Nalog za organizatora je otvoren ✓' : 'Nalog je kreiran ✓', 'success');
    if (regType === 'venue') {
      nav('venue-onboarding');
    } else {
      goToUserOnboarding();
    }
  } catch(e) {
    console.error('[mitmi] register:', e);
    _setRegisterLoading(false);
    const msg = e.data?.error_description || e.message;
    if (msg?.includes('already registered')) {
      _renderAuthNotice('register-auth-notice', {
        type: 'error',
        message: 'Email već postoji. Prijavi se sa postojećim nalogom.'
      });
      _authToast('Email već postoji - prijavi se', 'error');
    } else {
      const friendlyMsg = _friendlyAuthError(msg, 'Registracija nije završena. Proveri podatke i pokušaj ponovo.');
      _renderAuthNotice('register-auth-notice', {
        type: 'error',
        message: friendlyMsg
      });
      _authToast('Greška pri registraciji', 'error');
    }
    return;
  }
  _setRegisterLoading(false);
}

// --- Logout ---
async function handleLogout() {
  try {
    if (_session?.access_token && _isSupabaseConfigured()) {
      await _supaFetch('/auth/v1/logout', { method: 'POST' }).catch(() => {});
    }
  } finally {
    _clearSession();
    nav('landing');
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) bottomNav.classList.remove('show');
  }
}

function _selectedOnboardingInterests() {
  return Array.from(document.querySelectorAll('#ob-interest-grid .int-item.sel'))
    .map(item => item.getAttribute('data-interest'))
    .filter(Boolean);
}

function updateOnboardingInterestCount() {
  const countEl = document.getElementById('ob-interest-count');
  if (countEl) countEl.textContent = `Izabrano: ${_selectedOnboardingInterests().length}`;
}

function toggleOnboardingInterest(el) {
  if (!el) return;
  el.classList.toggle('sel');
  clearFieldError('ob-interests');
  updateOnboardingInterestCount();
}

function resetUserOnboarding() {
  if (typeof obStep !== 'undefined') obStep = 1;
  for (let i = 1; i <= 3; i++) {
    const step = document.getElementById('ob' + i);
    if (step) step.classList.toggle('active', i === 1);
    const dot = document.getElementById('obdot' + i);
    if (dot) {
      dot.classList.remove('active', 'done');
      if (i === 1) dot.classList.add('active');
    }
  }
  const bar = document.getElementById('ob-bar');
  if (bar) bar.style.width = '33%';
  const backBtn = document.getElementById('ob-back');
  if (backBtn) backBtn.style.display = 'none';
  const nextBtn = document.getElementById('ob-next');
  if (nextBtn) nextBtn.textContent = 'Nastavi';
  ['ob-city', 'ob-interests', 'ob-tempo-block'].forEach(clearFieldError);
  updateOnboardingInterestCount();
}

function goToUserOnboarding() {
  _renderAuthNotice('register-auth-notice', null);
  nav('onboarding');
  setTimeout(() => {
    resetUserOnboarding();
    const cityEl = document.getElementById('ob-city');
    const sessionCity = getUser()?.city || '';
    if (cityEl && sessionCity && !cityEl.value) cityEl.value = sessionCity;
  }, 0);
}

function validateUserOnboardingStep(step = 1) {
  if (step === 1) {
    const city = document.getElementById('ob-city')?.value?.trim() || '';
    clearFieldError('ob-city');
    if (!city) {
      showFieldError('ob-city', 'Izaberi ili upiši grad.');
      _authToast('Izaberi ili upiši grad', 'error');
      return false;
    }
  }
  if (step === 2) {
    clearFieldError('ob-interests');
    if (_selectedOnboardingInterests().length < 3) {
      showFieldError('ob-interests', 'Izaberi bar 3 interesovanja.');
      _authToast('Izaberi bar 3 interesovanja', 'error');
      return false;
    }
  }
  if (step === 3) {
    clearFieldError('ob-tempo-block');
    const tempo = document.querySelector('input[name="ob-social-tempo"]:checked')?.value || '';
    if (!tempo) {
      showFieldError('ob-tempo-block', 'Izaberi tempo izlazaka.');
      _authToast('Izaberi tempo izlazaka', 'error');
      return false;
    }
  }
  return true;
}

async function saveOnboarding() {
  if (!isLoggedIn()) { nav('login'); return; }
  const btn = document.getElementById('ob-next');
  const city = document.getElementById('ob-city')?.value?.trim() || '';
  const interests = _selectedOnboardingInterests();
  const socialTempo = document.querySelector('input[name="ob-social-tempo"]:checked')?.value || '';

  if (!validateUserOnboardingStep(1) || !validateUserOnboardingStep(2) || !validateUserOnboardingStep(3)) return;

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Čuvam...';
  }

  try {
    await _upsertMyProfile({
      city,
      role: 'user'
    });
    try {
      localStorage.setItem(`mitmi_user_prefs_${getUser()?.id || 'guest'}`, JSON.stringify({
        interests,
        social_tempo: socialTempo
      }));
    } catch (e) {}
    ['city-label','home-city-display','browse-city-label','browse-home-city-label'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = city;
    });
    _authToast('Hvala! Spremno je, vodimo te na događaje u tvom gradu.', 'success', 2400);
    openUnifiedHub('home', 0);
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) bottomNav.classList.add('show');
  } catch (e) {
    _authToast('Greška pri čuvanju podešavanja, pokušaj ponovo', 'error', 2600);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Pogledaj događaje';
    }
  }
}

// --- Venue onboarding ---
let vobStep = 1;
const vobTotal = 3;

function resetVenueOnboarding() {
  vobStep = 1;
  for (let i = 1; i <= vobTotal; i++) {
    const step = document.getElementById('vob' + i);
    if (step) step.classList.toggle('active', i === 1);
  }
  const bar = document.getElementById('vob-bar');
  if (bar) bar.style.width = (1 / vobTotal * 100) + '%';
  const backBtn = document.getElementById('vob-back');
  if (backBtn) backBtn.style.display = 'none';
  const nextBtn = document.getElementById('vob-next');
  if (nextBtn) {
    nextBtn.disabled = false;
    nextBtn.textContent = 'Nastavi';
  }
}

function validateVenueOnboarding() {
  const venueName = document.getElementById('vob-name')?.value?.trim() || '';
  const venueType = document.getElementById('vob-type')?.value || '';
  const city = document.querySelector('#vob1 [data-venue-city]')?.value?.trim() || '';
  const desc = document.getElementById('vob-description')?.value?.trim() || '';

  if (!venueName) {
    return { ok:false, message:'Unesi naziv lokala ili organizacije.' };
  }
  if (!city) {
    return { ok:false, message:'Unesi grad u kom se lokal nalazi.' };
  }
  if (!desc) {
    return { ok:false, message:'Napiši kratak opis lokala ili organizatora.' };
  }

  return {
    ok:true,
    payload: {
      venueName,
      venueType: venueType || null,
      city,
      desc
    }
  };
}

function vobNext() {
  if (vobStep === 1) {
    const validation = validateVenueOnboarding();
    if (!validation.ok && /naziv|grad/i.test(validation.message)) {
      _authToast(validation.message, 'error');
      return;
    }
  }
  if (vobStep === 2) {
    const validation = validateVenueOnboarding();
    if (!validation.ok && /opis/i.test(validation.message)) {
      _authToast(validation.message, 'error');
      return;
    }
  }
  if (vobStep < vobTotal) {
    document.getElementById('vob' + vobStep).classList.remove('active');
    vobStep++;
    document.getElementById('vob' + vobStep).classList.add('active');
    document.getElementById('vob-bar').style.width = (vobStep / vobTotal * 100) + '%';
    document.getElementById('vob-back').style.display = 'block';
    if (vobStep === vobTotal) {
      document.getElementById('vob-next').textContent = 'Pošalji zahtev';
    }
  } else {
    // Venue onboarding završen - submit ka Supabase
    _submitVenueOnboarding();
  }
}

async function _submitVenueOnboarding() {
  if (!isLoggedIn()) { nav('login'); return; }

  const btn = document.getElementById('vob-next');
  const { ok, payload, message } = validateVenueOnboarding();
  if (!ok) {
    _authToast(message, 'error');
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Šaljem zahtev...'; }

  try {
    // Provjeri da profil ima role=venue
    await _supaFetch(`/rest/v1/profiles?id=eq.${getUser()?.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ role: 'venue' })
    });

    // Kreiraj venue
    await _supaFetch('/rest/v1/venues', {
      method: 'POST',
      body: JSON.stringify({
        profile_id:  getUser()?.id,
        venue_name:  payload.venueName,
        venue_type:  payload.venueType,
        city:        payload.city,
        description: payload.desc,
        status:      'pending'
      })
    });

    _authToast('Zahtev za pregled profila je poslat. Odgovaramo u roku od 48h. ✓', 'success', 3500);
    nav('venue');
    setBN(4);
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) bottomNav.classList.add('show');
  } catch(e) {
    console.error('[mitmi] venue onboarding:', e);
    const msg = e.data?.message || e.message || '';
    if (msg.includes('unique') || msg.includes('already')) {
      _authToast('Lokal za ovaj nalog već postoji', 'error');
      nav('venue'); setBN(4);
    } else {
      _authToast('Greška pri slanju, pokušaj ponovo', 'error');
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Pošalji zahtev'; }
  }
}

function vobBack() {
  if (vobStep > 1) {
    document.getElementById('vob' + vobStep).classList.remove('active');
    vobStep--;
    document.getElementById('vob' + vobStep).classList.add('active');
    document.getElementById('vob-bar').style.width = (vobStep / vobTotal * 100) + '%';
    if (vobStep === 1) document.getElementById('vob-back').style.display = 'none';
    document.getElementById('vob-next').textContent = 'Nastavi';
  }
}
