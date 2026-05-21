import { loadTokenIndex, toTextStyleSummary } from './scanner/loadTokens';
import { scanSelection } from './scanner/walkNodes';
import { applyFix } from './fixer/applyFix';
import { PlatformFilterValue, PluginMessage, UIMessage, Violation } from './types';
import type { TokenIndex } from './scanner/loadTokens';

figma.showUI(__html__, { width: 360, height: 680, themeColors: true });

const PLATFORM_FILTER_KEY = 'bmds-platform-filter';
const violationsById = new Map<string, Violation>();
let currentTokens: TokenIndex | null = null;
let platformFilter: PlatformFilterValue = 'APP';

function isValidFilter(v: unknown): v is PlatformFilterValue {
  return v === 'APP' || v === 'Web' || v === 'Both';
}

function post(msg: PluginMessage) {
  figma.ui.postMessage(msg);
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
    post({ type: 'scanResult', violations: [], scanned: 0, scope: '无选中' });
    return;
  }
  const tokens = currentTokens ?? (await loadAndPostTokens());
  const result = await scanSelection(selection, tokens, (processed, total) => {
    post({ type: 'scanProgress', processed, total });
  });
  for (const v of result.violations) violationsById.set(v.id, v);
  post({
    type: 'scanResult',
    violations: result.violations,
    scanned: result.scanned,
    scope: describeSelection(selection),
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
    }
  } catch (err) {
    figma.notify(`Token Scanner: ${err instanceof Error ? err.message : String(err)}`, { error: true });
  }
};
