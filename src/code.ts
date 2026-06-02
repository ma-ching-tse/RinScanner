import { loadTokenIndex, toTextStyleSummary } from './scanner/loadTokens';
import { resolveWhitelistName, scanSelection } from './scanner/walkNodes';
import { applyFix } from './fixer/applyFix';
import { applyLayoutFix } from './fixer/applyLayoutFix';
import { LlmConfig, gatherNamingContext, isLlmConfigured, suggestNames } from './llm/naming';
import { hasPlatformDivergence } from './tokens/bmds';
import { PlatformFilterValue, PluginMessage, ScanCategorySelection, UIMessage, Violation } from './types';
import type { TokenIndex } from './scanner/loadTokens';

figma.showUI(__html__, { width: 360, height: 680, themeColors: true });

const PLATFORM_FILTER_KEY = 'bmds-platform-filter';
const WHITELIST_KEY = 'bmds-component-whitelist';
const SCAN_CATEGORIES_KEY = 'bmds-scan-categories';
const LLM_CONFIG_KEY = 'bmds-llm-config';
const violationsById = new Map<string, Violation>();
let currentTokens: TokenIndex | null = null;
let platformFilter: PlatformFilterValue = 'APP';
let whitelist: string[] = [];
let scanCategories: ScanCategorySelection = { token: true, autolayout: true, naming: true };

// Team-wide defaults — colleagues only need to paste their own API key.
const DEFAULT_LLM_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_LLM_MODEL = 'qwen-plus';
let llmConfig: LlmConfig = { baseUrl: DEFAULT_LLM_BASE_URL, apiKey: '', model: DEFAULT_LLM_MODEL };

function postLlmConfig() {
  post({
    type: 'llmConfig',
    config: {
      configured: isLlmConfigured(llmConfig),
      baseUrl: llmConfig.baseUrl,
      model: llmConfig.model,
      hasKey: !!llmConfig.apiKey,
    },
  });
}

async function runNamingSuggestions() {
  const namingV = [...violationsById.values()].filter((v) => v.kind === 'naming-default');
  if (namingV.length === 0) return;
  if (!isLlmConfigured(llmConfig)) {
    figma.notify('请先在设置里填写 LLM 代理地址和模型', { error: true });
    return;
  }

  post({ type: 'namingSuggestionsStart', violationIds: namingV.map((v) => v.id) });

  // Gather context for each flagged node.
  const items = [];
  const idToViolation = new Map<string, string>(); // contextId -> violationId
  for (const v of namingV) {
    const node = await figma.getNodeByIdAsync(v.nodeId);
    if (node && 'type' in node && node.type !== 'PAGE' && node.type !== 'DOCUMENT') {
      const ctx = gatherNamingContext(node as SceneNode);
      items.push(ctx);
      idToViolation.set(ctx.id, v.id);
    }
  }

  // Chunk to keep requests reasonable.
  const CHUNK = 30;
  const results: { violationId: string; name?: string; error?: string }[] = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    const slice = items.slice(i, i + CHUNK);
    try {
      const map = await suggestNames(llmConfig, slice);
      for (const item of slice) {
        const vid = idToViolation.get(item.id)!;
        const name = map.get(item.id);
        results.push(name ? { violationId: vid, name } : { violationId: vid, error: '无建议' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const item of slice) {
        results.push({ violationId: idToViolation.get(item.id)!, error: message });
      }
    }
  }
  post({ type: 'namingSuggestions', results });
}

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
  try {
    const storedLlm = await figma.clientStorage.getAsync(LLM_CONFIG_KEY);
    if (storedLlm && typeof storedLlm === 'object') {
      const o = storedLlm as Record<string, unknown>;
      llmConfig = {
        baseUrl: typeof o.baseUrl === 'string' && o.baseUrl ? o.baseUrl : DEFAULT_LLM_BASE_URL,
        apiKey: typeof o.apiKey === 'string' ? o.apiKey : '',
        model: typeof o.model === 'string' && o.model ? o.model : DEFAULT_LLM_MODEL,
      };
    }
  } catch {
    // ignore — use default
  }
  post({ type: 'whitelistChanged', entries: whitelist });
  post({ type: 'scanCategoriesChanged', categories: scanCategories });
  postLlmConfig();
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
    } else if (msg.type === 'setLlmConfig') {
      // Blank URL/model fall back to team defaults; blank key keeps the existing one.
      llmConfig = {
        baseUrl: msg.baseUrl.trim() || DEFAULT_LLM_BASE_URL,
        model: msg.model.trim() || DEFAULT_LLM_MODEL,
        apiKey: msg.apiKey.trim() || llmConfig.apiKey,
      };
      await figma.clientStorage.setAsync(LLM_CONFIG_KEY, llmConfig);
      postLlmConfig();
      figma.notify('LLM 配置已保存');
    } else if (msg.type === 'requestNamingSuggestions') {
      await runNamingSuggestions();
    } else if (msg.type === 'applyRename') {
      const v = violationsById.get(msg.violationId);
      if (!v) {
        post({ type: 'fixApplied', violationId: msg.violationId, ok: false, error: 'Violation not found' });
        return;
      }
      try {
        const node = await figma.getNodeByIdAsync(v.nodeId);
        if (!node || !('name' in node)) throw new Error('节点不存在');
        (node as SceneNode).name = msg.name;
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
