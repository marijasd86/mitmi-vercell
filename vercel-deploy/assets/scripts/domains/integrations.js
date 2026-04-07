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

// ─── Supabase REST GET helper ───────────────────────────────
// Wrapa _supaFetch za GET pozive ka PostgREST
async function _supaGet(table, params = {}) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return _supaFetch(`/rest/v1/${table}${qs ? '?' + qs : ''}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });
}

// ─── Upload slike u Supabase Storage ─────────────────────────
async function _uploadToStorage(bucket, path, file) {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      'apikey':        SUPA_ANON,
      'Authorization': `Bearer ${_session?.access_token}`,
      'Content-Type':  file.type,
      'x-upsert':      'true'
    },
    body: file
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Storage upload failed');
  }
  // Vrati public URL
  return `${SUPA_URL}/storage/v1/object/public/${bucket}/${path}`;
}

async function _deleteFromStorage(bucket, path) {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPA_ANON,
      'Authorization': `Bearer ${_session?.access_token}`
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Storage delete failed');
  }
  return true;
}

async function _dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function _uploadProfileAvatarDataUrl(dataUrl) {
  const userId = getUser()?.id;
  if (!userId || !dataUrl) throw new Error('Missing avatar payload');
  const blob = await _dataUrlToBlob(dataUrl);
  const path = `${userId}/avatar_${Date.now()}.jpg`;
  return _uploadToStorage('avatars', path, blob);
}

async function _persistEventCover(eventId, dataUrl) {
  const userId = getUser()?.id;
  if (!userId || !eventId || !dataUrl) throw new Error('Missing event cover payload');
  const blob = await _dataUrlToBlob(dataUrl);
  const path = `${eventId}/${userId}/cover_${Date.now()}.jpg`;
  const url = await _uploadToStorage('event-photos', path, blob);
  await _supaFetch(`/rest/v1/events?id=eq.${eventId}&creator_id=eq.${userId}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({ cover_url: url })
  });
  return url;
}

