// Controlled TEST_ONLY upload. Never writes to Approved-Plans or Monday.
const root = 'https://graph.microsoft.com/v1.0/drives/';
async function request(url, token, options = {}) {
 const response = await fetch(url, { ...options, headers: { Authorization: 'Bearer ' + token, ...(options.headers || {}) }, cache: 'no-store' });
 if (!response.ok) {
  const body = await response.json().catch(() => null);
  const error = new Error('Graph HTTP ' + response.status + ' (' + (body?.error?.code || 'unknown') + '): ' + (body?.error?.message || 'A művelet sikertelen.'));
  error.httpStatus = response.status;
  throw error;
 }
 return response;
}
async function digest(bytes) {
 const hash = await crypto.subtle.digest('SHA-256', bytes);
 return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function uploadTestPreview({ driveId, boardId, data, token }) {
 if (!/^\d+$/.test(boardId) || !data || data.status !== 'TEST_ONLY' || data.isApprovedPlan !== false || data.boardId !== boardId) {
  throw new Error('Csak a kiválasztott boardhoz tartozó TEST_ONLY tervelőnézet tölthető fel.');
 }
 const base = root + encodeURIComponent(driveId);
 const parentPath = '/root:/Projects/' + boardId;
 // Verify the intended project folder exists before attempting any write.
 const parent = await (await request(base + parentPath, token)).json();
 if (!parent.folder) throw new Error('A projektmappa nem SharePoint-mappa.');
 let testFolder;
 try {
  testFolder = await (await request(base + parentPath + '/Upload-Tests', token)).json();
 } catch (err) {
  if (err.httpStatus !== 404) throw err;
  try {
   testFolder = await (await request(base + parentPath + ':/children', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Upload-Tests', folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
   })).json();
  } catch (createErr) {
   if (createErr.httpStatus !== 409) throw createErr;
   testFolder = await (await request(base + parentPath + '/Upload-Tests', token)).json();
  }
 }
 if (!testFolder.folder) throw new Error('Az Upload-Tests nem mappa.');
 const payload = new TextEncoder().encode(JSON.stringify(data, null, 2) + '\n');
 if (payload.byteLength > 5_000_000) throw new Error('A JSON nagyobb mint 5 MB.');
 const localHash = await digest(payload);
 const filename = 'TEST_ONLY-' + boardId + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID() + '.json';
 const itemPath = '/root:/Projects/' + boardId + '/Upload-Tests/' + filename;
 // Unique random filename plus fail-on-conflict: never overwrite another plan.
 const uploaded = await (await request(base + itemPath + ':/content?%40microsoft.graph.conflictBehavior=fail', token, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: payload
 })).json();
 if (!uploaded.id || uploaded.name !== filename) throw new Error('A Graph nem igazolta vissza a létrehozott fájlt.');
 const readResponse = await request(base + '/items/' + encodeURIComponent(uploaded.id) + '/content', token);
 const downloaded = new Uint8Array(await readResponse.arrayBuffer());
 const remoteHash = await digest(downloaded);
 if (localHash !== remoteHash || downloaded.byteLength !== payload.byteLength) {
  throw new Error('A visszaolvasott fájl eltér a feltöltött JSON-tól. Fájlazonosító: ' + uploaded.id);
 }
 return { filename, fileId: uploaded.id, bytes: payload.byteLength, sha256: localHash };
}
