const CREATE_ENTRY_COPY = {
  sr: {
    social: {
      icon: '◎',
      title: 'Objavi plan',
      desc: 'Kaži da tražiš društvo za izlazak ili događaj.',
      meta: 'Odmah'
    },
    managed: {
      icon: '◻',
      title: 'Objavi događaj',
      desc: 'Za organizatore i admin profile: zvanična objava u katalog.',
      meta: 'Organizer'
    },
    suggest: {
      icon: '↗',
      title: 'Predloži događaj',
      desc: 'Pošalji događaj na pregled ako ga još nema u aplikaciji.',
      meta: 'Pregled'
    }
  },
  en: {
    social: {
      icon: '◎',
      title: 'Post a plan',
      desc: 'Say that you are looking for company for an outing or event.',
      meta: 'Now'
    },
    managed: {
      icon: '◻',
      title: 'Publish event',
      desc: 'For organizer and admin profiles: official catalog event.',
      meta: 'Organizer'
    },
    suggest: {
      icon: '↗',
      title: 'Suggest event',
      desc: 'Send a missing event for review before it goes live.',
      meta: 'Review'
    }
  }
};

function _createEntryItems(lang = 'sr', canPublishManagedEvents = false) {
  const copy = CREATE_ENTRY_COPY[lang === 'en' ? 'en' : 'sr'];
  const items = [
    {
      ...copy.social,
      key: 'social',
      metaClass: 'primary',
      action: 'openCreateSocialEntry()'
    }
  ];
  if (canPublishManagedEvents) {
    items.push({
      ...copy.managed,
      key: 'managed',
      metaClass: 'primary',
      action: 'openCreateManagedEntry()'
    });
  }
  items.push({
    ...copy.suggest,
    key: 'suggest',
    metaClass: 'muted',
    action: 'openSuggestEventEntry()'
  });
  return items;
}

function _currentUiLang() {
  return localStorage.getItem('mitmi_lang') || 'sr';
}

function closeCreateEntryMenu() {
  const overlay = document.getElementById('create-entry-overlay');
  if (overlay) overlay.style.display = 'none';
}

function openCreateEntryMenu() {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  const caps = typeof getRoleCapabilities === 'function'
    ? getRoleCapabilities()
    : { canPublishManagedEvents: false };
  const overlay = document.getElementById('create-entry-overlay');
  const options = document.getElementById('create-entry-options');
  if (!overlay || !options) {
    openCreateEvent(null, caps.canPublishManagedEvents ? 'managed' : 'social');
    return;
  }
  const isEn = _currentUiLang() === 'en';
  const items = _createEntryItems(isEn ? 'en' : 'sr', !!caps.canPublishManagedEvents);
  options.innerHTML = items.map(item => `
    <button type="button" class="create-entry-option" onclick="${item.action}">
      <span class="create-entry-option-main">
        <span class="create-entry-icon">${item.icon}</span>
        <span>
          <span class="create-entry-title">${_escHtml(item.title)}</span>
          <span class="create-entry-desc">${_escHtml(item.desc)}</span>
        </span>
      </span>
      <span class="create-entry-meta ${item.metaClass}">${_escHtml(item.meta)}</span>
    </button>
  `).join('');
  overlay.style.display = 'flex';
}

function openCreateSocialEntry() {
  closeCreateEntryMenu();
  setBN(2);
  openCreateEvent(null, 'social');
}

function openCreateManagedEntry() {
  closeCreateEntryMenu();
  setBN(2);
  openCreateEvent(null, 'managed');
}

function openSuggestEventEntry() {
  closeCreateEntryMenu();
  setBN(2);
  openCreateEvent(null, 'suggest');
}

// Keep explicit globals for inline onclick handlers in index.html.
window.closeCreateEntryMenu = closeCreateEntryMenu;
window.openCreateEntryMenu = openCreateEntryMenu;
window.openCreateSocialEntry = openCreateSocialEntry;
window.openCreateManagedEntry = openCreateManagedEntry;
window.openSuggestEventEntry = openSuggestEventEntry;
