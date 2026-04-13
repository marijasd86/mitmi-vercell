(function initAdminBootstrap() {
  function hydrateAdminViews() {
    if (typeof _hydrateAdminDraftState === 'function') {
      _hydrateAdminDraftState();
    }
    if (typeof loadAdminOrganizersFromBackend === 'function') {
      loadAdminOrganizersFromBackend({ silent: true });
    }
    if (typeof loadAdminClaimRequestsFromBackend === 'function') {
      loadAdminClaimRequestsFromBackend({ silent: true });
    }
    if (typeof loadAdminDraftQueueFromBackend === 'function') {
      loadAdminDraftQueueFromBackend({ silent: true });
    }
    if (typeof loadAdminOrphanPublishedEvents === 'function') {
      loadAdminOrphanPublishedEvents({ silent: true });
    }
    if (typeof loadAdminPlanSignalsFromBackend === 'function') {
      loadAdminPlanSignalsFromBackend({ silent: true });
    }
    if (typeof syncAdminUI === 'function') {
      syncAdminUI();
    }
    if (typeof renderSavedEvents === 'function') {
      renderSavedEvents();
    }
    const createLabel = document.querySelector('#bn2 .bn-label');
    if (createLabel && typeof getRoleCapabilities === 'function') {
      createLabel.textContent = getRoleCapabilities().canPublishManagedEvents ? 'Događaj' : 'Društvo';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateAdminViews);
  } else {
    hydrateAdminViews();
  }
})();
