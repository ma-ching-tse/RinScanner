# RinScanner 使用统计

零依赖（纯 Node 标准库）。两部分：

1. **ingest server** (`index.js`) —— 一直跑着，收插件上报的事件，落到 `events.jsonl`。
2. **报表 CLI** (`report.js`) —— 你想看的时候敲一条命令，**直接在终端打出文本**：谁、用了多少次、解决了什么问题。没有网页。

> 为什么还需要一个常驻 server？Figma 插件只能发网络请求，没法直接写共享文件，所以得有个端点接收。它很小，只有一个 `POST /telemetry`。

## 1. 收数据

```bash
npm run telemetry:server          # 等同 node server/index.js，监听 :8787
# 或 PORT=9000 DATA=/data/ev.jsonl node server/index.js
```

部署到同事能访问的地址（内网机器 / 云主机都行）。

## 2. 看数据

```bash
npm run telemetry:report                 # 全部历史
node server/report.js --days 7           # 最近 7 天
node server/report.js --since 24h        # 最近 24 小时（30m / 12h / 7d）
node server/report.js --user 张三        # 只看某人
node server/report.js --json             # 原始聚合 JSON（喂给别的脚本）
```

输出长这样：

```
RinScanner 使用统计   ·   最近 7 天
数据范围: 06-02 09:18 ~ 06-02 17:40
════════════════════════════════════════════════════════════════
总览   使用人数 2 · 扫描 2 次 · 发现问题 42 · 一键修复 2 · 修复率 5% · AI命名 1

按人 (2)
  用户            扫描  发现  修复  AI命名  最近使用
  张三               1    36     2       1  06-02 09:18
  李四同学           1     6     0       0  06-02 09:18

按文件 (Top 2)
  Finance-APP                      1      36
  Web-Dash                         1       6

修复类型分布
  apply-token          1
  rename               1

最近事件
  06-02 09:18  张三        scan            36 问题 / 412 节点 · 一级代理
  ...
```

**修复率 = 修复数 ÷ 发现数**，是插件采纳度的核心代理指标，可直接拿去推广汇报。

## 让插件上报到这里

插件默认**不上报**（`src/code.ts` 里 `DEFAULT_TELEMETRY_URL = ''`，保持纯本地）。全团队开启：

1. 把 ingest server 部署到一个同事能访问的地址。
2. `src/code.ts` 里把 `DEFAULT_TELEMETRY_URL` 改成你的 `/telemetry` 端点，例如
   `https://your-host:8787/telemetry`。
3. `npm run build`，重新分发插件。

之后每位同事运行插件会自动上报（带 Figma 用户名 / id —— **记名**）。
同事可在插件「设置 ⚙ → 使用统计」里看到正在上报并一键关闭（合规告知用）。

## 上报内容

```jsonc
// scan
{ "event": "scan", "userId": "...", "userName": "张三", "fileName": "Finance-APP",
  "scanned": 412, "scope": "一级代理",
  "found": { "token": 23, "autolayout": 5, "naming": 8, "total": 36 } }
// fix            { "event": "fix", "fixKind": "apply-token" | "rename" | "add-autolayout" }
// naming_suggest { "event": "naming_suggest", "requested": 8, "succeeded": 7, "failed": 1 }
```

**只上报数字摘要和身份**——不含图层内容、token 值、截图。

## 隐私 / 合规

这是**记名**统计。上线前请告知团队并取得认可。想要纯匿名：删掉
`src/telemetry/telemetry.ts` 里 payload 的 `userId` / `userName` 即可。

## 数据存储

`events.jsonl`：每行一个 JSON 事件，已 gitignore。备份 / 迁移直接拷文件。
要更稳可换 SQLite / Postgres（改 `index.js` 的写入 + `report.js` 的读取）。
