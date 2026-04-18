// Shared global stores must exist before any dependent event/admin scripts run.
// index.html loads this file before events-data/events-admin-shared.
var REAL_EVENT_DATA = Array.isArray(globalThis.REAL_EVENT_DATA) ? globalThis.REAL_EVENT_DATA : [];
globalThis.REAL_EVENT_DATA = REAL_EVENT_DATA;
var ADMIN_ORGANIZERS = Array.isArray(globalThis.ADMIN_ORGANIZERS) ? globalThis.ADMIN_ORGANIZERS : [];
globalThis.ADMIN_ORGANIZERS = ADMIN_ORGANIZERS;
var EVENT_DRAFTS = Array.isArray(globalThis.EVENT_DRAFTS) ? globalThis.EVENT_DRAFTS : [];
globalThis.EVENT_DRAFTS = EVENT_DRAFTS;
var FOLLOWED_EVENTS = Array.isArray(globalThis.FOLLOWED_EVENTS) ? globalThis.FOLLOWED_EVENTS : [];
globalThis.FOLLOWED_EVENTS = FOLLOWED_EVENTS;
var PROFILE_DIRECTORY = Array.isArray(globalThis.PROFILE_DIRECTORY) ? globalThis.PROFILE_DIRECTORY : [];
globalThis.PROFILE_DIRECTORY = PROFILE_DIRECTORY;
var FOLLOWED_PROFILE_IDS = Array.isArray(globalThis.FOLLOWED_PROFILE_IDS) ? globalThis.FOLLOWED_PROFILE_IDS : [];
globalThis.FOLLOWED_PROFILE_IDS = FOLLOWED_PROFILE_IDS;
var BLOCKED_PROFILE_IDS = Array.isArray(globalThis.BLOCKED_PROFILE_IDS) ? globalThis.BLOCKED_PROFILE_IDS : [];
globalThis.BLOCKED_PROFILE_IDS = BLOCKED_PROFILE_IDS;
var ADMIN_CLAIM_REQUESTS = Array.isArray(globalThis.ADMIN_CLAIM_REQUESTS) ? globalThis.ADMIN_CLAIM_REQUESTS : [];
globalThis.ADMIN_CLAIM_REQUESTS = ADMIN_CLAIM_REQUESTS;
var ADMIN_MODERATION_ITEMS = Array.isArray(globalThis.ADMIN_MODERATION_ITEMS) ? globalThis.ADMIN_MODERATION_ITEMS : [];
globalThis.ADMIN_MODERATION_ITEMS = ADMIN_MODERATION_ITEMS;
var ADMIN_PLAN_SIGNALS = Array.isArray(globalThis.ADMIN_PLAN_SIGNALS) ? globalThis.ADMIN_PLAN_SIGNALS : [];
globalThis.ADMIN_PLAN_SIGNALS = ADMIN_PLAN_SIGNALS;
var ADMIN_ORPHAN_EVENTS = Array.isArray(globalThis.ADMIN_ORPHAN_EVENTS) ? globalThis.ADMIN_ORPHAN_EVENTS : [];
globalThis.ADMIN_ORPHAN_EVENTS = ADMIN_ORPHAN_EVENTS;
var _currentPublicProfileId = globalThis._currentPublicProfileId || null;
globalThis._currentPublicProfileId = _currentPublicProfileId;
var _currentPublicVenueId = globalThis._currentPublicVenueId || null;
globalThis._currentPublicVenueId = _currentPublicVenueId;
var _currentPublicVenueTarget = globalThis._currentPublicVenueTarget || null;
globalThis._currentPublicVenueTarget = _currentPublicVenueTarget;
var _reportContext = globalThis._reportContext || { type:'profile', profileId:null, venueId:null, eventId:null, label:'' };
globalThis._reportContext = _reportContext;

