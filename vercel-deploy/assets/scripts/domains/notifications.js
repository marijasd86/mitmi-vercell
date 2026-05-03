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

function _notifIcon(type) {
  const icons = {
    new_invite: '🎟️',
    new_plan: '🎟️',
    invite_joined: '🙌',
    plan_joined: '🙌',
    new_message: '💬',
    new_review: '⭐',
    event_reminder: '📅',
    new_follower: '👤',
    system: '📣'
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
  if (diff < 60) return 'upravo';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function _renderNotificationRows(items = []) {
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
  if (item) {
    item.read = true;
    item.syntheticUnread = false;
    _setNotificationBadge(_notificationFeed.filter(entry => entry.read === false || entry.syntheticUnread).length);
  }
  el?.classList.remove('unread');
  if (notifId) {
    await markNotifRead(notifId, el);
  }
  await openNotificationItem(item || notifId || '');
}

async function _loadPlanNotificationItems() {
  const myId = getUser()?.id;
  if (!myId || !_isSupabaseConfigured()) return [];
  try {
    const myPlans = await _supaGet('plans', {
      select: 'id,title,event_id,created_at,events!event_id(id,title)',
      creator_id: `eq.${myId}`,
      order: 'created_at.desc',
      limit: '20'
    });
    const planIds = (Array.isArray(myPlans) ? myPlans : []).map(item => item.id).filter(Boolean);
    if (!planIds.length) return [];

    const planSignals = await _supaGet('event_pair_plans', {
      select: 'id,source_plan_id,created_at,proposed_by_id,status,event_id',
      source_plan_id: `in.(${planIds.join(',')})`,
      order: 'created_at.desc',
      limit: '12'
    }).catch(() => []);

    const relevantSignals = (Array.isArray(planSignals) ? planSignals : [])
      .filter(item => item?.source_plan_id && item.proposed_by_id && item.proposed_by_id !== myId);
    if (!relevantSignals.length) return [];

    const profileIds = [...new Set(relevantSignals.map(item => item.proposed_by_id).filter(Boolean))];
    const profiles = profileIds.length
      ? await _supaGet('profiles', {
          select: 'id,username,display_name',
          id: `in.(${profileIds.join(',')})`,
          limit: String(Math.max(profileIds.length, 1))
        }).catch(() => [])
      : [];

    const profileMap = new Map((Array.isArray(profiles) ? profiles : []).map(item => [item.id, item]));
    const planMap = new Map((Array.isArray(myPlans) ? myPlans : []).map(item => [item.id, item]));

    return relevantSignals.map(signal => {
      const plan = planMap.get(signal.source_plan_id) || {};
      const profile = profileMap.get(signal.proposed_by_id) || {};
      const label = profile.display_name || profile.username || 'Novi korisnik';
      const eventTitle = plan.events?.title || 'Događaj';
      return {
        type: 'plan_joined',
        title: `${label} ti se javio/la za plan`,
        body: plan.title ? `Plan: ${plan.title} · ${eventTitle}` : `Pogledaj ko želi da ide na ${eventTitle}`,
        created_at: signal.created_at,
        syntheticUnread: true,
        target: { profileTab: 'pt4', planId: signal.source_plan_id, eventId: plan.event_id || signal.event_id || null, profileId: profile.id || null }
      };
    });
  } catch (e) {
    console.warn('[svita] _loadPlanNotificationItems:', e.message);
    return [];
  }
}

const _loadInviteNotificationItems = _loadPlanNotificationItems;

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
    console.warn('[svita] _loadFollowerNotificationItems:', e.message);
    return [];
  }
}

