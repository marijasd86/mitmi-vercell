// ─── Kompresija slike (canvas) ───
const MAX_EVENT_PHOTOS = 3;
const MAX_EVENT_IMAGE_BYTES = 8 * 1024 * 1024;
const EVENT_GALLERY_WIDTH = 1280;
const EVENT_GALLERY_QUALITY = 0.72;

function compressImage(file, maxWidth, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// handleVenueCover je definisana gore sa Storage upload logikom

// handleEventPhotos, checkEvPhotoEmpty, openPhotoFullscreen su definirani gore

// Shared Supabase/storage helpers now live in /assets/scripts/api/.
// Notification inbox logic now lives in /assets/scripts/domains/notifications.js.
// Keep this file focused on media flows and uploads.

async function _uploadProfileAvatarDataUrl(dataUrl) {
  const userId = getUser()?.id;
  if (!userId || !dataUrl) throw new Error('Missing avatar payload');
  const blob = await _dataUrlToBlob(dataUrl);
  const path = `${userId}/avatar_${Date.now()}.jpg`;
  return _uploadToStorage('avatars', path, blob);
}

async function _deleteStorageQuietly(bucket, path, context = 'storage cleanup') {
  if (!bucket || !path) return;
  try {
    await _deleteFromStorage(bucket, path);
  } catch (cleanupErr) {
    console.warn(`[svita] ${context}:`, cleanupErr.message);
  }
}

async function _persistEventCover(eventId, dataUrl) {
  const userId = getUser()?.id;
  if (!userId || !eventId || !dataUrl) throw new Error('Missing event cover payload');
  const blob = await _dataUrlToBlob(dataUrl);
  const uploaded = await _uploadEventCoverWithPolicyFallback(eventId, blob, userId);
  const url = uploaded.url;
  const path = uploaded.path;
  const focusX = Number(globalThis._pendingEventCoverFocusX ?? 50);
  const focusY = Number(globalThis._pendingEventCoverFocusY ?? 82);
  const persistedUrl = typeof _applyCoverFocusToUrl === 'function'
    ? _applyCoverFocusToUrl(url, focusX, focusY)
    : url;

  try {
    let updated = await _supaFetch(`/rest/v1/events?id=eq.${eventId}&creator_id=eq.${userId}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ cover_url: persistedUrl })
    });

    let savedRow = Array.isArray(updated) ? updated[0] : updated;

    // Fallback za admin/organizer tokove gde creator filter ne mora da pogodi,
    // ali RLS i dalje određuje da li korisnik sme da menja događaj.
    if (!savedRow?.cover_url) {
      updated = await _supaFetch(`/rest/v1/events?id=eq.${eventId}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({ cover_url: persistedUrl })
      });
      savedRow = Array.isArray(updated) ? updated[0] : updated;
    }

    if (!savedRow?.cover_url) {
      throw new Error('Cover URL was not saved');
    }

    return savedRow.cover_url;
  } catch (e) {
    await _deleteStorageQuietly('event-photos', path, 'event cover cleanup');
    throw e;
  }
}

async function _clearPersistedEventCover(eventId) {
  const userId = getUser()?.id;
  if (!userId || !eventId) throw new Error('Missing event cover context');
  let updated = await _supaFetch(`/rest/v1/events?id=eq.${eventId}&creator_id=eq.${userId}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({ cover_url: null })
  });
  let savedRow = Array.isArray(updated) ? updated[0] : updated;

  // Fallback for admin/claimed organizer/venue owner paths.
  // RLS remains the source of truth.
  if (!savedRow) {
    updated = await _supaFetch(`/rest/v1/events?id=eq.${eventId}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ cover_url: null })
    });
    savedRow = Array.isArray(updated) ? updated[0] : updated;
  }
}

async function _getMyVenueId() {
  const userId = getUser()?.id;
  if (!userId) throw new Error('Missing user id');
  const venues = await _supaGet('venues', {
    'profile_id': `eq.${userId}`,
    'select': 'id',
    'limit': '1'
  });
  const venueId = Array.isArray(venues) ? venues[0]?.id : null;
  if (!venueId) throw new Error('Venue not found');
  return venueId;
}

