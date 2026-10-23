'use strict';
// Pull Q&A questions from a Google Sheet (e.g. the Google Form "Form_Responses" tab).
// The sheet must be readable without login: Share → "Anyone with the link: Viewer",
// or File → Share → Publish to web → CSV.
const crypto = require('crypto');

// Any Google Sheets link → CSV export link for the same tab (gid).
function csvUrl(link) {
  const u = String(link || '').trim();
  if (!u) return '';
  if (/output=csv|format=csv/.test(u)) return u;
  const pub = u.match(/\/spreadsheets\/d\/e\/([^/]+)/); // "Publish to web" link
  const gid = (u.match(/[#?&]gid=(\d+)/) || [])[1];
  if (pub) return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? `&gid=${gid}` : ''}`;
  const id = (u.match(/\/spreadsheets\/d\/([^/]+)/) || [])[1];
  if (!id) return u; // assume it is already a CSV URL
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

// RFC 4180 CSV: quoted fields, "" escapes, newlines inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const norm = (s) => String(s || '').toLocaleLowerCase('vi').normalize('NFC');

// Rows → questions. Columns are found by header text, so column order does not matter:
//   question: header containing "câu hỏi" (but not the "xử lý thế nào" column) or "question"
//   time:     "timestamp" / "dấu thời gian"
//   handling: "xử lý" / "thế nào" — rows that only want an offline answer are skipped
function extractQuestions(rows) {
  if (!rows.length) return { questions: [], skipped: 0, error: 'Sheet trống' };
  const head = rows[0].map(norm);
  const hCol = head.findIndex((h) => /xử lý|thế nào|how should/.test(h));
  let qCol = head.findIndex((h, i) => i !== hCol && /câu hỏi|question/.test(h));
  if (qCol < 0) qCol = head.length > 1 ? 1 : 0;
  const tCol = head.findIndex((h) => /timestamp|dấu thời gian|thời gian/.test(h));
  const questions = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const text = String(r[qCol] || '').replace(/\s+/g, ' ').trim().slice(0, 1000); // form answers can be long; never cut them at 300
    if (text.length < 3) continue;
    const handling = hCol >= 0 ? norm(r[hCol]) : '';
    // Keep "Cả hai" / "Trả lời trực tiếp trong buổi Town Hall"; skip answers wanted only by email etc.
    if (handling && !/cả hai|trực tiếp|town ?hall|both|live/.test(handling)) { skipped++; continue; }
    const ts = tCol >= 0 ? String(r[tCol] || '').trim() : '';
    const parsed = Date.parse(ts);
    questions.push({
      // key uses the first 300 chars so rows imported before the limit was raised keep their identity
      key: crypto.createHash('sha1').update(ts + '|' + text.slice(0, 300)).digest('hex').slice(0, 16),
      text,
      at: Number.isFinite(parsed) ? parsed : Date.now(),
    });
  }
  return { questions, skipped };
}

async function fetchSheet(link, timeoutMs = 15000) {
  const url = csvUrl(link);
  if (!url) throw new Error('Chưa nhập link Google Sheet');
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  const type = res.headers.get('content-type') || '';
  if (!res.ok || /text\/html/.test(type)) {
    throw new Error('Không đọc được sheet — hãy chia sẻ "Bất kỳ ai có đường liên kết: Người xem" (hoặc Publish to web → CSV)');
  }
  return extractQuestions(parseCsv(await res.text()));
}

module.exports = { csvUrl, parseCsv, extractQuestions, fetchSheet };
