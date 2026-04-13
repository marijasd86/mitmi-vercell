const ADMIN_ORGANIZERS_KEY = 'mitmi_admin_organizers';
const EVENT_DRAFTS_KEY = 'mitmi_event_drafts';
const EVENT_MEDIA_KEY = 'mitmi_event_media';

function _uiStorageScope() {
  return getUser()?.id || 'guest';
}

function _uiScopedStorageKey(baseKey = '') {
  return `${baseKey}:${_uiStorageScope()}`;
}

function _safeStorage(type = 'session') {
  try {
    return type === 'local' ? window.localStorage : window.sessionStorage;
  } catch (e) {
    return null;
  }
}

function _loadStoredList(key, fallback = []) {
  try {
    const storage = _safeStorage('session');
    const parsed = JSON.parse(storage?.getItem(_uiScopedStorageKey(key)) || 'null');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

function _saveStoredList(key, list = []) {
  try {
    const storage = _safeStorage('session');
    storage?.setItem(_uiScopedStorageKey(key), JSON.stringify(Array.isArray(list) ? list : []));
  } catch (e) {}
}

function _getEventMediaMap() {
  try {
    const sessionStore = _safeStorage('session');
    const localStore = _safeStorage('local');
    const scopedKey = _uiScopedStorageKey(EVENT_MEDIA_KEY);
    const raw = sessionStore?.getItem(scopedKey)
      || sessionStore?.getItem(EVENT_MEDIA_KEY)
      || localStore?.getItem(scopedKey)
      || localStore?.getItem(EVENT_MEDIA_KEY)
      || '{}';
    return JSON.parse(raw) || {};
  } catch(e) {
    return {};
  }
}

function _saveEventMediaMap(map = {}) {
  try {
    const sessionStore = _safeStorage('session');
    sessionStore?.setItem(_uiScopedStorageKey(EVENT_MEDIA_KEY), JSON.stringify(map));
  } catch(e) {}
}

function _getEventTags(eventId) {
  if (!eventId) return [];
  const map = _getEventMediaMap();
  return _normalizeEventTags(map[eventId]?.tags || []);
}

function _setEventTags(eventId, tags = []) {
  if (!eventId) return;
  const map = _getEventMediaMap();
  map[eventId] = { ...(map[eventId] || {}), tags: _normalizeEventTags(tags) };
  _saveEventMediaMap(map);
}

function _setEventCover(eventId, coverUrl) {
  if (!eventId || !coverUrl) return;
  const map = _getEventMediaMap();
  map[eventId] = { ...(map[eventId] || {}), cover_url: coverUrl };
  _saveEventMediaMap(map);
}

function _getEventCover(eventId) {
  const map = _getEventMediaMap();
  return map[eventId]?.cover_url || '';
}

function _clearEventCover(eventId) {
  if (!eventId) return;
  const map = _getEventMediaMap();
  if (!map[eventId]) return;
  delete map[eventId];
  _saveEventMediaMap(map);
}
