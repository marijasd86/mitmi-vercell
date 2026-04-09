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
  titleEl.textContent = context.eventTitle || 'Događaj';
  const baseMeta = context.inviteTitle
    ? `Dogovor za: ${context.inviteTitle}`
    : 'Dogovor oko odlaska i potvrda plana';
  metaEl.textContent = _eventContextIsPast(context)
    ? `${baseMeta} · Događaj je prošao`
    : baseMeta;
}

function _pairPlanUsersForEvent(peerId) {
  const myId = getUser()?.id || null;
  if (!myId || !peerId) return null;
  const ids = [myId, peerId].sort();
  return {
    myId,
    peerId,
    userAId: ids[0],
    userBId: ids[1],
    amUserA: ids[0] === myId
  };
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

async function _loadEventPairPlan(eventId, peerId, sourcePlanId = null) {
  if (!_isSupabaseConfigured() || !eventId || !peerId) return null;
  const pair = _pairPlanUsersForEvent(peerId);
  if (!pair) return null;
  try {
    const params = {
      select: 'id,event_id,invite_id,source_plan_id,chat_id,user_a_id,user_b_id,status,proposed_by_id,confirmed_by_a_at,confirmed_by_b_at,confirmed_at,cancelled_by_id,cancelled_at,created_at,updated_at',
      user_a_id: `eq.${pair.userAId}`,
      user_b_id: `eq.${pair.userBId}`,
      limit: '1'
    };
    if (sourcePlanId) {
      params.source_plan_id = `eq.${sourcePlanId}`;
    } else {
      params.event_id = `eq.${eventId}`;
      params.source_plan_id = 'is.null';
    }
    const rows = await _supaGet('event_pair_plans', params);
    return Array.isArray(rows) ? (rows[0] || null) : null;
  } catch (e) {
    console.warn('[mitmi] _loadEventPairPlan:', e.message);
    return null;
  }
}

async function _refreshActiveEventPlanState() {
  if (!_activeChatContext?.eventId || !_activeChatProfileId) {
    _syncEventPlanUi(null);
    return null;
  }
  const plan = await _loadEventPairPlan(_activeChatContext.eventId, _activeChatProfileId, _activeChatContext.planId || null);
  if (plan?.source_plan_id && !_activeChatContext?.planId) {
    _activeChatContext = { ..._activeChatContext, planId: plan.source_plan_id };
  }
  _syncEventPlanUi(plan);
  return plan;
}

function _myPlanConfirmationField(plan = {}) {
  const pair = _pairPlanUsersForEvent(_activeChatProfileId);
  if (!pair || !plan) return null;
  return pair.amUserA ? 'confirmed_by_a_at' : 'confirmed_by_b_at';
}

function _otherPlanConfirmationField(plan = {}) {
  const pair = _pairPlanUsersForEvent(_activeChatProfileId);
  if (!pair || !plan) return null;
  return pair.amUserA ? 'confirmed_by_b_at' : 'confirmed_by_a_at';
}

function _syncEventPlanUi(plan = null) {
  _activeEventPairPlan = plan || null;
  if (!_activeChatContext?.eventId) {
    setDMStatus('pricamo', { silent: true });
    return;
  }
  const proposeBtn = document.getElementById('chat-propose-btn');
  const proposeTxt = document.getElementById('idemo-btn-text');
  if (_eventContextIsPast(_activeChatContext)) {
    setDMStatus('pricamo', { silent: true });
    if (proposeBtn) proposeBtn.disabled = true;
    if (proposeTxt) proposeTxt.textContent = 'Događaj je prošao';
    return;
  }
  if (!plan) {
    setDMStatus('pricamo', { silent: true });
    if (proposeBtn) proposeBtn.disabled = false;
    if (proposeTxt) proposeTxt.textContent = 'Predloži zajednički odlazak';
    return;
  }
  if (plan.status === 'confirmed') {
    setDMStatus('potvrdeno', { silent: true });
    if (proposeTxt) proposeTxt.textContent = 'Idete zajedno';
    return;
  }
  if (plan.status === 'cancelled') {
    setDMStatus('odustao', { silent: true });
    if (proposeTxt) proposeTxt.textContent = 'Dogovor je otkazan';
    return;
  }
  const myField = _myPlanConfirmationField(plan);
  const otherField = _otherPlanConfirmationField(plan);
  const meConfirmed = !!(myField && plan[myField]);
  const otherConfirmed = !!(otherField && plan[otherField]);
  setDMStatus('mozda', { silent: true });
  if (proposeBtn) proposeBtn.disabled = meConfirmed && !otherConfirmed;
  if (proposeTxt) {
    proposeTxt.textContent = meConfirmed && !otherConfirmed
      ? 'Čeka potvrdu druge osobe'
      : 'Potvrdi zajednički odlazak';
  }
}

function openInboxDirectChat(profileId, name = 'Direktna poruka', eventId = null, eventTitle = '', planId = '') {
  const context = eventId ? { kind: 'event', eventId, eventTitle: eventTitle || 'Događaj', planId: planId || null } : null;
  return openDirectChat(profileId, name, context);
}

async function hideConversation(chatId) {
  if (!chatId || !isLoggedIn() || !_isSupabaseConfigured()) return;
  const confirmed = typeof window !== 'undefined'
    ? window.confirm('Da li želiš da ukloniš ovaj razgovor iz svog inboxa?')
    : true;
  if (!confirmed) return;
  try {
    await _supaFetch(`/rest/v1/chat_participants?chat_id=eq.${chatId}&user_id=eq.${getUser()?.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        hidden_at: new Date().toISOString()
      })
    });
    if (typeof _clearCache === 'function') _clearCache('inbox', getUser()?.id || 'guest');
    await loadChatsInbox();
    showToast('Razgovor je uklonjen iz tvog inboxa', 'success', 1700);
  } catch (e) {
    console.warn('[mitmi] hideConversation:', e.message);
    showToast('Brisanje razgovora trenutno nije uspelo', 'error');
  }
}

async function hideActiveConversation() {
  if (!_activeChatId) return;
  await hideConversation(_activeChatId);
  nav('chats');
}

async function leaveActiveChat() {
  if (!_activeChatId) return;
  const confirmed = typeof window !== 'undefined'
    ? window.confirm('Da li želiš da napustiš ovaj chat?')
    : true;
  if (!confirmed) return;
  await hideConversation(_activeChatId);
  nav('chats');
}

function _syncChatActionMenu() {
  const statusRow = document.getElementById('chat-status-row');
  const proposeBtn = document.getElementById('chat-propose-btn');
  const hideBtn = document.getElementById('chat-hide-btn');
  const leaveBtn = document.getElementById('chat-leave-btn');
  const hasEventPlan = !!_activeChatContext?.eventId;
  const canManageEventPlan = hasEventPlan && !_eventContextIsPast(_activeChatContext);
  const isGroup = _activeChatType === 'group';
  if (statusRow) statusRow.style.display = canManageEventPlan ? 'flex' : 'none';
  if (proposeBtn) proposeBtn.style.display = canManageEventPlan ? 'flex' : 'none';
  if (hideBtn) hideBtn.textContent = isGroup ? 'Ukloni iz mog inboxa' : 'Ukloni iz mog inboxa';
  if (leaveBtn) leaveBtn.style.display = isGroup ? '' : 'none';
}

function _renderInboxRows(rows = []) {
  return rows.map(item => {
    const title = _escHtml(item.title || 'Poruka');
    const subtitle = _escHtml(item.subtitle || '');
    const preview = _escHtml(item.preview || 'Još nema poruka');
    const time = _escHtml(item.time || '');
    const kind = item.kindLabel ? `<span class="chat-kind${item.kind === 'event_dm' ? ' chat-kind-event' : ''}">${_escHtml(item.kindLabel)}</span>` : '';
    const reviewBadge = item.reviewPending ? `<span class="chat-kind chat-kind-review">OCENA</span>` : '';
    const unreadBadge = item.unreadCount > 0 ? `<span class="chat-badge">${_escHtml(String(item.unreadCount > 9 ? '9+' : item.unreadCount))}</span>` : '';
    const subtitleRow = subtitle ? `<div class="chat-subtitle">${subtitle}${item.reviewPending ? ' · Čeka ocena' : ''}</div>` : '';
    const previewText = item.reviewPending
      ? _escHtml(item.reviewPreview || 'Oceni iskustvo sa ovog događaja')
      : preview;
    const onclick = item.type === 'dm' && item.profileId
      ? `openInboxDirectChat('${_escHtml(item.profileId)}','${title.replace(/'/g, '&#39;')}','${_escHtml(item.eventId || '')}','${_escHtml(item.eventTitle || '').replace(/'/g, '&#39;')}','${_escHtml(item.planId || '')}')`
      : `openChat('${item.type}','${title.replace(/'/g, '&#39;')}','${subtitle.replace(/'/g, '&#39;')}','${_escHtml(item.chatId)}')`;
    return `<div class="chat-row${item.unreadCount > 0 ? ' chat-row-unread' : ''}" onclick="${onclick}"><div class="av av-40 av-purple"${item.type === 'group' ? ' style="border-radius:10px"' : ''}>${_escHtml((item.title || 'P').charAt(0).toUpperCase())}</div><div class="chat-info"><div class="chat-name-row"><div class="chat-name">${title}</div>${kind}${reviewBadge}${unreadBadge}</div>${subtitleRow}<div class="chat-preview">${previewText}</div></div><div class="chat-meta"><div class="chat-time">${time}</div><button class="btn btn-ghost btn-sm chat-row-delete" onclick="event.stopPropagation();hideConversation('${_escHtml(item.chatId || '')}')" title="Ukloni razgovor">Ukloni</button></div></div>`;
  }).join('');
}

function _renderInboxSections(box, items = []) {
  if (!box) return;
  const grouped = {
    group: items.filter(item => item.type === 'group'),
    eventDm: items.filter(item => item.kind === 'event_dm'),
    dm: items.filter(item => item.type === 'dm' && item.kind !== 'event_dm')
  };
  box.innerHTML = `${grouped.group.length ? `<div class="chat-list-section">GRUPNI CHATOVI</div>${_renderInboxRows(grouped.group)}` : ''}${grouped.eventDm.length ? `<div class="chat-list-section" style="margin-top:8px">DOGOVORI ZA DOGAĐAJE</div>${_renderInboxRows(grouped.eventDm)}` : ''}${grouped.dm.length ? `<div class="chat-list-section" style="margin-top:8px">DIREKTNE PORUKE</div>${_renderInboxRows(grouped.dm)}` : ''}${!grouped.group.length && !grouped.eventDm.length && !grouped.dm.length ? '<div class="draft-empty">Još nema aktivnih poruka.</div>' : ''}`;
}

async function loadChatsInbox() {
  const box = document.getElementById('chats-list');
  if (!box) return [];
  if (!isLoggedIn()) {
    box.innerHTML = '<div class="draft-empty">Prijavi se da vidiš poruke.</div>';
    return [];
  }
  if (!_isSupabaseConfigured()) {
    box.innerHTML = '<div class="draft-empty">Poruke trenutno nisu dostupne.</div>';
    return [];
  }
  const cacheKey = getUser()?.id || 'guest';
  const cached = typeof _getCached === 'function' ? _getCached('inbox', cacheKey) : null;
  if (cached) {
    _renderInboxSections(box, cached);
    return cached;
  }
  try {
    await loadPendingReviewTasks({ sync: true, render: false }).catch(() => []);
    const myId = getUser()?.id;
    const memberships = await _supaGet('chat_participants', {
      select: 'chat_id,hidden_at,last_read_at,chats!inner(id,chat_type,title,created_at,event_id,events(title))',
      user_id: `eq.${myId}`,
      order: 'created_at.desc',
      limit: '100'
    });
    const chatRows = (Array.isArray(memberships) ? memberships : []).filter(row => !row.hidden_at);
    if (!chatRows.length) {
      box.innerHTML = '<div class="draft-empty">Još nema aktivnih poruka.</div>';
      return [];
    }
    const chatIds = Array.from(new Set(chatRows.map(row => row.chat_id).filter(Boolean)));
    const inFilter = `in.(${chatIds.join(',')})`;
    const [messages, participants, eventPairPlans] = await Promise.all([
      _supaGet('messages', {
        select: 'id,chat_id,sender_id,content,is_deleted,created_at',
        chat_id: inFilter,
        order: 'created_at.desc',
        limit: '200'
      }).catch(() => []),
      _supaGet('chat_participants', {
        select: 'chat_id,user_id,hidden_at,profiles!user_id(id,username,display_name,avatar_url)',
        chat_id: inFilter,
        limit: '200'
      }).catch(() => []),
      _supaGet('event_pair_plans', {
        select: 'chat_id,source_plan_id,updated_at,created_at',
        chat_id: inFilter,
        order: 'updated_at.desc',
        limit: '200'
      }).catch(() => [])
    ]);
    const latestByChat = new Map();
    const messagesByChat = new Map();
    (Array.isArray(messages) ? messages : []).forEach(msg => {
      if (!latestByChat.has(msg.chat_id)) latestByChat.set(msg.chat_id, msg);
      const list = messagesByChat.get(msg.chat_id) || [];
      list.push(msg);
      messagesByChat.set(msg.chat_id, list);
    });
    const othersByChat = new Map();
    (Array.isArray(participants) ? participants : []).forEach(row => {
      if (row.user_id === myId) return;
      const list = othersByChat.get(row.chat_id) || [];
      list.push(row.profiles || {});
      othersByChat.set(row.chat_id, list);
    });
    const planIdByChat = new Map();
    (Array.isArray(eventPairPlans) ? eventPairPlans : []).forEach(row => {
      if (!row?.chat_id || planIdByChat.has(row.chat_id)) return;
      if (row.source_plan_id) planIdByChat.set(row.chat_id, row.source_plan_id);
    });
    const items = chatRows.map(row => {
      const chat = row.chats || {};
      const others = othersByChat.get(row.chat_id) || [];
      const peer = others[0] || {};
      const isDM = chat.chat_type === 'direct';
      const eventId = isDM ? (chat.event_id || null) : null;
      const eventTitle = isDM ? (chat.events?.title || '') : '';
      const isEventDm = !!(isDM && eventId);
      const reviewSummary = isEventDm ? _pendingReviewSummaryForChat(eventId, peer.id || null) : { count: 0, hasPeer: false, hasEvent: false };
      const title = isDM ? (peer.display_name || peer.username || 'Direktna poruka') : (chat.title || 'Grupni chat');
      const subtitle = isEventDm
        ? `Za događaj · ${eventTitle || 'Događaj'}`
        : (isDM ? 'Direktna poruka' : `${others.length + 1} člana · Grupni chat`);
      const latest = latestByChat.get(row.chat_id);
      const chatMessages = messagesByChat.get(row.chat_id) || [];
      const unreadCount = chatMessages.filter(msg => {
        if (!msg?.created_at || msg.sender_id === myId) return false;
        if (!row.last_read_at) return true;
        return new Date(msg.created_at) > new Date(row.last_read_at);
      }).length;
      const preview = latest?.is_deleted ? 'Poruka je obrisana' : (latest?.content || 'Još nema poruka');
      return {
        chatId: row.chat_id,
        type: isDM ? 'dm' : 'group',
        kind: isEventDm ? 'event_dm' : (isDM ? 'dm' : 'group'),
        kindLabel: isEventDm ? 'DOGAĐAJ' : '',
        title,
        subtitle,
        preview,
        time: latest?.created_at ? new Date(latest.created_at).toLocaleTimeString('sr', { hour:'2-digit', minute:'2-digit' }) : '',
        unreadCount,
        profileId: isDM ? (peer.id || null) : null,
        eventId,
        eventTitle,
        planId: isEventDm ? (planIdByChat.get(row.chat_id) || null) : null,
        reviewPending: reviewSummary.count > 0,
        reviewPreview: reviewSummary.hasPeer && reviewSummary.hasEvent
          ? 'Oceni osobu i događaj'
          : (reviewSummary.hasPeer ? 'Oceni iskustvo sa ovom osobom' : (reviewSummary.hasEvent ? 'Oceni događaj' : '')),
        sortAt: latest?.created_at || chat.created_at || row.created_at || null
      };
    }).sort((a, b) => new Date(b.sortAt || 0) - new Date(a.sortAt || 0));
    _renderInboxSections(box, items);
    if (typeof _setCached === 'function') _setCached('inbox', cacheKey, items, 12000);
    return items;
  } catch (e) {
    console.warn('[mitmi] loadChatsInbox:', e.message);
    box.innerHTML = '<div class="draft-empty">Poruke trenutno nisu mogle da se učitaju. Pokušaj ponovo malo kasnije.</div>';
    return [];
  }
}

async function _findDirectChatWithProfile(profileId, eventId = null) {
  if (!profileId || !isLoggedIn() || !_isSupabaseConfigured()) return null;
  const myId = getUser()?.id;
  if (!myId) return null;
  try {
    const [myMemberships, peerMemberships] = await Promise.all([
      _supaGet('chat_participants', {
        select: 'chat_id,chats!inner(id,chat_type,title,created_at,event_id)',
        user_id: `eq.${myId}`,
        limit: '100'
      }).catch(() => []),
      _supaGet('chat_participants', {
        select: 'chat_id',
        user_id: `eq.${profileId}`,
        limit: '100'
      }).catch(() => [])
    ]);
    const peerChatIds = new Set((Array.isArray(peerMemberships) ? peerMemberships : []).map(row => row.chat_id).filter(Boolean));
    const grouped = new Map();
    (Array.isArray(myMemberships) ? myMemberships : []).forEach(row => {
      const chatId = row.chat_id;
      if (!chatId) return;
      const chat = row.chats || null;
      if (!peerChatIds.has(chatId)) return;
      if (!chat || chat.chat_type !== 'direct') return;
      if (eventId ? chat.event_id !== eventId : !!chat.event_id) return;
      const entry = grouped.get(chatId) || { users: new Set(), chat: row.chats || null };
      entry.users.add(myId);
      entry.users.add(profileId);
      if (!entry.chat && row.chats) entry.chat = row.chats;
      grouped.set(chatId, entry);
    });
    for (const [chatId, entry] of grouped.entries()) {
      if (entry.users.has(myId) && entry.users.has(profileId)) {
        return entry.chat || { id: chatId, chat_type: 'direct' };
      }
    }
  } catch (e) {
    console.warn('[mitmi] _findDirectChatWithProfile:', e.message);
  }
  return null;
}

async function _createOrGetDirectDm(profileId) {
  if (!profileId || !isLoggedIn() || !_isSupabaseConfigured()) return null;
  try {
    const result = await _supaFetch('/rest/v1/rpc/create_or_get_dm', {
      method: 'POST',
      body: JSON.stringify({
        other_user_id: profileId
      })
    });
    const chatId = typeof result === 'string'
      ? result
      : (result?.id || (Array.isArray(result) ? result[0]?.id : null));
    if (!chatId) throw new Error('DM nije vraćen iz RPC-a');
    await _restoreChatForMe(chatId);
    const rows = await _supaGet('chats', {
      select: 'id,event_id,chat_type,title,created_at',
      id: `eq.${chatId}`,
      limit: '1'
    });
    return Array.isArray(rows) ? (rows[0] || { id: chatId, chat_type: 'direct' }) : { id: chatId, chat_type: 'direct' };
  } catch (e) {
    console.warn('[mitmi] _createOrGetDirectDm:', e.message);
    return null;
  }
}

async function _restoreChatForMe(chatId) {
  if (!chatId || !isLoggedIn() || !_isSupabaseConfigured()) return;
  try {
    await _supaFetch(`/rest/v1/chat_participants?chat_id=eq.${chatId}&user_id=eq.${getUser()?.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ hidden_at: null })
    });
  } catch (e) {
    console.warn('[mitmi] _restoreChatForMe:', e.message);
  }
}

async function _createDirectChat(profileId, label = 'Direktna poruka', context = null) {
  const myId = getUser()?.id;
  if (!myId || !profileId) throw new Error('Missing participants');
  const eventContext = _normalizeChatContext(context);
  const chatRes = await _supaFetch('/rest/v1/chats', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({
      created_by: myId,
      chat_type: 'direct',
      event_id: eventContext?.eventId || null,
      title: label || 'Direktna poruka'
    })
  });
  const chat = Array.isArray(chatRes) ? chatRes[0] : chatRes;
  if (!chat?.id) throw new Error('Chat nije kreiran');
  await _supaFetch('/rest/v1/chat_participants', {
    method: 'POST',
    body: JSON.stringify([
      { chat_id: chat.id, user_id: myId },
      { chat_id: chat.id, user_id: profileId }
    ])
  });
  return chat;
}

async function _ensureDirectChat(profileId, label = 'Direktna poruka', context = null) {
  const eventContext = _normalizeChatContext(context);
  if (!eventContext?.eventId) {
    const chat = await _createOrGetDirectDm(profileId);
    if (chat?.id) return chat;
  }
  const existing = await _findDirectChatWithProfile(profileId, eventContext?.eventId || null);
  if (existing?.id) {
    await _restoreChatForMe(existing.id);
    return existing;
  }
  return _createDirectChat(profileId, label, eventContext);
}

async function _findEventChat(eventId) {
  if (!eventId || !_isSupabaseConfigured()) return null;
  try {
    const rows = await _supaGet('chats', {
      select: 'id,event_id,chat_type,title,created_at',
      event_id: `eq.${eventId}`,
      chat_type: 'eq.event_group',
      limit: '1'
    });
    return Array.isArray(rows) ? (rows[0] || null) : null;
  } catch (e) {
    console.warn('[mitmi] _findEventChat:', e.message);
    return null;
  }
}

async function _ensureChatParticipant(chatId, userId) {
  if (!chatId || !userId) return;
  try {
    const existing = await _supaGet('chat_participants', {
      select: 'chat_id,user_id,hidden_at',
      chat_id: `eq.${chatId}`,
      user_id: `eq.${userId}`,
      limit: '1'
    });
    if (Array.isArray(existing) && existing.length) {
      if (existing[0]?.hidden_at && userId === getUser()?.id) {
        await _supaFetch(`/rest/v1/chat_participants?chat_id=eq.${chatId}&user_id=eq.${userId}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ hidden_at: null })
        });
      }
      return;
    }
    await _supaFetch('/rest/v1/chat_participants', {
      method: 'POST',
      body: JSON.stringify({
        chat_id: chatId,
        user_id: userId
      })
    });
  } catch (e) {
    console.warn('[mitmi] _ensureChatParticipant:', e.message);
  }
}

