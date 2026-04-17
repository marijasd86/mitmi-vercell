async function syncPendingReviewTasks() {
  if (!isLoggedIn() || !_isSupabaseConfigured()) return 0;
  try {
    const result = await _supaFetch('/rest/v1/rpc/sync_review_tasks_for_user', {
      method: 'POST',
      body: JSON.stringify({})
    });
    return Number(result || 0);
  } catch (e) {
    console.warn('[mitmi] syncPendingReviewTasks:', e.message);
    return 0;
  }
}

async function loadPendingReviewTasks(options = {}) {
  const { sync = false, render = false } = options || {};
  if (!isLoggedIn() || !_isSupabaseConfigured()) {
    PENDING_REVIEW_TASKS = [];
    if (render) {
      _renderProfileReviewCard([]);
      renderReviewPage([]);
    }
    return [];
  }
  try {
    if (sync) await syncPendingReviewTasks();
    const rows = await _supaGet('review_tasks', {
      select: 'id,plan_id,reviewer_id,event_id,target_type,target_user_id,status,available_at,completed_at,created_at',
      reviewer_id: `eq.${getUser()?.id}`,
      order: 'available_at.asc',
      limit: '20'
    });
    const tasks = Array.isArray(rows) ? rows : [];
    const eventIds = Array.from(new Set(tasks.map(item => item.event_id).filter(Boolean)));
    const userIds = Array.from(new Set(tasks.map(item => item.target_user_id).filter(Boolean)));
    const pairPlanIds = Array.from(new Set(tasks.map(item => item.plan_id).filter(Boolean)));
    const [events, users, pairPlans] = await Promise.all([
      eventIds.length ? _supaGet('events', {
        select: 'id,title,venue_id,organizer_id,avg_rating,rating_count',
        id: `in.(${eventIds.join(',')})`,
        limit: String(eventIds.length)
      }).catch(() => []) : Promise.resolve([]),
      userIds.length ? _supaGet('profiles', {
        select: 'id,username,display_name',
        id: `in.(${userIds.join(',')})`,
        limit: String(userIds.length)
      }).catch(() => []) : Promise.resolve([]),
      pairPlanIds.length ? _supaGet('event_pair_plans', {
        select: 'id,source_plan_id,invite_id,event_id',
        id: `in.(${pairPlanIds.join(',')})`,
        limit: String(pairPlanIds.length)
      }).catch(() => []) : Promise.resolve([])
    ]);
    const sourcePlanIds = Array.from(new Set((Array.isArray(pairPlans) ? pairPlans : []).map(item => item.source_plan_id).filter(Boolean)));
    const sourcePlans = sourcePlanIds.length
      ? await _supaGet('plans', {
        select: 'id,title,description,category,event_tags,city,location_name,starts_at,event_id,organizer_id,venue_id',
        id: `in.(${sourcePlanIds.join(',')})`,
        limit: String(sourcePlanIds.length)
      }).catch(() => [])
      : [];
    const eventMap = new Map((Array.isArray(events) ? events : []).map(item => [item.id, item]));
    const userMap = new Map((Array.isArray(users) ? users : []).map(item => [item.id, item]));
    const pairPlanMap = new Map((Array.isArray(pairPlans) ? pairPlans : []).map(item => [item.id, item]));
    const sourcePlanMap = new Map((Array.isArray(sourcePlans) ? sourcePlans : []).map(item => [item.id, item]));
    const mappedTasks = tasks.map(task => ({
      ...task,
      pairPlan: pairPlanMap.get(task.plan_id) || null,
      event: eventMap.get(task.event_id) || null,
      targetProfile: userMap.get(task.target_user_id) || null,
      sourcePlan: sourcePlanMap.get(pairPlanMap.get(task.plan_id)?.source_plan_id || '') || null
    }));
    PENDING_REVIEW_TASKS = await _skipIrrelevantEventReviewTasks(mappedTasks);
    if (render) {
      _renderProfileReviewCard(PENDING_REVIEW_TASKS);
      renderReviewPage(PENDING_REVIEW_TASKS);
    }
    return PENDING_REVIEW_TASKS;
  } catch (e) {
    console.warn('[mitmi] loadPendingReviewTasks:', e.message);
    if (render) {
      _renderProfileReviewCard([]);
      renderReviewPage([]);
    }
    return [];
  }
}

function openPendingReviews() {
  nav('review');
}

function _activeReviewTask() {
  return PENDING_REVIEW_TASKS.find(item => item.id === _activeReviewTaskId) || null;
}

function _reviewTaskLabel(task = null) {
  if (!task) return '';
  if (task.target_type === 'peer') {
    return task.targetProfile?.display_name || task.targetProfile?.username || 'Ocena osobe';
  }
  if (task.sourcePlan?.title) {
    return task.sourcePlan.title;
  }
  return task.event?.title || 'Ocena događaja';
}

