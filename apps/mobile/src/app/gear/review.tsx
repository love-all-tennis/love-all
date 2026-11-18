import {
  EQUIPMENT_REVIEW_BODY_MAX,
  EQUIPMENT_REVIEW_TITLE_MAX,
  type EquipmentDetail,
} from "@love-all/domain";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, EmptyState, ErrorBanner, Loading, Screen, space, Text, TextField } from "@/design";
import { confirmDestructive } from "@/features/forum/components";
import { StarPicker } from "@/features/gear/components";
import { itemName, lengthHint, reviewErrors, reviewPayload } from "@/features/gear/gear";
import { deleteReview, fetchItem, saveReview } from "@/features/gear/gear-api";

const NETWORK = "Check your connection and try again.";

/** Write or edit my review of an item: stars, then an optional title and text. */
export default function GearReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<EquipmentDetail | "missing" | "error" | null>(null);
  const [generation, setGeneration] = useState(0);
  const [rating, setRating] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchItem(id)
      .then((found) => {
        if (!live) return;
        setItem(found ?? "missing");
        const mine = found?.myReview;

        if (mine) {
          setRating(mine.rating);
          setTitle(mine.title ?? "");
          setBody(mine.body ?? "");
        }
      })
      .catch(() => live && setItem("error"));

    return () => {
      live = false;
    };
  }, [id, generation]);

  const errors = reviewErrors({ rating, title, body });

  const save = async () => {
    setTried(true);

    if (rating === null || errors.title || errors.body) return;
    setBusy("save");
    setProblem(null);

    try {
      const outcome = await saveReview(id, reviewPayload({ rating, title, body }));

      if ("refusal" in outcome) {
        setProblem(outcome.refusal);

        return;
      }

      router.back();
    } catch {
      setProblem(`Couldn't save your review. ${NETWORK}`);
    } finally {
      setBusy(null);
    }
  };

  const remove = () =>
    confirmDestructive(
      "Delete your review?",
      "Your stars and text are removed from this item.",
      "Delete review",
      () => {
        setBusy("delete");
        setProblem(null);
        deleteReview(id)
          .then(() => router.back())
          .catch(() => setProblem(`Couldn't delete your review. ${NETWORK}`))
          .finally(() => setBusy(null));
      },
    );

  if (item === null) {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        <Loading label="Loading" />
      </Screen>
    );
  }

  if (item === "missing" || item === "error") {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        {item === "missing" ? (
          <EmptyState
            title="Item not found"
            body="It's no longer in the catalog."
            action={{ label: "Back to gear", onPress: () => router.back() }}
          />
        ) : (
          <EmptyState
            title="Couldn't load this item"
            body={NETWORK}
            action={{
              label: "Try again",
              onPress: () => {
                setItem(null);
                setGeneration((g) => g + 1);
              },
            }}
          />
        )}
      </Screen>
    );
  }

  const editing = item.myReview !== null;

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: editing ? "Edit review" : "Write a review" }} />
      <Text variant="heading" accessibilityRole="header">
        {itemName(item)}
      </Text>
      <StarPicker value={rating} onChange={setRating} error={tried ? errors.rating : null} />
      <TextField
        label="Title (optional)"
        placeholder="Great spin, a bit stiff"
        value={title}
        onChangeText={setTitle}
        hint={lengthHint(title, EQUIPMENT_REVIEW_TITLE_MAX)}
        error={tried ? (errors.title ?? undefined) : undefined}
        maxLength={EQUIPMENT_REVIEW_TITLE_MAX + 20}
        returnKeyType="next"
      />
      <TextField
        label="Review (optional)"
        placeholder="How it plays, how long it lasted, who it suits"
        value={body}
        onChangeText={setBody}
        hint={lengthHint(body, EQUIPMENT_REVIEW_BODY_MAX)}
        error={tried ? (errors.body ?? undefined) : undefined}
        multiline
        maxLength={EQUIPMENT_REVIEW_BODY_MAX + 100}
      />
      <ErrorBanner>{problem}</ErrorBanner>
      <View style={styles.actions}>
        <Button label="Save review" loading={busy === "save"} onPress={() => void save()} />
        {editing && (
          <Button
            variant="danger"
            label="Delete review"
            loading={busy === "delete"}
            onPress={remove}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space[3] },
});