async function _resolvePublicProfileCoverTarget() {
  const currentTarget = globalThis._currentPublicVenueTarget || null;
  const target = (typeof _normalizeVenueTarget === 'function')
    ? _normalizeVenueTarget(currentTarget)
    : currentTarget;
  const isOrganizerTarget = !!target && (
    (typeof _isOrganizerEntity === 'function' && _isOrganizerEntity(target))
    || target.kind === 'organizer'
    || target.entity_type === 'organizer'
  );

  if (isOrganizerTarget && target?.id) {
    const isAdmin = typeof isAdminUser === 'function' && isAdminUser();
    const isClaimOwner = !!(target.claimed_by_profile_id && target.claimed_by_profile_id === getUser()?.id);
    if (isAdmin || isClaimOwner) {
      return { kind: 'organizer', id: target.id };
    }
    if (typeof _getMyClaimedOrganizer === 'function') {
      const mine = await _getMyClaimedOrganizer().catch(() => null);
      if (mine?.id && mine.id === target.id) {
        return { kind: 'organizer', id: target.id };
      }
    }
    throw new Error('Nemate dozvolu za izmenu cover slike ovog organizer profila');
  }

  const venueId = await _getMyVenueId();
  return { kind: 'venue', id: venueId };
}

function _isStorageRlsError(error) {
  const msg = String(error?.message || error?.data?.message || '').toLowerCase();
  return msg.includes('row-level security') || msg.includes('violates row-level');
}

function _organizerCoverFromNotes(sourceNotes = '') {
  const raw = String(sourceNotes || '');
  const match = raw.match(/\[cover_url:([^\]]+)\]/i);
  return match?.[1] ? String(match[1]).trim() : '';
}

function _mergeOrganizerCoverIntoNotes(sourceNotes = '', coverUrl = '') {
  const raw = String(sourceNotes || '');
  const clean = raw.replace(/\s*\[cover_url:[^\]]+\]\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim();
  const nextMarker = coverUrl ? `[cover_url:${coverUrl}]` : '';
  return [clean, nextMarker].filter(Boolean).join(' · ').trim();
}

function _isMissingOrganizerCoverColumnError(error) {
  const msg = String(error?.message || error?.data?.message || error?.error_description || '');
  return (
    /cover_url/i.test(msg)
    && /organizers?/i.test(msg)
    && /(could not find|schema cache|column)/i.test(msg)
  );
}

async function _persistOrganizerCoverFallback(targetId = '', userId = '', coverUrl = '') {
  if (!targetId || !coverUrl) return;
  const rows = await _supaGet('organizers', {
    select: 'id,source_notes',
    id: `eq.${targetId}`,
    limit: '1'
  });
  const organizer = Array.isArray(rows) ? rows[0] : null;
  const nextNotes = _mergeOrganizerCoverIntoNotes(organizer?.source_notes || '', coverUrl);
  try {
    await _supaFetch(`/rest/v1/organizers?id=eq.${targetId}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        source_notes: nextNotes,
        updated_by: userId || null
      })
    });
  } catch (e) {
    // Some schemas do not have updated_by; retry with source_notes only.
    await _supaFetch(`/rest/v1/organizers?id=eq.${targetId}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        source_notes: nextNotes
      })
    });
  }
}

async function _uploadVenueCoverWithPolicyFallback(target, blob, userId) {
  const stamp = Date.now();
  const suffix = `cover_${stamp}.jpg`;
  const venueBucketPaths = [
    `${target.kind}_${target.id}/${suffix}`,
    `${target.kind}s/${target.id}/${suffix}`,
    `${userId}/${target.kind}_${target.id}/${suffix}`,
    `${userId}/${target.kind}/${target.id}/${suffix}`,
    `${userId}/${target.kind}s/${target.id}/${suffix}`,
    `${userId}/${suffix}`
  ].filter(Boolean);
  const eventPhotosFallbackPaths = [
    `${userId}/${target.kind}_${target.id}/${suffix}`,
    `${userId}/${target.kind}/${target.id}/${suffix}`,
    `${userId}/venue-covers/${target.kind}/${target.id}/${suffix}`,
    `${userId}/${suffix}`
  ].filter(Boolean);
  const avatarsFallbackPaths = [
    `${userId}/organizer_${target.id}/${suffix}`,
    `${userId}/venue_${target.id}/${suffix}`,
    `${userId}/covers/${target.kind}_${target.id}/${suffix}`,
    `${userId}/${suffix}`
  ].filter(Boolean);

  let lastError = null;
  for (const path of venueBucketPaths) {
    try {
      const url = await _uploadToStorage('venue-covers', path, blob);
      return { url, path, bucket: 'venue-covers' };
    } catch (e) {
      lastError = e;
      if (!_isStorageRlsError(e)) throw e;
    }
  }

  // RLS fallback: neki projekti imaju strožiju politiku na venue-covers bucket-u.
  // U tom slučaju koristimo event-photos bucket koji već ima proverenu user putanju.
  for (const path of eventPhotosFallbackPaths) {
    try {
      const url = await _uploadToStorage('event-photos', path, blob);
      return { url, path, bucket: 'event-photos' };
    } catch (e) {
      lastError = e;
      if (!_isStorageRlsError(e)) throw e;
    }
  }

  // Last-resort fallback: avatars bucket usually has permissive "own folder" policy.
  for (const path of avatarsFallbackPaths) {
    try {
      const url = await _uploadToStorage('avatars', path, blob);
      return { url, path, bucket: 'avatars' };
    } catch (e) {
      lastError = e;
      if (!_isStorageRlsError(e)) throw e;
    }
  }

  throw lastError || new Error('Storage upload failed');
}