function _reviewTaskMeta(task = null) {
  if (!task) return '';
  if (task.target_type === 'peer') {
    if (task.sourcePlan?.title) {
      return `Osoba · ${task.sourcePlan.title}`;
    }
    return `Osoba · ${task.event?.title || 'Događaj'}`;
  }
  if (task.event?.title) return `Događaj · ${task.event.title}`;
  return 'Plan';
}

function _taskNeedsEventReview(task = null) {
  if (!task || task.target_type !== 'event') return true;
  if (task.sourcePlan && !task.sourcePlan.event_id) return false;
  return !!(task.event?.venue_id || task.event?.organizer_id);
}

async function _skipIrrelevantEventReviewTasks(tasks = []) {
  if (!_isSupabaseConfigured()) return Array.isArray(tasks) ? tasks : [];
  const items = Array.isArray(tasks) ? tasks : [];
  const irrelevant = items.filter(item => item.status === 'pending' && item.target_type === 'event' && !_taskNeedsEventReview(item));
  if (!irrelevant.length) return items;
  await Promise.all(irrelevant.map(item =>
    _supaFetch(`/rest/v1/review_tasks?id=eq.${item.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        status: 'skipped',
        completed_at: new Date().toISOString()
      })
    }).catch(() => null)
  ));
  return items.filter(item => !irrelevant.some(skip => skip.id === item.id));
}

function _renderReviewQueue(tasks = []) {
  const card = document.getElementById('review-queue-card');
  const countEl = document.getElementById('review-queue-count');
  const copyEl = document.getElementById('review-queue-copy');
  const list = document.getElementById('review-queue-list');
  const pending = (Array.isArray(tasks) ? tasks : []).filter(item => item.status === 'pending');
  if (!card || !countEl || !copyEl || !list) return;
  if (!pending.length) {
    card.style.display = 'none';
    list.innerHTML = '';
    countEl.textContent = '0';
    return;
  }
  card.style.display = '';
  countEl.textContent = String(pending.length);
  copyEl.textContent = pending.length === 1
    ? 'Imaš jednu ocenu koja čeka.'
    : `Imaš ${pending.length} iskustva koja čekaju tvoju ocenu.`;
  list.innerHTML = pending.map(task => {
    const activeClass = task.id === _activeReviewTaskId ? ' active' : '';
    return `<button type="button" class="pill${activeClass}" onclick="selectReviewTask('${_escHtml(task.id)}')"><span>${_escHtml(_reviewTaskLabel(task))}</span><span style="font-size:11px;font-weight:600;opacity:.76">${_escHtml(_reviewTaskMeta(task))}</span></button>`;
  }).join('');
}

function selectReviewTask(taskId = '') {
  const task = PENDING_REVIEW_TASKS.find(item => item.id === taskId && item.status === 'pending') || null;
  if (!task) return;
  _setActiveReviewTask(task);
}

function _setActiveReviewTask(task = null) {
  _activeReviewTaskId = task?.id || null;
  const empty = document.getElementById('review-empty');
  const shell = document.getElementById('review-shell');
  const kindEl = document.getElementById('review-kind');
  const titleEl = document.getElementById('review-title');
  const subtitleEl = document.getElementById('review-subtitle');
  const peerFields = document.getElementById('review-peer-fields');
  const eventFields = document.getElementById('review-event-fields');
  if (!task) {
    if (empty) empty.style.display = '';
    if (shell) shell.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (shell) shell.style.display = '';
  const isPeer = task.target_type === 'peer';
  if (kindEl) kindEl.textContent = isPeer ? 'Ocena osobe' : 'Ocena događaja';
  if (titleEl) titleEl.textContent = isPeer
    ? `Kako je bilo sa ${task.targetProfile?.display_name || task.targetProfile?.username || 'ovom osobom'}?`
    : `Kako je prošao ${task.event?.title ? `događaj „${task.event.title}”` : 'ovaj plan'}?`;
  if (subtitleEl) subtitleEl.textContent = isPeer
    ? `Ova ocena se odnosi na zajednički odlazak${task.sourcePlan?.title ? ` za plan „${task.sourcePlan.title}”` : task.event?.title ? ` na događaj „${task.event.title}”` : ''}.`
    : task.sourcePlan?.title
      ? `Tvoja ocena pomaže drugima da znaju kakav je bio događaj iza plana „${task.sourcePlan.title}”.`
      : `Tvoja ocena pomaže drugima da znaju kakav je bio događaj i organizacija.`;
  if (peerFields) peerFields.style.display = isPeer ? '' : 'none';
  if (eventFields) eventFields.style.display = isPeer ? 'none' : '';
  _renderReviewQueue(PENDING_REVIEW_TASKS);
}

function renderReviewPage(tasks = []) {
  const pending = (Array.isArray(tasks) ? tasks : []).filter(item => item.status === 'pending');
  const current = pending.find(item => item.id === _activeReviewTaskId) || null;
  _renderReviewQueue(pending);
  _setActiveReviewTask(current || pending[0] || null);
}

async function skipActiveReviewTask() {
  const task = _activeReviewTask();
  if (!task || !_isSupabaseConfigured()) return;
  try {
    await _supaFetch(`/rest/v1/review_tasks?id=eq.${task.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        status: 'skipped',
        completed_at: new Date().toISOString()
      })
    });
    showToast('Ocena je preskočena', 'info', 1600);
    await loadPendingReviewTasks({ sync: false, render: true });
    if (typeof loadNotifications === 'function') loadNotifications().catch(() => {});
  } catch (e) {
    showToast('Preskakanje ocene trenutno nije uspelo', 'error');
  }
}

