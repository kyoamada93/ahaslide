'use strict';
// Google OAuth 2.0 (web server flow) with read-only Sheets access, so the admin can sync a
// private Google Form responses sheet. No SDK: three HTTPS calls (authorize, token, Sheets API).
// Endpoints are overridable for tests.
const crypto = require('crypto');

const AUTH_URL = process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const SHEETS_API = process.env.GOOGLE_SHEETS_API || 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/spreadsheets.readonly'];

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const configured = () => !!(CLIENT_ID && CLIENT_SECRET);

const pendingStates = new Map(); // state -> expiresAt (login links are single use, 10 min)

function authorizeUrl(redirectUri) {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now() + 10 * 60 * 1000);
  const q = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return `${AUTH_URL}?${q}`;
}

function takeState(state) {
  const exp = pendingStates.get(state);
  pendingStates.delete(state);
  for (const [k, v] of pendingStates) if (v < Date.now()) pendingStates.delete(k);
  return !!exp && exp > Date.now();
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || `Google token ${res.status}`);
  return json;
}

const emailFromIdToken = (idToken) => {
  try { return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString()).email || ''; } catch { return ''; }
};

// Authorization code → tokens to keep server-side: { refreshToken, accessToken, expiresAt, email }
async function exchangeCode(code, redirectUri) {
  const t = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
  return { refreshToken: t.refresh_token || '', accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in || 3600) * 1000, email: emailFromIdToken(t.id_token) };
}

// Returns a valid access token, refreshing it (and updating `g` in place) when it is about to expire.
async function accessToken(g) {
  if (g.accessToken && g.expiresAt > Date.now() + 60000) return g.accessToken;
  if (!g.refreshToken) throw new Error('Phiên Google đã hết hạn, hãy đăng nhập lại');
  const t = await tokenRequest({ refresh_token: g.refreshToken, grant_type: 'refresh_token' });
  g.accessToken = t.access_token;
  g.expiresAt = Date.now() + (t.expires_in || 3600) * 1000;
  return g.accessToken;
}

async function api(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  const json = await res.json().catch(() => ({}));
  if (res.status === 403 || res.status === 404) throw new Error('Tài khoản Google đã đăng nhập không có quyền xem sheet này');
  if (!res.ok) throw new Error(json.error?.message || `Google Sheets API ${res.status}`);
  return json;
}

// Rows of the tab identified by gid (from the sheet link), via the Sheets API.
async function readRows(link, g) {
  const id = (String(link).match(/\/spreadsheets\/d\/([^/]+)/) || [])[1];
  if (!id) throw new Error('Link Google Sheet không hợp lệ');
  const gid = Number((String(link).match(/[#?&]gid=(\d+)/) || [])[1] || 0);
  const token = await accessToken(g);
  const meta = await api(`${SHEETS_API}/${id}?fields=sheets.properties(sheetId,title)`, token);
  const tab = (meta.sheets || []).find((s) => s.properties.sheetId === gid) || (meta.sheets || [])[0];
  if (!tab) throw new Error('Không tìm thấy tab trong sheet');
  const range = encodeURIComponent(`'${tab.properties.title.replace(/'/g, "''")}'`);
  const data = await api(`${SHEETS_API}/${id}/values/${range}?majorDimension=ROWS`, token);
  return data.values || [];
}

module.exports = { configured, authorizeUrl, takeState, exchangeCode, readRows };
