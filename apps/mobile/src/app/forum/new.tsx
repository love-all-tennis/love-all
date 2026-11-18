import { FORUM_BODY_MAX, FORUM_TITLE_MAX, type ForumCategory } from "@love-all/domain";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  Button,
  ChoiceRow,
  EmptyState,
  ErrorBanner,
  Loading,
  Screen,
  space,
  Text,
  TextField,
} from "@/design";
import { bodyError, lengthHint, titleError } from "@/features/forum/forum";
import { createThread, fetchCategories } from "@/features/forum/forum-api";

const NETWORK = "Check your connection and try again.";

/**
 * Start a thread: pick a category (my metro's Local one is offered only when
 * I have a metro, since the API only lists it then), then a title and text.
 */
export default function NewThreadScreen() {
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const [categories, setCategories] = useState<ReadonlyArray<ForumCategory> | "error" | null>(null);
  const [generation, setGeneration] = useState(0);
  const [categoryId, setCategoryId] = useState<string | null>(params.categoryId ?? null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  const [posting, setPosting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchCategories()
      .then((list) => live && setCategories(list))
      .catch(() => live && setCategories("error"));
    return () => {
      live = false;
    };
  }, [generation]);

  const errors = {
    category: categoryId ? null : "Pick a category",
    title: titleError(title),
    body: bodyError(body),
  };

  const post = async () => {
    setTried(true);
    if (!categoryId || errors.title || errors.body) return;
    setPosting(true);
    setProblem(null);
    try {
      const outcome = await createThread({
        categoryId,
        title: title.trim(),
        body: body.trim(),
      });
      if ("refusal" in outcome) {
        setProblem(outcome.refusal);
        return;
      }
      router.replace({ pathname: "/forum/thread/[id]", params: { id: outcome.ok.id } });
    } catch {
      setProblem(`Couldn't post your thread. ${NETWORK}`);
    } finally {
      setPosting(false);
    }
  };

  if (categories === null) {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        <Loading label="Loading categories" />
      </Screen>
    );
  }
  if (categories === "error") {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        <EmptyState
          title="Couldn't load categories"
          body={NETWORK}
          action={{
            label: "Try again",
            onPress: () => {
              setCategories(null);
              setGeneration((g) => g + 1);
            },
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <View style={styles.group} accessibilityRole="radiogroup">
        <Text variant="heading" accessibilityRole="header">
          Category
        </Text>
        {categories.map((category) => (
          <ChoiceRow
            key={category.id}
            label={category.name}
            hint={category.metroId ? "Only players in your metro see this" : undefined}
            selected={categoryId === category.id}
            onPress={() => setCategoryId(category.id)}
          />
        ))}
        {tried && errors.category ? (
          <Text variant="caption" color="danger">
            {errors.category}
          </Text>
        ) : null}
      </View>
      <TextField
        label="Title"
        value={title}
        onChangeText={setTitle}
        hint={lengthHint(title, FORUM_TITLE_MAX)}
        error={tried ? (errors.title ?? undefined) : undefined}
        maxLength={FORUM_TITLE_MAX + 20}
        returnKeyType="next"
      />
      <TextField
        label="Post"
        value={body}
        onChangeText={setBody}
        hint={lengthHint(body, FORUM_BODY_MAX)}
        error={tried ? (errors.body ?? undefined) : undefined}
        multiline
        maxLength={FORUM_BODY_MAX + 100}
      />
      <ErrorBanner>{problem}</ErrorBanner>
      <Button label="Post thread" loading={posting} onPress={() => void post()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[2] },
});
