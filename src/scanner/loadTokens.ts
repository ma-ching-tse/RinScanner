import {
  CollectionInfo,
  ColorToken,
  ColorVariableSummary,
  DataSourceInfo,
  LibraryCollectionInfo,
  TextStyleSummary,
  TextStyleToken,
} from '../types';
import {
  BMDS_COLLECTION_NAME,
  BMDS_VERSION,
  PlatformFilter,
  bmdsTokenId,
  filterColorsByPlatform,
  fullTokenName,
  platformBadge,
} from '../tokens/bmds';

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => {
    const n = Math.round(v * 255);
    return n.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function lineHeightToString(lh: LineHeight): string {
  if (lh.unit === 'AUTO') return 'auto';
  if (lh.unit === 'PERCENT') return `${lh.value}%`;
  return `${lh.value}px`;
}

export function textStyleFingerprint(
  family: string,
  style: string,
  size: number,
  lineHeight: string,
): string {
  return `${family}|${style}|${size}|${lineHeight}`;
}

export interface LoadedColors {
  flat: ColorToken[];
  summaries: ColorVariableSummary[];
  collections: CollectionInfo[];
}

export function loadBmdsColorTokens(filter: PlatformFilter): LoadedColors {
  const flat: ColorToken[] = [];
  const summaries: ColorVariableSummary[] = [];
  const colors = filterColorsByPlatform(filter);

  for (const t of colors) {
    const name = fullTokenName(t);
    const lightId = bmdsTokenId(t.group, t.name, 'Light');
    const darkId = bmdsTokenId(t.group, t.name, 'Dark');

    flat.push({
      id: lightId,
      name,
      hex: `#${t.light.hex.toUpperCase()}`,
      alpha: t.light.alpha,
      source: 'bmds',
      collectionName: BMDS_COLLECTION_NAME,
      group: t.group,
      modeName: 'Light',
    });
    flat.push({
      id: darkId,
      name,
      hex: `#${t.dark.hex.toUpperCase()}`,
      alpha: t.dark.alpha,
      source: 'bmds',
      collectionName: BMDS_COLLECTION_NAME,
      group: t.group,
      modeName: 'Dark',
    });

    summaries.push({
      id: `${t.group}/${t.name}`,
      name,
      shortName: t.name,
      group: t.group,
      source: 'bmds',
      collectionName: BMDS_COLLECTION_NAME,
      platformBadge: t.platforms ? platformBadge(t) : undefined,
      modes: [
        { modeName: 'Light', hex: `#${t.light.hex.toUpperCase()}`, alpha: t.light.alpha },
        { modeName: 'Dark', hex: `#${t.dark.hex.toUpperCase()}`, alpha: t.dark.alpha },
      ],
    });
  }

  const collections: CollectionInfo[] = [
    {
      id: 'bmds-colors',
      name: BMDS_COLLECTION_NAME,
      remote: false,
      variableCount: colors.length,
      source: 'variable',
    },
  ];

  return { flat, summaries, collections };
}

export async function loadSubscribedLibraryCollections(): Promise<LibraryCollectionInfo[]> {
  try {
    const collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    return collections.map((c) => ({ key: c.key, name: c.name, libraryName: c.libraryName }));
  } catch (err) {
    console.warn('Token Scanner: 无法读取 team library variables', err);
    return [];
  }
}

export async function loadTextStyleTokens(): Promise<TextStyleToken[]> {
  const out: TextStyleToken[] = [];
  const styles = await figma.getLocalTextStylesAsync();
  for (const s of styles) {
    const lh = lineHeightToString(s.lineHeight);
    out.push({
      id: s.id,
      name: s.name,
      family: s.fontName.family,
      style: s.fontName.style,
      size: s.fontSize,
      lineHeight: lh,
      fingerprint: textStyleFingerprint(s.fontName.family, s.fontName.style, s.fontSize, lh),
    });
  }
  return out;
}

export function toTextStyleSummary(t: TextStyleToken): TextStyleSummary {
  return {
    id: t.id,
    name: t.name,
    family: t.family,
    style: t.style,
    size: t.size,
    lineHeight: t.lineHeight,
  };
}

export interface TokenIndex {
  colors: ColorToken[];
  colorSummaries: ColorVariableSummary[];
  colorByHex: Map<string, ColorToken>;
  textStyles: TextStyleToken[];
  textByFingerprint: Map<string, TextStyleToken>;
  dataSource: DataSourceInfo;
}

export function colorKey(hex: string, alpha: number): string {
  return `${hex.toUpperCase()}@${alpha.toFixed(3)}`;
}

export async function loadTokenIndex(filter: PlatformFilter): Promise<TokenIndex> {
  const colorResult = loadBmdsColorTokens(filter);
  const [textStyles, subscribed] = await Promise.all([
    loadTextStyleTokens(),
    loadSubscribedLibraryCollections(),
  ]);
  const colorByHex = new Map<string, ColorToken>();
  for (const c of colorResult.flat) {
    const key = colorKey(c.hex, c.alpha);
    if (!colorByHex.has(key)) colorByHex.set(key, c);
  }
  const textByFingerprint = new Map<string, TextStyleToken>();
  for (const t of textStyles) {
    if (!textByFingerprint.has(t.fingerprint)) textByFingerprint.set(t.fingerprint, t);
  }

  const collectionsCopy: CollectionInfo[] = colorResult.collections.slice();
  if (textStyles.length > 0) {
    collectionsCopy.push({
      id: 'local-text-styles',
      name: 'Local Text Styles',
      remote: false,
      variableCount: textStyles.length,
      source: 'style',
    });
  }

  return {
    colors: colorResult.flat,
    colorSummaries: colorResult.summaries,
    colorByHex,
    textStyles,
    textByFingerprint,
    dataSource: {
      fileName: figma.root.name,
      collections: collectionsCopy,
      paintStyleCount: 0,
      textStyleCount: textStyles.length,
      subscribedLibraryCollections: subscribed,
      bmdsVersion: BMDS_VERSION,
      bmdsColorCount: colorResult.flat.length / 2,
    },
  };
}
