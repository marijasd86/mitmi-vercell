const CREATE_ENTRY_COPY = {
  sr: {
    social: {
      iconKey: 'social',
      title: 'Pronađi ekipu za odlazak',
      desc: 'Ide ti se na neki događaj? Objavi poziv i pronađi svitu koja je za istu priču.',
      meta: 'Poziv za ekipu'
    },
    managed: {
      iconKey: 'managed',
      title: 'Objavi događaj koji organizuješ',
      desc: 'Praviš nešto dobro? Objavi događaj da ga ljudi lakše pronađu i dođu.',
      meta: 'Zvanična objava'
    },
    suggest: {
      iconKey: 'suggest',
      title: 'Predloži dobar događaj',
      desc: 'Znaš za dešavanje koje vredi videti? Pošalji nam predlog da ga dodamo.',
      meta: 'Predlog za dodavanje'
    }
  },
  en: {
    social: {
      iconKey: 'social',
      title: 'Find your going-out crew',
      desc: 'Going to an event? Post an invite and find people on the same vibe.',
      meta: 'Crew invite'
    },
    managed: {
      iconKey: 'managed',
      title: 'Publish an event you organize',
      desc: 'Hosting something great? Publish it so people can find it and join.',
      meta: 'Official listing'
    },
    suggest: {
      iconKey: 'suggest',
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

function _createEntryIconSvg(iconKey = '') {
  if (iconKey === 'managed') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-4"></path><path d="M5 10h4l6-3v10l-6-3H5z"></path><path d="M9 14.5v3"></path><path d="M17 10.5a2.8 2.8 0 0 1 0 5"></path></svg>';
  }
  if (iconKey === 'suggest') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.2l2.3 4.6 5 .7-3.6 3.5.9 4.9-4.6-2.4-4.6 2.4.9-4.9-3.6-3.5 5-.7z"></path></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="3.5"></circle><path d="M5.5 18a8 8 0 0 1 13 0"></path></svg>';
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
        <span class="create-entry-icon">${_createEntryIconSvg(item.iconKey || '')}</span>
        <span>
          <span class="create-entry-title">${_escHtml(item.title)}</span>
          <span class="create-entry-desc">${_escHtml(item.desc)}</span>
          <span class="create-entry-meta ${item.metaClass}">${_escHtml(item.meta)}</span>
        </span>
      </span>
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