async function _createEventChat(eventId, title = 'Event chat', creatorId = null) {
  const myId = getUser()?.id;
  if (!myId || !eventId) throw new Error('Missing event chat context');
  const chatRes = await _supaFetch('/rest/v1/chats', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({
      created_by: myId,
      event_id: eventId,
      chat_type: 'event_group',
      title
    })
  });
  const chat = Array.isArray(chatRes) ? chatRes[0] : chatRes;
  if (!chat?.id) throw new Error('Event chat nije kreiran');
  const participants = [{ chat_id: chat.id, user_id: myId }];
  if (creatorId && creatorId !== myId) participants.push({ chat_id: chat.id, user_id: creatorId });
  await _supaFetch('/rest/v1/chat_participants', {
    method: 'POST',
    body: JSON.stringify(participants)
  });
  return chat;
}

async function openEventGroupChat(eventId, eventTitle = 'Događaj', creatorId = null) {
  if (!isLoggedIn()) {
    showToast('Prijavi se da otvoriš event chat', 'info', 1800);
    nav('login');
    return;
  }
  try {
    let chat = await _findEventChat(eventId);
    if (!chat?.id) {
      chat = await _createEventChat(eventId, `${eventTitle} · Event chat`, creatorId);
    }
    await _ensureChatParticipant(chat.id, getUser()?.id);
    if (creatorId && creatorId !== getUser()?.id) await _ensureChatParticipant(chat.id, creatorId);
    openChat('group', eventTitle, 'Event chat', chat.id);
  } catch (e) {
    console.error('[mitmi] openEventGroupChat:', e);
    showToast('Event chat trenutno nije dostupan', 'error');
  }
}

