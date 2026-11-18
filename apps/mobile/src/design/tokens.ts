/**
 * Colour roles, light first. Name a colour by what it does, never by its hue,
 * and pair every fill with its `on*` text colour.
 *
 * The palette: chalk-white grounds, a deep green-grey ink, court green as the
 * one accent, and two soft tints taken from the game (ball yellow and clay)
 * for tags and highlights only.
 */
export const colors = {
  light: {
    /** The screen behind everything: warm chalk. */
    background: "#F7F5EF",
    /** Cards, sheets, list rows, the tab bar. */
    surface: "#FFFEFA",
    /** Inputs, secondary buttons, empty avatar circles, a quiet section. */
    surfaceSunken: "#EFECE4",
    /** A pressed row or secondary button. */
    surfacePressed: "#E7E3D9",
    /** Hairlines between rows and around cards. Decorative only. */
    border: "#DDD8CC",
    /** Input outlines, unchecked boxes, anything a player must see to use. */
    borderStrong: "#8A8478",

    /** Body text and headings. */
    text: "#1F2B25",
    /** Secondary lines: meta, dates, distances, helper text, placeholders. */
    textMuted: "#55635A",

    /** Court green. Primary buttons, links, the focus ring, selected state. */
    accent: "#3B6B53",
    accentPressed: "#315A46",
    onAccent: "#FFFFFF",
    /** A selected chip, a confirmed badge, the active tab's pill. */
    accentSoft: "#DFEADF",
    onAccentSoft: "#24503A",

    /** Ball yellow. "New" and "Open spot" tags, a highlighted day. Never text. */
    highlight: "#E8EEB4",
    onHighlight: "#454C17",
    /** Clay. Surface tags (clay courts), a pending state. Never text. */
    clay: "#F4E3D8",
    onClay: "#7A3D22",

    /** Destructive actions and errors. */
    danger: "#B23B30",
    dangerPressed: "#97322A",
    onDanger: "#FFFFFF",
    dangerSoft: "#F7E1DD",
    onDangerSoft: "#8A2A21",

    /** Scrim behind sheets and dialogs. */
    scrim: "rgba(31, 43, 37, 0.32)",
  },
  dark: {
    background: "#121815",
    surface: "#1A221E",
    surfaceSunken: "#232C27",
    surfacePressed: "#2B352F",
    border: "#2E3833",
    borderStrong: "#76837A",

    text: "#ECEEE8",
    textMuted: "#A6B0A9",

    accent: "#8CC2A1",
    accentPressed: "#7AB190",
    onAccent: "#10241A",
    accentSoft: "#213A2D",
    onAccentSoft: "#BFE0CB",

    highlight: "#3A3F17",
    onHighlight: "#E3EBA6",
    clay: "#3D261C",
    onClay: "#F0C7B3",

    danger: "#F08A7E",
    dangerPressed: "#E27669",
    onDanger: "#2A0E0A",
    dangerSoft: "#3A1D19",
    onDangerSoft: "#F6C1BA",

    scrim: "rgba(0, 0, 0, 0.5)",
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type ColorRole = keyof typeof colors.light;
export type Palette = { readonly [K in ColorRole]: string };

/**
 * Font family names, as registered by `useAppFonts` (src/design/fonts.ts).
 * Android can't pick a weight from one family, so each weight is its own
 * family. Set `fontFamily` from here and never set `fontWeight` alongside it.
 */
export const fontFamily = {
  sans: "Geist-Regular",
  sansMedium: "Geist-Medium",
  sansSemiBold: "Geist-SemiBold",
  /** Geist Serif has one weight. Display text only: screen titles, big moments. */
  serif: "GeistSerif-Regular",
} as const;

/**
 * The type scale. Each variant is a complete text style; use the `Text`
 * component's `variant` prop rather than setting sizes by hand.
 *
 * Serif for the top two levels (a screen's title, a big moment like a match
 * confirmation), sans for everything else. Nothing goes below 13.
 */
export const typography = {
  /** One a screen at most: a welcome, a confirmed match, an empty state's headline. */
  display: { fontFamily: fontFamily.serif, fontSize: 34, lineHeight: 40, letterSpacing: -0.4 },
  /** The screen title. */
  title: { fontFamily: fontFamily.serif, fontSize: 28, lineHeight: 34, letterSpacing: -0.2 },
  /** A section inside a screen ("Availability", "Upcoming matches"). */
  heading: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  /** Card and row titles: a player's name, a session's day and time. */
  subheading: { fontFamily: fontFamily.sansSemiBold, fontSize: 17, lineHeight: 24 },
  /** Running text: bios, forum posts, messages. */
  body: { fontFamily: fontFamily.sans, fontSize: 16, lineHeight: 24 },
  /** Body text that needs a little weight: button labels, list values. */
  bodyStrong: { fontFamily: fontFamily.sansMedium, fontSize: 16, lineHeight: 24 },
  /** Meta lines under a title: level, distance, time ago. */
  caption: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20 },
  /** Field labels, chip labels, tab labels. Sentence case, never all caps. */
  label: { fontFamily: fontFamily.sansMedium, fontSize: 13, lineHeight: 18 },
} as const;

export type TypographyVariant = keyof typeof typography;

/**
 * The spacing scale, in points. Every margin, padding and gap comes from here.
 * The usual picks: 16 for screen edges and card padding, 8 or 12 between
 * items in a group, 24 or 32 between groups.
 */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export type Space = keyof typeof space;

/** Corner radii. Soft, never sharp, never fully round except pills and avatars. */
export const radius = {
  /** Chips' inner marks, small badges. */
  sm: 8,
  /** Inputs and buttons. */
  md: 12,
  /** Cards, sheets, list groups. */
  lg: 16,
  /** Bottom sheets' top corners, big hero cards. */
  xl: 24,
  /** Chips, pills, avatars. */
  full: 999,
} as const;

/** Fixed sizes that keep the app consistent and easy to tap. */
export const size = {
  /** The smallest thing a thumb is asked to hit (Apple says 44, Material 48). */
  minTap: 44,
  /** Buttons and text inputs. */
  control: 48,
  /** Compact controls inside a row (a chip, a small button). Pad the hit area to minTap. */
  controlSmall: 36,
  /** Screen edge padding. */
  gutter: 16,
  /** Readable line length on tablets and web. */
  maxContentWidth: 640,
  avatar: { sm: 32, md: 48, lg: 72, xl: 112 },
  icon: { sm: 16, md: 20, lg: 24 },
  hairline: 1,
  /** Room under a tabs screen's scrolling content, so the last row clears the native tab bar. */
  tabBarClearance: 80,
} as const;

/**
 * Motion. Short and quiet: things respond to a touch and settle. Nothing
 * loops, bounces or moves on its own. Under reduce motion, swap movement for
 * an instant change or a plain fade.
 */
export const motion = {
  duration: {
    /** Press feedback. */
    press: 90,
    /** Small state changes: a chip selecting, a toggle. */
    fast: 150,
    /** A panel or sheet opening, a list item arriving. */
    base: 220,
    /** A screen-level moment, like a match confirmed. Rare. */
    slow: 320,
  },
  /** How far a pressed button or card scales. */
  pressScale: 0.98,
  /** Opacity of a pressed text button or icon. */
  pressOpacity: 0.7,
  /** Opacity of a disabled control. */
  disabledOpacity: 0.45,
} as const;

/**
 * Shadows. The app is flat: cards sit on the ground with a hairline border.
 * A shadow is only for things that float over content (sheets, a toast).
 * `boxShadow` is supported on iOS, Android and web in this React Native.
 */
export const elevation = {
  none: "none",
  floating: "0 8px 24px rgba(31, 43, 37, 0.12)",
} as const;