async function _clearPersistedEventCover(eventId) {
  const userId = getUser()?.id;
  if (!userId || !eventId) throw new Error('Missing event cover context');
  await _supaFetch(`/rest/v1/events?id=eq.${eventId}&creator_id=eq.${userId}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ cover_url: null })
  });
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
    const userId  = getUser()?.id;
    const venueId = await _getMyVenueId();
    const path    = `${venueId}/cover_${Date.now()}.jpg`;
    // Konvertuj base64 u Blob
    const res     = await fetch(compressed);
    const blob    = await res.blob();
    const url     = await _uploadToStorage('venue-covers', path, blob);

    // Update cover_url u venues tabeli
    await _supaFetch(`/rest/v1/venues?profile_id=eq.${userId}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ cover_url: url })
    });
    showToast('Cover slika sačuvana ✓', 'success', 2000);
  } catch(e) {
    console.warn('[mitmi] cover upload:', e.message);
    showToast('Prikaz ažuriran, upload će biti sačuvan kad se povežeš', 'info', 3000);
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
      const ok = window.confirm('Obriši ovu fotografiju?');
      if (!ok) return;
      const prevText = removeBtn.textContent;
      removeBtn.disabled = true;
      removeBtn.textContent = '...';
      try {
        await _deleteEventPhoto(item.id, item.storage_path || '', item.event_id || null);
      } catch (e) {
        console.warn('[mitmi] delete event photo:', e.message);
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
      console.warn('[mitmi] storage event photo delete:', e.message);
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
    items.forEach(item => {
      if (!item?.photo_url) return;
      grid.appendChild(_renderEventPhotoThumb(item, canManage));
    });
    checkEvPhotoEmpty();
    return items;
  } catch (e) {
    console.warn('[mitmi] loadEventPhotos:', e.message);
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
      const res     = await fetch(compressed);
      const blob    = await res.blob();
      const url     = await _uploadToStorage('event-photos', path, blob);
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
      nextDisplayOrder += 1;
      _eventPhotos.push(url);
      uploadedCount += 1;
    } catch(e) {
      console.warn('[mitmi] event photo upload:', e.message);
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

let _notificationFeed = [];

function _setNotificationBadge(count = 0) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  badge.textContent = count > 0 ? (count > 9 ? '9+' : String(count)) : '';
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function _activateMyProfileTab(targetId = 'pt1') {
  nav('profile');
  const page = document.getElementById('page-profile');
  if (!page) return;
  page.querySelectorAll('.ptab').forEach(btn => btn.classList.remove('active'));
  page.querySelectorAll('.ptab-pane').forEach(pane => pane.classList.remove('active'));
  const pane = document.getElementById(targetId);
  if (pane) pane.classList.add('active');
  const targetBtn = Array.from(page.querySelectorAll('.ptab')).find(btn => (btn.getAttribute('onclick') || '').includes(`'${targetId}'`));
  if (targetBtn) targetBtn.classList.add('active');
}

function _renderNotificationRows(items = [], opts = {}) {
  const container = document.getElementById('notif-list');
  if (!container) return;
  _notificationFeed = Array.isArray(items) ? items : [];
  if (!_notificationFeed.length) {
    container.innerHTML = '<div class="draft-empty">Još nema obaveštenja.</div>';
    _setNotificationBadge(0);
    return;
  }
  const unreadCount = _notificationFeed.filter(item => item.read === false || item.syntheticUnread).length;
  _setNotificationBadge(unreadCount);
  container.innerHTML = _notificationFeed.map((item, index) => `
    <div class="notif-row${item.read ? '' : ' unread'}" onclick="handleNotificationClick(${index},'${_escHtml(item.id || '')}',this)">
      <div class="notif-ico">${_notifIcon(item.type)}</div>
      <div class="notif-body">
        <div class="notif-title">${_escHtml(item.title || 'Obaveštenje')}</div>
        ${item.body ? `<div class="notif-sub">${_escHtml(item.body)}</div>` : ''}
        <div class="notif-time">${_escHtml(item.timeLabel || _relTime(item.created_at || new Date().toISOString()))}</div>
      </div>
    </div>
  `).join('');
}

async function handleNotificationClick(index, notifId = '', el = null) {
  const item = _notificationFeed[index] || null;
  if (notifId) {
    await markNotifRead(notifId, el);
    if (item) item.read = true;
  }
  openNotificationItem(item || notifId || '');
}

async function _loadInviteNotificationItems() {
  const myId = getUser()?.id;
  if (!myId || !_isSupabaseConfigured()) return [];
  try {
    const myInvites = await _supaGet('invites', {
      select: 'id,title,event_id',
      creator_id: `eq.${myId}`,
      order: 'created_at.desc',
      limit: '10'
    });
    const inviteIds = (Array.isArray(myInvites) ? myInvites : []).map(item => item.id).filter(Boolean);
    if (!inviteIds.length) return [];
    const apps = await _supaGet('invite_applications', {
      select: 'invite_id,created_at,applicant_id,profiles!applicant_id(id,username,display_name)',
      invite_id: `in.(${inviteIds.join(',')})`,
      order: 'created_at.desc',
      limit: '5'
    }).catch(() => []);
    const inviteMap = new Map((Array.isArray(myInvites) ? myInvites : []).map(item => [item.id, item]));
    return (Array.isArray(apps) ? apps : []).map(app => {
      const invite = inviteMap.get(app.invite_id) || {};
      const applicant = app.profiles || {};
      const label = applicant.display_name || applicant.username || 'Novi korisnik';
      return {
        type: 'invite_joined',
        title: `${label} se prijavio/la na tvoj poziv`,
        body: invite.title ? `Poziv: ${invite.title}` : 'Pogledaj ko želi da ide sa tobom',
        created_at: app.created_at,
        syntheticUnread: true,
        target: { profileTab: 'pt4', inviteId: app.invite_id, eventId: invite.event_id || null, profileId: applicant.id || null }
      };
    });
  } catch (e) {
    console.warn('[mitmi] _loadInviteNotificationItems:', e.message);
    return [];
  }
}

async function _loadFollowerNotificationItems() {
  const myId = getUser()?.id;
  if (!myId || !_isSupabaseConfigured()) return [];
  try {
    const rows = await _supaGet('follows', {
      select: 'follower_id,created_at,profiles!follower_id(id,username,display_name)',
      following_id: `eq.${myId}`,
      order: 'created_at.desc',
      limit: '5'
    }).catch(() => []);
    return (Array.isArray(rows) ? rows : []).map(row => {
      const follower = row.profiles || {};
      const label = follower.display_name || follower.username || 'Neko';
      return {
        type: 'new_follower',
        title: `${label} te sada prati`,
        body: 'Pogledaj profil i uzvrati praćenje ako želiš',
        created_at: row.created_at,
        syntheticUnread: false,
        target: { profileId: follower.id || null }
      };
    });
  } catch (e) {
    console.warn('[mitmi] _loadFollowerNotificationItems:', e.message);
    return [];
  }
}

async function _loadMessageNotificationItems() {
  const myId = getUser()?.id;
  if (!myId || !_isSupabaseConfigured()) return [];
  try {
    const memberships = await _supaGet('chat_participants', {
      select: 'chat_id,hidden_at,chats!inner(id,chat_type,title,created_at)',
      user_id: `eq.${myId}`,
      order: 'created_at.desc',
      limit: '20'
    }).catch(() => []);
    const chatRows = (Array.isArray(memberships) ? memberships : []).filter(row => !row.hidden_at);
    const chatIds = chatRows.map(row => row.chat_id).filter(Boolean);
    if (!chatIds.length) return [];
    const inFilter = `in.(${chatIds.join(',')})`;
    const [messages, participants] = await Promise.all([
      _supaGet('messages', {
        select: 'chat_id,sender_id,content,created_at',
        chat_id: inFilter,
        order: 'created_at.desc',
        limit: '60'
      }).catch(() => []),
      _supaGet('chat_participants', {
        select: 'chat_id,user_id,profiles!user_id(id,username,display_name)',
        chat_id: inFilter,
        limit: '60'
      }).catch(() => [])
    ]);
    const latestByChat = new Map();
    (Array.isArray(messages) ? messages : []).forEach(msg => {
      if (msg.sender_id === myId) return;
      if (!latestByChat.has(msg.chat_id)) latestByChat.set(msg.chat_id, msg);
    });
    const peersByChat = new Map();
    (Array.isArray(participants) ? participants : []).forEach(row => {
      if (row.user_id === myId) return;
      const list = peersByChat.get(row.chat_id) || [];
      list.push(row.profiles || {});
      peersByChat.set(row.chat_id, list);
    });
    return chatRows
      .map(row => {
        const chat = row.chats || {};
        const latest = latestByChat.get(row.chat_id);
        if (!latest) return null;
        const peers = peersByChat.get(row.chat_id) || [];
        const peer = peers[0] || {};
        const isDM = chat.chat_type === 'direct';
        const title = isDM
          ? `${peer.display_name || peer.username || 'Nova poruka'} ti je poslao/la poruku`
          : `Nova poruka u chatu „${chat.title || 'Događaj'}”`;
        return {
          type: 'new_message',
          title,
          body: latest.content || 'Otvori poruke da nastaviš razgovor',
          created_at: latest.created_at,
          syntheticUnread: true,
          target: {
            chatId: row.chat_id,
            profileId: isDM ? (peer.id || null) : null,
            chatType: isDM ? 'direct' : 'group',
            title: isDM ? (peer.display_name || peer.username || 'Direktna poruka') : (chat.title || 'Grupni chat')
          }
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 4);
  } catch (e) {
    console.warn('[mitmi] _loadMessageNotificationItems:', e.message);
    return [];
  }
}

async function _loadFollowedEventReminderItems() {
  try {
    const items = await loadFollowedEvents().catch(() => FOLLOWED_EVENTS || []);
    return (Array.isArray(items) ? items : [])
      .filter(item => item?.id)
      .slice(0, 2)
      .map(item => ({
        type: 'event_reminder',
        title: `Sačuvan događaj: ${item.title || 'Događaj'}`,
        body: item.date ? `Podsetnik za ${item.date}` : 'Pogledaj detalje događaja',
        created_at: new Date().toISOString(),
        syntheticUnread: false,
        timeLabel: 'sačuvano',
        target: { eventId: item.id }
      }));
  } catch (e) {
    console.warn('[mitmi] _loadFollowedEventReminderItems:', e.message);
    return [];
  }
}

async function _loadReviewTaskNotificationItems() {
  if (typeof loadPendingReviewTasks !== 'function') return [];
  try {
    const tasks = await loadPendingReviewTasks({ sync:true, render:false });
    return (Array.isArray(tasks) ? tasks : [])
      .filter(item => item.status === 'pending')
      .slice(0, 6)
      .map(item => ({
        type: 'new_review',
        title: item.target_type === 'peer'
          ? `Oceni iskustvo sa ${item.targetProfile?.display_name || item.targetProfile?.username || 'osobom'}`
          : `Oceni događaj: ${item.event?.title || 'Događaj'}`,
        body: item.target_type === 'peer'
          ? `Zajednički odlazak na: ${item.event?.title || 'Događaj'}`
          : 'Podeli utisak o događaju i organizaciji',
        created_at: item.available_at || item.created_at || new Date().toISOString(),
        syntheticUnread: true,
        target: { reviewTaskId: item.id }
      }));
  } catch (e) {
    console.warn('[mitmi] _loadReviewTaskNotificationItems:', e.message);
    return [];
  }
}

// ─── Load notifikacija iz Supabase ───────────────────────────
async function loadNotifications() {
  if (!isLoggedIn()) return;
  const container = document.getElementById('notif-list');
  if (!container) return;
  const cacheKey = getUser()?.id || 'guest';
  const cached = typeof _getCached === 'function' ? _getCached('notifications', cacheKey) : null;
  if (cached) {
    _renderNotificationRows(cached);
    return;
  }
  try {
    const notifs = await _supaGet('notifications', {
      'user_id': `eq.${getUser()?.id}`,
      'order':   'created_at.desc',
      'limit':   '20',
      'select':  'id,type,title,body,read,created_at,actor_profile_id,chat_id,event_id,invite_id,venue_id,application_id,message_id,payload'
    });
    if (!Array.isArray(notifs) || notifs.length === 0) {
      await renderFallbackNotifications();
      return;
    }
    const mapped = notifs.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      read: !!n.read,
      created_at: n.created_at,
      target: {
        profileId: n.actor_profile_id || null,
        chatId: n.chat_id || null,
        eventId: n.event_id || null,
        inviteId: n.invite_id || null,
        venueId: n.venue_id || null,
        applicationId: n.application_id || null,
        messageId: n.message_id || null,
        chatType: n.payload?.chat_type || null
      }
    }));
    const reviewItems = await _loadReviewTaskNotificationItems();
    const merged = [...mapped, ...reviewItems]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 20);
    if (typeof _setCached === 'function') _setCached('notifications', cacheKey, merged, 12000);
    _renderNotificationRows(merged);
  } catch(e) {
    console.warn('[mitmi] loadNotifications:', e.message);
    await renderFallbackNotifications();
  }
}

