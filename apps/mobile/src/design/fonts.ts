import { useFonts } from "expo-font";

import { fontFamily } from "./tokens";

/**
 * Geist Sans (Regular, Medium, SemiBold) and Geist Serif, bundled from
 * assets/fonts (SIL Open Font License, see assets/fonts/OFL.txt).
 * Returns true once the fonts can be used.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    [fontFamily.sans]: require("@/assets/fonts/Geist-Regular.ttf"),
    [fontFamily.sansMedium]: require("@/assets/fonts/Geist-Medium.ttf"),
    [fontFamily.sansSemiBold]: require("@/assets/fonts/Geist-SemiBold.ttf"),
    [fontFamily.serif]: require("@/assets/fonts/GeistSerif-Regular.ttf"),
  });
  // If a font fails to load, carry on with the system font rather than a blank app.
  return loaded || error != null;
}
