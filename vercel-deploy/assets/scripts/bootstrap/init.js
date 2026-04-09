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

  const bindLandingAction = (id, handler) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.bound === '1') return;
    el.dataset.bound = '1';
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      handler();
    });
  };
  bindLandingAction('landing-login-btn', () => safeLandingNav('login'));
  bindLandingAction('landing-register-btn', () => safeLandingNav('register'));
  bindLandingAction('landing-hero-start-btn', () => safeLandingNav('register'));
  bindLandingAction('landing-hero-browse-btn', () => safeLandingNav('browse'));

  const lang = typeof getCurrentLang === 'function'
    ? getCurrentLang()
    : (localStorage.getItem('mitmi_lang') || window.curLang || 'sr');
  const btn = document.querySelector(`.lbtn[onclick*="${lang}"]`);
  if (btn) {
    document.querySelectorAll('.lbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  applyLang(lang);

  const restored = _restoreSession();
  if (restored && isLoggedIn()) {
    let role = typeof _resolveCurrentRole === 'function'
      ? _resolveCurrentRole()
      : (getUser()?.user_metadata?.role || getUser()?.user_role || 'user');
    try {
      const profile = await loadMyProfile();
      if (typeof _resolveCurrentRole === 'function') {
        role = _resolveCurrentRole(profile);
      } else {
        role = profile?.role || role;
      }
    } catch (profileErr) {
      console.warn('[mitmi] init profile bootstrap warning:', profileErr);
    }
    _goToRoleHome(role);
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

(() => {
  const applyMitmiHeroCopyNow = () => {
    const heroTitle = document.querySelector('#page-landing .hero-copy h1');
    const heroSubtitle = document.querySelector('#page-landing .hero-copy .hero-sub');
    const authTitle = document.querySelector('#page-login .land-auth-hero h2');
    const authSubtitle = document.querySelector('#page-login .land-auth-hero p');
    const lang = typeof getCurrentLang === 'function'
      ? getCurrentLang()
      : ((window.curLang === 'en') ? 'en' : 'sr');

    if (heroTitle) {
      const sr = 'Prona\u0111i doga\u0111aj koji voli\u0161.<br>Na\u0111i i dru\u0161tvo za njega.<br><em>Tu je mitmi.</em>';
      const en = 'Find an event you love.<br>Find people to go with.<br><em>This is mitmi.</em>';
      heroTitle.setAttribute('data-t-html', JSON.stringify({ sr, en }));
      heroTitle.innerHTML = (lang === 'en') ? en : sr;
    }

    if (heroSubtitle) {
      const sr = 'Prona\u0111i \u0161ta se de\u0161ava, sa\u010duvaj zanimljive doga\u0111aje i priklju\u010di se kad ti odgovara.';
      const en = 'See what is happening, save the events you like and join in whenever it suits you.';
      heroSubtitle.setAttribute('data-t', JSON.stringify({ sr, en }));
      heroSubtitle.textContent = (lang === 'en') ? en : sr;
    }

    if (authTitle) {
      const sr = 'Prijavi se i prona\u0111i ekipu za izlazak.';
      const en = 'Sign in and find your people for tonight.';
      authTitle.setAttribute('data-t', JSON.stringify({ sr, en }));
      authTitle.textContent = (lang === 'en') ? en : sr;
    }

    if (authSubtitle) {
      const sr = 'Brzo, jednostavno i bez pritiska. Prati doga\u0111aje, sa\u010duvaj favorite i uklju\u010di se kad po\u017eeli\u0161.';
      const en = 'Simple, calm and flexible. Follow events, save favorites and join when you want to.';
      authSubtitle.setAttribute('data-t', JSON.stringify({ sr, en }));
      authSubtitle.textContent = (lang === 'en') ? en : sr;
    }
  };

  applyMitmiHeroCopyNow();
  document.addEventListener('DOMContentLoaded', applyMitmiHeroCopyNow);
  window.addEventListener('load', () => {
    applyMitmiHeroCopyNow();
    requestAnimationFrame(applyMitmiHeroCopyNow);
    setTimeout(applyMitmiHeroCopyNow, 0);
  });
})();
