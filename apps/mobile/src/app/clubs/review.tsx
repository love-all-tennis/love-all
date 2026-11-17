import { CLUB_REVIEW_BODY_MAX, type ClubReview } from "@love-all/domain";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import {
  Button,
  EmptyState,
  ErrorBanner,
  Loading,
  space,
  Text,
  TextField,
  useColors,
} from "@/design";
import { lengthHint, noteError, optionalText } from "@/features/clubs/clubs";
import { deleteReview, fetchClub, saveReview } from "@/features/clubs/clubs-api";
import { StarPicker } from "@/features/clubs/components";
import { confirmDestructive } from "@/features/forum/components";

const NETWORK = "Check your connection and try again.";

type Loaded =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "gone" }
  | { readonly status: "ready"; readonly name: string; readonly mine: ClubReview | null };

/** Write or change my review of a club, in a form sheet: stars and an optional note. */
export default function ReviewSheet() {
  const palette = useColors();
  const { id } = useLocalSearchParams<{ id: string; name?: string }>();
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [generation, setGeneration] = useState(0);
  const [stars, setStars] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchClub(id)
      .then((club) => {
        if (!live) return;
        if (!club) return setLoaded({ status: "gone" });
        setLoaded({ status: "ready", name: club.name, mine: club.myReview });
        setStars(club.myReview?.rating ?? null);
        setNote(club.myReview?.body ?? "");
      })
      .catch(() => live && setLoaded({ status: "error" }));
    return () => {
      live = false;
    };
  }, [id, generation]);

  const starsError = tried && stars === null ? "Pick 1 to 5 stars." : null;
  const bodyError = tried ? noteError(note) : null;

  const save = async () => {
    setTried(true);
    if (stars === null || noteError(note)) return;
    setBusy("save");
    setProblem(null);
    try {
      const outcome = await saveReview(id, { rating: stars, body: optionalText(note) });
      if ("refusal" in outcome) return setProblem(outcome.refusal);
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
      "Your stars and note are removed from this club.",
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

  const title = loaded.status === "ready" && loaded.mine ? "Edit review" : "Write a review";

  return (
    <ScrollView
      style={{ backgroundColor: palette.surface }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title }} />
      {loaded.status === "loading" ? <Loading label="Loading your review" /> : null}
      {loaded.status === "gone" ? (
        <EmptyState
          title="Club not found"
          body="It may have been removed from the list."
          action={{ label: "Close", onPress: () => router.back() }}
        />
      ) : null}
      {loaded.status === "error" ? (
        <EmptyState
          title="Couldn't load this club"
          body={NETWORK}
          action={{
            label: "Try again",
            onPress: () => {
              setLoaded({ status: "loading" });
              setGeneration((g) => g + 1);
            },
          }}
        />
      ) : null}
      {loaded.status === "ready" ? (
        <>
          <Text variant="subheading">{loaded.name}</Text>
          <StarPicker value={stars} onChange={setStars} error={starsError} />
          <TextField
            label="Your review (optional)"
            hint={
              bodyError
                ? undefined
                : `Courts, lights, nets, parking, how busy it gets. ${lengthHint(note, CLUB_REVIEW_BODY_MAX)}`
            }
            error={bodyError ?? undefined}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={CLUB_REVIEW_BODY_MAX + 100}
          />
          <ErrorBanner>{problem}</ErrorBanner>
          <View style={styles.actions}>
            <Button
              label="Save review"
              loading={busy === "save"}
              disabled={busy === "delete"}
              onPress={() => void save()}
            />
            {loaded.mine ? (
              <Button
                label="Delete review"
                variant="danger"
                loading={busy === "delete"}
                disabled={busy === "save"}
                onPress={remove}
              />
            ) : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space[4], gap: space[5], paddingBottom: space[10] },
  actions: { gap: space[3] },
});
