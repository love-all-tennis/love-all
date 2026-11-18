import { EQUIPMENT_BRAND_MAX, EQUIPMENT_MODEL_MAX, type EquipmentKind } from "@love-all/domain";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, ChoiceRow, ErrorBanner, Screen, space, Text, TextField } from "@/design";
import { KIND_LABELS, KINDS, newItemErrors } from "@/features/gear/gear";
import { addItem } from "@/features/gear/gear-api";

const isKind = (value: string | undefined): value is EquipmentKind =>
  KINDS.some((k) => k === value);

/**
 * Add an item to the catalog: what kind it is, then brand and model. If it's
 * already there, opens that one instead of adding it twice.
 */
export default function NewGearScreen() {
  const params = useLocalSearchParams<{ kind?: string; model?: string }>();
  const [kind, setKind] = useState<EquipmentKind | null>(isKind(params.kind) ? params.kind : null);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState(params.model ?? "");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const errors = newItemErrors({ kind, brand, model });

  const save = async () => {
    setTried(true);

    if (!kind || errors.brand || errors.model) return;
    setSaving(true);
    setProblem(null);

    try {
      const outcome = await addItem({ kind, brand: brand.trim(), model: model.trim() });

      if ("refusal" in outcome) {
        setProblem(outcome.refusal);

        return;
      }

      const id = "existing" in outcome ? outcome.existing : outcome.ok.id;
      router.replace({ pathname: "/gear/[id]", params: { id } });
    } catch {
      setProblem("Couldn't add it. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <View style={styles.group} accessibilityRole="radiogroup">
        <Text variant="heading" accessibilityRole="header">
          Kind
        </Text>
        {KINDS.map((k) => (
          <ChoiceRow
            key={k}
            label={KIND_LABELS[k]}
            selected={kind === k}
            onPress={() => setKind(k)}
          />
        ))}
        {tried && errors.kind ? (
          <Text variant="caption" color="danger">
            {errors.kind}
          </Text>
        ) : null}
      </View>
      <TextField
        label="Brand"
        placeholder="Wilson"
        value={brand}
        onChangeText={setBrand}
        error={tried ? (errors.brand ?? undefined) : undefined}
        maxLength={EQUIPMENT_BRAND_MAX + 10}
        autoCapitalize="words"
        returnKeyType="next"
      />
      <TextField
        label="Model"
        placeholder="Blade 98 v9"
        hint="Include the version or year if it has one"
        value={model}
        onChangeText={setModel}
        error={tried ? (errors.model ?? undefined) : undefined}
        maxLength={EQUIPMENT_MODEL_MAX + 10}
      />
      <ErrorBanner>{problem}</ErrorBanner>
      <Button label="Add gear" loading={saving} onPress={() => void save()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[2] },
});
