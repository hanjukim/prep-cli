/**
 * Column layout shared by the human reports. No knowledge of what is being
 * reported, so a new report reuses the alignment without dragging in chef's
 * wording.
 */

export const INDENT = "  ";
export const GUTTER = "  ";

const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
];

/** Counts a character the terminal draws two cells wide as two. Keeps columns aligned. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    width += WIDE_RANGES.some(([lo, hi]) => code >= lo && code <= hi) ? 2 : 1;
  }
  return width;
}

export function pad(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}

export function widest(texts: readonly string[]): number {
  return texts.reduce((max, text) => Math.max(max, displayWidth(text)), 0);
}

/** Joins cells into one row, dropping the trailing gutter of an empty last cell. */
export function join(...cells: string[]): string {
  return cells.join(GUTTER).trimEnd();
}
