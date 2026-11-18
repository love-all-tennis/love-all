/** WCAG 2 contrast between two `#RRGGBB` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string) {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));

  return (hi + 0.05) / (lo + 0.05);
}

function luminance(hex: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);

  if (!match) throw new Error(`Expected a #RRGGBB colour, got ${hex}`);
  const value = parseInt(match[1]!, 16);

  return (
    0.2126 * linear((value >> 16) & 255) +
    0.7152 * linear((value >> 8) & 255) +
    0.0722 * linear(value & 255)
  );
}

function linear(channel: number) {
  const c = channel / 255;

  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
