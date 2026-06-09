#!/usr/bin/env node
// RinScanner telemetry — INGEST + read server (zero dependencies, pure Node stdlib).
//
// Collects events AND exposes a key-protected read endpoint so a scheduled job
// can fetch the rollup over HTTPS without SSH. To view the data manually, run
// the CLI report: node server/rinscanner-report.js  (see README.md)
//
//   node server/index.js             # listens on :8787, appends ./events.jsonl
//   PORT=9000 DATA=/tmp/ev.jsonl REPORT_KEY=secret node server/index.js
//
// A Figma plugin can only send data over the network — it can't write to a
// shared file directly — so this tiny endpoint has to run somewhere the team
// can reach. Storage is append-only JSON Lines: one event per line.
//
// Endpoints:
//   POST /telemetry              ingest one event {event: scan|fix|naming_suggest, ...}
//   GET  /report?key=…&days=7    key-protected aggregated rollup (JSON), default 7 days

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8787;
const DATA_FILE = process.env.DATA || path.join(__dirname, 'events.jsonl');
// Secret guarding GET /report. Override via env in production if desired.
const REPORT_KEY = process.env.REPORT_KEY || 'rk_8d51f0a93c6e2b74';

const CORS = {
  'Access-Control-Allow-Origin': '*', // Figma plugin fetch origin is "null"
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const VALID_EVENTS = new Set(['scan', 'fix', 'naming_suggest']);

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(obj));
}

function readEvents() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return fs
    .readFileSync(DATA_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function aggregate(evs) {
  const users = new Map();
  const files = new Map();
  const fixKinds = {};
  let scans = 0;
  let fixes = 0;
  let naming = 0;
  let found = 0;
  let first = null;
  let last = null;

  for (const e of evs) {
    const seen = e.receivedAt || null;
    if (seen) {
      if (!first || seen < first) first = seen;
      if (!last || seen > last) last = seen;
    }
    const k = e.userId || e.installId || 'unknown';
    if (!users.has(k)) {
      users.set(k, { name: e.userName || '(未识别)', scans: 0, found: 0, fixes: 0, naming: 0, lastSeen: null });
    }
    const u = users.get(k);
    if (e.userName) u.name = e.userName;
    if (seen && (!u.lastSeen || seen > u.lastSeen)) u.lastSeen = seen;

    if (e.event === 'scan') {
      scans++;
      u.scans++;
      const f = (e.found && e.found.total) || 0;
      found += f;
      u.found += f;
      const fk = e.fileName || e.fileKey;
      if (fk) {
        if (!files.has(fk)) files.set(fk, { name: e.fileName || fk, scans: 0, found: 0 });
        const ff = files.get(fk);
        ff.scans++;
        ff.found += f;
      }
    } else if (e.event === 'fix') {
      fixes++;
      u.fixes++;
      const kk = e.fixKind || 'unknown';
      fixKinds[kk] = (fixKinds[kk] || 0) + 1;
    } else if (e.event === 'naming_suggest') {
      naming++;
      u.naming++;
    }
  }

  return {
    period: { first, last, events: evs.length },
    totals: {
      uniqueUsers: users.size,
      scans,
      found,
      fixes,
      naming,
      fixRate: found > 0 ? Math.round((fixes / found) * 100) : 0,
    },
    users: [...users.values()].sort((a, b) => b.scans - a.scans),
    files: [...files.values()].sort((a, b) => b.scans - a.scans).slice(0, 10),
    fixKinds,
  };
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'x'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  if (req.method === 'POST' && u.pathname === '/telemetry') {
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

  if (req.method === 'GET' && u.pathname === '/report') {
    if (u.searchParams.get('key') !== REPORT_KEY) {
      return sendJson(res, 403, { ok: false, error: 'forbidden' });
    }
    const days = Number(u.searchParams.get('days')) || 7;
    const cutoff = Date.now() - days * 86400e3;
    const evs = readEvents().filter((e) => e.receivedAt && Date.parse(e.receivedAt) >= cutoff);
    // Group by product so multiple tools (RinScanner, RinType, …) sharing this
    // events.jsonl are reported separately. Untagged events default to
    // 'rinscanner' (the only tool that omits the field).
    const byProduct = {};
    for (const e of evs) {
      const p = e.product || 'rinscanner';
      (byProduct[p] = byProduct[p] || []).push(e);
    }
    const products = {};
    for (const p of Object.keys(byProduct)) products[p] = aggregate(byProduct[p]);
    return sendJson(res, 200, { days, products, combined: aggregate(evs).totals });
  }

  res.writeHead(404, { 'Content-Type': 'text/plain', ...CORS });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`RinScanner telemetry server`);
  console.log(`  POST http://localhost:${PORT}/telemetry`);
  console.log(`  GET  http://localhost:${PORT}/report?key=…&days=7`);
  console.log(`  data: ${DATA_FILE}`);
  console.log(`  view: node server/rinscanner-report.js`);
});
