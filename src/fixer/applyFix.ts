import { findBmdsToken, parseBmdsTokenId } from '../tokens/bmds';
import { Violation } from '../types';

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

async function applyBmdsColorFix(violation: Violation, tokenId: string): Promise<void> {
  const parsed = parseBmdsTokenId(tokenId);
  if (!parsed) throw new Error(`Invalid BMDS token id: ${tokenId}`);
  const token = findBmdsToken(parsed.group, parsed.name);
  if (!token) throw new Error(`BMDS token not found: ${parsed.group}/${parsed.name}`);
  const variant = parsed.mode === 'Light' ? token.light : token.dark;

  const node = await figma.getNodeByIdAsync(violation.nodeId);
  if (!node) throw new Error('Node not found (may have been deleted)');

  const isFill = violation.kind === 'color-fill';
  const field: 'fills' | 'strokes' = isFill ? 'fills' : 'strokes';
  if (!(field in node)) throw new Error(`Node does not support ${field}`);

  const target = node as GeometryMixin & SceneNode;
  const paintsRaw = target[field];
  if (paintsRaw === figma.mixed || !Array.isArray(paintsRaw)) {
    throw new Error('Mixed paints — manual fix required');
  }

  const idx = violation.paintIndex ?? 0;
  const next = (paintsRaw as Paint[]).slice();
  const current = next[idx];
  if (!current || current.type !== 'SOLID') throw new Error('Target paint is not solid');

  const rgb = hexToRgb01(variant.hex);
  next[idx] = {
    type: 'SOLID',
    color: rgb,
    opacity: variant.alpha,
    visible: current.visible,
    blendMode: current.blendMode,
  };
  target[field] = next;
}

export async function applyFix(violation: Violation, tokenId: string): Promise<void> {
  if (tokenId.startsWith('bmds:')) {
    await applyBmdsColorFix(violation, tokenId);
    return;
  }

  const node = await figma.getNodeByIdAsync(violation.nodeId);
  if (!node) throw new Error('Node not found (may have been deleted)');
  if (!('type' in node)) throw new Error('Invalid node');

  if (violation.kind === 'text') {
    if (node.type !== 'TEXT') throw new Error('Expected TEXT node');
    await (node as TextNode).setTextStyleIdAsync(tokenId);
    return;
  }

  throw new Error(`Unsupported tokenId for color fix: ${tokenId}`);
}
