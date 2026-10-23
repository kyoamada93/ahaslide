// Q&A import through Composio, against a local fake of the Composio tools/execute API.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { io } = require('socket.io-client');

const KEY = 'test-key';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, ...args) => new Promise((r) => s.emit(ev, ...args, r));

(async () => {
  const seen = [];
  let failNext = false;
  const fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const json = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
      if (req.headers['x-api-key'] !== 'ak_test') return json(401, { error: { message: 'Invalid API key' } });
      if (req.method === 'GET' && req.url.startsWith('/connected_accounts?')) {
        assert.ok(req.url.includes('toolkit_slugs=googlesheets') && req.url.includes('statuses=ACTIVE'));
        return json(200, { items: [
          { id: 'ca_old', user_id: 'u_old', status: 'ACTIVE', toolkit: { slug: 'googlesheets' }, updated_at: '2026-10-01T00:00:00Z' },
          { id: 'ca_test', user_id: 'pg-user-1', status: 'ACTIVE', toolkit: { slug: 'googlesheets' }, updated_at: '2026-10-22T00:00:00Z' },
        ] });
      }
      const b = JSON.parse(body || '{}');
      seen.push({ url: req.url, body: b });
      if (b.connected_account_id !== 'ca_test') return json(400, { successful: false, error: 'connected account not found' });
      if (b.user_id !== 'pg-user-1') return json(400, { successful: false, error: 'User ID is required with connected account.' });
      if (failNext) { failNext = false; return json(200, { successful: false, error: 'The caller does not have permission' }); }
      if (req.url.endsWith('/GOOGLESHEETS_GET_SHEET_NAMES')) return json(200, { successful: true, data: { sheet_names: ['Dashboard', 'Form_Responses'] } });
      if (req.url.endsWith('/GOOGLESHEETS_BATCH_GET')) {
        return json(200, { successful: true, data: { spreadsheet_data: { valueRanges: [{ range: "'Form_Responses'!A1:C3", values: [
          ['Timestamp', 'Câu hỏi của bạn', 'Bạn muốn câu hỏi được xử lý thế nào?'],
          ['10/21/2026 9:28:35', 'Câu hỏi đọc qua Composio?', 'Cả hai'],
          ['10/21/2026 9:29:32', 'Câu chỉ cần email', 'Trả lời qua email'],
        ] }] } } });
      }
      json(404, { successful: false, error: 'unknown tool' });
    });
  }).listen(0);
  await new Promise((r) => fake.once('listening', r));

  const PORT = 4500 + Math.floor(Math.random() * 400);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-cmp-'));
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, ADMIN_KEY: KEY, DATA_DIR: dataDir, COMPOSIO_BASE_URL: `http://localhost:${fake.address().port}`, COMPOSIO_API_KEY: 'ak_test', COMPOSIO_CONNECTED_ACCOUNT_ID: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('running') && r()));
  let failed = false;
  try {
    const admin = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
    await new Promise((r) => admin.on('connect', r));
    let adm = null; admin.on('admin', (a) => { adm = a; });
    await call(admin, 'admin:auth', KEY);
    await wait(200);
    assert.ok(adm.google.composio, 'admin sees Composio is configured');
    await call(admin, 'admin:action', { type: 'sheet:config', url: 'https://docs.google.com/spreadsheets/d/SHEETID/edit#gid=2088885041' });
    let r = await call(admin, 'admin:action', { type: 'sheet:sync' });
    assert.ok(r.ok && r.added === 1 && r.skipped === 1, 'imported via Composio: ' + JSON.stringify(r));
    assert.equal(seen[0].body.connected_account_id, 'ca_test', 'most recent active account discovered');
    assert.equal(seen[0].body.arguments.spreadsheet_id, 'SHEETID');
    assert.deepEqual(seen[1].body.arguments.ranges, ['Form_Responses'], 'picked the Form_Responses tab');
    await wait(300);
    assert.ok(adm.questions.find((q) => q.text === 'Câu hỏi đọc qua Composio?' && q.status === 'pending'));
    r = await call(admin, 'admin:action', { type: 'sheet:sync' });
    assert.equal(r.added, 0, 'no duplicates');
    failNext = true;
    r = await call(admin, 'admin:action', { type: 'sheet:sync' });
    assert.ok(!r.ok && /permission/.test(r.error), 'Composio error surfaced: ' + r.error);
    console.log('✅ composio test passed');
    admin.close();
  } catch (e) {
    failed = true;
    console.error('❌', e);
  } finally {
    srv.kill('SIGTERM');
    fake.close();
    await wait(300);
    fs.rmSync(dataDir, { recursive: true, force: true });
    process.exit(failed ? 1 : 0);
  }
})();
