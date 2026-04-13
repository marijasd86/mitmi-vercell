// Shared Supabase REST helpers.
// Keep this layer domain-neutral so feature files do not need to know
// whether data comes from PostgREST or another backend in the future.

async function _supaGet(table, params = {}) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return _supaFetch(`/rest/v1/${table}${qs ? '?' + qs : ''}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });
}
