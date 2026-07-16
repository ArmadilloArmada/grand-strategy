/**
 * Colorblind-safe faction palette.
 *
 * The default faction colors (blue / red / green / orange) are hard to tell
 * apart for players with red-green color vision deficiency. When colorblind
 * mode is enabled we remap faction colors to the Okabe-Ito palette — a set of
 * eight hues chosen to stay distinguishable across the common types of color
 * blindness. Colors are assigned by turn order so every map (and mods) gets a
 * stable, maximally-distinct set without per-faction configuration.
 */

export interface PaletteEntry {
  color: string;
  colorLight: string;
}

// Okabe-Ito qualitative palette + a lightened highlight variant for each hue.
export const COLORBLIND_PALETTE: PaletteEntry[] = [
  { color: '#0072b2', colorLight: '#4da3d1' }, // blue
  { color: '#d55e00', colorLight: '#e68a4d' }, // vermillion
  { color: '#009e73', colorLight: '#4cc3a3' }, // bluish green
  { color: '#cc79a7', colorLight: '#e0a9c6' }, // reddish purple
  { color: '#e69f00', colorLight: '#f2c94c' }, // orange
  { color: '#56b4e9', colorLight: '#9ad1f2' }, // sky blue
  { color: '#f0e442', colorLight: '#f7ee8f' }, // yellow
  { color: '#999999', colorLight: '#c4c4c4' }, // neutral gray
];

/**
 * Get the colorblind-safe palette entry for a faction based on its turn order
 * (1-based). Wraps around if there are more factions than palette entries.
 */
export function colorblindEntryForTurnOrder(turnOrder: number): PaletteEntry {
  const index = ((turnOrder - 1) % COLORBLIND_PALETTE.length + COLORBLIND_PALETTE.length) % COLORBLIND_PALETTE.length;
  return COLORBLIND_PALETTE[index];
}
