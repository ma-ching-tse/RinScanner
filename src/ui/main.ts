import {
  ColorVariableSummary,
  DataSourceInfo,
  LlmConfigPublic,
  PlatformFilterValue,
  PluginMessage,
  ScanCategorySelection,
  TextStyleSummary,
  UIMessage,
  Violation,
} from '../types';

interface State {
  status: 'idle' | 'scanning' | 'done';
  progress: { processed: number; total: number };
  tokens: {
    colors: ColorVariableSummary[];
    textStyles: TextStyleSummary[];
    dataSource: DataSourceInfo | null;
    loaded: boolean;
  };
  platformFilter: PlatformFilterValue;
  platformDivergence: boolean;
  scanCategories: ScanCategorySelection;
  view: 'scan' | 'tokens' | 'settings';
  tokenFilter: string;
  llmConfig: LlmConfigPublic;
  namingSuggestions: Record<string, { name?: string; error?: string; loading?: boolean }>;
  whitelist: string[];
  whitelistOpen: boolean;
  selection: { count: number; rootName: string | null };
  scanScope: string | null;
  scanSkipped: number;
  violations: Violation[];
  scanned: number;
  lastError?: string;
}

const state: State = {
  status: 'idle',
  progress: { processed: 0, total: 0 },
  tokens: { colors: [], textStyles: [], dataSource: null, loaded: false },
  platformFilter: 'APP',
  platformDivergence: false,
  scanCategories: { token: true, autolayout: true, naming: true },
  view: 'scan',
  tokenFilter: '',
  llmConfig: { configured: false, baseUrl: '', model: '', hasKey: false },
  namingSuggestions: {},
  whitelist: [],
  whitelistOpen: false,
  selection: { count: 0, rootName: null },
  scanScope: null,
  scanSkipped: 0,
  violations: [],
  scanned: 0,
};

const root = document.getElementById('root')!;