async function _uploadEventCoverWithPolicyFallback(eventId, blob, userId) {
  const stamp = Date.now();
  const suffix = `cover_${stamp}.jpg`;
  const candidatePaths = [
    `${eventId}/${userId}/${suffix}`,
    `${userId}/${eventId}/${suffix}`,
    `${userId}/event_${eventId}/${suffix}`,
    `${userId}/${suffix}`,
    `${eventId}/${suffix}`
  ].filter(Boolean);

  let lastError = null;
  for (const path of candidatePaths) {
    try {
      const url = await _uploadToStorage('event-photos', path, blob);
      return { url, path };
    } catch (e) {
      lastError = e;
      if (!_isStorageRlsError(e)) throw e;
    }
  }
  throw lastError || new Error('Storage upload failed');
}

// ─── Venue cover upload → Supabase Storage + DB update ───────
async function handleVenueCover(input) {
  if (!input.files || !input.files[0]) return;
  if (!isLoggedIn()) { showToast('Prijavi se', 'error'); return; }

  showToast('Obrađujem sliku...', 'info', 1200);
  const file = input.files[0];

  // Kompresuj lokalno
  const compressed = await compressImage(file, 1200, 0.80);
  // Prikaz odmah
  const hero = document.getElementById('vp-hero-inner');
  if (hero) {
    hero.classList.remove('ev-img-a','ev-img-b','ev-img-c','ev-img-d','ev-img-e');
    hero.style.backgroundImage = `url(${compressed})`;
    hero.style.backgroundSize  = 'cover';
    hero.style.backgroundPosition = 'center';
  }

  // Upload u pozadini
  try {
    const userId = getUser()?.id;
    const target = await _resolvePublicProfileCoverTarget();
    if (!userId) throw new Error('Missing user id');
    // Konvertuj data URL u Blob bez fetch(data:...), zbog CSP connect-src ograničenja.
    const blob = await _dataUrlToBlob(compressed);
    const uploaded = await _uploadVenueCoverWithPolicyFallback(target, blob, userId);
    const url = uploaded.url;
    const path = uploaded.path;
    const bucket = uploaded.bucket || 'venue-covers';

    try {
      if (target.kind === 'organizer') {
        let organizerPatched = false;
        try {
          await _supaFetch(`/rest/v1/organizers?id=eq.${target.id}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              cover_url: url,
              updated_by: userId || null
            })
          });
          organizerPatched = true;
        } catch (organizerPatchErr) {
          if (_isMissingOrganizerCoverColumnError(organizerPatchErr)) {
            await _persistOrganizerCoverFallback(target.id, userId, url);
            organizerPatched = true;
          } else {
            throw organizerPatchErr;
          }
        }
        if (!organizerPatched) {
          await _persistOrganizerCoverFallback(target.id, userId, url);
        }
      } else {
        await _supaFetch(`/rest/v1/venues?id=eq.${target.id}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ cover_url: url })
        });
      }
    } catch (dbErr) {
      await _deleteStorageQuietly(bucket, path, 'venue cover cleanup');
      throw dbErr;
    }
    if (target.kind === 'organizer') {
      if (typeof _clearCache === 'function') _clearCache('organizer', getUser()?.id || 'guest');
      if (globalThis._currentPublicVenueTarget && (globalThis._currentPublicVenueTarget.id === target.id)) {
        globalThis._currentPublicVenueTarget.cover_url = url;
        globalThis._currentPublicVenueTarget.source_notes = _mergeOrganizerCoverIntoNotes(globalThis._currentPublicVenueTarget.source_notes || '', url);
      }
    } else {
      if (typeof _clearCache === 'function') _clearCache('venue', getUser()?.id || 'guest');
      if (globalThis._currentPublicVenueTarget && (globalThis._currentPublicVenueTarget.id === target.id)) {
        globalThis._currentPublicVenueTarget.cover_url = url;
      }
    }
    showToast('Cover slika sačuvana ✓', 'success', 2000);
  } catch(e) {
    console.warn('[svita] cover upload:', e.message);
    const msg = String(e?.message || e?.data?.message || '').trim();
    showToast(msg ? `Cover slika nije sačuvana: ${msg}` : 'Cover slika nije sačuvana', 'error', 3200);
  }
  input.value = '';
}

