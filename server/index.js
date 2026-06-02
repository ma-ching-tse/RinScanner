#!/usr/bin/env node
// Token Scanner telemetry — INGEST server (zero dependencies, pure Node stdlib).
//
// This only collects events. To VIEW the data, run the CLI report:
//   node server/report.js            (see report.js / README.md)
//
//   node server/index.js             # listens on :8787, appends ./events.jsonl
//   PORT=9000 DATA=/tmp/ev.jsonl node server/index.js
//
// A Figma plugin can only send data over the network — it can't write to a
// shared file directly — so this tiny endpoint has to run somewhere the team
// can reach. Storage is append-only JSON Lines: one event per line.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8787;
const DATA_FILE = process.env.DATA || path.join(__dirname, 'events.jsonl');

const CORS = {
  'Access-Control-Allow-Origin': '*', // Figma plugin fetch origin is "null"
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const VALID_EVENTS = new Set(['scan', 'fix', 'naming_suggest']);

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  if (req.method === 'POST' && req.url === '/telemetry') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) req.destroy(); // basic flood guard
    });
    req.on('end', () => {
      try {
        const evt = JSON.parse(body);
        if (!evt || !VALID_EVENTS.has(evt.event)) {
          return sendJson(res, 400, { ok: false, error: 'invalid event' });
        }
        // Stamp server-side receipt time; trust client `ts` only as a hint.
        const record = { ...evt, receivedAt: new Date().toISOString() };
        fs.appendFileSync(DATA_FILE, JSON.stringify(record) + '\n');
        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 400, { ok: false, error: 'bad json' });
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain', ...CORS });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`Token Scanner telemetry ingest`);
  console.log(`  POST http://localhost:${PORT}/telemetry`);
  console.log(`  data: ${DATA_FILE}`);
  console.log(`  view: node server/report.js`);
});