function send(msg: UIMessage) {
  parent.postMessage({ pluginMessage: msg }, '*');
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function swatchHtml(hex: string, alpha: number, title: string, sizeClass = 'sm'): string {
  const safeHex = hex.replace('#', '');
  const bg = hexToRgba(`#${safeHex}`, alpha);
  return `<div class="swatch ${sizeClass}" style="background:${bg}" title="${escape(title)}"></div>`;
}

function renderSuggestion(v: Violation): string {
  if (v.suggestion) {
    const s = v.suggestion;
    const label = s.confidence === 'exact' ? '完全匹配' : s.confidence === 'near' ? `相近 (Δ ${s.distance?.toFixed(0)})` : '部分匹配';
    return `<div class="suggestion ${s.confidence}">${label} · ${escape(s.tokenName)}</div>`;
  }
  if (v.candidates && v.candidates.length > 0) {
    return `<div class="candidates">${v.candidates
      .map(
        (c) =>
          `<div class="candidate"><span class="candidate-name">候选: ${escape(c.tokenName)}</span><button class="btn primary" data-action="apply" data-id="${v.id}" data-token="${c.tokenId}">应用</button></div>`,
      )
      .join('')}</div>`;
  }
  return `<div class="no-match">无匹配 token</div>`;
}

function renderCard(v: Violation): string {
  if (v.category === 'token') return renderTokenCard(v);
  return renderStructuralCard(v);
}

function renderTokenCard(v: Violation): string {
  const isColor = v.kind !== 'text';
  const swatch = isColor
    ? swatchHtml(v.colorHex ?? '#000000', v.colorAlpha ?? 1, v.currentValue, '')
    : `<div class="swatch" style="display:flex;align-items:center;justify-content:center;font-size:10px">Aa</div>`;
  const kindLabel = v.kind === 'color-fill' ? 'Fill' : v.kind === 'color-stroke' ? 'Stroke' : 'Text';
  const canApply = !!v.suggestion;
  const applyBtn = canApply
    ? `<button class="btn primary" data-action="apply" data-id="${v.id}" data-token="${v.suggestion!.tokenId}">应用 token</button>`
    : '';

  return `<div class="card" data-violation="${v.id}">
    ${swatch}
    <div class="card-body">
      <div class="card-title">${escape(v.nodeName)} <span style="color:var(--text-secondary);font-weight:400">· ${kindLabel}</span></div>
      <div class="card-meta">${escape(v.currentValue)}</div>
      ${renderSuggestion(v)}
      <div class="actions">
        <button class="btn" data-action="locate" data-node="${v.nodeId}">定位</button>
        ${applyBtn}
      </div>
    </div>
  </div>`;
}

function renderStructuralCard(v: Violation): string {
  const isLayout = v.category === 'autolayout';
  const icon = isLayout ? '▦' : '⌶';
  const kindLabel =
    v.kind === 'autolayout-group' ? 'Group' : v.kind === 'autolayout-none' ? '无 auto-layout' : '默认命名';

  // auto-layout auto-fix is shelved (results were unreliable) — detection + locate only.
  // naming gets an AI suggestion + rename action.
  let extraBtn = '';
  let suggestionRow = '';
  if (v.category === 'naming') {
    const sug = state.namingSuggestions[v.id];
    if (sug && sug.name) {
      suggestionRow = `<div class="suggestion exact">建议: ${escape(sug.name)}</div>`;
      extraBtn = `<button class="btn primary" data-action="apply-rename" data-id="${v.id}" data-name="${escape(sug.name)}">改名</button>`;
    } else if (sug && sug.error) {
      suggestionRow = `<div class="no-match">AI 建议失败: ${escape(sug.error)}</div>`;
    } else if (sug && sug.loading) {
      suggestionRow = `<div class="no-match">AI 生成中…</div>`;
    }
  }

  return `<div class="card" data-violation="${v.id}">
    <div class="swatch struct-ic">${icon}</div>
    <div class="card-body">
      <div class="card-title">${escape(v.nodeName)} <span style="color:var(--text-secondary);font-weight:400">· ${kindLabel}</span></div>
      <div class="card-meta">${escape(v.message ?? v.currentValue)}</div>
      ${suggestionRow}
      <div class="actions">
        <button class="btn" data-action="locate" data-node="${v.nodeId}">定位</button>
        ${extraBtn}
      </div>
    </div>
  </div>`;
}

function sourceBadge(remote: boolean, source: 'variable' | 'style' | 'bmds'): string {
  if (source === 'bmds') return `<span class="src-badge bmds">BMDS</span>`;
  const label = source === 'style' ? 'Style' : remote ? 'Library' : 'Local';
  const cls = source === 'style' ? 'style' : remote ? 'library' : 'local';
  return `<span class="src-badge ${cls}">${label}</span>`;
}

function renderDataSource(ds: DataSourceInfo): string {
  const collectionRows = ds.collections
    .map((c) => {
      const badge = sourceBadge(c.remote, c.source);
      return `<div class="ds-row"><span class="ds-name">${escape(c.name)}</span>${badge}<span class="ds-count">${c.variableCount}</span></div>`;
    })
    .join('');

  return `<div class="ds-block">
    <div class="ds-title">数据来源</div>
    <div class="ds-list">${collectionRows}</div>
    <div class="ds-note">
      <strong>颜色</strong>: ${escape(ds.bmdsVersion)} · ${ds.bmdsColorCount} 个 token（写死在插件代码 <code>src/tokens/bmds.ts</code>，BMDS 改动后改这个文件 + rebuild）<br/>
      <strong>字体</strong>: 当前 Figma 文件「${escape(ds.fileName)}」的 Local Text Styles（${ds.textStyleCount} 个）
    </div>
  </div>`;
}

function tokenViewHeader(loaded: boolean, colorCount: number, textCount: number): string {
  return `<div class="view-header">
    <button class="icon-btn" data-action="back-to-scan" title="返回扫描">←</button>
    <div class="view-title">Token 库</div>
    <span class="token-header-counts">${loaded ? `${colorCount} 颜色 · ${textCount} 字体` : '加载中…'}</span>
    <button class="btn" data-action="reload-tokens" title="重新加载">↻</button>
  </div>`;
}

function renderTokenView(): string {
  const { colors, textStyles, dataSource, loaded } = state.tokens;
  const filter = state.tokenFilter.trim().toLowerCase();
  const header = tokenViewHeader(loaded, colors.length, textStyles.length);

  if (!loaded) {
    return `${header}<div class="empty">读取 Variables / Styles…</div>`;
  }

  if (colors.length === 0 && textStyles.length === 0) {
    return `${header}
      ${dataSource ? renderDataSource(dataSource) : ''}
      <div class="empty">
        当前文件没读到任何颜色变量或字体样式。<br/>
        检查是否在 BMDS 文件里，或者已订阅 BMDS library（Assets → Libraries）。
      </div>`;
  }

  const matchesFilter = (s: string) => filter === '' || s.toLowerCase().includes(filter);

  const filteredColors = colors.filter(
    (c) => matchesFilter(c.name) || c.modes.some((m) => matchesFilter(m.hex) || matchesFilter(m.modeName)),
  );
  const filteredText = textStyles.filter(
    (t) => matchesFilter(t.name) || matchesFilter(t.family) || matchesFilter(t.style),
  );

  const colorsByCollection = new Map<string, ColorVariableSummary[]>();
  for (const c of filteredColors) {
    const key = c.collectionName ?? (c.source === 'style' ? 'Paint Styles' : 'Variables');
    const arr = colorsByCollection.get(key) ?? [];
    arr.push(c);
    colorsByCollection.set(key, arr);
  }

  let colorHtml = '';
  for (const [collection, items] of colorsByCollection) {
    const remote = items.some((it) => it.remote);
    const source = items[0]?.source ?? 'variable';
    colorHtml += `<div class="token-subgroup">${escape(collection)} (${items.length}) ${sourceBadge(remote, source)}</div>`;
    colorHtml += items
      .map((c) => {
        const label = c.shortName ? `${escape(c.group ?? '')}<span class="muted">/</span>${escape(c.shortName)}` : escape(c.name);
        const platformChip = c.platformBadge ? `<span class="platform-chip">${escape(c.platformBadge)}</span>` : '';
        return `<div class="token-row">
          <div class="token-swatches">${c.modes
            .map((m) => swatchHtml(m.hex, m.alpha, `${m.modeName}: ${m.hex}${m.alpha < 1 ? ` · ${Math.round(m.alpha * 100)}%` : ''}`))
            .join('')}</div>
          <div class="token-row-name">${label}${platformChip}</div>
          <div class="token-row-meta">${c.modes
            .map((m) => `${escape(m.modeName)} ${escape(m.hex)}${m.alpha < 1 ? ` ${Math.round(m.alpha * 100)}%` : ''}`)
            .join(' · ')}</div>
        </div>`;
      })
      .join('');
  }

  let textHtml = '';
  if (filteredText.length > 0) {
    textHtml += `<div class="token-subgroup">Text Styles (${filteredText.length}) ${sourceBadge(false, 'style')}</div>`;
    textHtml += filteredText
      .map(
        (t) => `<div class="token-row">
          <div class="swatch sm token-text-swatch">Aa</div>
          <div class="token-row-name">${escape(t.name)}</div>
          <div class="token-row-meta">${escape(t.family)} ${escape(t.style)} · ${t.size}/${escape(t.lineHeight)}</div>
        </div>`,
      )
      .join('');
  }

  const filterRow = `<div class="token-filter">
    <input type="text" id="token-filter-input" placeholder="🔍 搜索 token 名称 / hex / mode…" value="${escape(state.tokenFilter)}" />
    ${filter ? `<span class="filter-count">${filteredColors.length + filteredText.length} 项匹配</span>` : ''}
  </div>`;

  const empty =
    filter && filteredColors.length === 0 && filteredText.length === 0
      ? '<div class="empty">没有匹配的 token</div>'
      : '';

  return `${header}
    <div class="view-fixed">
      ${dataSource ? renderDataSource(dataSource) : ''}
      ${filterRow}
    </div>
    <div class="view-scroll">
      ${empty}
      <div class="token-group">${colorHtml}</div>
      <div class="token-group">${textHtml}</div>
    </div>`;
}

function renderWhitelistPanel(): string {
  const open = state.whitelistOpen;
  const count = state.whitelist.length;
  const header = `<div class="token-header">
    <span data-action="toggle-whitelist" style="cursor:pointer">${open ? '▼' : '▶'} </span>
    <span class="token-header-title" data-action="toggle-whitelist" style="cursor:pointer">额外忽略的组件</span>
    <span class="token-header-counts">${count} 个 · 库组件自动跳过</span>
  </div>`;

  if (!open) return `<div class="token-panel">${header}</div>`;

  const chips =
    count === 0
      ? `<div class="wl-empty">来自设计系统库的组件已<b>自动跳过</b>，无需在此添加。这里用于额外忽略<b>本地组件</b>等特例：选中实例点下方按钮加入，该组件及其内部图层不会被扫描。</div>`
      : `<div class="wl-chips">${state.whitelist
          .map(
            (name) =>
              `<span class="wl-chip">${escape(name)}<button class="wl-remove" data-action="remove-whitelist" data-name="${escape(name)}" title="移除">×</button></span>`,
          )
          .join('')}</div>`;

  return `<div class="token-panel">
    ${header}
    <div class="wl-body">
      ${chips}
      <button class="btn wl-add" data-action="add-whitelist">＋ 添加选中组件</button>
    </div>
  </div>`;
}

function renderSettingsView(): string {
  const c = state.llmConfig;
  const status = c.configured
    ? `<span class="src-badge library">已配置</span>`
    : `<span class="src-badge style">未配置</span>`;
  return `<div class="view-header">
      <button class="icon-btn" data-action="back-to-scan" title="返回">←</button>
      <div class="view-title">LLM 命名设置 ${status}</div>
    </div>
    <div class="view-scroll settings-body">
      <div class="ds-note" style="margin-bottom:10px">
        地址和模型已是团队默认值，<strong>你只需粘贴自己的 API Key</strong> 即可（地址/模型留默认就行）。
      </div>
      <label class="field-label">API Key${c.hasKey ? '（已保存，留空则不修改）' : '（百炼 sk- 开头）'}</label>
      <input class="field-input" id="llm-key" type="password" placeholder="${c.hasKey ? '••••••••（已保存）' : 'sk-...'}" />
      <details class="adv-config">
        <summary>高级：地址 / 模型</summary>
        <label class="field-label">代理地址 (Base URL)</label>
        <input class="field-input" id="llm-base" value="${escape(c.baseUrl)}" placeholder="${escape('https://dashscope.aliyuncs.com/compatible-mode/v1')}" />
        <label class="field-label">模型</label>
        <input class="field-input" id="llm-model" value="${escape(c.model)}" placeholder="qwen-plus" />
      </details>
      <button class="btn primary settings-save" data-action="save-llm">保存</button>
      <div class="ds-note">
        命名建议会把每个图层的<strong>类型、当前名、父层名、内部文字</strong>发送到该端点
        （OpenAI 兼容 <code>/chat/completions</code>）。不发送截图。Key 仅存本机 clientStorage。
      </div>
    </div>`;
}

function render() {
  if (state.view === 'tokens') {
    root.innerHTML = renderTokenView();
    return;
  }
  if (state.view === 'settings') {
    root.innerHTML = renderSettingsView();
    return;
  }

  const colorViolations = state.violations.filter((v) => v.kind === 'color-fill' || v.kind === 'color-stroke');
  const textViolations = state.violations.filter((v) => v.kind === 'text');
  const layoutViolations = state.violations.filter((v) => v.category === 'autolayout');
  const namingViolations = state.violations.filter((v) => v.category === 'naming');
  const pct = state.progress.total > 0 ? Math.round((state.progress.processed / state.progress.total) * 100) : 0;
  const scanning = state.status === 'scanning';

  const progressBar = scanning
    ? `<div class="progress"><div style="width:${pct}%"></div></div>`
    : '';

  const selectionHint =
    state.selection.count === 0
      ? '<span style="color:var(--warning)">⚠ 未选中任何画板</span>'
      : `<span>选中: <strong>${escape(state.selection.rootName ?? '')}</strong></span>`;

  const stats =
    state.status === 'done'
      ? `<div class="stats">
          <span><strong>${state.violations.length}</strong> 处</span>
          <span>${colorViolations.length} 颜色 · ${textViolations.length} 字体 · ${layoutViolations.length} 布局 · ${namingViolations.length} 命名</span>
          <span>${escape(state.scanScope ?? '')} · ${state.scanned} 节点${state.scanSkipped > 0 ? ` · 已忽略 ${state.scanSkipped}` : ''}</span>
        </div>`
      : state.status === 'idle'
        ? `<div class="stats">${selectionHint}</div>`
        : `<div class="stats">扫描中… ${state.progress.processed}/${state.progress.total}</div>`;

  const groupBlock = (title: string, items: Violation[]) =>
    items.length > 0 ? `<div class="group">${title} (${items.length})</div>${items.map(renderCard).join('')}` : '';

  let listHtml = '';
  if (state.status === 'done') {
    if (state.violations.length === 0) {
      listHtml = `<div class="empty">🎉 选区内颜色、字体、布局、命名都没发现问题。</div>`;
    } else {
      listHtml += groupBlock('颜色', colorViolations);
      listHtml += groupBlock('字体', textViolations);
      listHtml += groupBlock('布局 (auto-layout)', layoutViolations);
      if (namingViolations.length > 0) {
        const aiBtn = `<button class="link-btn" data-action="ai-naming">✨ AI 命名建议</button>`;
        listHtml += `<div class="group">命名 (${namingViolations.length}) ${aiBtn}</div>`;
        listHtml += namingViolations.map(renderCard).join('');
      }
    }
  } else if (state.status === 'idle') {
    listHtml = `<div class="empty">在 Figma 画布上选中一个或多个画板/节点，然后点上方「扫描选中画板」。</div>`;
  }

  const canScan = !scanning && state.tokens.loaded && state.selection.count > 0;

  const platformOptions: PlatformFilterValue[] = ['APP', 'Web', 'Both'];
  const platformLabels: Record<PlatformFilterValue, string> = { APP: 'APP', Web: 'Web', Both: '两者' };
  // Only show the platform switcher when at least one token actually diverges
  // between APP and Web — otherwise it's a no-op and just adds clutter.
  const platformRow = state.platformDivergence
    ? `<div class="topbar-row">
        <span class="muted" style="font-size:10px">匹配 token 来源:</span>
        <div class="seg">${platformOptions
          .map(
            (p) =>
              `<button class="seg-btn ${state.platformFilter === p ? 'active' : ''}" data-action="set-platform" data-platform="${p}" ${state.platformFilter === p ? 'aria-current="true"' : ''}>${platformLabels[p]}</button>`,
          )
          .join('')}</div>
      </div>`
    : '';

  const tokensLoaded = state.tokens.loaded;
  const tokenEntryLabel = tokensLoaded
    ? `${state.tokens.colors.length} 颜色 · ${state.tokens.textStyles.length} 字体`
    : '加载中…';
  const tokenEntry = `<button class="token-entry" data-action="view-tokens">
    <span class="token-entry-label">📋 Token 库</span>
    <span class="token-entry-meta">${tokenEntryLabel}</span>
    <span class="token-entry-chev">›</span>
  </button>`;

  const catDefs: { key: keyof ScanCategorySelection; label: string }[] = [
    { key: 'token', label: 'Token' },
    { key: 'autolayout', label: '布局' },
    { key: 'naming', label: '命名' },
  ];
  const categoryRow = `<div class="topbar-row">
    <span class="muted" style="font-size:10px">扫描:</span>
    <div class="cat-toggles">${catDefs
      .map(
        (c) =>
          `<button class="cat-chip ${state.scanCategories[c.key] ? 'on' : ''}" data-action="toggle-category" data-cat="${c.key}">${state.scanCategories[c.key] ? '✓ ' : ''}${c.label}</button>`,
      )
      .join('')}</div>
  </div>`;

  root.innerHTML = `
    <div class="topbar">
      <div class="topbar-row">
        <div class="title">Token Scanner</div>
        <button class="icon-btn" data-action="open-settings" title="LLM 命名设置">⚙</button>
        <button class="scan-btn" data-action="scan" ${canScan ? '' : 'disabled'}>${scanning ? '扫描中…' : '扫描选中画板'}</button>
      </div>
      ${categoryRow}
      ${platformRow}
      ${tokenEntry}
      ${stats}
      ${progressBar}
    </div>
    ${renderWhitelistPanel()}
    <div class="list">${listHtml}</div>
  `;
}

root.addEventListener('input', (e) => {
  const target = e.target as HTMLInputElement | null;
  if (target && target.id === 'token-filter-input') {
    state.tokenFilter = target.value;
    const cursor = target.selectionStart;
    render();
    const restored = document.getElementById('token-filter-input') as HTMLInputElement | null;
    if (restored) {
      restored.focus();
      if (cursor !== null) restored.setSelectionRange(cursor, cursor);
    }
  }
});

root.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const btn = target.closest('[data-action]') as HTMLElement | null;
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'scan') {
    state.status = 'scanning';
    state.violations = [];
    state.namingSuggestions = {};
    state.progress = { processed: 0, total: 0 };
    render();
    send({ type: 'scan' });
  } else if (action === 'locate') {
    send({ type: 'selectNode', nodeId: btn.dataset.node! });
  } else if (action === 'apply') {
    send({ type: 'applyFix', violationId: btn.dataset.id!, tokenId: btn.dataset.token! });
  } else if (action === 'apply-layout') {
    send({ type: 'applyLayoutFix', violationId: btn.dataset.id! });
  } else if (action === 'toggle-category') {
    const cat = btn.dataset.cat as keyof ScanCategorySelection;
    const next = { ...state.scanCategories, [cat]: !state.scanCategories[cat] };
    // Keep at least one category on.
    if (next.token || next.autolayout || next.naming) {
      state.scanCategories = next;
      render();
      send({ type: 'setScanCategories', categories: next });
    }
  } else if (action === 'view-tokens') {
    state.view = 'tokens';
    render();
  } else if (action === 'open-settings') {
    state.view = 'settings';
    render();
  } else if (action === 'back-to-scan') {
    state.view = 'scan';
    render();
  } else if (action === 'save-llm') {
    const base = (document.getElementById('llm-base') as HTMLInputElement | null)?.value ?? '';
    const model = (document.getElementById('llm-model') as HTMLInputElement | null)?.value ?? '';
    const key = (document.getElementById('llm-key') as HTMLInputElement | null)?.value ?? '';
    send({ type: 'setLlmConfig', baseUrl: base, model, apiKey: key });
  } else if (action === 'ai-naming') {
    if (!state.llmConfig.configured || !state.llmConfig.hasKey) {
      state.view = 'settings';
      render();
    } else {
      send({ type: 'requestNamingSuggestions' });
    }
  } else if (action === 'apply-rename') {
    send({ type: 'applyRename', violationId: btn.dataset.id!, name: btn.dataset.name! });
  } else if (action === 'reload-tokens') {
    e.stopPropagation();
    state.tokens.loaded = false;
    render();
    send({ type: 'reloadTokens' });
  } else if (action === 'set-platform') {
    const platform = btn.dataset.platform as PlatformFilterValue | undefined;
    if (platform && platform !== state.platformFilter) {
      state.platformFilter = platform;
      state.tokens.loaded = false;
      render();
      send({ type: 'setPlatformFilter', filter: platform });
    }
  } else if (action === 'toggle-whitelist') {
    state.whitelistOpen = !state.whitelistOpen;
    render();
  } else if (action === 'add-whitelist') {
    send({ type: 'addSelectedToWhitelist' });
  } else if (action === 'remove-whitelist') {
    send({ type: 'removeFromWhitelist', name: btn.dataset.name! });
  }
});

