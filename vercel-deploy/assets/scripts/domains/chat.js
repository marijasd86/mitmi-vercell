const _chatDmStatus = {};
let _activeChatProfileId = null;
let _activeChatContext = null;
let _activeEventPairPlan = null;
let _activeChatType = null;

function _localDmStatusCacheKey() {
  if (_activeChatId) return `chat:${_activeChatId}`;
  if (_activeChatProfileId) return `profile:${_activeChatProfileId}`;
  return '';
}

function _pendingReviewSummaryForChat(eventId = null, profileId = null) {
  if (!eventId || !profileId || !Array.isArray(PENDING_REVIEW_TASKS)) return { count: 0, hasPeer: false, hasEvent: false };
  const matches = PENDING_REVIEW_TASKS.filter(item =>
    item.status === 'pending' &&
    item.event_id === eventId &&
    (
      item.target_type === 'event' ||
      (item.target_type === 'peer' && item.target_user_id === profileId)
    )
  );
  return {
    count: matches.length,
    hasPeer: matches.some(item => item.target_type === 'peer'),
    hasEvent: matches.some(item => item.target_type === 'event')
  };
}

function _normalizeChatContext(context = null) {
  if (!context || typeof context !== 'object') return null;
  const eventId = context.eventId || null;
  if (!eventId) return null;
  return {
    kind: context.kind || 'event',
    eventId,
    eventTitle: context.eventTitle || 'Događaj',
    startsAt: context.startsAt || context.starts_at || null,
    inviteId: context.inviteId || null,
    inviteTitle: context.inviteTitle || '',
    planId: context.planId || null
  };
}

function _eventContextIsPast(context = null) {
  const startsAt = context?.startsAt || null;
  if (!startsAt) return false;
  const eventTime = new Date(startsAt).getTime();
  return Number.isFinite(eventTime) ? eventTime < Date.now() : false;
}

async function _ensureChatContextEventTiming(context = null) {
  const normalized = _normalizeChatContext(context);
  if (!normalized?.eventId || normalized.startsAt || !_isSupabaseConfigured()) return normalized;
  try {
    const rows = await _supaGet('events', {
      select: 'id,starts_at',
      id: `eq.${normalized.eventId}`,
      limit: '1'
    });
    const event = Array.isArray(rows) ? (rows[0] || null) : null;
    return {
      ...normalized,
      startsAt: event?.starts_at || null
    };
  } catch (e) {
    console.warn('[mitmi] _ensureChatContextEventTiming:', e.message);
    return normalized;
  }
}