function _notifIcon(type) {
  const icons = {
    new_invite:    '🎟️', invite_joined: '🙌', new_message:   '💬',
    new_review:    '⭐', event_reminder:'📅', new_follower:  '👤',
    system:        '📣'
  };
  return icons[type] || '🔔';
}

function _escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function _relTime(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return 'upravo';
  if (diff < 3600) return `${Math.floor(diff/60)}m`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h`;
  return `${Math.floor(diff/86400)}d`;
}

async function markNotifRead(id, el) {
  if (!isLoggedIn()) return;
  el?.classList.remove('unread');
  try {
    await _supaFetch(`/rest/v1/notifications?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ read: true })
    });
    if (typeof _clearCache === 'function') _clearCache('notifications', getUser()?.id || 'guest');
  } catch(e) {}
}

async function markAllNotificationsRead() {
  if (!isLoggedIn()) return;
  const unreadIds = _notificationFeed
    .filter(item => item?.id && (item.read === false || item.syntheticUnread))
    .map(item => item.id);
  document.querySelectorAll('.notif-row.unread').forEach(el => el.classList.remove('unread'));
  _notificationFeed = _notificationFeed.map(item => ({ ...item, read: true, syntheticUnread: false }));
  _setNotificationBadge(0);
  if (!unreadIds.length) {
    showToast('Nema novih obaveštenja', 'info', 1400);
    return;
  }
  try {
    await _supaFetch(`/rest/v1/notifications?id=in.(${unreadIds.join(',')})`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ read: true })
    });
    if (typeof _clearCache === 'function') _clearCache('notifications', getUser()?.id || 'guest');
  } catch (e) {
    console.warn('[mitmi] markAllNotificationsRead:', e.message);
  }
  showToast('Obaveštenja su označena kao pročitana', 'success', 1600);
}

