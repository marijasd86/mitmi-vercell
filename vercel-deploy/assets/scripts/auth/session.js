// ========================================
// 1c - SUPABASE AUTH + SESSION
// ========================================

// --- Konfiguracija ---
// ⚠️ OBAVEZNO: Zameni sa tvojim Supabase podacima
// Nalaze se na: supabase.com → tvoj projekat → Settings → API
const SUPA_URL  = 'https://yrsxdygymydfgavckfem.supabase.co';  // Project URL
const SUPA_ANON = 'sb_publishable_lpO96ApOE100QCRSntxXPQ_LJgmQG5V'; // publishable public key

// --- Session state ---
// Sve u memoriji - ne u localStorage direktno
// Token se cuva u closure, refresh ide proaktivno
let _session = null;       // { access_token, refresh_token, expires_at, user }
let _refreshTimer = null;

function getSession()  { return _session; }
function getUser()     { return _session?.user || null; }
function isLoggedIn()  { return !!_session?.access_token; }

const REGISTER_COPY = {
  user: {
    title: 'Kreiraj nalog',
    sub: 'Nađi društvo za sledeći izlazak',
    cta: 'Nastavi',
    hint: 'Prvo napravi profil, pa biramo interesovanja i grad.',
    emailPlaceholder: 'tvoj@email.com'
  },
  venue: {
    title: 'Registruj organizatora događaja',
    sub: 'Objavljuj događaje i pošalji zahtev za pregled profila',
    cta: 'Nastavi kao organizator',
    hint: 'Posle naloga sledi onboarding za organizatora događaja i ručni pregled profila u roku od 48h.',
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

function _isSupabaseConfigured() {
  return !SUPA_URL.includes('TVOJ_PROJECT_ID') && SUPA_ANON !== 'TVOJ_ANON_KEY';
}

function _getRoleTarget(role) {
  return role === 'venue'
    ? { page: 'venue', navIndex: 3 }
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
  document.getElementById('bottom-nav').classList.add('show');
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
      showToast('Unesite validan email', 'error');
      return;
    }
    if (!pass || pass.length < 6) {
      _renderAuthNotice('login-auth-notice', { type:'error', message:'Unesite lozinku.' });
      showToast('Unesite lozinku', 'error');
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
      showToast('Prijava trenutno nije dostupna', 'error');
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
    showToast('Dobrodošli! 👋', 'success');
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
      showToast('Pogrešan email ili lozinka', 'error');
    } else {
      _renderAuthNotice('login-auth-notice', {
        type: 'error',
        message: _friendlyAuthError(msg, 'Prijava nije uspela. Pokušaj ponovo.')
      });
      showToast('Greška pri prijavi', 'error');
    }
  }
}

function handleGoogleLoginPlaceholder() {
  _renderAuthNotice('login-auth-notice', {
    type: 'error',
    message: 'Google prijava još nije povezana. Za sada koristi email i lozinku.'
  });
  showToast('Google prijava još nije aktivna', 'info', 2200);
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
    showToast('Unesi email adresu za link prijavu', 'error');
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
    showToast('Link za prijavu je poslat', 'success', 2200);
  } catch (e) {
    _renderAuthNotice('login-auth-notice', {
      type: 'error',
      message: _friendlyAuthError(e.data?.error_description || e.message, 'Slanje login linka nije uspelo.')
    });
    showToast('Slanje login linka nije uspelo', 'error', 2400);
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
    showToast('Unesi email adresu da pošaljemo reset lozinke', 'info', 2200);
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
    showToast('Reset lozinke je poslat', 'success', 2200);
  } catch (e) {
    _renderAuthNotice('login-auth-notice', {
      type: 'error',
      message: _friendlyAuthError(e.data?.error_description || e.message, 'Slanje reset linka nije uspelo.')
    });
    showToast('Reset lozinke nije poslat', 'error', 2400);
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
  const email = document.getElementById('reg-email');
  const btn = document.getElementById('reg-submit-btn');
  if (title) title.textContent = copy.title;
  if (sub) sub.textContent = copy.sub;
  if (hint) hint.textContent = copy.hint;
  if (email) email.placeholder = copy.emailPlaceholder;
  if (btn && !btn.disabled) btn.textContent = copy.cta;
}

