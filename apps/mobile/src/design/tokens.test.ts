import { describe, expect, it } from "vite-plus/test";

import { contrastRatio } from "./contrast";
import { colors, type ColorRole, type ColorScheme } from "./tokens";

const pairs: ReadonlyArray<readonly [fg: ColorRole, bg: ColorRole, min: number]> = [
  ["text", "background", 7],
  ["text", "surface", 7],
  ["text", "surfaceSunken", 7],
  ["text", "surfacePressed", 7],
  ["textMuted", "background", 4.5],
  ["textMuted", "surface", 4.5],
  ["textMuted", "surfaceSunken", 4.5],
  ["textMuted", "surfacePressed", 4.5],
  ["accent", "background", 4.5],
  ["accent", "surface", 4.5],
  ["onAccent", "accent", 4.5],
  ["onAccent", "accentPressed", 4.5],
  ["onAccentSoft", "accentSoft", 4.5],
  ["onHighlight", "highlight", 4.5],
  ["onClay", "clay", 4.5],
  ["danger", "background", 4.5],
  ["danger", "surface", 4.5],
  ["onDanger", "danger", 4.5],
  ["onDanger", "dangerPressed", 4.5],
  ["onDangerSoft", "dangerSoft", 4.5],
  ["borderStrong", "surface", 3],
  ["borderStrong", "surfaceSunken", 3],
  ["borderStrong", "background", 3],
];

// WARNING: colors is keyed by ColorScheme, so every key is a ColorScheme.
describe.each(Object.keys(colors) as ColorScheme[])("%s colours", (scheme) => {
  it.each(pairs)("%s on %s meets %d:1", (fg, bg, min) => {
    expect(contrastRatio(colors[scheme][fg], colors[scheme][bg])).toBeGreaterThanOrEqual(min);
  });

  it("defines the same roles as light", () => {
    expect(Object.keys(colors[scheme]).sort()).toEqual(Object.keys(colors.light).sort());
  });
});
