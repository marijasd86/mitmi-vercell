async function openModerationInbox() {
  if (!isAdminUser() && isLoggedIn() && typeof loadMyProfile === 'function') {
    await loadMyProfile().catch(() => {});
  }
  if (!isAdminUser()) {
    nav(isLoggedIn() ? 'settings' : 'login');
    showToast('Admin pristup nije dostupan za ovaj nalog.', 'error', 2200);
    return;
  }
  nav('admin-moderation', { noPageAnim: true, preserveScroll: true });
  loadAdminModerationQueue().catch((e) => {
    console.warn('[svita] openModerationInbox:', e?.message || e);
    showToast(_adminErrorMessage(e, 'Moderation inbox trenutno nije dostupan'), 'error', 3400);
  });
}

function setModerationFilter(filter = 'all') {
  _moderationFilter = filter || 'all';
  renderAdminModerationInbox();
}

function _moderationMatchesQuery(item, query = '') {
  if (!query) return true;
  const haystack = [
    item.entity_type,
    item.reason,
    item.status,
    item.source_type,
    item.report_message,
    item.notes,
    item.created_by_username
  ].filter(Boolean).join(' \n ').toLowerCase();
  return haystack.includes(query);
}

function _moderationStatusTag(status = 'open') {
  if (status === 'reviewing') return '<span class="tag tag-purple">U obradi</span>';
  if (status === 'resolved') return '<span class="tag tag-green">Rešeno</span>';
  if (status === 'dismissed') return '<span class="tag tag-gray">Odbačeno</span>';
  return '<span class="tag tag-amber">Otvoreno</span>';
}

function _moderationEntityLabel(type = '') {
  const map = {
    user: 'Korisnik',
    event: 'Događaj',
    invite: 'Plan',
    chat_message: 'Poruka',
    organizer: 'Organizer',
    event_draft: 'Draft',
    claim_request: 'Preuzimanje profila',
    report: 'Prijava'
  };
  return map[type] || type || 'Slučaj';
}

function _moderationContextLabel(item = {}) {
  if (item.entity_type === 'report' && item.metadata?.category === 'bug_report') return 'Bag';
  return _moderationEntityLabel(item.entity_type);
}

function _moderationCanSoftHide(type = '') {
  return ['event', 'organizer', 'event_draft'].includes(type);
}

function _moderationNoteValue(itemId) {
  return document.getElementById(`moderation-note-${itemId}`)?.value.trim() || '';
}

async function loadAdminModerationQueue() {
  if (!isAdminUser()) {
    showToast('Samo admin ima pristup moderation inbox-u', 'error');
    return;
  }
  const list = document.getElementById('admin-moderation-list');
  if (list) list.innerHTML = '<div class="draft-empty">Učitavanje moderation inbox-a...</div>';
  if (!_isSupabaseConfigured()) {
    ADMIN_MODERATION_ITEMS = [];
    renderAdminModerationInbox();
    return;
  }
  try {
    const rows = await _supaGet('admin_moderation_queue', {
      select: '*',
      order: 'created_at.desc',
      limit: '100'
    });
    ADMIN_MODERATION_ITEMS = Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn('[svita] loadAdminModerationQueue:', e.message);
    showToast(_adminErrorMessage(e, 'Prijave i bagovi trenutno nisu dostupni'), 'error', 3400);
  }
  renderAdminModerationInbox();
}