// ─── Event foto upload → Supabase Storage + event_photos ─────
const _eventPhotos = [];

async function _canManageEventPhotos(eventId = null) {
  const activeEventId = eventId || (typeof _currentEventId !== 'undefined' ? _currentEventId : null);
  const myId = getUser()?.id || null;
  if (!activeEventId || !myId) return false;
  const caps = typeof getRoleCapabilities === 'function'
    ? getRoleCapabilities()
    : { isAdmin: false, canPublishManagedEvents: false };
  if (caps.isAdmin) return true;
  const current = typeof _getCurrentEventCard === 'function' ? _getCurrentEventCard() : null;
  const candidate = current?.id === activeEventId
    ? current
    : (typeof _combinedEventCards === 'function'
      ? _combinedEventCards().find(item => item.id === activeEventId)
      : null);
  const raw = candidate?.raw || {};
  if (raw.creator_id && raw.creator_id === myId) return true;
  if (caps.canPublishManagedEvents) {
    try {
      if (raw.organizer_id && typeof _getMyClaimedOrganizer === 'function') {
        const organizer = await _getMyClaimedOrganizer();
        if (organizer?.id && organizer.id === raw.organizer_id) return true;
      }
      if (raw.venue_id && typeof _getMyVenue === 'function') {
        const venue = await _getMyVenue().catch(() => null);
        if (venue?.id && venue.id === raw.venue_id) return true;
      }
    } catch (e) {}
  }
  return false;
}

function _eventPhotoSlotsLeft() {
  const grid = document.getElementById('ev-photo-grid');
  const currentCount = grid ? grid.querySelectorAll('[data-event-photo-thumb="1"]').length : 0;
  return Math.max(0, MAX_EVENT_PHOTOS - currentCount);
}

function _renderEventPhotoThumb(item = {}, removable = false) {
  const src = item?.photo_url || item?.src || '';
  const thumb = document.createElement('div');
  thumb.dataset.eventPhotoThumb = '1';
  if (item?.id) thumb.dataset.eventPhotoId = item.id;
  thumb.style.cssText = 'aspect-ratio:1;border-radius:8px;overflow:hidden;position:relative;cursor:pointer;background:#eee';
  thumb.innerHTML = `<img src="${src}" style="width:100%;height:100%;object-fit:cover" onclick="openPhotoFullscreen(this.src)">`;
  if (removable) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.style.cssText = 'position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:14px;cursor:pointer;line-height:1';
    removeBtn.onclick = async (event) => {
      event.stopPropagation();
      if (!item?.id) {
        thumb.remove();
        checkEvPhotoEmpty();
        return;
      }
      const ok = typeof appConfirm === 'function'
        ? await appConfirm('Obriši ovu fotografiju?', 'Delete this photo?')
        : true;
      if (!ok) return;
      const prevText = removeBtn.textContent;
      removeBtn.disabled = true;
      removeBtn.textContent = '...';
      try {
        await _deleteEventPhoto(item.id, item.storage_path || '', item.event_id || null);
      } catch (e) {
        console.warn('[svita] delete event photo:', e.message);
        showToast('Fotografija nije obrisana', 'error', 2200);
      } finally {
        removeBtn.disabled = false;
        removeBtn.textContent = prevText;
      }
    };
    thumb.appendChild(removeBtn);
  }
  return thumb;
}

