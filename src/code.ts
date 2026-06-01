import { loadTokenIndex, toTextStyleSummary } from './scanner/loadTokens';
import { resolveWhitelistName, scanSelection } from './scanner/walkNodes';
import { applyFix } from './fixer/applyFix';
import { applyLayoutFix } from './fixer/applyLayoutFix';
import { hasPlatformDivergence } from './tokens/bmds';
import { PlatformFilterValue, PluginMessage, ScanCategorySelection, UIMessage, Violation } from './types';
import type { TokenIndex } from './scanner/loadTokens';

figma.showUI(__html__, { width: 360, height: 680, themeColors: true });

const PLATFORM_FILTER_KEY = 'bmds-platform-filter';
const WHITELIST_KEY = 'bmds-component-whitelist';
const SCAN_CATEGORIES_KEY = 'bmds-scan-categories';
const violationsById = new Map<string, Violation>();
let currentTokens: TokenIndex | null = null;
let platformFilter: PlatformFilterValue = 'APP';
let whitelist: string[] = [];
let scanCategories: ScanCategorySelection = { token: true, autolayout: true, naming: true };

function isValidFilter(v: unknown): v is PlatformFilterValue {
  return v === 'APP' || v === 'Web' || v === 'Both';
}

function normalizeCategories(v: unknown): ScanCategorySelection | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const cats = {
    token: o.token !== false,
    autolayout: o.autolayout !== false,
    naming: o.naming !== false,
  };
  // At least one must be on.
  if (!cats.token && !cats.autolayout && !cats.naming) cats.token = true;
  return cats;
}

function post(msg: PluginMessage) {
  figma.ui.postMessage(msg);
}

async function saveWhitelist() {
  await figma.clientStorage.setAsync(WHITELIST_KEY, whitelist);
  post({ type: 'whitelistChanged', entries: whitelist });
}

async function addSelectedToWhitelist() {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.notify('请先选中要忽略的组件实例', { error: true });
    return;
  }
  const added: string[] = [];
  let invalid = 0;
  for (const node of selection) {
    const name = await resolveWhitelistName(node);
    if (!name) {
      invalid++;
      continue;
    }
    if (!whitelist.some((w) => w.toLowerCase() === name.toLowerCase())) {
      whitelist.push(name);
      added.push(name);
    }
  }
  if (added.length > 0) {
    whitelist.sort((a, b) => a.localeCompare(b));
    await saveWhitelist();
    figma.notify(`已忽略组件: ${added.join('、')}`);
  } else if (invalid === selection.length) {
    figma.notify('选中的不是组件实例 / 组件，无法加入白名单', { error: true });
  } else {
    figma.notify('选中的组件已在白名单中');
  }
}

async function loadAndPostTokens(): Promise<TokenIndex> {
  const tokens = await loadTokenIndex(platformFilter);
  currentTokens = tokens;
  post({
    type: 'tokensReady',
    colors: tokens.colorSummaries,
    textStyles: tokens.textStyles.map(toTextStyleSummary),
    dataSource: tokens.dataSource,
    platformFilter,
    platformDivergence: hasPlatformDivergence(),
  });
  return tokens;
}

function describeSelection(selection: readonly SceneNode[]): string {
  if (selection.length === 0) return '无选中';
  if (selection.length === 1) return selection[0].name;
  return `${selection.length} 个选中节点`;
}

function postSelection() {
  const sel = figma.currentPage.selection;
  post({
    type: 'selectionChanged',
    count: sel.length,
    rootName: sel.length === 0 ? null : describeSelection(sel),
  });
}

async function runScan() {
  violationsById.clear();
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.notify('Token Scanner: 请先选中要扫描的画板 / 节点', { error: true });
    post({ type: 'scanResult', violations: [], scanned: 0, scope: '无选中', skipped: 0 });
    return;
  }
  const tokens = currentTokens ?? (await loadAndPostTokens());
  const result = await scanSelection(selection, tokens, whitelist, scanCategories, (processed, total) => {
    post({ type: 'scanProgress', processed, total });
  });
  for (const v of result.violations) violationsById.set(v.id, v);
  post({
    type: 'scanResult',
    violations: result.violations,
    scanned: result.scanned,
    scope: describeSelection(selection),
    skipped: result.skipped,
  });
}

