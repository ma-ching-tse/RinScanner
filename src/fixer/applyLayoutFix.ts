import { Violation } from '../types';

type AutoLayoutFrame = FrameNode | ComponentNode;

interface Boxed {
  node: SceneNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Best-effort (Beta): turn a plain frame into an auto-layout frame, inferring
 * direction / spacing / padding from the children's current geometry. This is
 * essentially scripting Figma's native "Add auto layout".
 */
function applyInferredAutoLayout(frame: AutoLayoutFrame): void {
  const kids = frame.children.filter((c) => c.visible);
  if (kids.length === 0) {
    frame.layoutMode = 'VERTICAL';
    return;
  }

  const boxes: Boxed[] = kids.map((c) => ({ node: c, x: c.x, y: c.y, w: c.width, h: c.height }));

  // Count overlaps along each axis; children sit along the axis with fewer overlaps.
  const byX = [...boxes].sort((a, b) => a.x - b.x);
  const byY = [...boxes].sort((a, b) => a.y - b.y);
  let xOverlap = 0;
  let yOverlap = 0;
  for (let i = 1; i < byX.length; i++) {
    if (byX[i].x < byX[i - 1].x + byX[i - 1].w) xOverlap++;
  }
  for (let i = 1; i < byY.length; i++) {
    if (byY[i].y < byY[i - 1].y + byY[i - 1].h) yOverlap++;
  }
  const horizontal = xOverlap <= yOverlap;
  const sorted = horizontal ? byX : byY;

  // Spacing = average gap between adjacent children along the axis.
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const gap = horizontal ? cur.x - (prev.x + prev.w) : cur.y - (prev.y + prev.h);
    gaps.push(Math.max(0, Math.round(gap)));
  }
  const spacing = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;

  // Padding from the frame edges to the children's bounding box.
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  const padLeft = Math.max(0, Math.round(minX));
  const padTop = Math.max(0, Math.round(minY));
  const padRight = Math.max(0, Math.round(frame.width - maxX));
  const padBottom = Math.max(0, Math.round(frame.height - maxY));

  // Reorder children to match visual order so auto-layout doesn't scramble them.
  for (const b of sorted) frame.appendChild(b.node);

  frame.layoutMode = horizontal ? 'HORIZONTAL' : 'VERTICAL';
  frame.itemSpacing = spacing;
  frame.paddingLeft = padLeft;
  frame.paddingRight = padRight;
  frame.paddingTop = padTop;
  frame.paddingBottom = padBottom;
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'FIXED';
  frame.primaryAxisAlignItems = 'MIN';
  frame.counterAxisAlignItems = 'MIN';
}

/** Best-effort (Beta): replace a Group with a Frame (+ auto-layout), preserving positions. */
function convertGroupToFrame(group: GroupNode): SceneNode {
  const parent = group.parent;
  if (!parent || !('insertChild' in parent)) throw new Error('Group 父节点不支持转换');
  const index = parent.children.indexOf(group);

  const frame = figma.createFrame();
  frame.name = group.name;
  frame.x = group.x;
  frame.y = group.y;
  frame.resize(Math.max(0.01, group.width), Math.max(0.01, group.height));
  frame.fills = [];
  frame.clipsContent = false;
  (parent as ChildrenMixin).insertChild(index, frame);

  const children = [...group.children];
  const absById = new Map(children.map((c) => [c.id, c.absoluteTransform]));
  const frameAbs = frame.absoluteTransform;
  for (const child of children) frame.appendChild(child);
  for (const child of children) {
    const t = absById.get(child.id);
    if (t) {
      child.x = t[0][2] - frameAbs[0][2];
      child.y = t[1][2] - frameAbs[1][2];
    }
  }

  group.remove();
  applyInferredAutoLayout(frame);
  return frame;
}

/** Returns the node to select after the fix (may be a new node for group conversion). */
export async function applyLayoutFix(violation: Violation): Promise<SceneNode> {
  const node = await figma.getNodeByIdAsync(violation.nodeId);
  if (!node || !('type' in node)) throw new Error('节点不存在（可能已被删除）');

  if (violation.kind === 'autolayout-group') {
    if (node.type !== 'GROUP') throw new Error('该节点已不是 Group');
    return convertGroupToFrame(node as GroupNode);
  }

  if (violation.kind === 'autolayout-none') {
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT') throw new Error('该节点不是 Frame');
    applyInferredAutoLayout(node as AutoLayoutFrame);
    return node as SceneNode;
  }

  throw new Error(`不支持的布局修复: ${violation.kind}`);
}
