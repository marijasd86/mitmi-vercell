const _chatDmStatus = {};
let _activeChatProfileId = null;

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
  try {
    const myId = getUser()?.id;
    const memberships = await _supaGet('chat_participants', {
      select: 'chat_id,chats!inner(id,chat_type,title,created_at)',
      user_id: `eq.${myId}`,
      order: 'created_at.desc',
      limit: '100'
    });
    const chatRows = Array.isArray(memberships) ? memberships : [];
    if (!chatRows.length) {
      box.innerHTML = '<div class="draft-empty">Još nema aktivnih poruka.</div>';
      return [];
    }
    const chatIds = Array.from(new Set(chatRows.map(row => row.chat_id).filter(Boolean)));
    const inFilter = `in.(${chatIds.join(',')})`;
    const [messages, participants] = await Promise.all([
      _supaGet('messages', {
        select: 'id,chat_id,sender_id,content,created_at',
        chat_id: inFilter,
        order: 'created_at.desc',
        limit: '200'
      }).catch(() => []),
      _supaGet('chat_participants', {
        select: 'chat_id,user_id,profiles!user_id(id,username,display_name,avatar_url)',
        chat_id: inFilter,
        limit: '200'
      }).catch(() => [])
    ]);
    const latestByChat = new Map();
    (Array.isArray(messages) ? messages : []).forEach(msg => {
      if (!latestByChat.has(msg.chat_id)) latestByChat.set(msg.chat_id, msg);
    });
    const othersByChat = new Map();
    (Array.isArray(participants) ? participants : []).forEach(row => {
      if (row.user_id === myId) return;
      const list = othersByChat.get(row.chat_id) || [];
      list.push(row.profiles || {});
      othersByChat.set(row.chat_id, list);
    });
    const items = chatRows.map(row => {
      const chat = row.chats || {};
      const others = othersByChat.get(row.chat_id) || [];
      const peer = others[0] || {};
      const isDM = chat.chat_type === 'direct';
      const title = isDM ? (peer.display_name || peer.username || 'Direktna poruka') : (chat.title || 'Grupni chat');
      const subtitle = isDM ? 'Direktna poruka' : `${others.length + 1} člana · Grupni chat`;
      const latest = latestByChat.get(row.chat_id);
      return {
        chatId: row.chat_id,
        type: isDM ? 'dm' : 'group',
        title,
        subtitle,
        preview: latest?.content || 'Još nema poruka',
        time: latest?.created_at ? new Date(latest.created_at).toLocaleTimeString('sr', { hour:'2-digit', minute:'2-digit' }) : '',
        profileId: isDM ? (peer.id || null) : null,
        sortAt: latest?.created_at || chat.created_at || row.created_at || null
      };
    }).sort((a, b) => new Date(b.sortAt || 0) - new Date(a.sortAt || 0));
    const grouped = {
      group: items.filter(item => item.type === 'group'),
      dm: items.filter(item => item.type === 'dm')
    };
    const renderRows = (rows) => rows.map(item => `<div class="chat-row" onclick="${item.type === 'dm' && item.profileId ? `openDirectChat('${_escHtml(item.profileId)}','${_escHtml(item.title).replace(/'/g, '&#39;')}')` : `openChat('${item.type}','${_escHtml(item.title).replace(/'/g, '&#39;')}','${_escHtml(item.subtitle).replace(/'/g, '&#39;')}','${_escHtml(item.chatId)}')`}"><div class="av av-40 av-purple"${item.type === 'group' ? ' style="border-radius:10px"' : ''}>${_escHtml((item.title || 'P').charAt(0).toUpperCase())}</div><div class="chat-info"><div class="chat-name">${_escHtml(item.title)}</div><div class="chat-preview">${_escHtml(item.preview)}</div></div><div class="chat-meta"><div class="chat-time">${_escHtml(item.time || '')}</div></div></div>`).join('');
    box.innerHTML = `${grouped.group.length ? `<div class="chat-list-section">GRUPNI CHATOVI</div>${renderRows(grouped.group)}` : ''}${grouped.dm.length ? `<div class="chat-list-section" style="margin-top:8px">DIREKTNE PORUKE</div>${renderRows(grouped.dm)}` : ''}${!grouped.group.length && !grouped.dm.length ? '<div class="draft-empty">Još nema aktivnih poruka.</div>' : ''}`;
    return items;
  } catch (e) {
    console.warn('[mitmi] loadChatsInbox:', e.message);
    box.innerHTML = '<div class="draft-empty">Poruke trenutno nisu mogle da se učitaju. Pokušaj ponovo malo kasnije.</div>';
    return [];
  }
}

async function _findDirectChatWithProfile(profileId) {
  if (!profileId || !isLoggedIn() || !_isSupabaseConfigured()) return null;
  const myId = getUser()?.id;
  if (!myId) return null;
  try {
    const rows = await _supaGet('chat_participants', {
      select: 'chat_id,user_id,chats!inner(id,chat_type,title,created_at)',
      user_id: `in.(${myId},${profileId})`,
      'chats.chat_type': 'eq.direct',
      limit: '50'
    });
    const grouped = new Map();
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const chatId = row.chat_id;
      if (!chatId) return;
      const entry = grouped.get(chatId) || { users: new Set(), chat: row.chats || null };
      entry.users.add(row.user_id);
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

async function _createDirectChat(profileId, label = 'Direktna poruka') {
  const myId = getUser()?.id;
  if (!myId || !profileId) throw new Error('Missing participants');
  const chatRes = await _supaFetch('/rest/v1/chats', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({
      created_by: myId,
      chat_type: 'direct',
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

async function _ensureDirectChat(profileId, label = 'Direktna poruka') {
  const existing = await _findDirectChatWithProfile(profileId);
  if (existing?.id) return existing;
  return _createDirectChat(profileId, label);
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
      select: 'chat_id,user_id',
      chat_id: `eq.${chatId}`,
      user_id: `eq.${userId}`,
      limit: '1'
    });
    if (Array.isArray(existing) && existing.length) return;
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
      select: 'id,chat_id,sender_id,content,created_at,profiles!sender_id(id,username,display_name,avatar_url)',
      chat_id: `eq.${chatId}`,
      order: 'created_at.asc',
      limit: '200'
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn('[mitmi] _loadChatMessages:', e.message);
    return [];
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
    bubble.className = 'bubble';
    bubble.textContent = m.content || m.text || '';
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = m.time || new Date(m.created_at || Date.now()).toLocaleTimeString('sr', { hour:'2-digit', minute:'2-digit' });
    wrap.appendChild(bubble);
    wrap.appendChild(time);
    div.appendChild(wrap);
    msgs.appendChild(div);
  });
  msgs.scrollTop = msgs.scrollHeight;
}

async function openDirectChat(profileId, name = 'Direktna poruka') {
  if (!isLoggedIn()) {
    showToast('Prijavi se da otvoriš poruke', 'info', 1800);
    nav('login');
    return;
  }
  try {
    const chat = await _ensureDirectChat(profileId, `DM · ${name}`);
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
    if (nameEl) nameEl.textContent = name;
    if (subEl) subEl.textContent = 'Direktna poruka';
    if (typeBadge) {
      typeBadge.textContent = 'PRIVATNI';
      typeBadge.style.background = 'var(--purple-bg)';
      typeBadge.style.color = 'var(--purple3)';
    }
    if (actionBtn) actionBtn.style.display = 'none';
    if (moreBtn) {
      moreBtn.style.display = 'flex';
      moreBtn.style.background = '';
    }
    _activeChatProfileId = profileId || null;
    if (miniProfile) {
      miniProfile.style.display = 'flex';
      miniProfile.dataset.profileId = profileId || '';
    }
    if (miniName) miniName.textContent = name;
    if (miniAv) miniAv.textContent = (name.charAt(0) || 'D').toUpperCase();
    if (sbar) sbar.style.display = 'none';
    _renderChatMessageList(messages);
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
      bubble.className = 'bubble';
      bubble.textContent = m.text || m.content || ''; // textContent — XSS safe
      const time = document.createElement('span');
      time.className = 'msg-time';
      time.textContent = m.time || new Date(m.created_at || Date.now()).toLocaleTimeString('sr', { hour:'2-digit', minute:'2-digit' });
      wrap.appendChild(bubble);
      wrap.appendChild(time);
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

  // Status bar (DM)
  const statusBar = document.getElementById('chat-status-bar');
  if (statusBar) statusBar.style.display = isDM ? 'block' : 'none';

  // Buttons u headeru — u grupnom ℹ event, u DM ⋯ vise opcija
  const actionBtn = document.getElementById('chat-action-btn');
  const moreBtn   = document.getElementById('chat-more-btn');
  if (actionBtn) {
    actionBtn.style.display = isDM ? 'none' : 'flex';
    actionBtn.onclick = () => nav('event');
  }
  if (moreBtn) {
    moreBtn.style.display = isDM ? 'flex' : 'none';
    moreBtn.style.background = '';
  }
  // Sakrij status bar pri svakom otvaranju — korisnik ga otvara sam
  const sbar = document.getElementById('chat-status-bar');
  if (sbar) sbar.style.display = 'none';

  // Reset dogovor za novi DM
  if (isDM) {
    _dogovorState = 'idle';
    const savedStatus = _chatDmStatus[name] || 'pricamo';
    setTimeout(() => setDMStatus(savedStatus), 50);
    // Reset propose btn
    const proposeBtn = document.getElementById('chat-propose-btn');
    const proposeTxt = document.getElementById('idemo-btn-text');
    if (proposeBtn) { proposeBtn.disabled = false; proposeBtn.style.background = 'linear-gradient(135deg, var(--purple) 0%, var(--purple2) 100%)'; proposeBtn.style.color = '#fff'; }
    if (proposeTxt) { proposeTxt.textContent = 'Predlozi zajednicki odlazak'; }
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

function setDMStatus(status) {
  _dmStatus = status;
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
    btnText.textContent = 'Potvrdjeno! Vidimo se.';
    btn.style.background = 'linear-gradient(135deg, var(--green) 0%, #15803d 100%)';
    showToast('Odlazak potvrdjen!', 'success');
  } else if (status === 'odustao') {
    btn.disabled = true;
    btnText.textContent = 'Odustao/la si';
    btn.style.background = 'var(--bg3)';
    btn.style.color = 'var(--ink4)';
  } else {
    btn.disabled = false;
    btnText.textContent = 'Predlozi zajednicki odlazak';
    btn.style.background = 'linear-gradient(135deg, var(--purple) 0%, var(--purple2) 100%)';
    btn.style.color = '#fff';
  }
  if (_activeChatName) {
    _chatDmStatus[_activeChatName] = status;
  }
}

// Override clickIdemZajedno za novi flow
function clickIdemZajedno() {
  const btn = document.getElementById('chat-propose-btn');
  const btnText = document.getElementById('idemo-btn-text');
  if (!btn || btn.disabled) return;

  if (_dogovorState === 'idle') {
    _dogovorState = 'ceka';
    btn.disabled = true;
    if (btnText) btnText.textContent = 'Predlog poslat, cekamo...';
    btn.style.background = 'linear-gradient(135deg, var(--amber2) 0%, var(--amber) 100%)';
    showToast('Predlog poslat!', 'info');
    // Simulacija — Supabase Realtime u produkciji
    setTimeout(() => {
      _dogovorState = 'prihvaceno';
      btn.disabled = false;
      if (btnText) btnText.textContent = 'Potvrdi zajednicki odlazak!';
      btn.style.background = 'linear-gradient(135deg, var(--green) 0%, #15803d 100%)';
      showToast('Prihvatili su! Potvrdi odlazak.', 'success', 4000);
      // Auto-prebaci na "Mozda" status
      setDMStatus('mozda');
    }, 2500);

  } else if (_dogovorState === 'prihvaceno') {
    _dogovorState = 'potvrdjeno';
    btn.disabled = true;
    if (btnText) btnText.textContent = 'Idemo zajedno!';
    showToast('Potvrdjen zajednicki odlazak!', 'success');
    setDMStatus('potvrdeno');
  }
}


// --- Toggle status bar u DM ---
function toggleChatStatus() {
  const bar = document.getElementById('chat-status-bar');
  if (!bar) return;
  const isVisible = bar.style.display !== 'none';
  bar.style.display = isVisible ? 'none' : 'block';
  const btn = document.getElementById('chat-more-btn');
  if (btn) btn.style.background = isVisible ? '' : 'var(--purple-bg)';
}