async function _deleteEventPhoto(photoId, storagePath = '', eventId = null) {
  if (!photoId) throw new Error('Missing event photo id');
  await _supaFetch(`/rest/v1/event_photos?id=eq.${photoId}`, {
    method: 'DELETE',
    headers: { 'Prefer': 'return=minimal' }
  });
  if (storagePath) {
    try {
      await _deleteFromStorage('event-photos', storagePath);
    } catch (e) {
      console.warn('[svita] storage event photo delete:', e.message);
    }
  }
  await loadEventPhotos(eventId || (typeof _currentEventId !== 'undefined' ? _currentEventId : null));
  showToast('Fotografija je obrisana', 'success', 1800);
}

async function loadEventPhotos(eventId = null) {
  const grid  = document.getElementById('ev-photo-grid');
  const empty = document.getElementById('ev-photo-empty');
  if (!grid || !empty) return [];

  const activeEventId = eventId || (typeof _currentEventId !== 'undefined' ? _currentEventId : null);
  grid.querySelectorAll('[data-event-photo-thumb="1"]').forEach(el => el.remove());
  empty.style.display = '';

  if (!activeEventId || !_isSupabaseConfigured()) return [];

  try {
    const [rows, canManage] = await Promise.all([
      _supaGet('event_photos', {
        select: 'id,event_id,uploader_id,photo_url,storage_path,display_order,created_at',
        event_id: `eq.${activeEventId}`,
        order: 'display_order.asc,created_at.asc',
        limit: String(MAX_EVENT_PHOTOS)
      }),
      _canManageEventPhotos(activeEventId)
    ]);
    const items = Array.isArray(rows) ? rows : [];
    if (items.length && activeEventId) {
      const currentCard = (typeof _currentEventCard === 'function') ? _currentEventCard() : null;
      const hasHeroCover = !!(currentCard?.cover_url || (typeof _getEventCover === 'function' ? _getEventCover(activeEventId) : ''));
      const firstPhotoUrl = String(items[0]?.photo_url || '');
      const hero = document.getElementById('event-hero');
      if (!hasHeroCover && firstPhotoUrl && hero) {
        const bgClass = currentCard?.bg || 'ev-img-a';
        hero.className = `ev-hero ${bgClass}`;
        hero.style.backgroundImage = `url(${_safeCssUrl(firstPhotoUrl)})`;
        hero.style.backgroundSize = 'cover';
        hero.style.backgroundPosition = 'center';
        if (currentCard) currentCard.cover_url = firstPhotoUrl;
        if (typeof _setEventCover === 'function') _setEventCover(activeEventId, firstPhotoUrl);
      }
    }
    items.forEach(item => {
      if (!item?.photo_url) return;
      grid.appendChild(_renderEventPhotoThumb(item, canManage));
    });
    checkEvPhotoEmpty();
    return items;
  } catch (e) {
    console.warn('[svita] loadEventPhotos:', e.message);
    return [];
  }
}

