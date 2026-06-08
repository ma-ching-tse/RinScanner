#!/usr/bin/env node
// RinScanner 使用统计 — 命令行文本报表（零依赖）。
//
//   node rinscanner-report.js                # 全部历史
//   node rinscanner-report.js --days 7       # 最近 7 天
//   node rinscanner-report.js --since 24h    # 最近 24 小时（支持 30m / 12h / 7d）
//   node rinscanner-report.js --user 张三    # 只看某人（按名字模糊匹配）
//   node rinscanner-report.js --json         # 输出原始聚合 JSON（给脚本用）
//
// 数据来源：server/events.jsonl（由 index.js 收集），或用 DATA=... 指定。

const fs = require('fs');
const path = require('path');

const DATA_FILE = process.env.DATA || path.join(__dirname, 'events.jsonl');

// ---- args -----------------------------------------------------------------
const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const opts = {
  days: flag('--days') ? Number(flag('--days')) : undefined,
  since: flag('--since'),
  user: flag('--user'),
  json: argv.includes('--json'),
};

function sinceMs(spec) {
  if (!spec) return undefined;
  const m = /^(\d+)([mhd])$/.exec(spec.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = { m: 60e3, h: 3600e3, d: 86400e3 }[m[2]];
  return Date.now() - n * unit;
}

// ---- load + filter --------------------------------------------------------
function load() {
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

// events.jsonl 现在是 RinScanner 和 RinType 共用的。这里只统计 RinScanner 的事件：
// 带 product:'rinscanner' 的，以及老数据（上线 product 字段之前没有该字段的事件）。
let events = load().filter((e) => !e.product || e.product === 'rinscanner');

let cutoff = sinceMs(opts.since);
if (cutoff === undefined && opts.days) cutoff = Date.now() - opts.days * 86400e3;
if (cutoff !== undefined) {
  events = events.filter((e) => e.receivedAt && Date.parse(e.receivedAt) >= cutoff);
}
if (opts.user) {
  const q = opts.user.toLowerCase();
  events = events.filter((e) => (e.userName || '').toLowerCase().includes(q));
}

// ---- aggregate ------------------------------------------------------------
function aggregate(evs) {
  const users = new Map();
  const files = new Map();
  const fixKinds = new Map();
  let scans = 0;
  let fixes = 0;
  let namingCalls = 0;
  let foundTotal = 0;
  let firstSeen = null;
  let lastSeen = null;

  for (const e of evs) {
    const seen = e.receivedAt || null;
    if (seen) {
      if (!firstSeen || seen < firstSeen) firstSeen = seen;
      if (!lastSeen || seen > lastSeen) lastSeen = seen;
    }
    const key = e.userId || e.installId || 'unknown';
    if (!users.has(key)) {
      users.set(key, { name: e.userName || '(未识别)', scans: 0, found: 0, fixes: 0, naming: 0, lastSeen: null });
    }
    const u = users.get(key);
    if (e.userName) u.name = e.userName;
    if (seen && (!u.lastSeen || seen > u.lastSeen)) u.lastSeen = seen;

    if (e.event === 'scan') {
      scans++;
      u.scans++;
      const found = e.found?.total || 0;
      foundTotal += found;
      u.found += found;
      const fkey = e.fileKey || e.fileName;
      if (fkey) {
        if (!files.has(fkey)) files.set(fkey, { name: e.fileName || fkey, scans: 0, found: 0 });
        const f = files.get(fkey);
        f.scans++;
        f.found += found;
      }
    } else if (e.event === 'fix') {
      fixes++;
      u.fixes++;
      const k = e.fixKind || 'unknown';
      fixKinds.set(k, (fixKinds.get(k) || 0) + 1);
    } else if (e.event === 'naming_suggest') {
      namingCalls++;
      u.naming++;
    }
  }

  return {
    period: { firstSeen, lastSeen, events: evs.length },
    totals: {
      uniqueUsers: users.size,
      scans,
      foundTotal,
      fixes,
      namingCalls,
      fixRate: foundTotal > 0 ? Math.round((fixes / foundTotal) * 100) : 0,
    },
    users: [...users.values()].sort((a, b) => b.scans - a.scans),
    files: [...files.values()].sort((a, b) => b.scans - a.scans).slice(0, 15),
    fixKinds: [...fixKinds.entries()].sort((a, b) => b[1] - a[1]),
    recent: evs.slice(-20).reverse(),
  };
}

const data = aggregate(events);

if (opts.json) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

// ---- text rendering -------------------------------------------------------
// CJK chars take 2 terminal cells; pad accordingly so columns line up.
function width(s) {
  let w = 0;
  for (const ch of String(s)) w += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
  return w;
}
function pad(s, n) {
  s = String(s);
  const gap = n - width(s);
  return gap > 0 ? s + ' '.repeat(gap) : s;
}
function padNum(s, n) {
  s = String(s);
  const gap = n - width(s);
  return gap > 0 ? ' '.repeat(gap) + s : s;
}
function fmt(iso) {
  // Stored as UTC; display in Beijing time (UTC+8).
  if (!iso) return '—';
  const d = new Date(Date.parse(iso) + 8 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
function line(ch = '─', n = 64) {
  return ch.repeat(n);
}

const out = [];
const T = data.totals;

let scope = '全部历史';
if (opts.since) scope = `最近 ${opts.since}`;
else if (opts.days) scope = `最近 ${opts.days} 天`;
if (opts.user) scope += ` · 用户「${opts.user}」`;

out.push('');
out.push(`RinScanner 使用统计   ·   ${scope}`);
if (data.period.firstSeen) out.push(`数据范围: ${fmt(data.period.firstSeen)} ~ ${fmt(data.period.lastSeen)}`);
out.push(line('═'));

if (data.period.events === 0) {
  out.push('该范围内没有数据。');
  out.push('（确认插件 DEFAULT_TELEMETRY_URL 已指向 /telemetry，且 ingest server 在跑）');
  out.push('');
  console.log(out.join('\n'));
  process.exit(0);
}

out.push(
  `总览   使用人数 ${T.uniqueUsers} · 扫描 ${T.scans} 次 · 发现问题 ${T.foundTotal} · ` +
    `一键修复 ${T.fixes} · 修复率 ${T.fixRate}% · AI命名 ${T.namingCalls}`,
);
out.push('');

// --- per user ---
out.push(`按人 (${data.users.length})`);
out.push(
  '  ' +
    pad('用户', 14) +
    padNum('扫描', 6) +
    padNum('发现', 6) +
    padNum('修复', 6) +
    padNum('AI命名', 8) +
    '  最近使用',
);
for (const u of data.users) {
  out.push(
    '  ' +
      pad(u.name, 14) +
      padNum(u.scans, 6) +
      padNum(u.found, 6) +
      padNum(u.fixes, 6) +
      padNum(u.naming, 8) +
      '  ' +
      fmt(u.lastSeen),
  );
}
out.push('');

// --- per file ---
if (data.files.length) {
  out.push(`按文件 (Top ${data.files.length})`);
  out.push('  ' + pad('文件', 28) + padNum('扫描', 6) + padNum('发现', 8));
  for (const f of data.files) {
    out.push('  ' + pad(f.name, 28) + padNum(f.scans, 6) + padNum(f.found, 8));
  }
  out.push('');
}

// --- fix kinds ---
if (data.fixKinds.length) {
  out.push('修复类型分布');
  for (const [k, n] of data.fixKinds) out.push('  ' + pad(k, 16) + padNum(n, 6));
  out.push('');
}

// --- recent ---
out.push('最近事件');
for (const e of data.recent) {
  let detail = '';
  if (e.event === 'scan') detail = `${e.found?.total ?? 0} 问题 / ${e.scanned} 节点 · ${e.scope || ''}`;
  else if (e.event === 'fix') detail = e.fixKind || '';
  else if (e.event === 'naming_suggest') detail = `${e.succeeded}/${e.requested} 成功`;
  out.push('  ' + pad(fmt(e.receivedAt), 13) + pad(e.userName || '—', 12) + pad(e.event, 16) + detail);
}
out.push('');

console.log(out.join('\n'));