const CAT_EMOJI = {
  muzika:'🎵',
  scena_humor:'🎭',
  kultura_umetnost:'🎨',
  sport_rekreacija:'⚽',
  izlasci_druzenje:'🍸',
  napolju:'🌿',
  hobiji_igre:'🎲',
  edukacija_meetup:'📚',
  svirka:'🎵',
  dj:'🎧',
  standup:'🎤',
  sport:'⚽',
  kultura:'🎨',
  pozoriste:'🎭',
  izlozba:'🖼️',
  film:'🎬',
  kafa:'☕',
  kafana:'🥂',
  bar:'🍸',
  festival:'🎪',
  radionica:'🛠️',
  priroda:'🌿',
  izlasci:'🍸',
  drugo:'✨'
};

const EVENT_CATEGORY_META = {
  muzika: { bucket: 'muzika', label: 'Muzika' },
  scena_humor: { bucket: 'scena_humor', label: 'Scena i humor' },
  kultura_umetnost: { bucket: 'kultura_umetnost', label: 'Kultura i umetnost' },
  sport_rekreacija: { bucket: 'sport_rekreacija', label: 'Sport i rekreacija' },
  izlasci_druzenje: { bucket: 'izlasci_druzenje', label: 'Izlasci i druženje' },
  napolju: { bucket: 'napolju', label: 'Napolju' },
  hobiji_igre: { bucket: 'hobiji_igre', label: 'Hobiji i igre' },
  edukacija_meetup: { bucket: 'edukacija_meetup', label: 'Edukacija i meetup' },
  svirka: { bucket: 'muzika', label: 'Muzika' },
  dj: { bucket: 'muzika', label: 'Muzika' },
  standup: { bucket: 'scena_humor', label: 'Scena i humor' },
  festival: { bucket: 'muzika', label: 'Muzika' },
  sport: { bucket: 'sport_rekreacija', label: 'Sport i rekreacija' },
  kultura: { bucket: 'kultura_umetnost', label: 'Kultura i umetnost' },
  pozoriste: { bucket: 'scena_humor', label: 'Scena i humor' },
  izlozba: { bucket: 'kultura_umetnost', label: 'Kultura i umetnost' },
  film: { bucket: 'kultura_umetnost', label: 'Kultura i umetnost' },
  radionica: { bucket: 'edukacija_meetup', label: 'Edukacija i meetup' },
  kafa: { bucket: 'izlasci_druzenje', label: 'Izlasci i druženje' },
  kafana: { bucket: 'izlasci_druzenje', label: 'Izlasci i druženje' },
  bar: { bucket: 'izlasci_druzenje', label: 'Izlasci i druženje' },
  izlasci: { bucket: 'izlasci_druzenje', label: 'Izlasci i druženje' },
  priroda: { bucket: 'napolju', label: 'Napolju' },
  drugo: { bucket: 'drugo', label: 'Drugo' }
};

const EVENT_CATEGORY_ALIASES = {
  'scena i humor': 'scena_humor',
  'kultura i umetnost': 'kultura_umetnost',
  'sport i rekreacija': 'sport_rekreacija',
  'izlasci i druzenje': 'izlasci_druzenje',
  napolju: 'napolju',
  'hobiji i igre': 'hobiji_igre',
  'edukacija i meetup': 'edukacija_meetup',
  'stand up': 'standup',
  standup: 'standup',
  'dj vece': 'dj',
  'dj vece / party': 'dj',
  'dj party': 'dj',
  koncert: 'muzika',
  'open air': 'muzika',
  'akusticno vece': 'muzika',
  improv: 'scena_humor',
  performans: 'scena_humor',
  muzej: 'kultura_umetnost',
  kafana: 'kafana',
  'kafana / etno bar': 'kafana',
  'etno bar': 'kafana',
  tamburasi: 'kafana',
  'bar / izlazak': 'bar',
  'film / projekcija': 'film',
  vecera: 'izlasci_druzenje',
  brunch: 'izlasci_druzenje',
  setnja: 'napolju',
  piknik: 'napolju',
  izlet: 'napolju',
  zalazak: 'napolju',
  trcanje: 'sport_rekreacija',
  bicikl: 'sport_rekreacija',
  planinarenje: 'sport_rekreacija',
  kviz: 'hobiji_igre',
  'drustvene igre': 'hobiji_igre',
  gejming: 'hobiji_igre',
  gaming: 'hobiji_igre',
  predavanje: 'edukacija_meetup',
  panel: 'edukacija_meetup',
  meetup: 'edukacija_meetup',
  networking: 'edukacija_meetup',
  konferencija: 'edukacija_meetup'
};