function renderAdminModerationInbox() {
  syncAdminUI();
  const list = document.getElementById('admin-moderation-list');
  if (!list) return;
  const query = _normalizeAdminQuery(document.getElementById('admin-moderation-search')?.value || '');
  const openCount = ADMIN_MODERATION_ITEMS.filter(item => item.status === 'open').length;
  const reviewingCount = ADMIN_MODERATION_ITEMS.filter(item => item.status === 'reviewing').length;
  const resolvedCount = ADMIN_MODERATION_ITEMS.filter(item => ['resolved', 'dismissed'].includes(item.status)).length;
  const openEl = document.getElementById('moderation-stat-open');
  const reviewingEl = document.getElementById('moderation-stat-reviewing');
  const resolvedEl = document.getElementById('moderation-stat-resolved');
  const badgeEl = document.getElementById('moderation-queue-badge');
  if (openEl) openEl.textContent = String(openCount);
  if (reviewingEl) reviewingEl.textContent = String(reviewingCount);
  if (resolvedEl) resolvedEl.textContent = String(resolvedCount);
  if (badgeEl) badgeEl.textContent = `${ADMIN_MODERATION_ITEMS.length} slučajeva`;
  if (!ADMIN_MODERATION_ITEMS.length) {
    list.innerHTML = '<div class="draft-empty">Još nema moderation slučajeva. Korisničke prijave će se pojaviti ovde.</div>';
    return;
  }
  const filtered = ADMIN_MODERATION_ITEMS
    .filter(item => _moderationFilter === 'all' ? true : item.status === _moderationFilter)
    .filter(item => _moderationMatchesQuery(item, query));
  if (!filtered.length) {
    list.innerHTML = '<div class="draft-empty">Nema rezultata za ovu pretragu ili filter.</div>';
    return;
  }
  list.innerHTML = filtered.map(item => {
    const title = `${_moderationContextLabel(item)} · ${item.reason || 'bez razloga'}`;
    const createdAt = item.created_at ? new Date(item.created_at).toLocaleString('sr-Latn', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'bez vremena';
    const message = item.report_message || item.notes || 'Nema dodatne poruke.';
    const sourceTag = item.metadata?.category === 'bug_report'
      ? '<span class="tag tag-purple">Bug</span>'
      : (item.source_type === 'user' ? '<span class="tag tag-gold">User</span>' : item.source_type === 'admin' ? '<span class="tag tag-outline">Admin</span>' : '<span class="tag tag-purple">System</span>');
    const authorLabel = item.created_by_username || (item.metadata?.context_type === 'issue' ? 'bag report' : 'bez autora');
    return `<div class="moderation-card">
      <div class="moderation-card-head">
        <div style="flex:1;min-width:0">
          <div class="moderation-title">${_escHtml(title)}</div>
          <div class="moderation-meta">${_escHtml(createdAt)} · ${_escHtml(authorLabel)} · #${_escHtml(item.entity_id || '')}</div>
        </div>
        <div class="draft-chip-row" style="justify-content:flex-end">${sourceTag}${_moderationStatusTag(item.status)}</div>
      </div>
      <div class="draft-detail-grid">
        ${_draftDetailRow('Tip', _moderationContextLabel(item))}
        ${_draftDetailRow('Prioritet', item.priority != null ? String(item.priority) : '')}
        ${_draftDetailRow('Izvor', item.source_type || '')}
        ${_draftDetailRow('Status', item.status || '')}
      </div>
      <div class="draft-note"><strong>Poruka:</strong> ${_escHtml(message)}</div>
      <textarea class="form-textarea moderation-note-input" id="moderation-note-${item.id}" placeholder="Dodaj admin belešku...">${_escHtml(item.notes || '')}</textarea>
      <div class="draft-actions" style="margin-top:10px">
        <button class="btn btn-outline btn-sm" onclick="assignModerationToMe('${item.id}')">U obradi</button>
        <button class="btn btn-purple btn-sm" onclick="resolveModerationItemUI('${item.id}','resolved')">Rešeno</button>
        <button class="btn btn-outline btn-sm" onclick="resolveModerationItemUI('${item.id}','dismissed')">Odbaci</button>
        ${_moderationCanSoftHide(item.entity_type) ? `<button class="btn btn-danger btn-sm" onclick="softHideModerationEntityUI('${item.id}','${item.entity_type}','${item.entity_id}')">Sakrij</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function assignModerationToMe(itemId) {
  if (!_isSupabaseConfigured() || !itemId) return;
  try {
    await _supaFetch(`/rest/v1/moderation_items?id=eq.${itemId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'reviewing',
        assigned_to: getUser()?.id,
        notes: _moderationNoteValue(itemId) || null
      })
    });
    showToast('Slučaj je označen kao u obradi', 'success', 1600);
    await loadAdminModerationQueue();
  } catch (e) {
    console.warn('[svita] assignModerationToMe:', e.message);
    showToast(_adminErrorMessage(e, 'Ova akcija trenutno nije uspela'), 'error', 3400);
  }
}

async function resolveModerationItemUI(itemId, status = 'resolved') {
  if (!_isSupabaseConfigured() || !itemId) return;
  try {
    await _supaFetch('/rest/v1/rpc/resolve_moderation_item', {
      method: 'POST',
      body: JSON.stringify({
        p_item_id: itemId,
        p_status: status,
        p_note: _moderationNoteValue(itemId) || null
      })
    });
    showToast(status === 'dismissed' ? 'Prijava je odbačena' : 'Slučaj je rešen', 'success', 1600);
    await loadAdminModerationQueue();
  } catch (e) {
    console.warn('[svita] resolveModerationItemUI:', e.message);
    showToast(_adminErrorMessage(e, 'Promena statusa nije uspela'), 'error', 3400);
  }
}

async function softHideModerationEntityUI(itemId, entityType, entityId) {
  if (!_isSupabaseConfigured() || !itemId || !entityType || !entityId) return;
  const note = _moderationNoteValue(itemId) || 'Sakriveno kroz moderation inbox';
  try {
    await _supaFetch('/rest/v1/rpc/soft_hide_entity', {
      method: 'POST',
      body: JSON.stringify({
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_reason: note
      })
    });
    await _supaFetch('/rest/v1/rpc/resolve_moderation_item', {
      method: 'POST',
      body: JSON.stringify({
        p_item_id: itemId,
        p_status: 'resolved',
        p_note: note
      })
    });
    showToast('Sadržaj je sakriven i slučaj je zatvoren', 'success', 1800);
    await loadAdminModerationQueue();
  } catch (e) {
    console.warn('[svita] softHideModerationEntityUI:', e.message);
    showToast(_adminErrorMessage(e, 'Sakrivanje trenutno nije uspelo'), 'error', 3400);
  }
}