async function _loadMessageNotificationItems() {
  const myId = getUser()?.id;
  if (!myId || !_isSupabaseConfigured()) return [];
  try {
    const memberships = await _supaGet('chat_participants', {
      select: 'chat_id,hidden_at,chats!inner(id,chat_type,title,event_id,created_at)',
      user_id: `eq.${myId}`,
      order: 'created_at.desc',
      limit: '20'
    }).catch(() => []);
    const chatRows = (Array.isArray(memberships) ? memberships : []).filter(row => !row.hidden_at);
    const chatIds = chatRows.map(row => row.chat_id).filter(Boolean);
    if (!chatIds.length) return [];
    const inFilter = `in.(${chatIds.join(',')})`;
    const [messages, participants, pairPlans] = await Promise.all([
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
      ,
      _supaGet('event_pair_plans', {
        select: 'chat_id,source_plan_id,invite_id,event_id,created_at',
        chat_id: inFilter,
        order: 'created_at.desc',
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
    const planByChat = new Map();
    (Array.isArray(pairPlans) ? pairPlans : []).forEach(row => {
      if (!row?.chat_id || planByChat.has(row.chat_id)) return;
      planByChat.set(row.chat_id, row);
    });
    return chatRows
      .map(row => {
        const chat = row.chats || {};
        const latest = latestByChat.get(row.chat_id);
        if (!latest) return null;
        const peers = peersByChat.get(row.chat_id) || [];
        const pairPlan = planByChat.get(row.chat_id) || {};
        const peer = peers[0] || {};
        const isDM = chat.chat_type === 'direct';
        const title = isDM
          ? `${peer.display_name || peer.username || 'Nova poruka'} ti je poslao/la poruku`
          : `Nova poruka u chatu „${chat.title || 'Događaj'}”`;
        const eventId = chat.event_id || pairPlan.event_id || null;
        const eventTitle = chat.title || 'Događaj';
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
            title: isDM ? (peer.display_name || peer.username || 'Direktna poruka') : (chat.title || 'Grupni chat'),
            eventId,
            eventTitle,
            planId: pairPlan.source_plan_id || null,
            inviteId: pairPlan.invite_id || null
          }
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 4);
  } catch (e) {
    console.warn('[svita] _loadMessageNotificationItems:', e.message);
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
    console.warn('[svita] _loadFollowedEventReminderItems:', e.message);
    return [];
  }
}

async function _loadReviewTaskNotificationItems() {
  if (typeof loadPendingReviewTasks !== 'function') return [];
  try {
    const tasks = await loadPendingReviewTasks({ sync: true, render: false });
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
    console.warn('[svita] _loadReviewTaskNotificationItems:', e.message);
    return [];
  }
}

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
      user_id: `eq.${getUser()?.id}`,
      order: 'created_at.desc',
      limit: '20',
      select: 'id,type,title,body,read,created_at,actor_profile_id,chat_id,event_id,invite_id,venue_id,application_id,message_id,payload'
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
        eventId: n.event_id || n.payload?.event_id || null,
        inviteId: n.invite_id || null,
        venueId: n.venue_id || null,
        applicationId: n.application_id || null,
        messageId: n.message_id || null,
        chatType: n.payload?.chat_type || null,
        planId: n.payload?.source_plan_id || n.payload?.plan_id || null,
        eventTitle: n.payload?.event_title || null
      }
    }));
    const reviewItems = await _loadReviewTaskNotificationItems();
    const merged = [...mapped, ...reviewItems]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 20);
    if (typeof _setCached === 'function') _setCached('notifications', cacheKey, merged, 12000);
    _renderNotificationRows(merged);
  } catch (e) {
    console.warn('[svita] loadNotifications:', e.message);
    await renderFallbackNotifications();
  }
}

