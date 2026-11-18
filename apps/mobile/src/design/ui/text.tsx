import { Text as RNText, type TextProps as RNTextProps } from "react-native";

import { typography, type ColorRole, type TypographyVariant } from "../tokens";
import { useColors } from "../use-tokens";

export type TextProps = RNTextProps & {
  /** A step on the type scale. Defaults to `body`. */
  variant?: TypographyVariant;
  /** A colour role. Defaults to `text`; use `textMuted` for secondary lines. */
  color?: ColorRole;
  /** Tabular figures, for scores, times and counts that line up. */
  tabular?: boolean;
};

/** All text in the app. Picks its style from the type scale and its colour from the theme. */
export function Text({ variant = "body", color = "text", tabular, style, ...rest }: TextProps) {
  const palette = useColors();

  const accessibilityRole =
    rest.accessibilityRole ?? (variant === "display" || variant === "title" ? "header" : undefined);

  return (
    <RNText
      {...rest}
      accessibilityRole={accessibilityRole}
      style={[
        typography[variant],
        { color: palette[color] },
        tabular && { fontVariant: ["tabular-nums"] },
        style,
      ]}
    />
  );
}
