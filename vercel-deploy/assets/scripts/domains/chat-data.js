async function hideConversation(chatId) {
  if (!chatId || !isLoggedIn() || !_isSupabaseConfigured()) return;
  const confirmed = typeof appConfirm === 'function'
    ? await appConfirm('Da li želiš da ukloniš ovaj razgovor iz svog inboxa?', 'Do you want to remove this conversation from your inbox?')
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
    console.warn('[svita] hideConversation:', e.message);
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
  const confirmed = typeof appConfirm === 'function'
    ? await appConfirm('Da li želiš da napustiš ovaj chat?', 'Do you want to leave this chat?')
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
    console.warn('[svita] loadChatsInbox:', e.message);
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
    console.warn('[svita] _findDirectChatWithProfile:', e.message);
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
    console.warn('[svita] _createOrGetDirectDm:', e.message);
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
    console.warn('[svita] _restoreChatForMe:', e.message);
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
    console.warn('[svita] _findEventChat:', e.message);
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
    console.warn('[svita] _ensureChatParticipant:', e.message);
  }
}

async function _createEventChat(eventId, title = 'Event chat', creatorId = null) {
  const myId = getUser()?.id;
  if (!myId || !eventId) throw new Error('Missing event chat context');
  let chatRes = null;
  try {
    chatRes = await _supaFetch('/rest/v1/chats', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({
        created_by: myId,
        event_id: eventId,
        chat_type: 'event_group',
        title
      })
    });
  } catch (e) {
    // Fallback for mixed/older RLS states: maybe chat already exists but INSERT is blocked.
    const existing = await _findEventChat(eventId);
    if (existing?.id) return existing;
    throw e;
  }
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
  if (!eventId) {
    showToast('Event chat trenutno nije dostupan', 'info', 1800);
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
    console.error('[svita] openEventGroupChat:', e);
    if (e?.status === 403) {
      showToast('Event chat je blokiran policy podešavanjem (RLS).', 'error', 2600);
      return;
    }
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
    console.warn('[svita] _loadChatMessages:', e.message);
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
  const confirmed = typeof appConfirm === 'function'
    ? await appConfirm('Da li želiš da obrišeš ovu poruku?', 'Do you want to delete this message?')
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
    console.warn('[svita] deleteChatMessage:', e.message);
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
    if (typeof _clearCache === 'function') _clearCache('inbox', getUser()?.id || 'guest');
    if (typeof _clearCache === 'function') _clearCache('notifications', getUser()?.id || 'guest');
    const chatsPage = document.getElementById('page-chats');
    if (chatsPage?.classList?.contains('active')) {
      loadChatsInbox().catch(() => {});
    }
    const notifPage = document.getElementById('page-notif');
    if (notifPage?.classList?.contains('active') && typeof loadNotifications === 'function') {
      loadNotifications().catch(() => {});
    }
  } catch (e) {
    console.warn('[svita] _markChatRead:', e.message);
  }
}
