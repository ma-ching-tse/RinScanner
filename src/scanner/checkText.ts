import { Suggestion, TextStyleToken, Violation } from '../types';
import { textStyleFingerprint } from './loadTokens';

function lineHeightString(lh: LineHeight | typeof figma.mixed): string {
  if (lh === figma.mixed) return 'mixed';
  if (lh.unit === 'AUTO') return 'auto';
  if (lh.unit === 'PERCENT') return `${lh.value}%`;
  return `${lh.value}px`;
}

export function checkTextNode(
  node: TextNode,
  textStyles: TextStyleToken[],
  byFingerprint: Map<string, TextStyleToken>,
): Violation | null {
  const styleId = node.textStyleId;
  if (styleId && styleId !== '' && styleId !== figma.mixed) {
    return null;
  }

  const fontName = node.fontName;
  const fontSize = node.fontSize;
  const lineHeight = node.lineHeight;

  if (fontName === figma.mixed || fontSize === figma.mixed) {
    return {
      id: `${node.id}:text`,
      nodeId: node.id,
      nodeName: node.name,
      category: 'token',
      kind: 'text',
      currentValue: 'Mixed values — needs manual review',
    };
  }

  const lh = lineHeightString(lineHeight);
  const fingerprint = textStyleFingerprint(fontName.family, fontName.style, fontSize as number, lh);
  const current = `${fontName.family} ${fontName.style} ${fontSize}/${lh}`;

  const exact = byFingerprint.get(fingerprint);
  if (exact) {
    const suggestion: Suggestion = {
      tokenId: exact.id,
      tokenName: exact.name,
      confidence: 'exact',
    };
    return {
      id: `${node.id}:text`,
      nodeId: node.id,
      nodeName: node.name,
      category: 'token',
      kind: 'text',
      currentValue: current,
      suggestion,
    };
  }

  const partial = textStyles.filter(
    (t) => t.family === fontName.family && t.size === fontSize,
  );
  const candidates: Suggestion[] = partial.slice(0, 5).map((t) => ({
    tokenId: t.id,
    tokenName: t.name,
    confidence: 'partial',
  }));

  return {
    id: `${node.id}:text`,
    nodeId: node.id,
    nodeName: node.name,
    category: 'token',
    kind: 'text',
    currentValue: current,
    candidates: candidates.length > 0 ? candidates : undefined,
  };
}
