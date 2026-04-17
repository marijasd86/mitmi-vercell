function getSelectedCreateTags() {
  return _normalizeEventTags(
    Array.from(document.querySelectorAll('[data-create-tag].active')).map(btn => btn.dataset.createTag || '')
  );
}

function toggleCreateTag(btn, tagKey = '') {
  if (!btn || !tagKey) return;
  const active = Array.from(document.querySelectorAll('[data-create-tag].active'));
  if (!btn.classList.contains('active') && active.length >= 4) {
    showToast(_langText('Izaberi najviše 4 taga', 'Choose up to 4 tags'), 'info', 1500);
    return;
  }
  btn.classList.toggle('active');
}

function setSelectedCreateTags(tags = []) {
  const selected = new Set(_normalizeEventTags(tags));
  document.querySelectorAll('[data-create-tag]').forEach(btn => {
    btn.classList.toggle('active', selected.has(btn.dataset.createTag || ''));
  });
}

function renderCreateTagOptions(category = '') {
  const grid = document.getElementById('create-tag-grid');
  if (!grid) return;
  const options = _eventTagOptions(category);
  const selected = new Set(getSelectedCreateTags().filter(tag => options.some(opt => opt.key === tag)));
  grid.innerHTML = options.map(option => `
    <button type="button" class="create-tag-chip${selected.has(option.key) ? ' active' : ''}" data-create-tag="${_escAttr(option.key)}" onclick="toggleCreateTag(this,'${_escAttr(option.key)}')">${_escHtml(option.label)}</button>
  `).join('');
}

function _setCreateCoverPreview(coverUrl = '') {
  const preview = document.getElementById('create-cover-preview');
  const empty = document.getElementById('create-cover-empty');
  const clearBtn = document.getElementById('create-cover-clear');
  if (preview) {
    preview.style.backgroundImage = coverUrl ? `url(${coverUrl})` : '';
    preview.style.backgroundSize = coverUrl ? 'cover' : '';
    preview.style.backgroundPosition = coverUrl ? 'center' : '';
  }
  if (empty) empty.style.display = coverUrl ? 'none' : '';
  if (clearBtn) clearBtn.style.display = coverUrl ? '' : 'none';
}

function resetCreateForm() {
  _editingEventId = null;
  _planEventId = null;
  _createFlowMode = 'auto';
  _pendingEventCover = '';
  const titleEl = document.getElementById('create-title');
  const categoryEl = document.getElementById('create-category');
  const dateEl = document.getElementById('create-date');
  const timeEl = document.getElementById('create-time');
  const locationEl = document.getElementById('create-location');
  const cityEl = document.getElementById('create-city');
  const addressEl = document.getElementById('create-address');
  const descEl = document.getElementById('create-desc');
  const spotsEl = document.getElementById('create-spots');
  const ticketPriceEl = document.getElementById('create-ticket-price');
  const headerEl = document.getElementById('create-page-title');
  const saveBtn = document.getElementById('create-submit-btn');
  const fileEl = document.getElementById('create-cover-input');
  const contextEl = document.getElementById('create-event-context');
  const categoryWrap = document.getElementById('create-category-wrap');
  const dateWrap = document.getElementById('create-date-wrap');
  const timeWrap = document.getElementById('create-time-wrap');
  const locationWrap = document.getElementById('create-location-wrap');
  const coverWrap = document.getElementById('create-cover-wrap');
  const tagsWrap = document.getElementById('create-tags-wrap');
  const organizerWrap = document.getElementById('create-organizer-wrap');
  const sourceUrlWrap = document.getElementById('create-source-url-wrap');
  const vibesWrap = document.getElementById('create-vibes-wrap');
  const spotsWrap = document.getElementById('create-spots-wrap');
  const ticketPriceWrap = document.getElementById('create-ticket-price-wrap');
  const intentCard = document.getElementById('create-intent-card');
  const reviewNote = document.getElementById('create-review-note');
  const suggestionsEl = document.getElementById('create-title-suggestions');
  const organizerEl = document.getElementById('create-organizer');
  const sourceUrlEl = document.getElementById('create-source-url');
  const titleLabel = document.getElementById('create-title-label');
  const categoryLabel = document.getElementById('create-category-label');
  const dateLabelEl = document.getElementById('create-date-label');
  const timeLabelEl = document.getElementById('create-time-label');
  const locationLabel = document.getElementById('create-location-label');
  const cityLabel = document.getElementById('create-city-label');
  const addressLabel = document.getElementById('create-address-label');
  const contextLabel = document.getElementById('create-context-label');
  const contextHint = document.getElementById('create-context-hint');
  const descLabel = document.getElementById('create-desc-label');
  const spotsLabel = document.getElementById('create-spots-label');
  const ticketPriceLabel = document.getElementById('create-ticket-price-label');

  if (titleEl) titleEl.value = '';
  if (categoryEl) categoryEl.value = 'muzika';
  if (dateEl) dateEl.value = '';
  if (timeEl) timeEl.value = '';
  if (locationEl) locationEl.value = '';
  if (cityEl) cityEl.value = getUser()?.city || '';
  if (addressEl) addressEl.value = '';
  if (descEl) descEl.value = '';
  if (spotsEl) spotsEl.value = '';
  if (ticketPriceEl) ticketPriceEl.value = '';
  if (organizerEl) organizerEl.value = '';
  if (sourceUrlEl) sourceUrlEl.value = '';
  clearSelectedCreateOrganizer();
  if (headerEl) headerEl.textContent = _langText('Objavi plan', 'Publish plan');
  if (saveBtn) saveBtn.textContent = _langText('Objavi plan', 'Publish plan');
  if (fileEl) fileEl.value = '';
  if (contextEl) contextEl.style.display = 'none';
  if (categoryWrap) categoryWrap.style.display = '';
  if (tagsWrap) tagsWrap.style.display = '';
  if (dateWrap) dateWrap.style.display = '';
  if (timeWrap) timeWrap.style.display = '';
  if (locationWrap) locationWrap.style.display = '';
  if (coverWrap) coverWrap.style.display = '';
  if (organizerWrap) organizerWrap.style.display = 'none';
  if (sourceUrlWrap) sourceUrlWrap.style.display = 'none';
  if (vibesWrap) vibesWrap.style.display = '';
  if (spotsWrap) spotsWrap.style.display = '';
  if (ticketPriceWrap) ticketPriceWrap.style.display = 'none';
  if (intentCard) intentCard.style.display = '';
  if (reviewNote) reviewNote.style.display = 'none';
  if (titleEl) titleEl.placeholder = _langText('npr. Idem na koncert u subotu i tražim društvo', 'e.g. Going to a concert on Saturday and looking for company');
  if (titleLabel) titleLabel.textContent = _langText('Naslov plana', 'Plan title');
  if (categoryLabel) categoryLabel.textContent = _langText('Kategorija', 'Category');
  renderCreateTagOptions('muzika');
  setSelectedCreateTags([]);
  if (dateLabelEl) dateLabelEl.textContent = _langText('Datum', 'Date');
  if (timeLabelEl) timeLabelEl.textContent = _langText('Vreme', 'Time');
  if (locationLabel) locationLabel.textContent = _langText('Mesto održavanja', 'Venue / place');
  if (cityLabel) cityLabel.textContent = _langText('Grad', 'City');
  if (addressLabel) addressLabel.textContent = _langText('Adresa (opciono)', 'Address (optional)');
  if (contextLabel) contextLabel.textContent = _langText('Događaj ili mesto (opciono)', 'Event or place (optional)');
  if (contextHint) contextHint.textContent = _langText('Ako znaš mesto ili organizer, dodaj ih ovde. Ako ne znaš, slobodno ostavi prazno.', 'If you know the place or organizer, add them here. If not, feel free to leave it empty.');
  if (descLabel) descLabel.textContent = _langText('Opis (opcionalno)', 'Description (optional)');
  if (spotsLabel) spotsLabel.textContent = _langText('Broj mesta', 'Spots');
  if (ticketPriceLabel) ticketPriceLabel.textContent = _langText('Cena ulaznice (RSD)', 'Ticket price (RSD)');
  if (organizerEl) organizerEl.placeholder = _langText('npr. SKCNS, Dom omladine ili naziv događaja', 'e.g. SKCNS, Youth Center, or event name');
  document.querySelectorAll('[data-create-vibe]').forEach(btn => btn.classList.remove('active'));
  if (suggestionsEl) {
    suggestionsEl.innerHTML = `
      <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('${_escJsArg(_langText('Tražim društvo za koncert', 'Looking for company for a concert'))}')">${_langText('muziku', 'music')}</button>
      <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('${_escJsArg(_langText('Tražim društvo za stand up ili predstavu', 'Looking for company for stand-up or theatre'))}')">${_langText('scenu', 'stage')}</button>
      <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('${_escJsArg(_langText('Tražim društvo za izložbu ili film', 'Looking for company for an exhibition or film'))}')">${_langText('kulturu', 'culture')}</button>
      <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('${_escJsArg(_langText('Tražim društvo za trening ili rekreaciju', 'Looking for company for training or recreation'))}')">${_langText('sport', 'sport')}</button>
      <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('${_escJsArg(_langText('Tražim društvo za kafu, kafanu ili večernji izlazak', 'Looking for company for coffee, a tavern, or a night out'))}')">${_langText('izlazak', 'going out')}</button>
      <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('${_escJsArg(_langText('Tražim društvo za šetnju ili boravak napolju', 'Looking for company for a walk or time outdoors'))}')">${_langText('napolju', 'outdoors')}</button>
    `;
  }
  const organizerSuggestions = document.getElementById('create-organizer-suggestions');
  if (organizerSuggestions) {
    organizerSuggestions.innerHTML = '';
    organizerSuggestions.style.display = 'none';
  }
  refreshCreateDescriptionSuggestions();
  _setCreateCoverPreview('');
}

