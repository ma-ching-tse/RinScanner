/// <reference path="../node_modules/@figma/plugin-typings/index.d.ts" />

export type TokenSource = 'variable' | 'style' | 'bmds';

export interface ColorToken {
  id: string;
  name: string;
  hex: string;
  alpha: number;
  source: TokenSource;
  collectionName?: string;
  modeName?: string;
  group?: string;
}

export interface ColorVariableSummary {
  id: string;
  name: string;
  shortName?: string;
  group?: string;
  source: TokenSource;
  collectionName?: string;
  collectionId?: string;
  remote?: boolean;
  platformBadge?: string;
  modes: { modeName: string; hex: string; alpha: number }[];
}

export interface CollectionInfo {
  id: string;
  name: string;
  remote: boolean;
  variableCount: number;
  source: 'variable' | 'style';
}

export interface LibraryCollectionInfo {
  key: string;
  name: string;
  libraryName: string;
}

export interface DataSourceInfo {
  fileName: string;
  collections: CollectionInfo[];
  paintStyleCount: number;
  textStyleCount: number;
  subscribedLibraryCollections: LibraryCollectionInfo[];
  bmdsVersion: string;
  bmdsColorCount: number;
}

export interface TextStyleToken {
  id: string;
  name: string;
  family: string;
  style: string;
  size: number;
  lineHeight: string;
  fingerprint: string;
}

export type IssueCategory = 'token' | 'autolayout' | 'naming';

export type ViolationKind =
  | 'color-fill'
  | 'color-stroke'
  | 'text'
  | 'autolayout-group'
  | 'autolayout-none'
  | 'naming-default';

export type FixKind = 'apply-token' | 'add-autolayout' | 'convert-group' | 'rename';

export interface FixInfo {
  kind: FixKind;
  /** Beta = best-effort, may rearrange / not be perfect; user should eyeball + undo. */
  beta?: boolean;
  /** Proposed new name for a rename fix. */
  rename?: string;
}

export interface Suggestion {
  tokenId: string;
  tokenName: string;
  confidence: 'exact' | 'near' | 'partial';
  distance?: number;
}

export interface Violation {
  id: string;
  nodeId: string;
  nodeName: string;
  category: IssueCategory;
  kind: ViolationKind;
  currentValue: string;
  message?: string;
  paintIndex?: number;
  colorHex?: string;
  colorAlpha?: number;
  suggestion?: Suggestion;
  candidates?: Suggestion[];
  fix?: FixInfo;
}

export type PlatformFilterValue = 'APP' | 'Web' | 'Both';

export interface ScanCategorySelection {
  token: boolean;
  autolayout: boolean;
  naming: boolean;
}

export type UIMessage =
  | { type: 'scan' }
  | { type: 'reloadTokens' }
  | { type: 'setPlatformFilter'; filter: PlatformFilterValue }
  | { type: 'setScanCategories'; categories: ScanCategorySelection }
  | { type: 'addSelectedToWhitelist' }
  | { type: 'removeFromWhitelist'; name: string }
  | { type: 'selectNode'; nodeId: string }
  | { type: 'applyFix'; violationId: string; tokenId: string }
  | { type: 'applyLayoutFix'; violationId: string }
  | { type: 'requestNamingSuggestions' }
  | { type: 'applyRename'; violationId: string; name: string }
  | { type: 'setLlmConfig'; baseUrl: string; apiKey: string; model: string };

export interface LlmConfigPublic {
  configured: boolean;
  baseUrl: string;
  model: string;
  hasKey: boolean;
}

export interface NamingSuggestionResult {
  violationId: string;
  name?: string;
  error?: string;
}

export interface TextStyleSummary {
  id: string;
  name: string;
  family: string;
  style: string;
  size: number;
  lineHeight: string;
}

export type PluginMessage =
  | {
      type: 'tokensReady';
      colors: ColorVariableSummary[];
      textStyles: TextStyleSummary[];
      dataSource: DataSourceInfo;
      platformFilter: PlatformFilterValue;
      platformDivergence: boolean;
    }
  | { type: 'selectionChanged'; count: number; rootName: string | null }
  | { type: 'whitelistChanged'; entries: string[] }
  | { type: 'scanCategoriesChanged'; categories: ScanCategorySelection }
  | { type: 'scanProgress'; processed: number; total: number }
  | { type: 'scanResult'; violations: Violation[]; scanned: number; scope: string; skipped: number }
  | { type: 'fixApplied'; violationId: string; ok: boolean; error?: string }
  | { type: 'llmConfig'; config: LlmConfigPublic }
  | { type: 'namingSuggestionsStart'; violationIds: string[] }
  | { type: 'namingSuggestions'; results: NamingSuggestionResult[] };
