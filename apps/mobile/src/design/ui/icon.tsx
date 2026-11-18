import { SymbolView } from "expo-symbols";
import type { ComponentProps } from "react";

import { size as sizes, type ColorRole } from "../tokens";
import { useColors } from "../use-tokens";

type SymbolName = Exclude<ComponentProps<typeof SymbolView>["name"], string>;

export type IconProps = {
  /** The SF Symbol on iOS, in its outline form ("person.2"). */
  ios: NonNullable<SymbolName["ios"]>;
  /** The matching Material symbol on Android and web ("group"). */
  md: NonNullable<SymbolName["android"]>;
  size?: keyof typeof sizes.icon;
  color?: ColorRole;
};

/**
 * An icon: an SF Symbol on iOS and the matching Material symbol elsewhere.
 * Decorative by default. An icon-only button labels its button, not the icon.
 */
export function Icon({ ios, md, size = "md", color = "textMuted" }: IconProps) {
  const palette = useColors();
  return (
    <SymbolView
      name={{ ios, android: md, web: md }}
      size={sizes.icon[size]}
      tintColor={palette[color]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