async function _loadChatMessages(chatId) {
  if (!chatId || !_isSupabaseConfigured()) return [];
  try {
    const rows = await _supaGet('messages', {
      select: 'id,chat_id,sender_id,content,is_deleted,created_at,profiles!sender_id(id,username,display_name,avatar_url)',
      chat_id: `eq.${chatId}`,
      order: 'created_at.desc',
      limit: '60'
    });
    return Array.isArray(rows) ? rows.slice().reverse() : [];
  } catch (e) {
    console.warn('[mitmi] _loadChatMessages:', e.message);
    return [];
  }
}

async function refreshActiveChatMessages() {
  if (!_activeChatId) return;
  const messages = await _loadChatMessages(_activeChatId);
  _renderChatMessageList(messages);
}

async function deleteChatMessage(messageId) {
  if (!messageId || !isLoggedIn() || !_isSupabaseConfigured()) return;
  const confirmed = typeof window !== 'undefined'
    ? window.confirm('Da li želiš da obrišeš ovu poruku?')
    : true;
  if (!confirmed) return;
  try {
    await _supaFetch(`/rest/v1/messages?id=eq.${messageId}&sender_id=eq.${getUser()?.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        is_deleted: true,
        content: 'Poruka je obrisana'
      })
    });
    await refreshActiveChatMessages();
    if (typeof _clearCache === 'function') _clearCache('inbox', getUser()?.id || 'guest');
    loadChatsInbox().catch(() => {});
    showToast('Poruka je obrisana', 'success', 1600);
  } catch (e) {
    console.warn('[mitmi] deleteChatMessage:', e.message);
    showToast('Brisanje poruke trenutno nije uspelo', 'error');
  }
}

async function _markChatRead(chatId) {
  if (!chatId || !isLoggedIn() || !_isSupabaseConfigured()) return;
  try {
    await _supaFetch(`/rest/v1/chat_participants?chat_id=eq.${chatId}&user_id=eq.${getUser()?.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ last_read_at: new Date().toISOString() })
    });
  } catch (e) {
    console.warn('[mitmi] _markChatRead:', e.message);
  }
}

