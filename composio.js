'use strict';
// Read the Q&A sheet through Composio (composio.dev), which holds the Google OAuth connection for us:
//   COMPOSIO_API_KEY              project API key (x-api-key)
//   COMPOSIO_CONNECTED_ACCOUNT_ID the Google Sheets connected account (ca_…), e.g. from `composio link googlesheets`
//   COMPOSIO_SHEET_TAB            optional tab name (default: Form_Responses, else the first tab)
const BASE = process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev/api/v3.1';
const API_KEY = process.env.COMPOSIO_API_KEY || '';
const ACCOUNT = process.env.COMPOSIO_CONNECTED_ACCOUNT_ID || '';
const USER_ID = process.env.COMPOSIO_USER_ID || '';
const TAB = process.env.COMPOSIO_SHEET_TAB || '';

const configured = () => !!(API_KEY && ACCOUNT);

async function execute(slug, args) {
  const body = { connected_account_id: ACCOUNT, arguments: args };
  if (USER_ID) body.user_id = USER_ID;
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

module.exports = { configured, readRows };
