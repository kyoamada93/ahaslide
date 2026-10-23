'use strict';
// Read the Q&A sheet through Composio (composio.dev), which holds the Google OAuth connection for us:
//   COMPOSIO_API_KEY              project API key (x-api-key)
//   COMPOSIO_CONNECTED_ACCOUNT_ID optional: the Google Sheets connected account id. When empty, the first
//                                 ACTIVE googlesheets account in the project is looked up automatically.
//   COMPOSIO_SHEET_TAB            optional tab name (default: Form_Responses, else the first tab)
const BASE = process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev/api/v3.1';
const API_KEY = process.env.COMPOSIO_API_KEY || '';
let account = process.env.COMPOSIO_CONNECTED_ACCOUNT_ID || '';
let userId = process.env.COMPOSIO_USER_ID || ''; // owner of the connected account (required by tools/execute)
const TAB = process.env.COMPOSIO_SHEET_TAB || '';

const configured = () => !!API_KEY;

async function getJson(url) {
  const res = await fetch(url, { headers: { 'x-api-key': API_KEY }, signal: AbortSignal.timeout(15000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Composio ${res.status}: ${json.error?.message || json.message || 'request failed'}`);
  return json;
}

// The project's active Google Sheets connection and its user id (so nobody has to copy them by hand).
async function resolveAccount() {
  if (account && userId) return account;
  const q = account
    ? `connected_accounts?connected_account_ids=${encodeURIComponent(account)}&limit=1`
    : 'connected_accounts?toolkit_slugs=googlesheets&statuses=ACTIVE&limit=50';
  let json;
  try { json = await getJson(`${BASE}/${q}`); } catch (e) {
    // some deployments only expose the listing under /api/v3
    if (!/\/v3\.1$/.test(BASE)) throw e;
    json = await getJson(`${BASE.replace(/\/v3\.1$/, '/v3')}/${q}`);
  }
  const items = (json.items || json.data || []).filter((a) => !a.status || a.status === 'ACTIVE');
  if (!items.length) {
    throw new Error(account
      ? `Composio: không tìm thấy connected account ${account} (hoặc nó không còn ACTIVE)`
      : 'Composio: chưa có tài khoản Google Sheets nào đang kết nối trong project này — vào dashboard Composio → Google Sheets → Connect account');
  }
  items.sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
  const pick = items.find((a) => a.id === account) || items[0];
  account = pick.id;
  userId = userId || pick.user_id || pick.userId || '';
  if (!userId) throw new Error('Composio không trả về user_id của tài khoản — đặt biến COMPOSIO_USER_ID');
  return account;
}

async function execute(slug, args) {
  const body = { connected_account_id: await resolveAccount(), user_id: userId, arguments: args };
  const res = await fetch(`${BASE}/tools/execute/${slug}`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.successful === false || json.successfull === false) {
    const msg = json.error?.message || json.error || json.message || `HTTP ${res.status}`;
    throw new Error(`Composio ${slug}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return json.data ?? json;
}

// Composio wraps the Google response; find the first "array of rows" anywhere in it.
function findRows(x, depth = 0) {
  if (depth > 6 || x == null) return null;
  if (Array.isArray(x) && x.length && x.every((r) => Array.isArray(r))) return x;
  if (Array.isArray(x)) { for (const v of x) { const r = findRows(v, depth + 1); if (r) return r; } return null; }
  if (typeof x === 'object') {
    for (const k of ['values', 'valueRanges', 'value_ranges', 'response_data', 'data']) if (k in x) { const r = findRows(x[k], depth + 1); if (r) return r; }
    for (const v of Object.values(x)) { const r = findRows(v, depth + 1); if (r) return r; }
  }
  return null;
}

function findNames(x, depth = 0) {
  if (depth > 6 || x == null) return null;
  if (Array.isArray(x) && x.length && x.every((v) => typeof v === 'string')) return x;
  if (typeof x === 'object') for (const v of Object.values(x)) { const r = findNames(v, depth + 1); if (r) return r; }
  return null;
}

async function readRows(link) {
  const id = (String(link).match(/\/spreadsheets\/d\/([^/]+)/) || [])[1];
  if (!id) throw new Error('Link Google Sheet không hợp lệ');
  let tab = TAB;
  if (!tab) {
    const names = findNames(await execute('GOOGLESHEETS_GET_SHEET_NAMES', { spreadsheet_id: id })) || [];
    tab = names.find((n) => /form[_ ]?responses|câu trả lời/i.test(n)) || names[0] || 'Form_Responses';
  }
  const data = await execute('GOOGLESHEETS_BATCH_GET', { spreadsheet_id: id, ranges: [tab] });
  const rows = findRows(data);
  if (!rows) throw new Error('Composio không trả về dữ liệu bảng — kiểm tra tên tab (COMPOSIO_SHEET_TAB)');
  return rows.map((r) => r.map((c) => (c == null ? '' : String(c))));
}

const accountId = () => account;

module.exports = { configured, readRows, accountId };
