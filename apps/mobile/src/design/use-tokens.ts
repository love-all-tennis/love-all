import { useColorScheme } from "@/hooks/use-color-scheme";

import { colors, type Palette } from "./tokens";

/** The colour roles for the current light or dark scheme. */
export function useColors(): Palette {
  return useColorScheme() === "dark" ? colors.dark : colors.light;
}
