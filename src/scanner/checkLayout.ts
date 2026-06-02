import { Violation } from '../types';

/**
 * Structural "auto-layout" rules — hard rules only (high confidence, low noise):
 *  - GROUP used instead of a Frame (groups can't carry auto-layout → bad codegen)
 *  - a Frame with multiple children but no auto-layout (layoutMode === 'NONE')
 *
 * Both produce a Beta fix (best-effort, may rearrange — user should eyeball + undo).
 */

function visibleChildCount(node: ChildrenMixin): number {
  return node.children.filter((c) => c.visible).length;
}

export function checkNodeLayout(node: SceneNode): Violation[] {
  const out: Violation[] = [];

  if (node.type === 'GROUP') {
    out.push({
      id: `${node.id}:layout-group`,
      nodeId: node.id,
      nodeName: node.name,
      category: 'autolayout',
      kind: 'autolayout-group',
      currentValue: 'Group',
      message: '用了 Group，建议改成 Frame + auto-layout',
      fix: { kind: 'convert-group', beta: true },
    });
    return out;
  }

  if (node.type === 'FRAME' || node.type === 'COMPONENT') {
    const frame = node as FrameNode | ComponentNode;
    if (frame.layoutMode === 'NONE' && visibleChildCount(frame) >= 2) {
      out.push({
        id: `${node.id}:layout-none`,
        nodeId: node.id,
        nodeName: node.name,
        category: 'autolayout',
        kind: 'autolayout-none',
        currentValue: '多个子元素，未用 auto-layout',
        message: '容器有多个子元素却没用 auto-layout，MCP 可能生成绝对定位',
        fix: { kind: 'add-autolayout', beta: true },
      });
    }
  }

  return out;
}
