(function initAdminBootstrap() {
  function _safeAdminBootstrapCall(fn) {
    try {
      const result = fn?.();
      if (result && typeof result.then === 'function') {
        result.catch((error) => {
          console.warn('[mitmi] admin bootstrap call failed:', error?.message || error);
        });
      }
    } catch (error) {
      console.warn('[mitmi] admin bootstrap call failed:', error?.message || error);
    }
  }

  function hydrateAdminViews() {
    _safeAdminBootstrapCall(() => typeof _hydrateAdminDraftState === 'function' && _hydrateAdminDraftState());
    _safeAdminBootstrapCall(() => typeof loadAdminOrganizersFromBackend === 'function' && loadAdminOrganizersFromBackend({ silent: true }));
    _safeAdminBootstrapCall(() => typeof loadAdminClaimRequestsFromBackend === 'function' && loadAdminClaimRequestsFromBackend({ silent: true }));
    _safeAdminBootstrapCall(() => typeof loadAdminDraftQueueFromBackend === 'function' && loadAdminDraftQueueFromBackend({ silent: true }));
    _safeAdminBootstrapCall(() => typeof loadAdminOrphanPublishedEvents === 'function' && loadAdminOrphanPublishedEvents({ silent: true }));
    _safeAdminBootstrapCall(() => typeof loadAdminPlanSignalsFromBackend === 'function' && loadAdminPlanSignalsFromBackend({ silent: true }));
    _safeAdminBootstrapCall(() => typeof syncAdminUI === 'function' && syncAdminUI());
    _safeAdminBootstrapCall(() => typeof renderSavedEvents === 'function' && renderSavedEvents());
    const createLabel = document.querySelector('#bn2 .bn-label');
    if (createLabel && typeof getRoleCapabilities === 'function') {
      createLabel.textContent = getRoleCapabilities().canPublishManagedEvents ? 'Događaj' : 'Pozivi';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateAdminViews);
  } else {
    hydrateAdminViews();
  }
})();