function _renderChatContext(context = null) {
  const box = document.getElementById('chat-event-context');
  const titleEl = document.getElementById('chat-event-context-title');
  const metaEl = document.getElementById('chat-event-context-meta');
  if (!box || !titleEl || !metaEl) return;
  if (!context?.eventId) {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';
  titleEl.textContent = context.eventTitle || _langText('Događaj', 'Event');
  const baseMeta = context.inviteTitle
    ? _langText(`Dogovor za: ${context.inviteTitle}`, `Plan for: ${context.inviteTitle}`)
    : _langText('Plan around going together and confirming the meetup', 'Plan around going together and confirming the meetup');
  metaEl.textContent = _eventContextIsPast(context)
    ? `${baseMeta} · ${_langText('Događaj je prošao', 'The event has passed')}`
    : baseMeta;
}

async function _isBlockedBetweenMeAnd(profileId) {
  if (!_isSupabaseConfigured() || !isLoggedIn() || !profileId) return false;
  try {
    const result = await _supaFetch('/rest/v1/rpc/is_blocked', {
      method: 'POST',
      body: JSON.stringify({
        a_user_id: getUser()?.id,
        b_user_id: profileId
      })
    });
    return result === true;
  } catch (e) {
    console.warn('[mitmi] _isBlockedBetweenMeAnd:', e.message);
    return false;
  }
}

function openInboxDirectChat(profileId, name = _langText('Direktna poruka', 'Direct message'), eventId = null, eventTitle = '', planId = '') {
  if (!profileId) {
    showToast(_langText('Profil sagovornika trenutno nije dostupan', 'The other profile is currently unavailable'), 'info', 1800);
    return;
  }
  const context = eventId ? { kind: 'event', eventId, eventTitle: eventTitle || _langText('Događaj', 'Event'), planId: planId || null } : null;
  return openDirectChat(profileId, name, context);
}

function _renderChatMessageList(items = []) {
  const msgs = document.getElementById('chat-msgs');
  if (!msgs) return;
  msgs.innerHTML = '';
  if (!items.length) {
    msgs.innerHTML = `<div class="draft-empty" style="padding:18px 0">${_langText('Još nema poruka. Napiši prvu.', 'No messages yet. Send the first one.')}</div>`;
    return;
  }
  const dayDiv = document.createElement('div');
  dayDiv.className = 'chat-day';
  dayDiv.textContent = _langText('Danas', 'Today');
  msgs.appendChild(dayDiv);
  const myId = getUser()?.id;
  items.forEach(m => {
    const div = document.createElement('div');
    const me = m.me || m.sender_id === myId;
    div.className = 'msg' + (me ? ' me' : '');
    if (!me) {
      const sender = m.profiles || {};
      const av = document.createElement('div');
      av.className = 'av av-32 av-purple';
      av.style.cursor = 'pointer';
      av.textContent = ((sender.display_name || sender.username || '?').charAt(0) || '?').toUpperCase();
      if (sender.id) av.onclick = () => openOtherProfile(sender.id);
      div.appendChild(av);
    }
    const wrap = document.createElement('div');
    const bubble = document.createElement('div');
    const isDeleted = !!m.is_deleted;
    bubble.className = 'bubble' + (isDeleted ? ' is-deleted' : '');
    bubble.textContent = isDeleted ? _langText('Poruka je obrisana', 'Message deleted') : (m.content || m.text || '');
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = m.time || new Date(m.created_at || Date.now()).toLocaleTimeString('sr', { hour:'2-digit', minute:'2-digit' });
    wrap.appendChild(bubble);
    wrap.appendChild(time);
    if (me && !isDeleted && m.id) {
      const del = document.createElement('button');
      del.className = 'chat-msg-delete';
      del.type = 'button';
      del.textContent = _langText('Obriši', 'Delete');
      del.onclick = (ev) => {
        ev.stopPropagation();
        deleteChatMessage(m.id);
      };
      wrap.appendChild(del);
    }
    div.appendChild(wrap);
    msgs.appendChild(div);
  });
  msgs.scrollTop = msgs.scrollHeight;
}

async function openDirectChat(profileId, name = _langText('Direktna poruka', 'Direct message'), context = null) {
  if (!isLoggedIn()) {
    showToast(_langText('Prijavi se da otvoriš poruke', 'Sign in to open messages'), 'info', 1800);
    nav('login');
    return;
  }
  if (!profileId) {
    showToast(_langText('Profil sagovornika trenutno nije dostupan', 'The other profile is currently unavailable'), 'info', 1800);
    return;
  }
  if (profileId === getUser()?.id) {
    showToast(_langText('Ne možeš otvoriti direktan chat sa sobom', 'You cannot open a direct chat with yourself'), 'info', 1800);
    return;
  }
  try {
    const blocked = await _isBlockedBetweenMeAnd(profileId);
    if (blocked) {
      showToast(_langText('Poruke nisu dostupne između blokiranih profila', 'Messages are unavailable between blocked profiles'), 'info', 2200);
      return;
    }
    const eventContext = await _ensureChatContextEventTiming(context);
    const chat = await _ensureDirectChat(profileId, `DM · ${name}`, eventContext);
    const messages = await _loadChatMessages(chat.id);
    await _markChatRead(chat.id);
    _unsubscribeChat();
    _subscribeToChat(chat.id);
    _activeChatName = name;
    const nameEl = document.querySelector('.chat-top-name');
    const subEl = document.querySelector('.chat-top-sub');
    const typeBadge = document.getElementById('chat-type-badge');
    const actionBtn = document.getElementById('chat-action-btn');
    const moreBtn = document.getElementById('chat-more-btn');
    const miniProfile = document.getElementById('chat-mini-profile');
    const miniName = document.getElementById('chat-mini-name');
    const miniAv = document.getElementById('chat-mini-av');
    const sbar = document.getElementById('chat-status-bar');
    _activeChatContext = eventContext;
    _activeEventPairPlan = null;
    _activeChatType = 'dm';
    if (nameEl) nameEl.textContent = name;
    if (subEl) subEl.textContent = eventContext
      ? _langText('Privatni chat za događaj', 'Private chat for this event')
      : _langText('Direktna poruka', 'Direct message');
    if (typeBadge) {
      typeBadge.textContent = eventContext ? _langText('DOGAĐAJ', 'EVENT') : _langText('PRIVATNI', 'PRIVATE');
      typeBadge.style.background = eventContext ? 'rgba(49,71,174,.12)' : 'var(--purple-bg)';
      typeBadge.style.color = eventContext ? 'var(--royal-blue)' : 'var(--purple3)';
    }
    if (actionBtn) actionBtn.style.display = 'none';
    if (moreBtn) {
      moreBtn.style.display = _activeChatId ? 'flex' : 'none';
      moreBtn.style.background = '';
    }
    _activeChatProfileId = profileId || null;
    if (miniProfile) {
      miniProfile.style.display = 'flex';
      miniProfile.dataset.profileId = profileId || '';
    }
    if (miniName) miniName.textContent = name;
    if (miniAv) miniAv.textContent = (name.charAt(0) || 'D').toUpperCase();
    _renderChatContext(eventContext);
    _syncChatActionMenu();
    if (sbar) sbar.style.display = 'none';
    _renderChatMessageList(messages);
    if (eventContext?.eventId) {
      await _refreshActiveEventPlanState();
      const reviewHint = _pendingReviewSummaryForChat(eventContext.eventId, profileId);
      if (reviewHint.count > 0) {
        showToast(
          reviewHint.hasPeer && reviewHint.hasEvent
            ? _langText('Posle događaja te čekaju dve ocene', 'Two reviews will be waiting for you after the event')
            : _langText('Čeka te ocena za ovaj događaj', 'A review is waiting for this event'),
          'info',
          1800
        );
      }
    } else {
      _syncEventPlanUi(null);
    }
    nav('chat');
  } catch (e) {
    console.error('[mitmi] openDirectChat:', e);
    showToast(_langText('Chat trenutno nije dostupan', 'Chat is currently unavailable'), 'error');
  }
}

function openChat(type, name, sub, chatId) {
  if (!isLoggedIn()) {
    showToast(_langText('Prijavi se da otvoriš poruke', 'Sign in to open messages'), 'info', 1800);
    nav('login');
    return;
  }
  (async () => {
  try {
  // Pokini prethodnu realtime pretplatu i počni novu ako ima pravi chatId
  _unsubscribeChat();
  if (chatId) _subscribeToChat(chatId);
  const dbMessages = chatId && _isSupabaseConfigured() ? await _loadChatMessages(chatId) : [];
  if (chatId) await _markChatRead(chatId);

  // Update header
  const nameEl = document.querySelector('.chat-top-name');
  const subEl  = document.querySelector('.chat-top-sub');
  _activeChatName = name; // za _doSend persistence
  _activeChatContext = null;
  _activeEventPairPlan = null;
  _activeChatType = type;
  if (nameEl) nameEl.textContent = name;
  if (subEl)  subEl.textContent  = sub || ((type === 'dm')
    ? _langText('Direktna poruka', 'Direct message')
    : _langText('Grupni chat', 'Group chat'));
  // Badge tip
  const typeBadge = document.getElementById('chat-type-badge');
  if (typeBadge) {
    const isDMBadge = type === 'dm';
    typeBadge.textContent = isDMBadge
      ? _langText('PRIVATNI', 'PRIVATE')
      : _langText('GRUPNI', 'GROUP');
    typeBadge.style.background = isDMBadge ? 'var(--purple-bg)' : 'var(--bg3)';
    typeBadge.style.color = isDMBadge ? 'var(--purple3)' : 'var(--ink4)';
  }

  // Renderuj poruke
  const msgs = document.getElementById('chat-msgs');
  if (msgs) {
    msgs.innerHTML = '';
    const dayDiv = document.createElement('div');
    dayDiv.className = 'chat-day';
    dayDiv.textContent = _langText('Danas', 'Today');
    msgs.appendChild(dayDiv);

    const sourceMsgs = dbMessages;
    sourceMsgs.forEach(m => {
      const div = document.createElement('div');
      const me = m.me || m.sender_id === getUser()?.id;
      div.className = 'msg' + (me ? ' me' : '');
      if (!me && (m.av || m.profiles?.id)) {
        const av = document.createElement('div');
        av.className = 'av av-32 ' + (m.color || 'av-purple');
        av.style.cursor = 'pointer';
        av.textContent = m.av || ((m.profiles?.display_name || m.profiles?.username || '?').charAt(0) || '?').toUpperCase();
        av.onclick = () => openOtherProfile(m.profiles?.id || null);
        div.appendChild(av);
      }
      const wrap = document.createElement('div');
      const bubble = document.createElement('div');
      const isDeleted = !!m.is_deleted;
      bubble.className = 'bubble' + (isDeleted ? ' is-deleted' : '');
      bubble.textContent = isDeleted
        ? _langText('Poruka je obrisana', 'Message deleted')
        : (m.text || m.content || ''); // textContent — XSS safe
      const time = document.createElement('span');
      time.className = 'msg-time';
      time.textContent = m.time || new Date(m.created_at || Date.now()).toLocaleTimeString('sr', { hour:'2-digit', minute:'2-digit' });
      wrap.appendChild(bubble);
      wrap.appendChild(time);
      if (me && !isDeleted && m.id) {
        const del = document.createElement('button');
        del.className = 'chat-msg-delete';
        del.type = 'button';
        del.textContent = _langText('Obriši', 'Delete');
        del.onclick = (ev) => {
          ev.stopPropagation();
          deleteChatMessage(m.id);
        };
        wrap.appendChild(del);
      }
      div.appendChild(wrap);
      msgs.appendChild(div);
    });
    msgs.scrollTop = msgs.scrollHeight;
  }

  // Idemo bar i trust bar — samo u DM
  const isDM = type === 'dm';
  const idemoBar = document.getElementById('idemo-bar');
  if (idemoBar) idemoBar.style.display = isDM ? 'flex' : 'none';

  const trustBar = document.getElementById('chat-trust-bar');
  if (trustBar) trustBar.style.display = 'none'; // Zamijenjen sa chat-mini-profile

  // Mini profil (DM)
  const miniProfile = document.getElementById('chat-mini-profile');
  const miniName    = document.getElementById('chat-mini-name');
  const miniAv      = document.getElementById('chat-mini-av');
  _activeChatProfileId = isDM ? (dbMessages.find(m => m.profiles?.id)?.profiles?.id || null) : null;
  if (miniProfile) {
    miniProfile.style.display = isDM ? 'flex' : 'none';
    miniProfile.dataset.profileId = _activeChatProfileId || '';
  }
  if (miniName) miniName.textContent = name;
  if (miniAv)   miniAv.textContent   = name.charAt(0);
  _renderChatContext(null);
  _syncChatActionMenu();

  // Buttons u headeru — u grupnom ℹ event, u DM ⋯ vise opcija
  const actionBtn = document.getElementById('chat-action-btn');
  const moreBtn   = document.getElementById('chat-more-btn');
  if (actionBtn) {
    actionBtn.style.display = isDM ? 'none' : 'flex';
    actionBtn.onclick = () => nav('event');
  }
  if (moreBtn) {
    moreBtn.style.display = chatId ? 'flex' : 'none';
    moreBtn.style.background = '';
  }
  // Status bar ostaje skriven pri otvaranju; korisnik ga otvara ručno preko ⋯
  const sbar = document.getElementById('chat-status-bar');
  if (sbar) sbar.style.display = 'none';

  // Reset dogovor za novi DM
  if (isDM) {
    _dogovorState = 'idle';
    const savedStatus = _chatDmStatus[_localDmStatusCacheKey()] || 'pricamo';
    setTimeout(() => setDMStatus(savedStatus, { silent: true }), 50);
    // Reset propose btn
    const proposeBtn = document.getElementById('chat-propose-btn');
    const proposeTxt = document.getElementById('idemo-btn-text');
    if (proposeBtn) {
      proposeBtn.disabled = false;
      proposeBtn.style.background = 'linear-gradient(135deg, var(--purple) 0%, var(--purple2) 100%)';
      proposeBtn.style.color = '#fff';
    }
    if (proposeTxt) {
      proposeTxt.textContent = savedStatus === 'mozda'
        ? _langText('Čeka potvrdu', 'Waiting for confirmation')
        : savedStatus === 'potvrdeno'
          ? _langText('Idete zajedno', 'Going together')
          : _langText('Predloži zajednički odlazak', 'Suggest going together');
    }
  }

  nav('chat');
  } catch(e) { console.error('[mitmi] openChat error:', e); nav('chat'); }
  })();
}

function openActiveChatProfile() {
  const profileId = document.getElementById('chat-mini-profile')?.dataset.profileId || _activeChatProfileId || null;
  if (!profileId) {
    showToast(_langText('Profil sagovornika trenutno nije dostupan', 'The other profile is currently unavailable'), 'info', 1600);
    return;
  }
  openOtherProfile(profileId);
}


// ─── DM Status sistem (Faza 2b) ───
// --- Toggle status bar u DM ---
function toggleChatStatus() {
  if (!_activeChatId) return;
  const bar = document.getElementById('chat-status-bar');
  if (!bar) return;
  _syncChatActionMenu();
  const isVisible = bar.style.display !== 'none';
  bar.style.display = isVisible ? 'none' : 'block';
  const btn = document.getElementById('chat-more-btn');
  if (btn) btn.style.background = isVisible ? '' : 'var(--purple-bg)';
}
