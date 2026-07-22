/**
 * The wipbin color palette - single source of truth for every color picker
 * (see DESIGN.md "Color palette"). 24 entries in row-major 6x4 grid order.
 * Hexes are canonical UPPERCASE: swatch data attributes, component values
 * written by the panel, and serialization default-comparisons all go through
 * normalizeColor, so one case convention has to hold everywhere.
 */

export interface PaletteEntry {
  id: string;
  label: string;
  /** null = the "no color" sentinel (transparent, fills only). */
  hex: string | null;
}

export const PALETTE: PaletteEntry[] = [
  // Row 1
  { id: 'none', label: 'No color', hex: null },
  { id: 'light-yellow', label: 'Light Yellow', hex: '#FAEC9C' },
  { id: 'peach', label: 'Peach', hex: '#F6C198' },
  { id: 'light-pink', label: 'Light Pink', hex: '#FCB9BE' },
  // Row 2
  { id: 'mint-green', label: 'Mint Green', hex: '#A5E6B7' },
  { id: 'sky-blue', label: 'Sky Blue', hex: '#B4D3FD' },
  { id: 'lavender', label: 'Lavender', hex: '#D7CCFE' },
  { id: 'golden-yellow', label: 'Golden Yellow', hex: '#FDCC3F' },
  // Row 3
  { id: 'orange', label: 'Orange', hex: '#FE9D48' },
  { id: 'coral-red', label: 'Coral Red', hex: '#F95B60' },
  { id: 'bright-green', label: 'Bright Green', hex: '#3CD457' },
  { id: 'medium-blue', label: 'Medium Blue', hex: '#5F99F9' },
  // Row 4
  { id: 'purple', label: 'Purple', hex: '#8D76FB' },
  { id: 'ochre', label: 'Ochre / Bronze', hex: '#B18F12' },
  { id: 'brown', label: 'Brown', hex: '#9F5117' },
  { id: 'crimson-red', label: 'Crimson Red', hex: '#BB0B0B' },
  // Row 5
  { id: 'forest-green', label: 'Forest Green', hex: '#107C2E' },
  { id: 'dark-blue', label: 'Dark Blue', hex: '#2D59AD' },
  { id: 'deep-purple', label: 'Deep Purple', hex: '#6725CC' },
  { id: 'white', label: 'White', hex: '#FFFFFF' },
  // Row 6
  { id: 'light-gray', label: 'Light Gray', hex: '#E1E1E1' },
  { id: 'medium-gray', label: 'Medium Gray', hex: '#AFAFAF' },
  { id: 'dark-gray', label: 'Dark Gray', hex: '#595959' },
  { id: 'black', label: 'Black', hex: '#202020' },
];

/** Canonical draw defaults; serialization omits these (DESIGN.md, plan Ch. 1). */
export const DEFAULT_FILL = '#FFFFFF';
export const DEFAULT_STROKE = '#202020';

export function paletteColor(id: string): string | null {
  return PALETTE.find((entry) => entry.id === id)?.hex ?? null;
}

// Legacy stored values (named draw defaults + the retired 8-swatch set) map
// to their nearest palette color so old boards highlight the right swatch
// and default-omission comparisons keep working. Keys are uppercase - the
// lookup runs on the uppercased input.
const LEGACY_TO_PALETTE: Record<string, string> = {
  'BLACK': DEFAULT_STROKE,
  '#000000': DEFAULT_STROKE,
  'WHITE': DEFAULT_FILL,
  '#E53935': '#F95B60',
  '#FB8C00': '#FE9D48',
  '#FDD835': '#FDCC3F',
  '#43A047': '#3CD457',
  '#1E88E5': '#5F99F9',
  '#8E24AA': '#6725CC',
};

/**
 * Canonicalize a stored color for COMPARISON (active-swatch highlight,
 * default-omission checks). Never write the normalized value back over a
 * stored one outside the panel - the exporter compares normalized but
 * writes originals, so legacy boards aren't silently recolored.
 */
export function normalizeColor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const upper = value.toUpperCase();
  return LEGACY_TO_PALETTE[upper] ?? upper;
}
