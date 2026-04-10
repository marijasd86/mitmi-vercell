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
  const uiStatus = _mapPairPlanDbStatusToUi(plan.status);
  if (uiStatus === 'potvrdeno') {
    setDMStatus(uiStatus, { silent: true });
    if (proposeTxt) proposeTxt.textContent = 'Idete zajedno';
    return;
  }
  if (uiStatus === 'odustao') {
    setDMStatus(uiStatus, { silent: true });
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

const PAIR_PLAN_DB_TO_UI_STATUS = {
  talking: 'pricamo',
  maybe: 'mozda',
  confirmed: 'potvrdeno',
  cancelled: 'odustao'
};

const PAIR_PLAN_UI_META = {
  pricamo: {
    buttonText: 'Predloži zajednički odlazak',
    background: 'linear-gradient(135deg, var(--purple) 0%, var(--purple2) 100%)',
    color: '#fff',
    disabled: false,
    toast: ''
  },
  mozda: {
    buttonText: 'Čeka potvrdu',
    background: 'linear-gradient(135deg, var(--amber2) 0%, var(--amber) 100%)',
    color: '#fff',
    disabled: false,
    toast: ''
  },
  potvrdeno: {
    buttonText: 'Idete zajedno',
    background: 'linear-gradient(135deg, var(--green) 0%, #15803d 100%)',
    color: '#fff',
    disabled: true,
    toast: 'Plan je označen kao potvrđen'
  },
  odustao: {
    buttonText: 'Dogovor je otkazan',
    background: 'var(--bg3)',
    color: 'var(--ink4)',
    disabled: true,
    toast: ''
  }
};

let _dmStatus = 'pricamo';

function _mapPairPlanDbStatusToUi(status = '') {
  return PAIR_PLAN_DB_TO_UI_STATUS[String(status || '').toLowerCase()] || 'pricamo';
}

function setDMStatus(status, options = {}) {
  return _setDMStatusInternal(status, options);
}

function _setDMStatusInternal(status, options = {}) {
  _dmStatus = status;
  const { silent = false } = options;
  const steps = Object.keys(PAIR_PLAN_UI_META);
  steps.forEach(s => {
    const el = document.getElementById('ss-' + s);
    if (!el) return;
    el.className = 'status-step' + (s === status ? ' active-' + s : '');
  });
  const btn = document.getElementById('chat-propose-btn');
  const btnText = document.getElementById('idemo-btn-text');
  if (!btn || !btnText) return;
  const meta = PAIR_PLAN_UI_META[status] || PAIR_PLAN_UI_META.pricamo;
  btn.disabled = !!meta.disabled;
  btnText.textContent = meta.buttonText;
  btn.style.background = meta.background;
  btn.style.color = meta.color;
  if (!silent && meta.toast) showToast(meta.toast, 'success');
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
