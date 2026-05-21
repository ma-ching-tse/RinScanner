import { Violation } from '../types';
import { TokenIndex } from './loadTokens';
import { checkNodeColors } from './checkColor';
import { checkTextNode } from './checkText';

const SCANNABLE_TYPES: NodeType[] = [
  'TEXT',
  'RECTANGLE',
  'FRAME',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'VECTOR',
  'ELLIPSE',
  'POLYGON',
  'STAR',
  'LINE',
  'BOOLEAN_OPERATION',
];

function isEffectivelyVisible(node: SceneNode): boolean {
  let current: BaseNode | null = node;
  while (current && 'visible' in current) {
    if (!(current as SceneNode).visible) return false;
    current = current.parent;
  }
  return true;
}

export interface ScanResult {
  violations: Violation[];
  scanned: number;
}

export async function scanSelection(
  roots: readonly SceneNode[],
  tokens: TokenIndex,
  onProgress?: (processed: number, total: number) => void,
): Promise<ScanResult> {
  await figma.currentPage.loadAsync();

  const collected: SceneNode[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    if (!seen.has(root.id) && SCANNABLE_TYPES.includes(root.type)) {
      collected.push(root);
      seen.add(root.id);
    }
    if ('findAllWithCriteria' in root) {
      const descendants = (root as ChildrenMixin & SceneNode).findAllWithCriteria({ types: SCANNABLE_TYPES });
      for (const d of descendants) {
        if (!seen.has(d.id)) {
          collected.push(d);
          seen.add(d.id);
        }
      }
    }
  }

  const violations: Violation[] = [];
  let scanned = 0;
  const total = collected.length;

  for (let i = 0; i < collected.length; i++) {
    const node = collected[i];
    if (!isEffectivelyVisible(node)) continue;
    scanned++;

    const colorViolations = checkNodeColors(node, tokens.colors, tokens.colorByHex);
    violations.push(...colorViolations);

    if (node.type === 'TEXT') {
      const textViolation = checkTextNode(node as TextNode, tokens.textStyles, tokens.textByFingerprint);
      if (textViolation) violations.push(textViolation);
    }

    if (i % 50 === 0) {
      onProgress?.(i + 1, total);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(total, total);

  return { violations, scanned };
}
