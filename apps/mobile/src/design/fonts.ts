import GeistMedium from "@/assets/fonts/Geist-Medium.ttf";
import GeistRegular from "@/assets/fonts/Geist-Regular.ttf";
import GeistSemiBold from "@/assets/fonts/Geist-SemiBold.ttf";
import GeistSerifRegular from "@/assets/fonts/GeistSerif-Regular.ttf";
import { useFonts } from "expo-font";

import { fontFamily } from "./tokens";

/**
 * Geist Sans (Regular, Medium, SemiBold) and Geist Serif, bundled from
 * assets/fonts (SIL Open Font License, see assets/fonts/OFL.txt).
 * Returns true once the fonts can be used.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    [fontFamily.sans]: GeistRegular,
    [fontFamily.sansMedium]: GeistMedium,
    [fontFamily.sansSemiBold]: GeistSemiBold,
    [fontFamily.serif]: GeistSerifRegular,
  });
  // If a font fails to load, carry on with the system font rather than a blank app.
  return loaded || error != null;
}