function _renderChatMessageList(items = []) {
  const msgs = document.getElementById('chat-msgs');
  if (!msgs) return;
  msgs.innerHTML = '';
  if (!items.length) {
    msgs.innerHTML = '<div class="draft-empty" style="padding:18px 0">Još nema poruka. Napiši prvu.</div>';
    return;
  }
  const dayDiv = document.createElement('div');
  dayDiv.className = 'chat-day';
  dayDiv.textContent = 'Danas';
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
    bubble.textContent = isDeleted ? 'Poruka je obrisana' : (m.content || m.text || '');
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = m.time || new Date(m.created_at || Date.now()).toLocaleTimeString('sr', { hour:'2-digit', minute:'2-digit' });
    wrap.appendChild(bubble);
    wrap.appendChild(time);
    if (me && !isDeleted && m.id) {
      const del = document.createElement('button');
      del.className = 'chat-msg-delete';
      del.type = 'button';
      del.textContent = 'Obriši';
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

async function openDirectChat(profileId, name = 'Direktna poruka', context = null) {
  if (!isLoggedIn()) {
    showToast('Prijavi se da otvoriš poruke', 'info', 1800);
    nav('login');
    return;
  }
  try {
    const blocked = await _isBlockedBetweenMeAnd(profileId);
    if (blocked) {
      showToast('Poruke nisu dostupne između blokiranih profila', 'info', 2200);
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
    if (subEl) subEl.textContent = eventContext ? 'Privatni chat za događaj' : 'Direktna poruka';
    if (typeBadge) {
      typeBadge.textContent = eventContext ? 'DOGAĐAJ' : 'PRIVATNI';
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
        showToast(reviewHint.hasPeer && reviewHint.hasEvent ? 'Posle događaja te čekaju dve ocene' : 'Čeka te ocena za ovaj događaj', 'info', 1800);
      }
    } else {
      _syncEventPlanUi(null);
    }
    nav('chat');
  } catch (e) {
    console.error('[mitmi] openDirectChat:', e);
    showToast('Chat trenutno nije dostupan', 'error');
  }
}

function openChat(type, name, sub, chatId) {
  if (!isLoggedIn()) {
    showToast('Prijavi se da otvoriš poruke', 'info', 1800);
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
  if (subEl)  subEl.textContent  = sub || ((type === 'dm') ? 'Direktna poruka' : 'Grupni chat');
  // Badge tip
  const typeBadge = document.getElementById('chat-type-badge');
  if (typeBadge) {
    const isDMBadge = type === 'dm';
    typeBadge.textContent = isDMBadge ? 'PRIVATNI' : 'GRUPNI';
    typeBadge.style.background = isDMBadge ? 'var(--purple-bg)' : 'var(--bg3)';
    typeBadge.style.color = isDMBadge ? 'var(--purple3)' : 'var(--ink4)';
  }

  // Renderuj poruke
  const msgs = document.getElementById('chat-msgs');
  if (msgs) {
    msgs.innerHTML = '';
    const dayDiv = document.createElement('div');
    dayDiv.className = 'chat-day';
    dayDiv.textContent = 'Danas';
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
      bubble.textContent = isDeleted ? 'Poruka je obrisana' : (m.text || m.content || ''); // textContent — XSS safe
      const time = document.createElement('span');
      time.className = 'msg-time';
      time.textContent = m.time || new Date(m.created_at || Date.now()).toLocaleTimeString('sr', { hour:'2-digit', minute:'2-digit' });
      wrap.appendChild(bubble);
      wrap.appendChild(time);
      if (me && !isDeleted && m.id) {
        const del = document.createElement('button');
        del.className = 'chat-msg-delete';
        del.type = 'button';
        del.textContent = 'Obriši';
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
        ? 'Čeka potvrdu'
        : savedStatus === 'potvrdeno'
          ? 'Idete zajedno'
          : 'Predloži zajednički odlazak';
    }
  }

  nav('chat');
  } catch(e) { console.error('[mitmi] openChat error:', e); nav('chat'); }
  })();
}