const EVENT_TAG_OPTIONS = {
  muzika: [
    { key: 'svirka', label: '🎸 Svirka' },
    { key: 'dj', label: '🎧 DJ' },
    { key: 'festival', label: '🎪 Festival' },
    { key: 'open_air', label: '🌤 Open air' },
    { key: 'akusticno', label: '🎼 Akustično' }
  ],
  scena_humor: [
    { key: 'stand_up', label: '🎤 Stand up' },
    { key: 'pozoriste', label: '🎭 Pozorište' },
    { key: 'improv', label: '🎬 Improv' },
    { key: 'performans', label: '✨ Performans' }
  ],
  kultura_umetnost: [
    { key: 'izlozba', label: '🖼 Izložba' },
    { key: 'film', label: '🎬 Film' },
    { key: 'muzej', label: '🏛 Muzej' },
    { key: 'radionica', label: '🛠 Radionica' },
    { key: 'knjizevno_vece', label: '📚 Književno veče' }
  ],
  sport_rekreacija: [
    { key: 'trcanje', label: '🏃 Trčanje' },
    { key: 'bicikl', label: '🚴 Bicikl' },
    { key: 'utakmica', label: '🏟 Utakmica' },
    { key: 'trening', label: '💪 Trening' },
    { key: 'planinarenje', label: '🥾 Planinarenje' }
  ],
  izlasci_druzenje: [
    { key: 'kafa', label: '☕ Kafa' },
    { key: 'kafana', label: '🥂 Kafana' },
    { key: 'bar', label: '🍷 Bar' },
    { key: 'vecera', label: '🍽 Večera' },
    { key: 'brunch', label: '🥐 Brunch' },
    { key: 'afterwork', label: '🌆 Afterwork' }
  ],
  napolju: [
    { key: 'setnja', label: '🚶 Šetnja' },
    { key: 'piknik', label: '🧺 Piknik' },
    { key: 'izlet', label: '🌄 Izlet' },
    { key: 'zalazak', label: '🌅 Zalazak' }
  ],
  hobiji_igre: [
    { key: 'kviz', label: '🧠 Kviz' },
    { key: 'drustvene_igre', label: '🎲 Društvene igre' },
    { key: 'gaming', label: '👾 Gejming' },
    { key: 'fotografija', label: '📷 Fotografija' }
  ],
  edukacija_meetup: [
    { key: 'predavanje', label: '🎓 Predavanje' },
    { key: 'meetup', label: '🤝 Meetup' },
    { key: 'networking', label: '🫶 Networking' },
    { key: 'konferencija', label: '🏛 Konferencija' },
    { key: 'panel', label: '🗣 Panel' }
  ],
  drugo: [
    { key: 'lokalni_dogadjaj', label: '📍 Lokalni događaj' },
    { key: 'specijalni_program', label: '✨ Specijalni program' },
    { key: 'community', label: '🤝 Community' }
  ]
};

const INVITE_VIBE_OPTIONS = [
  { key: 'solo_friendly', label: 'Solo friendly' },
  { key: 'mala_ekipa', label: 'Mala ekipa' },
  { key: 'spontano', label: 'Alternativna ekipa' },
  { key: 'brzo_okupljanje', label: 'Mirniji vibe' },
  { key: 'bez_alkohola', label: 'Bez alkohola' },
  { key: 'opušteno', label: 'Opušteno' }
];

