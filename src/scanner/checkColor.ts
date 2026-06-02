import { ColorToken, Suggestion, Violation } from '../types';
import { colorKey } from './loadTokens';
import { rgbToHex } from './loadTokens';
import { parseBmdsTokenId } from '../tokens/bmds';

/** Figma variable slash-path name for a BMDS token id, e.g. "Function/CEX/Brand". */
function tokenVarName(tokenId: string): string | null {
  const p = parseBmdsTokenId(tokenId);
  return p ? `${p.group}/${p.name}` : null;
}

const NEAR_THRESHOLD = 8;
const ALPHA_EPSILON = 0.01;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function colorDistance(a: string, b: string): number {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const dr = ca.r - cb.r;
  const dg = ca.g - cb.g;
  const db = ca.b - cb.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function alphaMatches(a: number, b: number): boolean {
  return Math.abs(a - b) <= ALPHA_EPSILON;
}

function suggestForPaint(
  hex: string,
  alpha: number,
  tokens: ColorToken[],
  byKey: Map<string, ColorToken>,
): Suggestion | undefined {
  const exact = byKey.get(colorKey(hex, alpha));
  if (exact) {
    return {
      tokenId: exact.id,
      tokenName: tokenLabel(exact),
      confidence: 'exact',
      distance: 0,
    };
  }
  let best: { token: ColorToken; distance: number } | null = null;
  for (const t of tokens) {
    if (!alphaMatches(t.alpha, alpha)) continue;
    const d = colorDistance(hex, t.hex);
    if (!best || d < best.distance) best = { token: t, distance: d };
  }
  if (best && best.distance <= NEAR_THRESHOLD) {
    return {
      tokenId: best.token.id,
      tokenName: tokenLabel(best.token),
      confidence: 'near',
      distance: best.distance,
    };
  }
  return undefined;
}

function tokenLabel(t: ColorToken): string {
  const mode = t.modeName ? ` (${t.modeName})` : '';
  return `${t.name}${mode}`;
}

function isPaintBoundToVariable(paint: Paint): boolean {
  const bound = (paint as Paint & { boundVariables?: Record<string, unknown> }).boundVariables;
  return !!(bound && bound.color);
}

export interface ColorTarget {
  field: 'fills' | 'strokes';
  paints: readonly Paint[];
  boundStyleId: string | typeof figma.mixed | undefined;
}

export function getColorTargets(node: SceneNode): ColorTarget[] {
  const targets: ColorTarget[] = [];
  if ('fills' in node && node.fills !== figma.mixed && Array.isArray(node.fills)) {
    const styleId = 'fillStyleId' in node ? node.fillStyleId : undefined;
    targets.push({ field: 'fills', paints: node.fills as readonly Paint[], boundStyleId: styleId });
  }
  if ('strokes' in node && Array.isArray(node.strokes)) {
    const styleId = 'strokeStyleId' in node ? node.strokeStyleId : undefined;
    targets.push({ field: 'strokes', paints: node.strokes as readonly Paint[], boundStyleId: styleId });
  }
  return targets;
}

export function checkNodeColors(
  node: SceneNode,
  tokens: ColorToken[],
  byKey: Map<string, ColorToken>,
  allowFills = true,
  allowStrokes = true,
  bindableNames: Set<string> = new Set(),
): Violation[] {
  const violations: Violation[] = [];
  const targets = getColorTargets(node);

  for (const target of targets) {
    if (target.field === 'fills' && !allowFills) continue;
    if (target.field === 'strokes' && !allowStrokes) continue;
    if (target.boundStyleId && target.boundStyleId !== '' && target.boundStyleId !== figma.mixed) {
      continue;
    }
    target.paints.forEach((paint, index) => {
      if (paint.type !== 'SOLID') return;
      if (!paint.visible && paint.visible !== undefined) return;
      if (isPaintBoundToVariable(paint)) return;

      const hex = rgbToHex(paint.color.r, paint.color.g, paint.color.b);
      const alpha = paint.opacity ?? 1;
      const suggestion = suggestForPaint(hex, alpha, tokens, byKey);

      // Value already matches a token exactly. It's still a raw value (not bound
      // to a variable), so MCP/Dev Mode would hardcode it. Flag it ONLY when the
      // matching Figma variable is actually available to bind — otherwise leave
      // it (binding isn't possible, so flagging would be unactionable noise).
      let unboundButCorrect = false;
      if (suggestion && suggestion.confidence === 'exact') {
        const vn = tokenVarName(suggestion.tokenId);
        const bindable = vn ? bindableNames.has(vn) : false;
        if (!bindable) return;
        unboundButCorrect = true;
      }

      const displayValue = alpha < 1 ? `${hex} · ${Math.round(alpha * 100)}%` : hex;
      violations.push({
        id: `${node.id}:${target.field}:${index}`,
        nodeId: node.id,
        nodeName: node.name,
        category: 'token',
        kind: target.field === 'fills' ? 'color-fill' : 'color-stroke',
        currentValue: displayValue,
        message: unboundButCorrect ? '值对但未绑定变量，MCP 会硬编码 — 建议绑定' : undefined,
        paintIndex: index,
        colorHex: hex,
        colorAlpha: alpha,
        suggestion,
        fix: suggestion ? { kind: 'apply-token' } : undefined,
      });
    });
  }
  return violations;
}