window.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data?.pluginMessage as PluginMessage | undefined;
  if (!msg) return;
  if (msg.type === 'tokensReady') {
    state.tokens = {
      colors: msg.colors,
      textStyles: msg.textStyles,
      dataSource: msg.dataSource,
      loaded: true,
    };
    state.platformFilter = msg.platformFilter;
    state.platformDivergence = msg.platformDivergence;
    render();
  } else if (msg.type === 'selectionChanged') {
    state.selection = { count: msg.count, rootName: msg.rootName };
    render();
  } else if (msg.type === 'whitelistChanged') {
    state.whitelist = msg.entries;
    render();
  } else if (msg.type === 'scanCategoriesChanged') {
    state.scanCategories = msg.categories;
    render();
  } else if (msg.type === 'llmConfig') {
    state.llmConfig = msg.config;
    if (state.view === 'settings') render();
  } else if (msg.type === 'namingSuggestionsStart') {
    for (const id of msg.violationIds) state.namingSuggestions[id] = { loading: true };
    render();
  } else if (msg.type === 'namingSuggestions') {
    for (const r of msg.results) {
      state.namingSuggestions[r.violationId] = { name: r.name, error: r.error, loading: false };
    }
    render();
  } else if (msg.type === 'scanProgress') {
    state.progress = { processed: msg.processed, total: msg.total };
    render();
  } else if (msg.type === 'scanResult') {
    state.violations = msg.violations;
    state.scanned = msg.scanned;
    state.scanScope = msg.scope;
    state.scanSkipped = msg.skipped;
    state.status = 'done';
    render();
  } else if (msg.type === 'fixApplied') {
    if (msg.ok) {
      state.violations = state.violations.filter((v) => v.id !== msg.violationId);
      render();
    } else {
      state.lastError = msg.error;
      const card = document.querySelector(`[data-violation="${msg.violationId}"]`);
      if (card) {
        card.insertAdjacentHTML('beforeend', `<div style="color:#d33;font-size:10px;margin-top:4px">修复失败: ${escape(msg.error || '')}</div>`);
      }
    }
  }
});

render();