function _normalizeEventTags(tags = []) {
  const known = new Set(
    Object.values(EVENT_TAG_OPTIONS)
      .flat()
      .map(item => String(item.key || '').trim())
      .filter(Boolean)
  );
  return Array.from(new Set((Array.isArray(tags) ? tags : [tags])
    .map(item => String(item || '').trim().toLowerCase())
    .filter(item => item && known.has(item)))).slice(0, 4);
}

function _eventTagOptions(category = '') {
  const bucket = _eventVisualCategory(category || 'drugo');
  return EVENT_TAG_OPTIONS[bucket] || EVENT_TAG_OPTIONS.drugo;
}

function _eventTagLabel(tag = '') {
  const normalized = String(tag || '').trim().toLowerCase();
  const option = Object.values(EVENT_TAG_OPTIONS).flat().find(item => item.key === normalized);
  return option?.label || normalized;
}

function _eventVisualCategory(category = '') {
  const normalized = _normalizeEventCategoryKey(category);
  return EVENT_CATEGORY_META[normalized]?.bucket || 'drugo';
}

function _eventEmoji(category = '') {
  const normalized = _normalizeEventCategoryKey(category);
  return CAT_EMOJI[normalized] || CAT_EMOJI[_eventVisualCategory(category)] || '📅';
}

function _normalizeEventCategoryKey(category = '') {
  const normalized = String(category || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/č/g, 'c')
    .replace(/ć/g, 'c')
    .replace(/ž/g, 'z')
    .replace(/š/g, 's')
    .replace(/đ/g, 'dj');
  return EVENT_CATEGORY_ALIASES[normalized] || normalized || 'drugo';
}

function _eventCategoryLabel(category = '', { bucket = false } = {}) {
  const normalized = _normalizeEventCategoryKey(category);
  const resolved = bucket ? _eventVisualCategory(normalized) : normalized;
  return EVENT_CATEGORY_META[resolved]?.label || EVENT_CATEGORY_META.drugo.label;
}