function openActiveChatProfile() {
  const profileId = document.getElementById('chat-mini-profile')?.dataset.profileId || _activeChatProfileId || null;
  if (!profileId) {
    showToast('Profil sagovornika trenutno nije dostupan', 'info', 1600);
    return;
  }
  openOtherProfile(profileId);
}


// ─── DM Status sistem (Faza 2b) ───
let _dmStatus = 'pricamo'; // pricamo | mozda | potvrdeno | odustao

function setDMStatus(status, options = {}) {
  return _setDMStatusInternal(status, options);
}

function _setDMStatusInternal(status, options = {}) {
  _dmStatus = status;
  const { silent = false } = options;
  const steps = ['pricamo', 'mozda', 'potvrdeno', 'odustao'];
  steps.forEach(s => {
    const el = document.getElementById('ss-' + s);
    if (!el) return;
    el.className = 'status-step' + (s === status ? ' active-' + s : '');
  });
  // Azuriraj propose dugme
  const btn = document.getElementById('chat-propose-btn');
  const btnText = document.getElementById('idemo-btn-text');
  if (!btn || !btnText) return;
  if (status === 'potvrdeno') {
    btn.disabled = true;
    btnText.textContent = 'Idete zajedno';
    btn.style.background = 'linear-gradient(135deg, var(--green) 0%, #15803d 100%)';
    if (!silent) showToast('Plan je označen kao potvrđen', 'success');
  } else if (status === 'odustao') {
    btn.disabled = true;
    btnText.textContent = 'Dogovor je otkazan';
    btn.style.background = 'var(--bg3)';
    btn.style.color = 'var(--ink4)';
  } else if (status === 'mozda') {
    btn.disabled = false;
    btnText.textContent = 'Čeka potvrdu';
    btn.style.background = 'linear-gradient(135deg, var(--amber2) 0%, var(--amber) 100%)';
    btn.style.color = '#fff';
  } else {
    btn.disabled = false;
    btnText.textContent = 'Predloži zajednički odlazak';
    btn.style.background = 'linear-gradient(135deg, var(--purple) 0%, var(--purple2) 100%)';
    btn.style.color = '#fff';
  }
  const localKey = _localDmStatusCacheKey();
  if (!_activeChatContext?.eventId && localKey) {
    _chatDmStatus[localKey] = status;
  }
}