function selectRegType(type) {
  regType = type;
  const userOpt = document.getElementById('reg-type-user');
  const venueOpt = document.getElementById('reg-type-venue');
  if (userOpt)  userOpt.classList.toggle('sel', type === 'user');
  if (venueOpt) venueOpt.classList.toggle('sel', type === 'venue');
  if (userOpt)  userOpt.setAttribute('aria-pressed', type === 'user' ? 'true' : 'false');
  if (venueOpt) venueOpt.setAttribute('aria-pressed', type === 'venue' ? 'true' : 'false');
  _syncRegisterUI();
}

function openOrganizerRegister(prefill = {}) {
  nav('register');
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
  const ageEl   = document.getElementById('reg-age-check');
  const legalEl = document.getElementById('reg-legal-check');

  const email = emailEl?.value.trim();
  const pass  = passEl?.value;

  if (!email || !email.includes('@')) { showToast('Unesite validan email', 'error'); return; }
  if (!pass || pass.length < 8)       { showToast('Lozinka mora imati min. 8 karaktera', 'error'); return; }
  if (!ageEl?.checked)                { showToast('MITMI je trenutno namenjen samo punoletnim korisnicima (18+)', 'error'); return; }
  if (!legalEl?.checked)              { showToast('Potvrdi da razumeš pravila, Uslove i Politiku privatnosti', 'error'); return; }

  _renderAuthNotice('register-auth-notice', null);
  _setRegisterLoading(true);

  if (!_isSupabaseConfigured()) {
    _setRegisterLoading(false);
    _renderAuthNotice('register-auth-notice', {
      type: 'error',
      message: 'Supabase nije podešen za ovu verziju aplikacije. Registracija trenutno nije dostupna.'
    });
    showToast('Registracija trenutno nije dostupna', 'error');
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
      bio: '',
      city: 'Srbija'
    });
    showToast(regType === 'venue' ? 'Nalog za organizatora je otvoren ✓' : 'Nalog je kreiran ✓', 'success');
    if (regType === 'venue') {
      nav('venue-onboarding');
    } else {
      nav('onboarding');
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
      showToast('Email već postoji - prijavi se', 'error');
    } else {
      const friendlyMsg = _friendlyAuthError(msg, 'Registracija nije završena. Proveri podatke i pokušaj ponovo.');
      _renderAuthNotice('register-auth-notice', {
        type: 'error',
        message: friendlyMsg
      });
      showToast('Greška pri registraciji', 'error');
    }
    return;
  }
  _setRegisterLoading(false);
}

// --- Register (venue) ---
async function handleVenueRegister() {
  openOrganizerRegister();
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
    document.getElementById('bottom-nav').classList.remove('show');
  }
}

// --- Venue onboarding ---
let vobStep = 1;
const vobTotal = 3;

function vobNext() {
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

  const nameEl = document.querySelector('#vob1 .form-input');
  const typeEl = document.querySelector('#vob1 .form-select');
  const cityEl = document.querySelector('#vob1 [placeholder*="Novi Sad"], #vob1 [placeholder*="grad"]');
  const descEl = document.querySelector('#vob2 .form-textarea, #vob2 .form-input[type="text"]:last-child');

  const venueName = nameEl?.value.trim();
  if (!venueName) { showToast('Unesi naziv organizacije', 'error'); return; }

  const btn = document.getElementById('vob-next');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

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
        venue_name:  venueName,
        venue_type:  typeEl?.value || null,
        city:        cityEl?.value?.trim() || 'Novi Sad',
        description: descEl?.value?.trim() || null,
        status:      'pending'
      })
    });

    showToast('Zahtev za pregled profila je poslat. Odgovaramo u roku od 48h. ✓', 'success', 3500);
    nav('venue');
    setBN(4);
    document.getElementById('bottom-nav').classList.add('show');
  } catch(e) {
    console.error('[mitmi] venue onboarding:', e);
    const msg = e.data?.message || e.message || '';
    if (msg.includes('unique') || msg.includes('already')) {
      showToast('Lokal za ovaj nalog već postoji', 'error');
      nav('venue'); setBN(4);
    } else {
      showToast('Greška pri slanju, pokušaj ponovo', 'error');
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