figma.on('selectionchange', postSelection);
postSelection();

async function bootstrap() {
  try {
    const stored = await figma.clientStorage.getAsync(PLATFORM_FILTER_KEY);
    if (isValidFilter(stored)) platformFilter = stored;
  } catch {
    // ignore — use default
  }
  try {
    const storedWl = await figma.clientStorage.getAsync(WHITELIST_KEY);
    if (Array.isArray(storedWl)) {
      whitelist = storedWl.filter((x): x is string => typeof x === 'string');
    }
  } catch {
    // ignore — use default
  }
  try {
    const storedCats = normalizeCategories(await figma.clientStorage.getAsync(SCAN_CATEGORIES_KEY));
    if (storedCats) scanCategories = storedCats;
  } catch {
    // ignore — use default
  }
  post({ type: 'whitelistChanged', entries: whitelist });
  post({ type: 'scanCategoriesChanged', categories: scanCategories });
  await loadAndPostTokens();
}

bootstrap().catch((err) => {
  figma.notify(`Token Scanner: 加载 token 失败 — ${err instanceof Error ? err.message : String(err)}`, { error: true });
});

figma.ui.onmessage = async (msg: UIMessage) => {
  try {
    if (msg.type === 'scan') {
      await runScan();
    } else if (msg.type === 'reloadTokens') {
      await loadAndPostTokens();
    } else if (msg.type === 'setPlatformFilter') {
      if (!isValidFilter(msg.filter)) return;
      platformFilter = msg.filter;
      await figma.clientStorage.setAsync(PLATFORM_FILTER_KEY, msg.filter);
      await loadAndPostTokens();
    } else if (msg.type === 'setScanCategories') {
      const cats = normalizeCategories(msg.categories);
      if (cats) {
        scanCategories = cats;
        await figma.clientStorage.setAsync(SCAN_CATEGORIES_KEY, cats);
        post({ type: 'scanCategoriesChanged', categories: cats });
      }
    } else if (msg.type === 'addSelectedToWhitelist') {
      await addSelectedToWhitelist();
    } else if (msg.type === 'removeFromWhitelist') {
      whitelist = whitelist.filter((w) => w !== msg.name);
      await saveWhitelist();
    } else if (msg.type === 'selectNode') {
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (node && 'type' in node && node.type !== 'PAGE' && node.type !== 'DOCUMENT') {
        figma.currentPage.selection = [node as SceneNode];
        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
      }
    } else if (msg.type === 'applyFix') {
      const v = violationsById.get(msg.violationId);
      if (!v) {
        post({ type: 'fixApplied', violationId: msg.violationId, ok: false, error: 'Violation not found' });
        return;
      }
      try {
        await applyFix(v, msg.tokenId);
        violationsById.delete(msg.violationId);
        post({ type: 'fixApplied', violationId: msg.violationId, ok: true });
      } catch (err) {
        post({
          type: 'fixApplied',
          violationId: msg.violationId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else if (msg.type === 'applyLayoutFix') {
      const v = violationsById.get(msg.violationId);
      if (!v) {
        post({ type: 'fixApplied', violationId: msg.violationId, ok: false, error: 'Violation not found' });
        return;
      }
      try {
        const node = await applyLayoutFix(v);
        violationsById.delete(msg.violationId);
        figma.currentPage.selection = [node];
        figma.viewport.scrollAndZoomIntoView([node]);
        post({ type: 'fixApplied', violationId: msg.violationId, ok: true });
      } catch (err) {
        post({
          type: 'fixApplied',
          violationId: msg.violationId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    figma.notify(`Token Scanner: ${err instanceof Error ? err.message : String(err)}`, { error: true });
  }
};
