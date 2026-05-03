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

function _splitCoverUrlMeta(coverUrl = '') {
  const raw = String(coverUrl || '');
  if (!raw) return { base: '', hash: '' };
  const hashIndex = raw.indexOf('#');
  if (hashIndex < 0) return { base: raw, hash: '' };
  return { base: raw.slice(0, hashIndex), hash: raw.slice(hashIndex + 1) };
}

function _coverFocusFromUrl(coverUrl = '', fallbackX = 50, fallbackY = 50) {
  const { hash } = _splitCoverUrlMeta(coverUrl);
  const params = new URLSearchParams(hash || '');
  const token = String(params.get('svfp') || '').trim();
  if (!token) return { x: fallbackX, y: fallbackY };
  const [xRaw, yRaw] = token.split(',');
  const x = Number(xRaw);
  const y = Number(yRaw);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: fallbackX, y: fallbackY };
  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y))
  };
}

function _coverUrlWithoutFocus(coverUrl = '') {
  const { base, hash } = _splitCoverUrlMeta(coverUrl);
  if (!hash) return base;
  const params = new URLSearchParams(hash);
  params.delete('svfp');
  const rest = params.toString();
  return rest ? `${base}#${rest}` : base;
}

function _applyCoverFocusToUrl(coverUrl = '', x = 50, y = 50) {
  const clean = _coverUrlWithoutFocus(coverUrl);
  if (!clean) return '';
  const nx = Math.round(Math.max(0, Math.min(100, Number(x))));
  const ny = Math.round(Math.max(0, Math.min(100, Number(y))));
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return clean;
  return `${clean}#svfp=${nx},${ny}`;
}

function _coverBackgroundPosition(coverUrl = '', fallback = 'center') {
  const fallbackPos = String(fallback || 'center');
  const fallbackParts = fallbackPos.split(/\s+/);
  const fallbackX = Number(String(fallbackParts[0] || '50').replace('%', ''));
  const fallbackY = Number(String(fallbackParts[1] || fallbackParts[0] || '50').replace('%', ''));
  const focus = _coverFocusFromUrl(
    coverUrl,
    Number.isFinite(fallbackX) ? fallbackX : 50,
    Number.isFinite(fallbackY) ? fallbackY : 50
  );
  return `${focus.x}% ${focus.y}%`;
}

function _coverInlineStyle(coverUrl = '', fallbackPosition = 'center') {
  const cleanUrl = _coverUrlWithoutFocus(coverUrl);
  if (!cleanUrl) return '';
  const url = typeof _safeCssUrl === 'function' ? _safeCssUrl(cleanUrl) : cleanUrl;
  const pos = _coverBackgroundPosition(coverUrl, fallbackPosition);
  return `background-image:url('${url}');background-size:cover;background-position:${pos}`;
}