async function _upsertEventPairPlan() {
  if (!_activeChatContext?.eventId || !_activeChatProfileId || !_activeChatId || !_isSupabaseConfigured()) return null;
  const pair = _pairPlanUsersForEvent(_activeChatProfileId);
  if (!pair) return null;
  const now = new Date().toISOString();
  const myField = pair.amUserA ? 'confirmed_by_a_at' : 'confirmed_by_b_at';
  const otherField = pair.amUserA ? 'confirmed_by_b_at' : 'confirmed_by_a_at';
  let plan = _activeEventPairPlan || await _loadEventPairPlan(_activeChatContext.eventId, _activeChatProfileId, _activeChatContext.planId || null);
  if (!plan) {
    const created = await _supaFetch('/rest/v1/event_pair_plans', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        event_id: _activeChatContext.eventId,
        invite_id: _activeChatContext.inviteId || null,
        source_plan_id: _activeChatContext.planId || null,
        chat_id: _activeChatId,
        user_a_id: pair.userAId,
        user_b_id: pair.userBId,
        status: 'maybe',
        proposed_by_id: pair.myId,
        [myField]: now
      })
    });
    plan = Array.isArray(created) ? (created[0] || null) : created;
    _syncEventPlanUi(plan);
    return plan;
  }
  if (plan.status === 'confirmed') {
    _syncEventPlanUi(plan);
    return plan;
  }
  if (plan[myField]) {
    _syncEventPlanUi(plan);
    return plan;
  }
  const patch = {
    [myField]: now,
    status: plan[otherField] ? 'confirmed' : 'maybe',
    chat_id: plan.chat_id || _activeChatId,
    invite_id: plan.invite_id || _activeChatContext.inviteId || null,
    source_plan_id: plan.source_plan_id || _activeChatContext.planId || null
  };
  if (plan[otherField]) patch.confirmed_at = now;
  await _supaFetch(`/rest/v1/event_pair_plans?id=eq.${plan.id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  const refreshed = await _refreshActiveEventPlanState();
  return refreshed;
}

async function _cancelEventPairPlan() {
  if (!_activeEventPairPlan?.id || !_isSupabaseConfigured()) return;
  const now = new Date().toISOString();
  await _supaFetch(`/rest/v1/event_pair_plans?id=eq.${_activeEventPairPlan.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'cancelled',
      cancelled_by_id: getUser()?.id || null,
      cancelled_at: now
    })
  });
  await _refreshActiveEventPlanState();
  if (typeof _clearCache === 'function') _clearCache('inbox', getUser()?.id || 'guest');
  loadChatsInbox().catch(() => {});
}