function applyCreateTitlePrompt(text = '') {
  const input = document.getElementById('create-title');
  if (!input) return;
  input.value = text || '';
  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function _createDescriptionSuggestionSet(context = {}) {
  const category = _eventVisualCategory(String(context.category || document.getElementById('create-category')?.value || 'drugo'));
  const eventTitle = String(context.eventTitle || '').trim();
  const location = String(context.location || document.getElementById('create-location')?.value || '').trim();
  const locationText = location || _langText('centar grada', 'the city center');
  if (eventTitle) {
    return [
      { label: _langText('kratko i jasno', 'short and clear'), text: _langText(`Tražim 1-2 osobe za ${eventTitle}. Dogovor oko detalja možemo u chatu.`, `Looking for 1-2 people for ${eventTitle}. We can sort out details in chat.`) },
      { label: _langText('ranije okupljanje', 'meet earlier'), text: _langText(`Ako je neko za kratko okupljanje pre ${eventTitle}, pišite.`, `If anyone is up for a short meetup before ${eventTitle}, send a message.`) },
      { label: _langText('plan posle', 'after-plan'), text: _langText(`Tražim ekipu za ${eventTitle}, a možemo i da nastavimo druženje posle ako kliknemo.`, `Looking for company for ${eventTitle}, and we can keep hanging out after if we click.`) },
      { label: _langText('opušten ton', 'easygoing tone'), text: _langText(`Idem na ${eventTitle} i prijalo bi mi prijatno društvo bez komplikacije i velikog plana.`, `I'm going to ${eventTitle} and would love pleasant company without overcomplicating the plan.`) }
    ];
  }
  const presets = {
    muzika: [
      { label: 'koncert', text: 'Tražim društvo za koncert. Volim opuštenu ekipu i dogovor bez razvlačenja.' },
      { label: 'pre događaja', text: `Ako je neko za kratko okupljanje pre svirke u ${locationText}, javite se.` },
      { label: 'solo friendly', text: 'Idem solo pa bih volela da se spojim sa još 1-2 osobe koje su za muziku i dobru energiju.' }
    ],
    scena_humor: [
      { label: 'predstava', text: 'Tražim društvo za stand up, pozorište ili sličan scenski događaj uz lagan dogovor.' },
      { label: 'opušteno', text: 'Prijalo bi mi društvo za događaj gde možemo da gledamo, smejemo se i posle kratko prokomentarišemo utiske.' },
      { label: 'bez komplikacije', text: 'Najviše mi odgovara jednostavan plan i prijatna osoba ili mala ekipa.' }
    ],
    sport_rekreacija: [
      { label: 'aktivno', text: 'Tražim društvo za sportski plan i dogovor koji može brzo da se organizuje.' },
      { label: 'rekreativno', text: 'Nisam za takmičenje nego za dobar trening i prijatnu ekipu.' },
      { label: 'termin', text: `Ako je neko za termin u ${locationText}, možemo lako da se uklopimo oko vremena.` }
    ],
    kultura_umetnost: [
      { label: 'izložba', text: 'Tražim društvo za kulturni događaj i prijao bi mi neko ko voli mirniji tempo i razgovor.' },
      { label: 'posle događaja', text: 'Možemo zajedno na događaj, a posle i na kratku kafu ili šetnju ako bude lepo.' },
      { label: 'opušteno', text: 'Plan je jednostavan: događaj, malo druženja i bez prevelikog pritiska.' }
    ],
    izlasci_druzenje: [
      { label: 'kratko druženje', text: 'Tražim društvo za kafu i lagan razgovor, bez velikog plana i komplikacije.' },
      { label: 'kafana', text: 'Tražim društvo za kafanu, muziku uživo ili opušteno veče uz dobru atmosferu.' },
      { label: 'posle posla', text: `Ako je neko za spontano viđanje u ${locationText}, možemo brzo da se dogovorimo.` },
      { label: 'mala ekipa', text: 'Najviše mi odgovara mala ekipa ili još jedna osoba za opušten izlazak.' }
    ],
    napolju: [
      { label: 'šetnja', text: 'Tražim društvo za prirodu i lagan plan bez žurbe.' },
      { label: 'vikend', text: 'Ako je neko za kratku šetnju ili boravak napolju, možemo se lako dogovoriti.' },
      { label: 'opušten ritam', text: 'Bitno mi je da plan bude prijatan, miran i da nije previše zahtevan.' }
    ],
    hobiji_igre: [
      { label: 'kviz ili igra', text: 'Tražim društvo za hobi plan, kviz ili neku zajedničku aktivnost sa laganim dogovorom.' },
      { label: 'mala ekipa', text: 'Najviše mi odgovara manja ekipa koja je za druženje i zajedničko interesovanje.' },
      { label: 'bez pritiska', text: 'Volela bih opušten plan bez velikih očekivanja i sa prijatnom atmosferom.' }
    ],
    edukacija_meetup: [
      { label: 'predavanje', text: 'Tražim društvo za predavanje, meetup ili radionicu. Lepo bi mi značilo da ne idem sama.' },
      { label: 'networking', text: 'Ako je neko za edukativan događaj i kratko upoznavanje posle, rado ću se javiti.' },
      { label: 'jasan plan', text: 'Bitno mi je da se lako dogovorimo oko dolaska i osnovnih detalja.' }
    ],
    drugo: [
      { label: 'spontano', text: 'Tražim društvo za ovaj plan i volela bih brz, jednostavan dogovor.' },
      { label: 'mala ekipa', text: 'Najviše mi odgovara mala ekipa ili još jedna osoba za prijatno druženje.' },
      { label: 'jasan dogovor', text: 'Ako ti ovo zvuči zanimljivo, javi se da se lako uskladimo oko detalja.' }
    ]
  };
  return presets[category] || presets.drugo;
}

function applyCreateDescriptionPrompt(text = '') {
  const input = document.getElementById('create-desc');
  if (!input) return;
  input.value = text || '';
  input.focus();
}

function refreshCreateDescriptionSuggestions(context = {}) {
  const box = document.getElementById('create-desc-suggestions');
  if (!box) return;
  box.style.display = 'flex';
  const suggestions = _createDescriptionSuggestionSet(context);
  box.innerHTML = suggestions.map(item => {
    const safeText = _escHtml(String(item.text || '')).replace(/'/g, '&#39;');
    return `<button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateDescriptionPrompt('${safeText}')">${_escHtml(item.label || _langText('predlog', 'suggestion'))}</button>`;
  }).join('');
}

function clearSelectedCreateOrganizer() {
  const input = document.getElementById('create-organizer');
  if (input) {
    delete input.dataset.organizerId;
    delete input.dataset.eventId;
    delete input.dataset.contextType;
  }
}

function selectCreateOrganizer(organizerId) {
  const input = document.getElementById('create-organizer');
  const list = document.getElementById('create-organizer-suggestions');
  const organizer = getOrganizerById(organizerId);
  if (!input || !organizer) return;
  input.value = organizer.name || '';
  input.dataset.organizerId = organizer.id;
  input.dataset.contextType = 'organizer';
  if (list) {
    list.innerHTML = `
      <div class="create-organizer-suggest is-selected">
        <div class="create-organizer-suggest-title">${_escHtml(organizer.name || 'Organizer')}</div>
        <div class="create-organizer-suggest-meta">Mesto / organizer · ${_escHtml(organizer.city || 'Grad nije unet')}${organizer.instagram ? ' · @' + _escHtml(organizer.instagram) : ''}</div>
      </div>
    `;
    list.style.display = '';
  }
}

function selectCreateEventReference(eventId) {
  const input = document.getElementById('create-organizer');
  const list = document.getElementById('create-organizer-suggestions');
  const event = _combinedEventCards().find(item => item.id === eventId);
  if (!input || !event) return;
  input.value = event.title || '';
  input.dataset.eventId = event.id;
  input.dataset.contextType = 'event';
  delete input.dataset.organizerId;
  if (list) {
    list.innerHTML = `
      <div class="create-organizer-suggest is-selected">
        <div class="create-organizer-suggest-title">${_escHtml(event.title || _langText('Događaj', 'Event'))}</div>
        <div class="create-organizer-suggest-meta">${_langText('Postojeći događaj', 'Existing event')} · ${_escHtml(event.meta || event.location_name || _langText('Detalji nisu upisani', 'Details have not been added'))}</div>
      </div>
    `;
    list.style.display = '';
  }
}

function renderCreateOrganizerSuggestions() {
  const input = document.getElementById('create-organizer');
  const list = document.getElementById('create-organizer-suggestions');
  if (!input || !list) return;
  const query = _createOrganizerQueryValue();
  const selectedId = input.dataset.organizerId || '';
  const selectedEventId = input.dataset.eventId || '';
  const selected = selectedId ? getOrganizerById(selectedId) : null;
  const selectedEvent = selectedEventId ? _combinedEventCards().find(item => item.id === selectedEventId) : null;
  if (selected && query && query === (selected.name || '')) {
    list.innerHTML = `
      <div class="create-organizer-suggest is-selected">
        <div class="create-organizer-suggest-title">${_escHtml(selected.name || 'Organizer')}</div>
        <div class="create-organizer-suggest-meta">Mesto / organizer · ${_escHtml(selected.city || 'Grad nije unet')}${selected.instagram ? ' · @' + _escHtml(selected.instagram) : ''}</div>
      </div>
    `;
    list.style.display = '';
    return;
  }
  if (selectedEvent && query && query === (selectedEvent.title || '')) {
    list.innerHTML = `
      <div class="create-organizer-suggest is-selected">
        <div class="create-organizer-suggest-title">${_escHtml(selectedEvent.title || _langText('Događaj', 'Event'))}</div>
        <div class="create-organizer-suggest-meta">${_langText('Postojeći događaj', 'Existing event')} · ${_escHtml(selectedEvent.meta || selectedEvent.location_name || _langText('Detalji nisu upisani', 'Details have not been added'))}</div>
      </div>
    `;
    list.style.display = '';
    return;
  }
  if (!selected || query !== (selected.name || '')) {
    clearSelectedCreateOrganizer();
  }
  const organizerMatches = _matchingOrganizersForQuery(query, getUser()?.city || '');
  const eventMatches = _matchingEventsForQuery(query, getUser()?.city || '');
  if (!organizerMatches.length && !eventMatches.length) {
    list.innerHTML = '';
    list.style.display = 'none';
    return;
  }
  const eventHtml = eventMatches.length ? `
    <div class="create-organizer-suggest-list">
      <div class="admin-mini" style="padding:0 4px 6px">${_langText('Postojeći događaji', 'Existing events')}</div>
      ${eventMatches.map(item => `
        <button type="button" class="create-organizer-suggest" onclick="selectCreateEventReference('${item.id}')">
          <div class="create-organizer-suggest-title">${_escHtml(item.title || _langText('Događaj', 'Event'))}</div>
          <div class="create-organizer-suggest-meta">${_escHtml(item.meta || item.location_name || _langText('Detalji nisu upisani', 'Details have not been added'))}</div>
        </button>
      `).join('')}
    </div>` : '';
  const organizerHtml = organizerMatches.length ? `
    <div class="create-organizer-suggest-list">
      <div class="admin-mini" style="padding:0 4px 6px">Mesta i organizatori</div>
      ${organizerMatches.map(item => `
        <button type="button" class="create-organizer-suggest" onclick="selectCreateOrganizer('${item.id}')">
          <div class="create-organizer-suggest-title">${_escHtml(item.name || 'Organizer')}</div>
          <div class="create-organizer-suggest-meta">${_escHtml(item.city || 'Grad nije unet')}${item.instagram ? ' · @' + _escHtml(item.instagram) : ''}</div>
        </button>
      `).join('')}
    </div>` : '';
  list.innerHTML = `${eventHtml}${organizerHtml}`;
  list.style.display = '';
}

function loadCreateForm() {
  const headerEl = document.getElementById('create-page-title');
  const saveBtn = document.getElementById('create-submit-btn');
  const contextEl = document.getElementById('create-event-context');
  const categoryWrap = document.getElementById('create-category-wrap');
  const tagsWrap = document.getElementById('create-tags-wrap');
  const dateWrap = document.getElementById('create-date-wrap');
  const timeWrap = document.getElementById('create-time-wrap');
  const locationWrap = document.getElementById('create-location-wrap');
  const coverWrap = document.getElementById('create-cover-wrap');
  const organizerWrap = document.getElementById('create-organizer-wrap');
  const sourceUrlWrap = document.getElementById('create-source-url-wrap');
  const vibesWrap = document.getElementById('create-vibes-wrap');
  const spotsWrap = document.getElementById('create-spots-wrap');
  const ticketPriceWrap = document.getElementById('create-ticket-price-wrap');
  const intentCard = document.getElementById('create-intent-card');
  const reviewNote = document.getElementById('create-review-note');
  const reviewNoteTitle = document.getElementById('create-review-note-title');
  const reviewNoteCopy = document.getElementById('create-review-note-copy');
  const suggestionsEl = document.getElementById('create-title-suggestions');
  const organizerEl = document.getElementById('create-organizer');
  const sourceUrlEl = document.getElementById('create-source-url');
  const titleLabel = document.getElementById('create-title-label');
  const titleHint = document.getElementById('create-title-hint');
  const categoryLabel = document.getElementById('create-category-label');
  const contextLabel = document.getElementById('create-context-label');
  const contextHint = document.getElementById('create-context-hint');
  const dateLabelEl = document.getElementById('create-date-label');
  const timeLabelEl = document.getElementById('create-time-label');
  const locationLabel = document.getElementById('create-location-label');
  const cityLabel = document.getElementById('create-city-label');
  const descLabel = document.getElementById('create-desc-label');
  const descHint = document.getElementById('create-desc-hint');
  const spotsLabel = document.getElementById('create-spots-label');
  const ticketPriceLabel = document.getElementById('create-ticket-price-label');
  const vibesLabel = document.getElementById('create-vibes-label');
  const vibesHint = document.getElementById('create-vibes-hint');
  const roleCaps = typeof getRoleCapabilities === 'function'
    ? getRoleCapabilities()
    : { canPublishManagedEvents: false };
  const intentBlocks = intentCard ? intentCard.querySelectorAll('div') : [];
  const intentTitleEl = intentBlocks[1] || null;
  const intentCopyEl = intentBlocks[2] || null;

  if (_planEventId && !_editingEventId) {
    const card = _combinedEventCards().find(item => item.id === _planEventId);
    const raw = card?.raw || {};
    const titleEl = document.getElementById('create-title');
    const descEl = document.getElementById('create-desc');
    const spotsEl = document.getElementById('create-spots');
    if (headerEl) headerEl.textContent = 'Objavi plan za događaj';
    if (saveBtn) saveBtn.textContent = 'Objavi plan';
    if (intentCard) intentCard.style.display = '';
    if (titleEl) titleEl.value = '';
    if (titleEl) titleEl.placeholder = `npr. Tražim društvo za ${card?.title || 'ovaj događaj'}`;
    if (descEl) descEl.value = '';
    if (spotsEl) spotsEl.value = '';
    if (contextEl) {
      const meta = [card?.date || raw.starts_at?.slice(0, 10) || '', raw.location_name || raw.city || 'Lokacija nije upisana'].filter(Boolean).join(' · ');
      contextEl.style.display = '';
      contextEl.innerHTML = `<div style="font-size:12px;color:var(--purple);font-weight:700;margin-bottom:4px">${_langText('Povezano sa događajem', 'Connected to event')}</div><div style="font-size:15px;font-weight:800;color:var(--ink)">${_escHtml(card?.title || _langText('Događaj', 'Event'))}</div><div style="font-size:13px;color:var(--ink3);margin-top:4px">${_escHtml(meta)}</div>`;
    }
    if (categoryWrap) categoryWrap.style.display = 'none';
    if (tagsWrap) tagsWrap.style.display = 'none';
    if (dateWrap) dateWrap.style.display = 'none';
    if (timeWrap) timeWrap.style.display = 'none';
    if (locationWrap) locationWrap.style.display = 'none';
    if (coverWrap) coverWrap.style.display = 'none';
    document.querySelectorAll('[data-create-vibe]').forEach(btn => btn.classList.remove('active'));
    if (suggestionsEl) {
      const safeTitle = _escHtml(card?.title || 'ovaj događaj').replace(/'/g, '&#39;');
      suggestionsEl.innerHTML = `
        <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Tražim društvo za ${safeTitle}')">za ovaj događaj</button>
        <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Tražim društvo za dolazak ranije na ${safeTitle}')">ranije okupljanje</button>
        <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Tražim društvo za odlazak na ${safeTitle}')">zajednički odlazak</button>
        <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('Tražim društvo za posle ${safeTitle}')">plan posle</button>
      `;
    }
    refreshCreateDescriptionSuggestions({
      eventTitle: card?.title || 'ovaj događaj',
      category: raw.category || card?.cat || 'drugo',
      location: raw.location_name || raw.city || ''
    });
    _pendingEventCover = '';
    _setCreateCoverPreview('');
    return;
  }

  if (!_editingEventId) {
    if (_createFlowMode === 'suggest') {
      if (headerEl) headerEl.textContent = _langText('Predloži događaj', 'Suggest an event');
      if (saveBtn) saveBtn.textContent = _langText('Pošalji predlog', 'Send suggestion');
      if (contextEl) contextEl.style.display = 'none';
      if (categoryWrap) categoryWrap.style.display = '';
      if (tagsWrap) tagsWrap.style.display = 'none';
      if (dateWrap) dateWrap.style.display = '';
      if (timeWrap) timeWrap.style.display = '';
      if (locationWrap) locationWrap.style.display = '';
      if (coverWrap) coverWrap.style.display = 'none';
      if (organizerWrap) organizerWrap.style.display = '';
      if (sourceUrlWrap) sourceUrlWrap.style.display = '';
      if (vibesWrap) vibesWrap.style.display = 'none';
      if (spotsWrap) spotsWrap.style.display = 'none';
      if (ticketPriceWrap) ticketPriceWrap.style.display = 'none';
      if (intentCard) intentCard.style.display = 'none';
      if (reviewNote) reviewNote.style.display = '';
      if (reviewNoteTitle) reviewNoteTitle.textContent = _langText('Predloži događaj', 'Suggest an event');
      if (reviewNoteCopy) reviewNoteCopy.textContent = _langText('Ovo nije direktna objava događaja. Pošalji osnovne podatke, a mitmi admin će proveriti detalje i objaviti događaj ako je sve u redu.', 'This is not a direct event publish flow. Send the basics and a mitmi admin will review the details and publish the event if everything looks good.');
      if (titleLabel) titleLabel.textContent = _langText('Naziv događaja', 'Event title');
      if (categoryLabel) categoryLabel.textContent = _langText('Kategorija', 'Category');
      if (dateLabelEl) dateLabelEl.textContent = _langText('Datum', 'Date');
      if (timeLabelEl) timeLabelEl.textContent = _langText('Vreme', 'Time');
      if (locationLabel) locationLabel.textContent = _langText('Mesto održavanja', 'Venue / place');
      if (cityLabel) cityLabel.textContent = _langText('Grad', 'City');
      if (addressLabel) addressLabel.textContent = _langText('Adresa (opciono)', 'Address (optional)');
      if (contextLabel) contextLabel.textContent = _langText('Organizer ili mesto (opciono)', 'Organizer or place (optional)');
      if (contextHint) contextHint.textContent = _langText('Ako znaš ko organizuje događaj ili gde se održava, dodaj to ovde da admin lakše poveže pravi profil.', 'If you know who organizes the event or where it takes place, add it here so the admin can match the right profile faster.');
      if (descLabel) descLabel.textContent = _langText('Kratke napomene (opcionalno)', 'Short notes (optional)');
      if (spotsLabel) spotsLabel.textContent = _langText('Broj mesta', 'Number of spots');
      if (ticketPriceLabel) ticketPriceLabel.textContent = _langText('Cena ulaznice (RSD)', 'Ticket price (RSD)');
      const titleEl = document.getElementById('create-title');
      const descEl = document.getElementById('create-desc');
      if (titleEl && !titleEl.value) titleEl.placeholder = _langText('npr. Otvaranje nove izložbe u petak', 'e.g. Opening of a new exhibition on Friday');
      if (descEl) descEl.placeholder = _langText('Šta znaš o događaju, ko organizuje i zašto vredi da se pojavi u aplikaciji...', 'What do you know about the event, who organizes it, and why should it appear in the app...');
      if (organizerEl && !organizerEl.value) organizerEl.placeholder = _langText('npr. SKCNS ili @skcns', 'e.g. SKCNS or @skcns');
      if (sourceUrlEl && !sourceUrlEl.value) sourceUrlEl.placeholder = 'https://instagram.com/...';
      renderCreateOrganizerSuggestions();
      renderCreateTagOptions(document.getElementById('create-category')?.value || 'muzika');
      setSelectedCreateTags([]);
      if (suggestionsEl) {
        suggestionsEl.innerHTML = `
          <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('${_escJsArg(_langText('Koncert u subotu u centru', 'Concert on Saturday downtown'))}')">${_langText('koncert', 'concert')}</button>
          <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('${_escJsArg(_langText('Nova izložba ovog vikenda', 'New exhibition this weekend'))}')">${_langText('izložba', 'exhibition')}</button>
          <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('${_escJsArg(_langText('Turnir i sportski događaj u gradu', 'Tournament and sports event in town'))}')">${_langText('sport', 'sport')}</button>
          <button type="button" class="tag tag-outline" style="cursor:pointer" onclick="applyCreateTitlePrompt('${_escJsArg(_langText('Večernji program u gradu', 'Evening program in town'))}')">${_langText('večernji program', 'evening program')}</button>
        `;
      }
      refreshCreateDescriptionSuggestions();
      return;
    }

    const isManagedCreate = _createFlowMode === 'managed'
      || (_createFlowMode === 'auto' && roleCaps.canPublishManagedEvents);
    if (headerEl) headerEl.textContent = isManagedCreate ? _langText('Objavi događaj', 'Publish event') : _langText('Tražim društvo', 'Looking for company');
    if (saveBtn) saveBtn.textContent = isManagedCreate ? _langText('Objavi događaj', 'Publish event') : _langText('Objavi plan', 'Publish plan');
    if (contextEl) contextEl.style.display = 'none';
    if (categoryWrap) categoryWrap.style.display = '';
    if (tagsWrap) tagsWrap.style.display = '';
    if (dateWrap) dateWrap.style.display = '';
    if (timeWrap) timeWrap.style.display = '';
    if (locationWrap) locationWrap.style.display = '';
    if (coverWrap) coverWrap.style.display = '';
    if (organizerWrap) organizerWrap.style.display = '';
    if (sourceUrlWrap) sourceUrlWrap.style.display = 'none';
    if (vibesWrap) vibesWrap.style.display = isManagedCreate ? 'none' : '';
    if (spotsWrap) spotsWrap.style.display = '';
    if (ticketPriceWrap) ticketPriceWrap.style.display = isManagedCreate ? '' : 'none';
    if (intentCard) intentCard.style.display = isManagedCreate ? 'none' : '';
    if (reviewNote) reviewNote.style.display = 'none';
    if (titleLabel) titleLabel.textContent = isManagedCreate ? _langText('Naziv događaja', 'Event title') : _langText('Naslov plana', 'Plan title');
    if (titleHint) {
      titleHint.textContent = isManagedCreate
        ? _langText('Najbolje prolaze kratki nazivi koji odmah kažu o kakvom događaju se radi.', 'Short titles that clearly say what the event is tend to work best.')
        : _langText('Najbolje prolaze kratki naslovi koji odmah kažu kakav plan imaš.', 'Short titles that immediately explain your plan tend to work best.');
    }
    if (categoryLabel) categoryLabel.textContent = _langText('Kategorija', 'Category');
    renderCreateTagOptions(document.getElementById('create-category')?.value || 'muzika');
    setSelectedCreateTags([]);
    if (dateLabelEl) dateLabelEl.textContent = _langText('Datum', 'Date');
    if (timeLabelEl) timeLabelEl.textContent = _langText('Vreme', 'Time');
    if (locationLabel) locationLabel.textContent = _langText('Mesto održavanja', 'Venue / place');
    if (cityLabel) cityLabel.textContent = _langText('Grad', 'City');
    if (addressLabel) addressLabel.textContent = _langText('Adresa (opciono)', 'Address (optional)');
    if (contextLabel) contextLabel.textContent = isManagedCreate
      ? _langText('Organizer (opciono)', 'Organizer (optional)')
      : _langText('Događaj ili mesto (opciono)', 'Event or place (optional)');
    if (contextHint) {
      contextHint.textContent = isManagedCreate
        ? _langText('Dodaj naziv organizatora ako postoji. Ako organizer još nema profil, mitmi će napraviti organizer u pripremi i povezati ga sa događajem.', 'Add the organizer name if it exists. If it does not have a profile yet, mitmi will create an unclaimed organizer and connect it to the event.')
        : _langText('Ako je plan vezan za neki događaj, klub ili mesto, dodaj ga ovde. Ako nije, ostavi prazno.', 'If the plan is tied to an event, club, or place, add it here. If not, leave it empty.');
    }
    if (descLabel) descLabel.textContent = isManagedCreate ? _langText('Opis događaja (opcionalno)', 'Event description (optional)') : _langText('Opis (opcionalno)', 'Description (optional)');
    if (descHint) {
      descHint.textContent = isManagedCreate
        ? _langText('Kratak i jasan opis događaja prolazi bolje od dugog objašnjenja.', 'A short and clear event description works better than a long explanation.')
        : _langText('Kratak i konkretan opis prolazi bolje od dugog objašnjenja.', 'A short and concrete description works better than a long explanation.');
    }
    if (spotsLabel) spotsLabel.textContent = isManagedCreate ? _langText('Kapacitet (opcionalno)', 'Capacity (optional)') : _langText('Broj mesta', 'Number of spots');
    if (ticketPriceLabel) ticketPriceLabel.textContent = _langText('Cena ulaznice (RSD)', 'Ticket price (RSD)');
    if (vibesLabel) vibesLabel.textContent = _langText('Vibe / kakvo društvo tražiš', 'Vibe / what kind of company you want');
    if (vibesHint) vibesHint.textContent = _langText('Izaberi do 3 taga da ljudi odmah vide kakvu ekipu tražiš.', 'Choose up to 3 tags so people instantly see what kind of company you want.');
    if (intentTitleEl) intentTitleEl.textContent = isManagedCreate ? _langText('Kreiraj događaj...', 'Create an event...') : _langText('Tražim društvo za...', 'Looking for company for...');
    if (intentCopyEl) {
      intentCopyEl.textContent = isManagedCreate
        ? _langText('Kreiraj događaj sa jasnim naslovom, vremenom i lokacijom da bi drugi lako mogli da ga pronađu.', 'Create an event with a clear title, time, and location so others can find it easily.')
        : _langText('Napiši konkretan plan. Ljudi brže reaguju kad odmah vide za šta tražiš društvo.', 'Write a concrete plan. People respond faster when they immediately understand what you want company for.');
    }
    const titleEl = document.getElementById('create-title');
    const descEl = document.getElementById('create-desc');
    if (titleEl && !titleEl.value) {
      titleEl.placeholder = isManagedCreate
        ? _langText('npr. Letnji live nastup u subotu', 'e.g. Summer live show on Saturday')
        : _langText('npr. Društvo za večerašnji izlazak', 'e.g. Company for going out tonight');
    }
    if (descEl) {
      descEl.placeholder = isManagedCreate
        ? _langText('Kratko opiši program, atmosferu i bitne detalje događaja...', 'Briefly describe the program, atmosphere, and key event details...')
        : _langText('Šta tražiš, kakvo društvo...', 'What are you looking for, what kind of company...');
    }
    if (organizerEl && !organizerEl.value) {
      organizerEl.placeholder = isManagedCreate
        ? _langText('npr. Exit, Dom omladine, Zappa Baza', 'e.g. Exit, Youth Center, Zappa Baza')
        : _langText('npr. SKCNS, Dom omladine ili naziv događaja', 'e.g. SKCNS, Youth Center, or event name');
    }
    if (suggestionsEl) {
      suggestionsEl.style.display = isManagedCreate ? 'none' : 'flex';
    }
    if (!isManagedCreate) {
      refreshCreateDescriptionSuggestions();
    } else {
      const descSuggestions = document.getElementById('create-desc-suggestions');
      if (descSuggestions) {
        descSuggestions.innerHTML = '';
        descSuggestions.style.display = 'none';
      }
    }
    return;
  }
  const card = _combinedEventCards().find(item => item.id === _editingEventId);
  const raw = card?.raw || {};
  const date = raw.starts_at ? new Date(raw.starts_at) : null;
  const titleEl = document.getElementById('create-title');
  const categoryEl = document.getElementById('create-category');
  const dateEl = document.getElementById('create-date');
  const timeEl = document.getElementById('create-time');
  const locationEl = document.getElementById('create-location');
  const cityEl = document.getElementById('create-city');
  const addressEl = document.getElementById('create-address');
  const descEl = document.getElementById('create-desc');
  const spotsEl = document.getElementById('create-spots');
  const ticketPriceEl = document.getElementById('create-ticket-price');
  if (headerEl) headerEl.textContent = _langText('Uredi događaj', 'Edit event');
  if (saveBtn) saveBtn.textContent = _langText('Sačuvaj izmene', 'Save changes');
  if (contextEl) contextEl.style.display = 'none';
  if (intentCard) intentCard.style.display = 'none';
  if (reviewNote) reviewNote.style.display = 'none';
  if (categoryWrap) categoryWrap.style.display = '';
  if (tagsWrap) tagsWrap.style.display = '';
  if (dateWrap) dateWrap.style.display = '';
  if (timeWrap) timeWrap.style.display = '';
  if (locationWrap) locationWrap.style.display = '';
  if (coverWrap) coverWrap.style.display = '';
  if (organizerWrap) organizerWrap.style.display = 'none';
  if (sourceUrlWrap) sourceUrlWrap.style.display = 'none';
  if (vibesWrap) vibesWrap.style.display = 'none';
  if (spotsWrap) spotsWrap.style.display = '';
  if (ticketPriceWrap) ticketPriceWrap.style.display = '';
  if (titleLabel) titleLabel.textContent = _langText('Naziv događaja', 'Event title');
  if (titleHint) titleHint.textContent = _langText('Najbolje prolaze kratki nazivi koji odmah kažu o kakvom događaju se radi.', 'Short titles that clearly say what the event is tend to work best.');
  if (descLabel) descLabel.textContent = _langText('Opis događaja (opcionalno)', 'Event description (optional)');
  if (descHint) descHint.textContent = _langText('Kratak i jasan opis događaja prolazi bolje od dugog objašnjenja.', 'A short and clear event description works better than a long explanation.');
  if (spotsLabel) spotsLabel.textContent = _langText('Kapacitet (opcionalno)', 'Capacity (optional)');
  if (ticketPriceLabel) ticketPriceLabel.textContent = _langText('Cena ulaznice (RSD)', 'Ticket price (RSD)');
  if (locationLabel) locationLabel.textContent = _langText('Mesto održavanja', 'Venue / place');
  if (cityLabel) cityLabel.textContent = _langText('Grad', 'City');
  document.querySelectorAll('[data-create-vibe]').forEach(btn => btn.classList.remove('active'));
  if (titleEl) titleEl.value = raw.title || card?.title || '';
  if (categoryEl) categoryEl.value = _normalizeEventCategoryKey(raw.category || card?.raw_category || card?.cat || 'muzika');
  renderCreateTagOptions(categoryEl?.value || raw.category || 'drugo');
  setSelectedCreateTags(raw.tags || card?.tags || _getEventTags(_editingEventId));
  if (dateEl) dateEl.value = raw.starts_at ? raw.starts_at.slice(0, 10) : (card?.date || '');
  if (timeEl && date && !Number.isNaN(date.getTime())) timeEl.value = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (locationEl) locationEl.value = raw.location_name || '';
  if (cityEl) cityEl.value = raw.city || getUser()?.city || '';
  if (addressEl) addressEl.value = raw.public_address || '';
  if (descEl) descEl.value = raw.description || '';
  if (descEl) descEl.placeholder = _langText('Kratko opiši program, atmosferu i bitne detalje događaja...', 'Briefly describe the program, atmosphere, and key event details...');
  if (spotsEl) spotsEl.value = raw.capacity || '';
  if (ticketPriceEl) ticketPriceEl.value = raw.ticket_price_rsd ?? '';
  if (suggestionsEl) suggestionsEl.style.display = 'none';
  const descSuggestions = document.getElementById('create-desc-suggestions');
  if (descSuggestions) {
    descSuggestions.innerHTML = '';
    descSuggestions.style.display = 'none';
  }
  _pendingEventCover = card?.cover_url || _getEventCover(_editingEventId) || '';
  _setCreateCoverPreview(_pendingEventCover);
}

function toggleCreateVibe(btn, vibeKey = '') {
  if (!btn || !vibeKey) return;
  const active = Array.from(document.querySelectorAll('[data-create-vibe].active'));
  if (!btn.classList.contains('active') && active.length >= 3) {
    showToast(_langText('Izaberi najviše 3 vibe taga', 'Choose up to 3 vibe tags'), 'info', 1500);
    return;
  }
  btn.classList.toggle('active');
}

function getSelectedCreateVibes() {
  return _normalizeInviteVibes(
    Array.from(document.querySelectorAll('[data-create-vibe].active')).map(btn => btn.dataset.createVibe || '')
  );
}

function openCreatePlanForEvent(eventId = null) {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  if (!eventId) {
    showToast(_langText('Prvo otvori događaj za koji želiš da objaviš plan', 'Open the event first before posting a plan for it'), 'info', 1800);
    return;
  }
  resetCreateForm();
  _createFlowMode = 'social';
  _planEventId = eventId;
  nav('create');
  setTimeout(() => loadCreateForm(), 0);
}

const openCreateInviteForEvent = openCreatePlanForEvent;

async function openCreateEvent(eventId = null, mode = 'auto') {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  if (!eventId) {
    resetCreateForm();
    _createFlowMode = mode || 'auto';
    nav('create');
    setTimeout(() => loadCreateForm(), 0);
    return;
  }
  _editingEventId = eventId;
  let card = _combinedEventCards().find(item => item.id === eventId) || null;
  if (!card && _isSupabaseConfigured()) {
    try {
      const rows = await _supaGet('events', {
        select: 'id,creator_id,venue_id,organizer_id,title,description,category,event_tags,city,location_name,public_address,starts_at,capacity,attendee_count,ticket_price_rsd,cover_url,is_published,is_cancelled,created_at',
        id: `eq.${eventId}`,
        limit: '1'
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row) {
        card = _mapDbEventToCard(row);
        _replaceRealEventCard(card);
      }
    } catch (e) {
      console.warn('[mitmi] openCreateEvent:', e.message);
    }
  }
  const raw = card?.raw || {};
  const isManagedEvent = !!(raw.organizer_id || raw.venue_id);
  const isOwnSocialEvent = !isManagedEvent && raw.creator_id === getUser()?.id;
  _createFlowMode = isOwnSocialEvent ? 'social' : 'managed';
  nav('create');
  setTimeout(() => loadCreateForm(), 0);
}

function _draftSubmitterLabel() {
  const user = getUser() || {};
  return user.display_name || user.username || user.email || _langText('mitmi korisnik', 'mitmi user');
}

function _extractOrganizerInstagram(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const handleMatch = text.match(/@([a-z0-9._]+)/i);
  if (handleMatch) return handleMatch[1].toLowerCase();
  try {
    const parsed = new URL(text);
    if ((parsed.hostname || '').includes('instagram.com')) {
      return (parsed.pathname.split('/').filter(Boolean)[0] || '').replace(/^@+/, '').toLowerCase();
    }
  } catch (e) {}
  return '';
}

async function handleSuggestEventSubmit() {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  const title = document.getElementById('create-title')?.value.trim();
  const category = document.getElementById('create-category')?.value || '';
  const date = document.getElementById('create-date')?.value || '';
  const time = document.getElementById('create-time')?.value || '';
  const location = document.getElementById('create-location')?.value.trim();
  const city = document.getElementById('create-city')?.value.trim() || '';
  const desc = document.getElementById('create-desc')?.value.trim();
  const organizer = document.getElementById('create-organizer')?.value.trim();
  const sourceUrl = document.getElementById('create-source-url')?.value.trim();
  const organizerId = document.getElementById('create-organizer')?.dataset.organizerId || null;

  if (!title) { showToast(_langText('Unesi naziv događaja', 'Enter the event title'), 'error'); return; }
  if (!category) { showToast(_langText('Izaberi kategoriju', 'Choose a category'), 'error'); return; }
  if (!date) { showToast(_langText('Izaberi datum događaja', 'Choose the event date'), 'error'); return; }
  if (!city) { showToast(_langText('Unesi grad događaja', 'Enter the event city'), 'error'); return; }
  if (!location) { showToast(_langText('Unesi lokaciju ili mesto održavanja', 'Enter the location or venue'), 'error'); return; }
  if (_containsRestrictedContactInfo(`${title}\n${desc}\n${location}\n${city}`)) {
    showToast(_langText('Predlog događaja ne sme da sadrži telefon, email, Instagram ili druge direktne kontakte u javnom tekstu.', 'The event suggestion must not include phone numbers, email, Instagram, or other direct contacts in public text.'), 'error', 2800);
    return;
  }
  if (sourceUrl) {
    try { new URL(sourceUrl); } catch (e) {
      showToast(_langText('Link nije ispravan', 'The link is invalid'), 'error');
      return;
    }
  }

  const startsAt = time ? `${date}T${time}:00` : `${date}T20:00:00`;
  const payload = {
    source_type: 'user',
    review_status: 'pending',
    title,
    description: desc || null,
    category: _normalizeEventCategoryKey(category),
    event_tags: getSelectedCreateTags(),
    city,
    starts_at: startsAt,
    location_name: location,
    source_url: sourceUrl || null,
    source_label: sourceUrl ? 'user_link' : 'user_manual',
    organizer_id: organizerId || null,
    proposed_organizer_name: organizer || '',
    proposed_organizer_instagram: _extractOrganizerInstagram(organizer || sourceUrl || ''),
    ai_summary: desc || _langText('Korisnik je poslao predlog događaja za admin pregled.', 'A user submitted an event suggestion for admin review.'),
    submitted_by: getUser()?.id || null
  };
  if (!_isSupabaseConfigured()) {
    showToast(_langText('Predlog događaja trenutno nije dostupan. Pokušaj ponovo malo kasnije.', 'Event suggestion is currently unavailable. Please try again a bit later.'), 'error', 2400);
    return;
  }
  try {
    await _supaFetch('/rest/v1/event_drafts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    await Promise.all([
      loadAdminOrganizersFromBackend({ silent: true }),
      loadAdminDraftQueueFromBackend({ silent: true })
    ]);
    renderAdminDrafts();
    resetCreateForm();
    openUnifiedHub('events', 0);
    showToast(_langText('Predlog je poslat adminu na pregled', 'Your suggestion was sent to admin for review'), 'success', 2200);
  } catch (e) {
    console.warn('[mitmi] handleSuggestEventSubmit:', e.message);
    showToast(_langText('Predlog trenutno nije poslat adminu. Sačuvaj podatke i pokušaj ponovo.', 'The suggestion was not sent to admin right now. Save your details and try again.'), 'error', 2600);
  }
}

async function handleCreateCover(input) {
  if (!input.files || !input.files[0]) return;
  try {
    if (input.files[0].size > 8 * 1024 * 1024) {
      showToast('Cover slika je prevelika. Izaberi manju fotografiju.', 'error');
      return;
    }
    const compressed = await compressImage(input.files[0], 960, 0.72);
    _pendingEventCover = compressed;
    _setCreateCoverPreview(compressed);
    showToast('Cover slika je dodata', 'success', 1800);
  } catch (e) {
    showToast('Slika nije uspela da se obradi', 'error');
  } finally {
    input.value = '';
  }
}

function clearCreateCover() {
  _pendingEventCover = '';
  _setCreateCoverPreview('');
}
