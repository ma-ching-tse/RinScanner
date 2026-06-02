import { ScanCategorySelection, Violation } from '../types';
import { TokenIndex } from './loadTokens';
import { checkNodeColors } from './checkColor';
import { checkTextNode } from './checkText';
import { checkNodeLayout } from './checkLayout';
import { checkNodeNaming } from './checkNaming';

const SCANNABLE_TYPES: NodeType[] = [
  'TEXT',
  'RECTANGLE',
  'FRAME',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'GROUP',
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
  skipped: number;
}

/**
 * Resolve a component-ish node's "whitelist name" — prefer the variant set name
 * (so all variants of a component are matched by one entry), else the component name.
 */
export async function resolveWhitelistName(node: SceneNode): Promise<string | null> {
  if (node.type === 'INSTANCE') {
    const main = await (node as InstanceNode).getMainComponentAsync();
    if (!main) return null;
    if (main.parent && main.parent.type === 'COMPONENT_SET') return main.parent.name;
    return main.name;
  }
  if (node.type === 'COMPONENT') {
    if (node.parent && node.parent.type === 'COMPONENT_SET') return node.parent.name;
    return node.name;
  }
  if (node.type === 'COMPONENT_SET') {
    return node.name;
  }
  return null;
}

/**
 * Identify instances whose entire subtree should be skipped:
 *  - the main component comes from an external library (a design-system
 *    component — already tokenized at the source), or
 *  - the component name is in the manual whitelist.
 */
async function findSkipRoots(
  nodes: readonly SceneNode[],
  whitelist: readonly string[],
): Promise<Set<string>> {
  const roots = new Set<string>();
  const lowered = new Set(whitelist.map((w) => w.toLowerCase()));
  const instances = nodes.filter((n): n is InstanceNode => n.type === 'INSTANCE');

  await Promise.all(
    instances.map(async (inst) => {
      let main: ComponentNode | null = null;
      try {
        main = await inst.getMainComponentAsync();
      } catch {
        return;
      }
      if (!main) return;

      // Design-system library component → trust it entirely.
      if (main.remote === true) {
        roots.add(inst.id);
        return;
      }

      // Manual whitelist (variant → component set name).
      const name = main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent.name : main.name;
      if (lowered.has(name.toLowerCase())) {
        roots.add(inst.id);
      }
    }),
  );
  return roots;
}

function hasSkippedAncestor(node: SceneNode, roots: Set<string>): boolean {
  let current: BaseNode | null = node;
  while (current) {
    if (roots.has(current.id)) return true;
    current = current.parent;
  }
  return false;
}

// Override-aware scanning: values inside a component instance that are inherited
// from the main component are the library's responsibility, not the designer's.
// We only flag properties the designer actually overrode on the instance.
const TEXT_OVERRIDE_FIELDS = ['fontName', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'];

interface ScanGate {
  fills: boolean;
  strokes: boolean;
  text: boolean;
}

const ALL_OPEN: ScanGate = { fills: true, strokes: true, text: true };

/** Collect every overridden (nodeId -> fields) pair across all instances in the set. */
function buildOverrideMap(nodes: readonly SceneNode[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const node of nodes) {
    if (node.type !== 'INSTANCE') continue;
    const overrides = (node as InstanceNode).overrides;
    for (const entry of overrides) {
      let set = map.get(entry.id);
      if (!set) {
        set = new Set<string>();
        map.set(entry.id, set);
      }
      for (const field of entry.overriddenFields) set.add(field as string);
    }
  }
  return map;
}

function isInsideInstance(node: SceneNode): boolean {
  let current: BaseNode | null = node;
  while (current) {
    if (current.type === 'INSTANCE') return true;
    current = current.parent;
  }
  return false;
}

function computeGate(node: SceneNode, overrideMap: Map<string, Set<string>>): ScanGate {
  if (!isInsideInstance(node)) return ALL_OPEN;
  const fields = overrideMap.get(node.id);
  if (!fields) return { fills: false, strokes: false, text: false };
  return {
    fills: fields.has('fills'),
    strokes: fields.has('strokes'),
    text: TEXT_OVERRIDE_FIELDS.some((f) => fields.has(f)),
  };
}

export async function scanSelection(
  roots: readonly SceneNode[],
  tokens: TokenIndex,
  whitelist: readonly string[] = [],
  categories: ScanCategorySelection = { token: true, autolayout: true, naming: true },
  onProgress?: (processed: number, total: number) => void,
): Promise<ScanResult> {
  await figma.currentPage.loadAsync();

  const collectedRaw: SceneNode[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    if (!seen.has(root.id) && SCANNABLE_TYPES.includes(root.type)) {
      collectedRaw.push(root);
      seen.add(root.id);
    }
    if ('findAllWithCriteria' in root) {
      const descendants = (root as ChildrenMixin & SceneNode).findAllWithCriteria({ types: SCANNABLE_TYPES });
      for (const d of descendants) {
        if (!seen.has(d.id)) {
          collectedRaw.push(d);
          seen.add(d.id);
        }
      }
    }
  }

  // Skip design-system (library) component instances and whitelisted components,
  // along with everything beneath them.
  const skipRoots = await findSkipRoots(collectedRaw, whitelist);
  let collected = collectedRaw;
  let skipped = 0;
  if (skipRoots.size > 0) {
    collected = collectedRaw.filter((n) => !hasSkippedAncestor(n, skipRoots));
    skipped = collectedRaw.length - collected.length;
  }

  // Map of designer-overridden fields per node, so we can ignore inherited
  // component values and only flag local overrides.
  const overrideMap = buildOverrideMap(collected);

  const violations: Violation[] = [];
  let scanned = 0;
  const total = collected.length;

  for (let i = 0; i < collected.length; i++) {
    const node = collected[i];
    if (!isEffectivelyVisible(node)) continue;

    const gate = computeGate(node, overrideMap);
    let checked = false;

    if (categories.token && (gate.fills || gate.strokes)) {
      checked = true;
      const colorViolations = checkNodeColors(
        node,
        tokens.colors,
        tokens.colorByHex,
        gate.fills,
        gate.strokes,
      );
      violations.push(...colorViolations);
    }

    if (categories.token && node.type === 'TEXT' && gate.text) {
      checked = true;
      const textViolation = checkTextNode(node as TextNode, tokens.textStyles, tokens.textByFingerprint);
      if (textViolation) violations.push(textViolation);
    }

    // Structural rules (auto-layout, naming) — only on nodes the designer owns
    // here, i.e. not inherited inside a component instance.
    if ((categories.autolayout || categories.naming) && !isInsideInstance(node)) {
      checked = true;
      if (categories.autolayout) {
        violations.push(...checkNodeLayout(node));
      }
      if (categories.naming) {
        const namingViolation = checkNodeNaming(node);
        if (namingViolation) violations.push(namingViolation);
      }
    }

    if (checked) scanned++;

    if (i % 50 === 0) {
      onProgress?.(i + 1, total);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(total, total);

  return { violations, scanned, skipped };
}