async function handleEventPhotos(input) {
  if (!input.files || !input.files.length) return;
  if (!isLoggedIn()) { showToast('Prijavi se da dodaš fotografiju', 'error'); return; }
  const eventId = typeof _currentEventId !== 'undefined' ? _currentEventId : null;
  if (!eventId) {
    showToast('Otvori konkretan događaj pre dodavanja fotografija', 'info', 2200);
    input.value = '';
    return;
  }

  const grid = document.getElementById('ev-photo-grid');
  const requestedFiles = Array.from(input.files);
  const slotsLeft = _eventPhotoSlotsLeft();
  if (slotsLeft <= 0) {
    showToast(`Možeš da sačuvaš najviše ${MAX_EVENT_PHOTOS} dodatne slike po događaju`, 'info', 2200);
    input.value = '';
    return;
  }

  const files = requestedFiles.slice(0, slotsLeft);
  if (requestedFiles.length > files.length) {
    showToast(`Sačuvane su samo prve ${files.length} slike zbog limita`, 'info', 2200);
  }

  showToast(`Obrađujem ${files.length} sliku/e...`, 'info', 1500);
  let uploadedCount = 0;
  let nextDisplayOrder = 0;
  try {
    const existingRows = await _supaGet('event_photos', {
      select: 'id,display_order',
      event_id: `eq.${eventId}`,
      order: 'display_order.desc,created_at.desc',
      limit: String(MAX_EVENT_PHOTOS)
    }).catch(() => []);
    const existingOrders = (Array.isArray(existingRows) ? existingRows : [])
      .map(row => Number(row.display_order))
      .filter(order => Number.isFinite(order));
    nextDisplayOrder = existingOrders.length ? (Math.max(...existingOrders) + 1) : 0;
  } catch (e) {
    nextDisplayOrder = 0;
  }

  for (const file of files) {
    if (file.size > MAX_EVENT_IMAGE_BYTES) {
      showToast('Jedna slika je preskočena jer je prevelika pre kompresije', 'info', 2200);
      continue;
    }
    try {
      const compressed = await compressImage(file, EVENT_GALLERY_WIDTH, EVENT_GALLERY_QUALITY);
      const userId  = getUser()?.id;
      const path    = `${eventId}/${userId}/${Date.now()}_${Math.random().toString(36).slice(2,7)}.jpg`;
      const blob    = await _dataUrlToBlob(compressed);
      const url     = await _uploadToStorage('event-photos', path, blob);
      try {
        await _supaFetch('/rest/v1/event_photos', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify({
            event_id: eventId,
            uploader_id: userId,
            photo_url: url,
            storage_path: path,
            display_order: nextDisplayOrder
          })
        });
      } catch (dbErr) {
        await _deleteStorageQuietly('event-photos', path, 'event photo cleanup');
        throw dbErr;
      }
      nextDisplayOrder += 1;
      _eventPhotos.push(url);
      uploadedCount += 1;
    } catch(e) {
      console.warn('[svita] event photo upload:', e.message);
      showToast('Jedna fotografija nije sačuvana', 'info', 2200);
    }
  }
  await loadEventPhotos(eventId);
  if (uploadedCount > 0) {
    showToast(`${uploadedCount} fotografija sačuvano`, 'success', 2000);
  }
  input.value = '';
}

function checkEvPhotoEmpty() {
  const grid  = document.getElementById('ev-photo-grid');
  const empty = document.getElementById('ev-photo-empty');
  if (!grid || !empty) return;
  empty.style.display = grid.querySelectorAll('[data-event-photo-thumb="1"]').length === 0 ? '' : 'none';
}

function openPhotoFullscreen(src) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  overlay.innerHTML = `<img src="${src}" style="max-width:96vw;max-height:92vh;border-radius:10px;object-fit:contain">`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

// ─── Follow venue ───
async function toggleVenueFollow(btn) {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  if (_currentPublicVenueTarget && _isOrganizerEntity(_currentPublicVenueTarget)) {
    showToast(_langText('Organizer profili trenutno nemaju opciju praćenja. Za sada možeš da pratiš njihove događaje.', 'Organizer profiles cannot be followed yet. For now, you can follow their events.'), 'info', 2200);
    return;
  }
  if (!_currentPublicVenueId) {
    showToast(_langText('Organizer profil još nije povezan', 'This organizer profile is not connected yet'), 'info', 1800);
    return;
  }
  const myVenue = await _getMyVenue().catch(() => null);
  if (myVenue?.id === _currentPublicVenueId) {
    showToast(_langText('Ovo je tvoj organizer profil', 'This is your organizer profile'), 'info', 1600);
    return;
  }
  const followed = await _isVenueFollowedByMe(_currentPublicVenueId);
  try {
    if (followed) {
      await _supaFetch(`/rest/v1/venue_follows?user_id=eq.${getUser()?.id}&venue_id=eq.${_currentPublicVenueId}`, {
        method: 'DELETE'
      });
      showToast('Više ne pratiš organizatora', 'info', 1500);
    } else {
      await _supaFetch('/rest/v1/venue_follows', {
        method: 'POST',
        body: JSON.stringify({
          user_id: getUser()?.id,
          venue_id: _currentPublicVenueId
        })
      });
      showToast('Organizer je dodat u praćenje', 'success', 1500);
    }
    if (typeof _clearCache === 'function') {
      _clearCache('notifications', getUser()?.id || 'guest');
      _clearCache('venueAnalytics');
      _clearCache('venuePublic', _currentPublicVenueId);
    }
    const venue = await _loadVenueProfile(_currentPublicVenueId);
    if (venue) await renderPublicVenueProfile(venue);
    if (myVenue?.id) await loadMyVenueAnalytics(myVenue);
  } catch (e) {
    showToast('Praćenje organizatora trenutno nije uspelo', 'error');
  }
}
