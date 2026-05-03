// Shared storage/media helpers.
// These utilities intentionally stay free of domain-specific UI logic.

async function _uploadToStorage(bucket, path, file) {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPA_ANON,
      'Authorization': `Bearer ${_session?.access_token}`,
      'Content-Type': file.type
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
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    const res = await fetch(dataUrl);
    return res.blob();
  }

  const match = dataUrl.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);
  if (!match) throw new Error('Invalid data URL');
  const mime = match[1] || 'application/octet-stream';
  const isBase64 = !!match[2];
  const encoded = (match[3] || '').replace(/\s/g, '');
  const binary = isBase64 ? atob(encoded) : decodeURIComponent(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
