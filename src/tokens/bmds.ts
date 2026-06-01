export type BmdsPlatform = 'APP' | 'Web';
export type PlatformFilter = 'APP' | 'Web' | 'Both';
export type BmdsMode = 'Light' | 'Dark';

export interface BmdsColorVariant {
  hex: string;
  alpha: number;
}

export interface BmdsColorToken {
  group: string;
  name: string;
  // 缺省 = 两端通用。仅当 APP 和 Web 真正分歧时填具体平台。
  platforms?: BmdsPlatform[];
  light: BmdsColorVariant;
  dark: BmdsColorVariant;
}

export const BMDS_VERSION = 'BMDS Color Tokens v1';
export const BMDS_COLLECTION_NAME = 'BMDS Colors';
export const BMDS_MODE_NAMES: readonly BmdsMode[] = ['Light', 'Dark'];

export const BMDS_COLORS: BmdsColorToken[] = [
  { group: 'Text', name: 'Primary',    light: { hex: '0F0F0F', alpha: 1 }, dark: { hex: 'F3F3F3', alpha: 1 } },
  { group: 'Text', name: 'Secondary',  light: { hex: 'B0B0B0', alpha: 1 }, dark: { hex: '787878', alpha: 1 } },
  { group: 'Text', name: 'Third',      light: { hex: 'CCCCCC', alpha: 1 }, dark: { hex: '4D4D4D', alpha: 1 } },
  { group: 'Text', name: 'Btn Text',   light: { hex: 'FFFFFF', alpha: 1 }, dark: { hex: '1C1E1F', alpha: 1 } },

  { group: 'Bg', name: 'Border',           light: { hex: 'E8E8E9', alpha: 1 },    dark: { hex: '2C2F32', alpha: 1 } },
  { group: 'Bg', name: 'Divider',          light: { hex: 'F3F4F7', alpha: 1 },    dark: { hex: '2C2F32', alpha: 1 } },
  { group: 'Bg', name: 'Bg',               light: { hex: 'FFFFFF', alpha: 1 },    dark: { hex: '000000', alpha: 1 } },
  { group: 'Bg', name: 'Bgline',           light: { hex: 'F3F4F7', alpha: 1 },    dark: { hex: '262729', alpha: 1 } },
  { group: 'Bg', name: 'Bgline2',          light: { hex: 'F4F4F4', alpha: 1 },    dark: { hex: '1B1D1F', alpha: 1 } },
  { group: 'Bg', name: 'Pop',              light: { hex: '363636', alpha: 1 },    dark: { hex: 'E5E5E5', alpha: 1 } },
  { group: 'Bg', name: 'Dialog Drawer Bg', light: { hex: 'FFFFFF', alpha: 1 },    dark: { hex: '141517', alpha: 1 } },
  { group: 'Bg', name: 'Tab Select',       light: { hex: 'E8E8E9', alpha: 1 },    dark: { hex: '2C2F32', alpha: 1 } },
  { group: 'Bg', name: 'Carousel',         light: { hex: 'FFFFFF', alpha: 0.2 },  dark: { hex: '1A1B1F', alpha: 0.2 } },
  { group: 'Bg', name: 'Carousel 2',       light: { hex: 'FFFFFF', alpha: 0 },    dark: { hex: '1A1B1F', alpha: 0 } },
  { group: 'Bg', name: 'Mask',             light: { hex: '000000', alpha: 0.7 },  dark: { hex: '000000', alpha: 0.7 } },

  { group: 'Function/CEX', name: 'Brand',      light: { hex: '03B2BD', alpha: 1 },    dark: { hex: '00F8F8', alpha: 1 } },
  { group: 'Function/CEX', name: 'Brand bg',   light: { hex: '03B2BD', alpha: 0.1 },  dark: { hex: '00F8F8', alpha: 0.2 } },
  { group: 'Function/CEX', name: 'Sell',       light: { hex: 'FA3B61', alpha: 1 },    dark: { hex: 'FA3B61', alpha: 1 } },
  { group: 'Function/CEX', name: 'Sell bg',    light: { hex: 'FA3B61', alpha: 0.1 },  dark: { hex: 'FA3B61', alpha: 0.2 } },
  { group: 'Function/CEX', name: 'Buy',        light: { hex: '13C287', alpha: 1 },    dark: { hex: '13C287', alpha: 1 } },
  { group: 'Function/CEX', name: 'Buy bg',     light: { hex: '13C287', alpha: 0.1 },  dark: { hex: '13C287', alpha: 0.2 } },
  { group: 'Function/CEX', name: 'Warning',    light: { hex: 'F19D1E', alpha: 1 },    dark: { hex: 'F19D1E', alpha: 1 } },
  { group: 'Function/CEX', name: 'Warning bg', light: { hex: 'F19D1E', alpha: 0.1 },  dark: { hex: 'F19D1E', alpha: 0.2 } },

  { group: 'Function/DEX', name: 'Brand',       light: { hex: '62AC1D', alpha: 1 },    dark: { hex: 'A0FF46', alpha: 1 } },
  { group: 'Function/DEX', name: 'Brand bg',    light: { hex: '62AC1D', alpha: 0.1 },  dark: { hex: 'A0FF46', alpha: 0.2 } },
  { group: 'Function/DEX', name: 'Brand Popup', light: { hex: '62AC1D', alpha: 0.4 },  dark: { hex: 'A0FF46', alpha: 0.4 } },
  { group: 'Function/DEX', name: 'Sell',        light: { hex: 'C32574', alpha: 1 },    dark: { hex: 'FF5EAE', alpha: 1 } },
  { group: 'Function/DEX', name: 'Sell bg',     light: { hex: 'C32574', alpha: 0.1 },  dark: { hex: 'FF5EAE', alpha: 0.2 } },
  { group: 'Function/DEX', name: 'Buy',         light: { hex: '5EAC1D', alpha: 1 },    dark: { hex: 'A0FF46', alpha: 1 } },
  { group: 'Function/DEX', name: 'Buy bg',      light: { hex: '5EAC1D', alpha: 0.1 },  dark: { hex: 'A0FF46', alpha: 0.2 } },
  { group: 'Function/DEX', name: 'Warning',     light: { hex: 'F19D1E', alpha: 1 },    dark: { hex: 'F19D1E', alpha: 1 } },
  { group: 'Function/DEX', name: 'Warning bg',  light: { hex: 'F19D1E', alpha: 0.1 },  dark: { hex: 'F19D1E', alpha: 0.2 } },
  { group: 'Function/DEX', name: 'Fail',        light: { hex: 'FA3B61', alpha: 1 },    dark: { hex: 'FA3B61', alpha: 1 } },
  { group: 'Function/DEX', name: 'Fail bg',     light: { hex: 'FA3B61', alpha: 0.1 },  dark: { hex: 'FA3B61', alpha: 0.2 } },
  { group: 'Function/DEX', name: 'Fail Popup',  light: { hex: 'FA3B61', alpha: 0.4 },  dark: { hex: 'FA3B61', alpha: 0.4 } },
];