function _parseEventDateLocal(value = '') {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function _eventDateToken(value = '') {
  const parsed = _parseEventDateLocal(value);
  if (!parsed) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function _eventSpotsState(capacityValue, attendeeCountValue = 0) {
  const capacity = Number(capacityValue);
  const attendeeCount = Math.max(Number(attendeeCountValue) || 0, 0);

  if (!Number.isFinite(capacity) || capacity <= 0) {
    return { label: 'Broj mesta nije ograničen', variant: 'neutral', remaining: null };
  }

  const remaining = Math.max(capacity - attendeeCount, 0);
  const ratio = capacity > 0 ? remaining / capacity : 0;

  if (remaining === 0) {
    return { label: 'Nema slobodnih mesta', variant: 'full', remaining };
  }
  if (ratio <= 0.1) {
    return { label: `Još samo ${remaining} mesta`, variant: 'urgent', remaining };
  }
  if (ratio <= 0.4) {
    return { label: `Još ${remaining} mesta`, variant: 'warning', remaining };
  }
  return { label: `${remaining} mesta slobodno`, variant: 'ok', remaining };
}

function _eventSpotsLabel(value, attendeeCountValue = 0) {
  return _eventSpotsState(value, attendeeCountValue).label;
}

function _eventBg(category = '') {
  const normalized = _eventVisualCategory(category);
  if (normalized === 'muzika') return 'ev-img-a';
  if (normalized === 'scena_humor') return 'ev-img-b';
  if (normalized === 'kultura_umetnost') return 'ev-img-b';
  if (normalized === 'sport_rekreacija') return 'ev-img-c';
  if (normalized === 'izlasci_druzenje') return 'ev-img-d';
  if (normalized === 'napolju') return 'ev-img-e';
  if (normalized === 'hobiji_igre') return 'ev-img-b';
  if (normalized === 'edukacija_meetup') return 'ev-img-b';
  return 'ev-img-b';
}

function _eventDayBucket(dateStr = '') {
  const date = _parseEventDateLocal(dateStr);
  if (!date) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compare = new Date(date);
  compare.setHours(0, 0, 0, 0);
  const diffDays = Math.round((compare - today) / 86400000);
  if (diffDays === 0) return 'danas';
  if (diffDays === 1) return 'sutra';
  const day = date.getDay();
  if (day === 5 || day === 6 || day === 0) return 'vikend';
  if (diffDays > 1 && diffDays <= 7) return 'ove_nedelje';
  return '';
}

function _formatEventMeta(event = {}) {
  const startsAt = event.starts_at || event.date || '';
  const date = startsAt ? new Date(startsAt) : null;
  const dayLabel = startsAt ? dateLabel(startsAt) : 'Termin uskoro';
  const timeLabel = date && !Number.isNaN(date.getTime())
    ? date.toLocaleTimeString('sr-Latn', { hour: '2-digit', minute: '2-digit' })
    : '';
  const location = event.location_name || event.city || 'Lokacija nije upisana';
  const priceLabel = _formatEventTicketPrice(event);
  return [dayLabel, timeLabel, location, priceLabel].filter(Boolean).join(' · ');
}

function _formatEventDateTimeLine(event = {}) {
  const startsAt = event.starts_at || event.date || '';
  const parsed = _parseEventDateLocal(startsAt);
  if (!parsed) return 'Termin uskoro';
  const datePart = parsed.toLocaleDateString('sr-Latn', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
  const timePart = parsed.toLocaleTimeString('sr-Latn', {
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${datePart} · ${timePart}`;
}

function _formatEventLocationLine(event = {}) {
  return event.location_name
    ? [event.location_name, event.public_address, event.city].filter(Boolean).join(' · ')
    : ([event.public_address, event.city].filter(Boolean).join(' · ') || 'Lokacija nije upisana');
}

function _eventStatusSummary(event = {}) {
  const spots = _eventSpotsState(event.capacity ?? event.spots ?? null, event.attendee_count || 0);
  return spots.label;
}

function _formatEventTicketPrice(event = {}) {
  const rawValue = event.ticket_price_rsd ?? event.raw?.ticket_price_rsd ?? null;
  if (rawValue === null || rawValue === undefined || rawValue === '') return '';
  const price = Number(rawValue);
  if (!Number.isFinite(price) || price < 0) return '';
  if (price === 0) return _langText('Besplatno', 'Free');
  return `${Math.round(price).toLocaleString('sr-Latn')} RSD`;
}

function _normalizeInviteVibes(vibes = []) {
  const allowed = new Set(INVITE_VIBE_OPTIONS.map(item => item.key));
  return (Array.isArray(vibes) ? vibes : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .filter(item => allowed.has(item))
    .slice(0, 3);
}

function _inviteVibeLabel(key = '') {
  return INVITE_VIBE_OPTIONS.find(item => item.key === key)?.label || key;
}

function _renderInviteVibes(vibes = []) {
  const normalized = _normalizeInviteVibes(vibes);
  if (!normalized.length) return '';
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${normalized.map(vibe => `<span class="tag tag-outline" style="font-size:10px;padding:2px 7px">${_escHtml(_inviteVibeLabel(vibe))}</span>`).join('')}</div>`;
}

function _isTonightEvent(startsAt = '') {
  const ts = new Date(startsAt).getTime();
  if (Number.isNaN(ts)) return false;
  const now = Date.now();
  return ts >= now && ts <= (now + 8 * 60 * 60 * 1000);
}

function _dateFromOffset(dayOffset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return _eventDateToken(d);
}

function dateLabel(dateStr) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const d = _parseEventDateLocal(dateStr);
  if (!d) return _langText('Uskoro', 'Soon');
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return _langText('Danas', 'Today');
  if (diff === 1) return _langText('Sutra', 'Tomorrow');
  if (diff <= 6) {
    const days = getCurrentLang() === 'en'
      ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      : ['Ned','Pon','Uto','Sre','Čet','Pet','Sub'];
    return days[d.getDay()];
  }
  return d.toLocaleDateString(getCurrentLang() === 'en' ? 'en-GB' : 'sr-Latn', { day:'numeric', month:'short' });
}