function openNotificationItem(itemOrType = '') {
  const item = typeof itemOrType === 'string'
    ? { type: itemOrType }
    : (itemOrType || {});
  const normalized = String(item.type || '').toLowerCase();
  const target = item.target || {};
  if (normalized.includes('message')) {
    if (target.profileId) {
      openDirectChat(target.profileId, target.title || 'Direktna poruka');
      return;
    }
    if (target.chatId) {
      openChat(target.chatType === 'direct' ? 'dm' : 'group', target.title || 'Poruke', target.chatType === 'direct' ? 'Direktna poruka' : 'Grupni chat', target.chatId);
      return;
    }
    nav('chats');
    return;
  }
  if (normalized.includes('review')) {
    if (item?.target?.reviewTaskId && typeof openPendingReviews === 'function') {
      openPendingReviews();
      return;
    }
    nav('profile');
    return;
  }
  if (normalized.includes('follower')) {
    if (target.profileId) {
      openOtherProfile(target.profileId);
      return;
    }
    _activateMyProfileTab('pt3');
    return;
  }
  if (normalized.includes('venue_follow')) {
    if (target.venueId) {
      openVenueProfile({ id: target.venueId, kind: 'venue', entity_type: 'venue' });
      return;
    }
    nav('venue');
    return;
  }
  if (normalized.includes('invite') || normalized.includes('event')) {
    if (target.profileTab) {
      _activateMyProfileTab(target.profileTab);
      return;
    }
    if (target.eventId) {
      openEventById(target.eventId);
      return;
    }
    const recent = _combinedEventCards()[0];
    if (recent?.id) openEventById(recent.id);
    else openUnifiedHub('events', 0);
    return;
  }
  nav('notif');
}