export function tokenAppliesTo(t: BmdsColorToken, platform: BmdsPlatform): boolean {
  if (!t.platforms) return true;
  return t.platforms.includes(platform);
}

export function filterColorsByPlatform(filter: PlatformFilter): BmdsColorToken[] {
  if (filter === 'Both') return BMDS_COLORS;
  return BMDS_COLORS.filter((t) => tokenAppliesTo(t, filter));
}

/** True when at least one token is platform-specific (APP/Web diverge). */
export function hasPlatformDivergence(): boolean {
  return BMDS_COLORS.some((t) => !!t.platforms && t.platforms.length > 0);
}

export function platformBadge(t: BmdsColorToken): string {
  if (!t.platforms || t.platforms.length === 2) return 'APP + Web';
  return t.platforms.join(' + ');
}

export function fullTokenName(t: BmdsColorToken): string {
  return `${BMDS_COLLECTION_NAME}/${t.group}/${t.name}`;
}

export function bmdsTokenId(group: string, name: string, mode: BmdsMode): string {
  return `bmds:${group}/${name}:${mode}`;
}

export interface ParsedBmdsTokenId {
  group: string;
  name: string;
  mode: BmdsMode;
}

export function parseBmdsTokenId(id: string): ParsedBmdsTokenId | null {
  if (!id.startsWith('bmds:')) return null;
  const rest = id.slice(5);
  const lastColon = rest.lastIndexOf(':');
  if (lastColon < 0) return null;
  const modeStr = rest.slice(lastColon + 1);
  if (modeStr !== 'Light' && modeStr !== 'Dark') return null;
  const fullName = rest.slice(0, lastColon);
  const lastSlash = fullName.lastIndexOf('/');
  if (lastSlash < 0) return null;
  return {
    group: fullName.slice(0, lastSlash),
    name: fullName.slice(lastSlash + 1),
    mode: modeStr as BmdsMode,
  };
}

export function findBmdsToken(group: string, name: string): BmdsColorToken | undefined {
  return BMDS_COLORS.find((t) => t.group === group && t.name === name);
}
