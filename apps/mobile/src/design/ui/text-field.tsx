import { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { radius, size, space, typography } from "../tokens";
import { useColors } from "../use-tokens";
import { Text } from "./text";

export type TextFieldProps = Omit<TextInputProps, "style"> & {
  /** Always visible above the input. Says what goes in: "Display name", "Email". */
  label: string;
  /** A line under the input that helps before anything goes wrong. */
  hint?: string;
  /** Replaces the hint. Names the field and what to type. */
  error?: string;
};

export function TextField({ label, hint, error, onFocus, onBlur, ...input }: TextFieldProps) {
  const palette = useColors();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? palette.danger : focused ? palette.accent : palette.borderStrong;
  return (
    <View style={styles.field}>
      <Text variant="label">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={palette.textMuted}
        selectionColor={palette.accent}
        cursorColor={palette.accent}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          typography.body,
          {
            color: palette.text,
            backgroundColor: palette.surface,
            borderColor,
            borderWidth: focused || error ? 2 : size.hairline,
          },
        ]}
        {...input}
      />
      {(error ?? hint) && (
        <Text variant="caption" color={error ? "danger" : "textMuted"}>
          {error ?? hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space[2] },
  input: {
    minHeight: size.control,
    borderRadius: radius.md,
    borderCurve: "continuous",
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
});
