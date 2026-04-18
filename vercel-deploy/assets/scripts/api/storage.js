// Shared storage/media helpers.
// These utilities intentionally stay free of domain-specific UI logic.

async function _uploadToStorage(bucket, path, file) {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPA_ANON,
      'Authorization': `Bearer ${_session?.access_token}`,
      'Content-Type': file.type,
      'x-upsert': 'true'
    },
    body: file
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Storage upload failed');
  }
  return `${SUPA_URL}/storage/v1/object/public/${bucket}/${path}`;
}

async function _deleteFromStorage(bucket, path) {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPA_ANON,
      'Authorization': `Bearer ${_session?.access_token}`
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Storage delete failed');
  }
  return true;
}

async function _dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}