async function renderFallbackNotifications() {
  const [inviteItems, messageItems, followerItems, reminderItems, reviewItems] = await Promise.all([
    _loadInviteNotificationItems(),
    _loadMessageNotificationItems(),
    _loadFollowerNotificationItems(),
    _loadFollowedEventReminderItems(),
    _loadReviewTaskNotificationItems()
  ]);
  const items = [...inviteItems, ...messageItems, ...followerItems, ...reminderItems, ...reviewItems]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 10);
  if (items.length) {
    _renderNotificationRows(items);
    return;
  }
  _renderNotificationRows([
    {
      type: 'new_message',
      title: 'Kad stignu prve poruke, videćeš ih ovde',
      body: 'Mitmi će te voditi pravo na chat ili poziv koji je bitan.',
      created_at: new Date().toISOString(),
      syntheticUnread: false,
      timeLabel: 'uskoro'
    },
    {
      type: 'event_reminder',
      title: 'Sačuvani događaji i prijave će se pojaviti ovde',
      body: 'Kad krene više aktivnosti, ovaj ekran će postati tvoj inbox za dešavanja.',
      created_at: new Date().toISOString(),
      syntheticUnread: false,
      timeLabel: 'uskoro'
    }
  ]);
}

// ─── Follow venue ───
async function toggleVenueFollow(btn) {
  if (!isLoggedIn()) {
    nav('login');
    return;
  }
  if (_currentPublicVenueTarget && _isOrganizerEntity(_currentPublicVenueTarget)) {
    showToast('Organizer profili trenutno nemaju opciju praćenja. Za sada možeš da pratiš njihove događaje.', 'info', 2200);
    return;
  }
  if (!_currentPublicVenueId) {
    showToast('Organizer profil još nije povezan', 'info', 1800);
    return;
  }
  const myVenue = await _getMyVenue().catch(() => null);
  if (myVenue?.id === _currentPublicVenueId) {
    showToast('Ovo je tvoj organizer profil', 'info', 1600);
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
