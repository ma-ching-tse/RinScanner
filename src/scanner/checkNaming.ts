import { Violation } from '../types';

/**
 * Deterministic naming check: catch un-renamed default layer names that Figma
 * auto-assigns. Reliable at finding defaults; it cannot judge whether a custom
 * name is *good* — that's the LLM-assisted layer (added separately).
 */

// Figma's auto-generated names, optionally followed by a number and/or " copy".
const DEFAULT_NAME_RE =
  /^(Frame|Group|Rectangle|Ellipse|Line|Vector|Star|Polygon|Component|Instance|Slice|Image|Union|Subtract|Intersect|Exclude|Mask group|Arrow)(\s+\d+)?(\s+copy(\s+\d+)?)?$/i;

// Types worth naming (containers / shapes that become elements in code).
const NAMEABLE_TYPES: NodeType[] = [
  'FRAME',
  'GROUP',
  'COMPONENT',
  'COMPONENT_SET',
  'RECTANGLE',
  'ELLIPSE',
  'POLYGON',
  'STAR',
  'VECTOR',
  'LINE',
  'BOOLEAN_OPERATION',
];

export function isDefaultName(name: string): boolean {
  return DEFAULT_NAME_RE.test(name.trim());
}

export function checkNodeNaming(node: SceneNode): Violation | null {
  if (!NAMEABLE_TYPES.includes(node.type)) return null;
  if (!isDefaultName(node.name)) return null;

  return {
    id: `${node.id}:naming`,
    nodeId: node.id,
    nodeName: node.name,
    category: 'naming',
    kind: 'naming-default',
    currentValue: node.name,
    message: '默认图层名，MCP 会用它当代码标识符 — 建议改成语义化名称',
    // No deterministic fix; a suggested rename is filled in by the LLM layer.
  };
}