async function requestDMStatus(status) {
  if (!_activeChatContext?.eventId) {
    _setDMStatusInternal(status, {});
    return;
  }
  if (status === 'odustao') {
    await _cancelEventPairPlan();
    return;
  }
  if (status === 'mozda' || status === 'potvrdeno') {
    await clickIdemZajedno();
    return;
  }
  _syncEventPlanUi(_activeEventPairPlan);
}

async function clickIdemZajedno() {
  const btn = document.getElementById('chat-propose-btn');
  if (!btn || btn.disabled) return;
  if (_dmStatus === 'potvrdeno') return;
  if (_activeChatContext?.eventId && _isSupabaseConfigured()) {
    try {
      const plan = await _upsertEventPairPlan();
      if (!plan) {
        showToast('Dogovor trenutno nije dostupan', 'error');
        return;
      }
      if (plan.status === 'confirmed') {
        showToast('Zajednički odlazak je potvrđen', 'success', 2200);
      } else if (plan.proposed_by_id === getUser()?.id) {
        showToast('Predložila si zajednički odlazak. Čeka se potvrda druge osobe.', 'info', 2600);
      } else {
        showToast('Potvrdila si zajednički odlazak', 'success', 2200);
      }
      return;
    } catch (e) {
      console.warn('[mitmi] clickIdemZajedno:', e.message);
      showToast('Dogovor trenutno nije sačuvan', 'error');
      return;
    }
  }
  _dogovorState = 'ceka';
  _setDMStatusInternal('mozda', {});
  showToast('Plan je označen kao u dogovoru. Nastavite potvrdu ručno kroz poruke ili status.', 'info', 2600);
}


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
