const CREATE_ENTRY_COPY = {
  sr: {
    social: {
      icon: '◎',
      title: 'Pronađi ekipu za odlazak',
      desc: 'Ide ti se na neki događaj? Objavi poziv i pronađi svitu koja je za istu priču.',
      meta: 'Poziv za ekipu'
    },
    managed: {
      icon: '◻',
      title: 'Objavi događaj koji organizuješ',
      desc: 'Praviš nešto dobro? Objavi događaj da ga ljudi lakše pronađu i dođu.',
      meta: 'Zvanična objava'
    },
    suggest: {
      icon: '↗',
      title: 'Predloži dobar događaj',
      desc: 'Znaš za dešavanje koje vredi videti? Pošalji nam predlog da ga dodamo.',
      meta: 'Predlog za dodavanje'
    }
  },
  en: {
    social: {
      icon: '◎',
      title: 'Find your going-out crew',
      desc: 'Going to an event? Post an invite and find people on the same vibe.',
      meta: 'Crew invite'
    },
    managed: {
      icon: '◻',
      title: 'Publish an event you organize',
      desc: 'Hosting something great? Publish it so people can find it and join.',
      meta: 'Official listing'
    },
    suggest: {
      icon: '↗',
      title: 'Suggest a great event',
      desc: 'Know an event worth seeing? Send it to us and we can add it.',
      meta: 'Add suggestion'
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