async function submitActiveReviewTask() {
  const task = _activeReviewTask();
  if (!task || !_isSupabaseConfigured()) return;
  const btn = document.getElementById('review-submit-btn');
  if (btn) btn.disabled = true;
  try {
    if (task.target_type === 'event' && !_taskNeedsEventReview(task)) {
      await _supaFetch(`/rest/v1/review_tasks?id=eq.${task.id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          status: 'skipped',
          completed_at: new Date().toISOString()
        })
      });
      showToast('Za ovaj plan nije potrebna posebna ocena događaja', 'info', 1800);
      await loadPendingReviewTasks({ sync: false, render: true });
      return;
    }
    if (task.target_type === 'peer') {
      await _supaFetch('/rest/v1/peer_reviews', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          plan_id: task.plan_id,
          reviewer_id: getUser()?.id,
          reviewed_user_id: task.target_user_id,
          event_id: task.event_id,
          did_show_up: (document.getElementById('review-peer-show')?.value || 'yes') === 'yes',
          communication_rating: Number(document.getElementById('review-peer-communication')?.value || 5),
          would_go_again: (document.getElementById('review-peer-again')?.value || 'yes') === 'yes',
          comment: document.getElementById('review-peer-comment')?.value?.trim() || null
        })
      });
    } else {
      await _supaFetch('/rest/v1/event_reviews', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          plan_id: task.plan_id,
          reviewer_id: getUser()?.id,
          event_id: task.event_id,
          venue_id: task.event?.venue_id || null,
          rating_overall: Number(document.getElementById('review-event-overall')?.value || 5),
          rating_atmosphere: document.getElementById('review-event-atmosphere')?.value ? Number(document.getElementById('review-event-atmosphere').value) : null,
          rating_organization: document.getElementById('review-event-organization')?.value ? Number(document.getElementById('review-event-organization').value) : null,
          comment: document.getElementById('review-event-comment')?.value?.trim() || null
        })
      });
    }
    await _supaFetch(`/rest/v1/review_tasks?id=eq.${task.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        status: 'done',
        completed_at: new Date().toISOString()
      })
    });
    showToast('Ocena je sačuvana', 'success', 1700);
    await loadPendingReviewTasks({ sync: false, render: true });
    if (typeof loadNotifications === 'function') loadNotifications().catch(() => {});
    loadMyProfile().catch(() => {});
    _clearCache('venueAnalytics');
    if (_currentEventId && task.event_id && _currentEventId === task.event_id && typeof openEventById === 'function') {
      openEventById(task.event_id).catch(() => {});
    }
    if (_currentPublicVenueTarget) {
      renderPublicVenueProfile(_currentPublicVenueTarget).catch(() => {});
    }
    if (document.getElementById('page-venue')?.classList.contains('active')) {
      loadMyVenueDashboard().catch(() => {});
    }
  } catch (e) {
    const duplicateReview = String(e?.data?.code || '').trim() === '23505' || /duplicate/i.test(String(e?.message || ''));
    if (duplicateReview) {
      try {
        await _supaFetch(`/rest/v1/review_tasks?id=eq.${task.id}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            status: 'done',
            completed_at: new Date().toISOString()
          })
        });
        await loadPendingReviewTasks({ sync: false, render: true });
        if (typeof loadNotifications === 'function') loadNotifications().catch(() => {});
        loadMyProfile().catch(() => {});
        showToast('Ocena je već sačuvana', 'info', 1700);
        return;
      } catch (_markDoneError) {}
    }
    console.warn('[mitmi] submitActiveReviewTask:', e.message);
    showToast('Čuvanje ocene trenutno nije uspelo', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}
