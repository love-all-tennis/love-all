import { useColorScheme } from "@/hooks/use-color-scheme";

import { colors } from "./tokens";

/** The colour roles for the current light or dark scheme. */
export function useColors() {
  return useColorScheme() === "dark" ? colors.dark : colors.light;
}
