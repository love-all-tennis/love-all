import type { ForumCategory } from "@love-all/domain";
import { router } from "expo-router";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";

import { Button, EmptyState, Icon, Loading, Screen, size, space, useColors } from "@/design";
import { CategoryCard, GroupHeading } from "@/features/forum/components";
import { localHeading, splitCategories } from "@/features/forum/forum";
import { useCategories } from "@/features/forum/use-forum";
import { useNow } from "@/features/sessions/use-sessions";

const openCategory = (category: ForumCategory) =>
  router.push({
    pathname: "/forum/category/[id]",
    params: { id: category.id, name: category.name },
  });

const newThread = () => router.push("/forum/new");

/** The forum: my metro's Local category first, then the ones every player sees. */
export default function ForumScreen() {
  const palette = useColors();
  const { state, refresh } = useCategories();
  const now = useNow();
  const { local, global } = splitCategories(state.status === "ready" ? state.value : []);

  const sections = [
    ...local.map((c) => ({ title: localHeading(c), data: [c] })),
    ...(global.length > 0 ? [{ title: local.length > 0 ? "Everyone" : null, data: global }] : []),
  ];

  return (
    <Screen title="Forum" scroll={false} edges={["top", "left", "right"]}>
      <View style={styles.bar}>
        <Button
          variant="quiet"
          size="small"
          label="New thread"
          icon={<Icon ios="square.and.pencil" md="edit_square" size="sm" color="accent" />}
          onPress={newThread}
        />
      </View>
      <SectionList
        style={styles.fill}
        contentContainerStyle={styles.list}
        sections={sections}
        stickySectionHeadersEnabled={false}
        keyExtractor={(category) => category.id}
        renderSectionHeader={({ section }) =>
          section.title ? <GroupHeading>{section.title}</GroupHeading> : null
        }
        renderItem={({ item }) => (
          <CategoryCard category={item} now={now} onPress={() => openCategory(item)} />
        )}
        ListEmptyComponent={
          state.status === "error" ? (
            <EmptyState
              title="Couldn't load the forum"
              body="Check your connection and try again."
              action={{ label: "Try again", onPress: refresh }}
            />
          ) : (
            <Loading label="Loading the forum" />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={refresh}
            tintColor={palette.textMuted}
            colors={[palette.accent]}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: "row", justifyContent: "flex-end" },
  list: { gap: space[2], paddingBottom: size.tabBarClearance },
});
