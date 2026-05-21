import {
  ColorVariableSummary,
  DataSourceInfo,
  PlatformFilterValue,
  PluginMessage,
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
  tokenPanelOpen: boolean;
  tokenFilter: string;
  selection: { count: number; rootName: string | null };
  scanScope: string | null;
  violations: Violation[];
  scanned: number;
  lastError?: string;
}

const state: State = {
  status: 'idle',
  progress: { processed: 0, total: 0 },
  tokens: { colors: [], textStyles: [], dataSource: null, loaded: false },
  platformFilter: 'APP',
  tokenPanelOpen: true,
  tokenFilter: '',
  selection: { count: 0, rootName: null },
  scanScope: null,
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

function renderTokenPanel(): string {
  const { colors, textStyles, dataSource, loaded } = state.tokens;
  const open = state.tokenPanelOpen;
  const filter = state.tokenFilter.trim().toLowerCase();
  const header = `<div class="token-header">
    <span data-action="toggle-tokens" style="cursor:pointer">${open ? '▼' : '▶'} </span>
    <span class="token-header-title" data-action="toggle-tokens" style="cursor:pointer">已加载的 Token</span>
    <span class="token-header-counts">${loaded ? `${colors.length} 颜色 · ${textStyles.length} 字体` : '加载中…'}</span>
    <button class="btn" data-action="reload-tokens" title="重新加载">↻</button>
  </div>`;

  if (!open) return `<div class="token-panel">${header}</div>`;

  if (!loaded) {
    return `<div class="token-panel">${header}<div class="empty">读取 Variables / Styles…</div></div>`;
  }

  if (colors.length === 0 && textStyles.length === 0) {
    return `<div class="token-panel">${header}
      ${dataSource ? renderDataSource(dataSource) : ''}
      <div class="empty">
        当前文件没读到任何颜色变量或字体样式。<br/>
        检查是否在 BMDS 文件里，或者已订阅 BMDS library（Assets → Libraries）。
      </div>
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

  return `<div class="token-panel">
    ${header}
    ${dataSource ? renderDataSource(dataSource) : ''}
    ${filterRow}
    <div class="token-body">
      ${empty}
      <div class="token-group">${colorHtml}</div>
      <div class="token-group">${textHtml}</div>
    </div>
  </div>`;
}

function render() {
  const colorViolations = state.violations.filter((v) => v.kind !== 'text');
  const textViolations = state.violations.filter((v) => v.kind === 'text');
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
          <span><strong>${state.violations.length}</strong> 处违规</span>
          <span><strong>${colorViolations.length}</strong> 颜色</span>
          <span><strong>${textViolations.length}</strong> 字体</span>
          <span>扫描范围: ${escape(state.scanScope ?? '')} · ${state.scanned} 节点</span>
        </div>`
      : state.status === 'idle'
        ? `<div class="stats">${selectionHint}</div>`
        : `<div class="stats">扫描中… ${state.progress.processed}/${state.progress.total}</div>`;

  let listHtml = '';
  if (state.status === 'done') {
    if (state.violations.length === 0) {
      listHtml = `<div class="empty">🎉 当前页面所有颜色和字体都已绑定到 token。</div>`;
    } else {
      if (colorViolations.length > 0) {
        listHtml += `<div class="group">颜色 (${colorViolations.length})</div>`;
        listHtml += colorViolations.map(renderCard).join('');
      }
      if (textViolations.length > 0) {
        listHtml += `<div class="group">字体 (${textViolations.length})</div>`;
        listHtml += textViolations.map(renderCard).join('');
      }
    }
  } else if (state.status === 'idle') {
    listHtml = `<div class="empty">在 Figma 画布上选中一个或多个画板/节点，然后点上方「扫描选中画板」。</div>`;
  }

  const canScan = !scanning && state.tokens.loaded && state.selection.count > 0;

  const platformOptions: PlatformFilterValue[] = ['APP', 'Web', 'Both'];
  const platformLabels: Record<PlatformFilterValue, string> = { APP: 'APP', Web: 'Web', Both: '两者' };
  const platformSwitcher = `<div class="seg">${platformOptions
    .map(
      (p) =>
        `<button class="seg-btn ${state.platformFilter === p ? 'active' : ''}" data-action="set-platform" data-platform="${p}" ${state.platformFilter === p ? 'aria-current="true"' : ''}>${platformLabels[p]}</button>`,
    )
    .join('')}</div>`;

  root.innerHTML = `
    <div class="topbar">
      <div class="topbar-row">
        <div class="title">Token Scanner</div>
        <button class="scan-btn" data-action="scan" ${canScan ? '' : 'disabled'}>${scanning ? '扫描中…' : '扫描选中画板'}</button>
      </div>
      <div class="topbar-row">
        <span class="muted" style="font-size:10px">匹配 token 来源:</span>
        ${platformSwitcher}
      </div>
      ${stats}
      ${progressBar}
    </div>
    ${renderTokenPanel()}
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
    state.progress = { processed: 0, total: 0 };
    render();
    send({ type: 'scan' });
  } else if (action === 'locate') {
    send({ type: 'selectNode', nodeId: btn.dataset.node! });
  } else if (action === 'apply') {
    send({ type: 'applyFix', violationId: btn.dataset.id!, tokenId: btn.dataset.token! });
  } else if (action === 'toggle-tokens') {
    state.tokenPanelOpen = !state.tokenPanelOpen;
    render();
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
    render();
  } else if (msg.type === 'selectionChanged') {
    state.selection = { count: msg.count, rootName: msg.rootName };
    render();
  } else if (msg.type === 'scanProgress') {
    state.progress = { processed: msg.processed, total: msg.total };
    render();
  } else if (msg.type === 'scanResult') {
    state.violations = msg.violations;
    state.scanned = msg.scanned;
    state.scanScope = msg.scope;
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