async function markNotifRead(id, el) {
  if (!isLoggedIn()) return;
  el?.classList.remove('unread');
  try {
    await _supaFetch(`/rest/v1/notifications?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ read: true })
    });
    if (typeof _clearCache === 'function') _clearCache('notifications', getUser()?.id || 'guest');
  } catch (e) {}
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
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ read: true })
    });
    if (typeof _clearCache === 'function') _clearCache('notifications', getUser()?.id || 'guest');
  } catch (e) {
    console.warn('[svita] markAllNotificationsRead:', e.message);
  }
  showToast('Obaveštenja su označena kao pročitana', 'success', 1600);
}

async function _resolveDirectPeerFromChat(chatId = '') {
  const myId = getUser()?.id || null;
  if (!chatId || !myId || !_isSupabaseConfigured()) return null;
  try {
    const rows = await _supaGet('chat_participants', {
      select: 'chat_id,user_id',
      chat_id: `eq.${chatId}`,
      limit: '4'
    });
    const peer = (Array.isArray(rows) ? rows : []).find(row => row.user_id && row.user_id !== myId);
    return peer?.user_id || null;
  } catch (e) {
    console.warn('[svita] _resolveDirectPeerFromChat:', e.message);
    return null;
  }
}

async function _resolveChatMeta(chatId = '') {
  if (!chatId || !_isSupabaseConfigured()) return null;
  try {
    const rows = await _supaGet('chats', {
      select: 'id,chat_type,title,event_id,events!event_id(id,title)',
      id: `eq.${chatId}`,
      limit: '1'
    });
    const chat = Array.isArray(rows) ? (rows[0] || null) : null;
    if (!chat?.id) return null;
    return {
      chatType: chat.chat_type || null,
      title: chat.title || null,
      eventId: chat.event_id || null,
      eventTitle: chat.events?.title || null
    };
  } catch (e) {
    console.warn('[svita] _resolveChatMeta:', e.message);
    return null;
  }
}

async function openNotificationItem(itemOrType = '') {
  const item = typeof itemOrType === 'string'
    ? { type: itemOrType }
    : (itemOrType || {});
  const normalized = String(item.type || '').toLowerCase();
  const target = item.target || {};
  if (normalized.includes('message')) {
    if (target.chatId) {
      const resolvedMeta = (!target.chatType || !target.eventId || !target.eventTitle)
        ? await _resolveChatMeta(target.chatId)
        : null;
      const resolvedChatType = target.chatType || resolvedMeta?.chatType || null;
      const resolvedEventId = target.eventId || resolvedMeta?.eventId || null;
      const resolvedEventTitle = target.eventTitle || resolvedMeta?.eventTitle || resolvedMeta?.title || target.title || 'Događaj';
      const resolvedTitle = target.title || resolvedMeta?.title || 'Poruke';

      if (resolvedChatType === 'direct') {
        const peerId = await _resolveDirectPeerFromChat(target.chatId);
        if (peerId) {
          const context = resolvedEventId
            ? {
                kind: 'event',
                eventId: resolvedEventId,
                eventTitle: resolvedEventTitle,
                inviteId: target.inviteId || null,
                planId: target.planId || null
              }
            : null;
          openDirectChat(peerId, resolvedTitle || 'Direktna poruka', context);
          return;
        }
      }
      if (resolvedChatType === 'event_group' && resolvedEventId && typeof openEventGroupChat === 'function') {
        openEventGroupChat(resolvedEventId, resolvedEventTitle || 'Događaj');
        return;
      }
      const openType = resolvedChatType === 'direct' ? 'dm' : 'group';
      openChat(openType, resolvedTitle || 'Poruke', openType === 'dm' ? 'Direktna poruka' : 'Grupni chat', target.chatId);
      return;
    }
    if (target.profileId) {
      const context = target.eventId
        ? {
            kind: 'event',
            eventId: target.eventId,
            eventTitle: target.eventTitle || 'Događaj',
            inviteId: target.inviteId || null,
            planId: target.planId || null
          }
        : null;
      openDirectChat(target.profileId, target.title || 'Direktna poruka', context);
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
  if (normalized.includes('invite') || normalized.includes('plan') || normalized.includes('event')) {
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
  const prefs = typeof _getUserPrefs === 'function' ? _getUserPrefs() : {};
  const allowPlanNotifications = typeof _planNotificationValue === 'function'
    ? _planNotificationValue(prefs)
    : (prefs.notif_plans !== false);
  const [planItems, messageItems, followerItems, reminderItems, reviewItems] = await Promise.all([
    allowPlanNotifications ? _loadPlanNotificationItems() : Promise.resolve([]),
    _loadMessageNotificationItems(),
    _loadFollowerNotificationItems(),
    _loadFollowedEventReminderItems(),
    _loadReviewTaskNotificationItems()
  ]);
  const items = [...planItems, ...messageItems, ...followerItems, ...reminderItems, ...reviewItems]
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
      body: 'Svita će te voditi pravo na chat ili poziv koji je bitan.',
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
