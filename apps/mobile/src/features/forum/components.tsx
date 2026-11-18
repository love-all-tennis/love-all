import type {
  ForumAuthor,
  ForumCategory,
  ForumReactionCount,
  ForumReactionKind,
  ForumThreadSummary,
} from "@love-all/domain";
import { type ReactNode, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";

import { Avatar, Button, Card, Chip, Icon, motion, size, space, Text } from "@/design";
import { timeAgo } from "@/features/session-activity/comments";
import { DELETED_ACCOUNT } from "@/lib/deleted-account";
import { type PostMenuAction, reactionChipLabel, replyCountLabel } from "./forum";

/** Asks before something that can't be undone, on native and web. */
export const confirmDestructive = (
  title: string,
  message: string,
  action: string,
  run: () => void,
) => {
  if (Platform.OS === "web") {
    // react-native-web has no Alert.
    if (globalThis.confirm?.(`${title}\n\n${message}`)) {
      run();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: action, style: "destructive", onPress: run },
  ]);
};

/** A category on the Forum tab, with its latest thread when it has one. */
export function CategoryCard({
  category,
  now,
  onPress,
}: {
  category: ForumCategory;
  now: Date;
  onPress: () => void;
}) {
  const latest = category.latestThread;
  const meta = latest
    ? `Latest: ${latest.title} · ${timeAgo(latest.lastPostAt, now)}`
    : "No threads yet";
  return (
    <Card onPress={onPress} accessibilityLabel={`${category.name}. ${meta}`}>
      <View style={styles.rowText}>
        <Text variant="subheading">{category.name}</Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </Card>
  );
}

/** A thread in its category: title, who started it, replies, and when it last moved. */
export function ThreadCard({
  thread,
  now,
  onPress,
}: {
  thread: ForumThreadSummary;
  now: Date;
  onPress: () => void;
}) {
  const meta = `${thread.author?.displayName ?? DELETED_ACCOUNT} · ${replyCountLabel(thread.replyCount)} · ${timeAgo(
    thread.lastPostAt,
    now,
  )}`;
  return (
    <Card onPress={onPress} accessibilityLabel={`${thread.title}. ${meta}`}>
      <View style={styles.row}>
        <Avatar
          name={thread.author?.displayName ?? DELETED_ACCOUNT}
          photoUrl={thread.author?.photoUrl ?? null}
          size="sm"
        />
        <View style={styles.rowText}>
          <Text variant="subheading" numberOfLines={2}>
            {thread.title}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1} tabular>
            {meta}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/** One chip per reaction kind; mine are selected. */
export function ReactionBar({
  reactions,
  onToggle,
}: {
  reactions: ReadonlyArray<ForumReactionCount>;
  onToggle: (kind: ForumReactionKind) => void;
}) {
  return (
    <View style={styles.reactions}>
      {reactions.map((reaction) => (
        <Chip
          key={reaction.kind}
          label={reactionChipLabel(reaction)}
          selected={reaction.mine}
          onPress={() => onToggle(reaction.kind)}
        />
      ))}
    </View>
  );
}

const MENU_LABELS: Record<PostMenuAction, string> = { delete: "Delete", report: "Report" };

/**
 * The opening post or a reply: author (tapping through to their profile),
 * when, the text, reactions, and a menu with Delete on mine and Report on
 * others'. A deleted reply shows as "Post deleted". With no author (they
 * deleted their account) it shows "Deleted account", with no link or menu.
 */
export function PostCard({
  author,
  mine,
  when,
  title,
  body,
  reactions,
  actions,
  busy,
  onOpenAuthor,
  onToggleReaction,
  onAction,
}: {
  author: ForumAuthor | null;
  mine: boolean;
  when: string;
  /** Only on the opening post. */
  title?: string;
  body: string | null;
  reactions: ReadonlyArray<ForumReactionCount>;
  actions: ReadonlyArray<PostMenuAction>;
  busy: boolean;
  onOpenAuthor: () => void;
  onToggleReaction: (kind: ForumReactionKind) => void;
  onAction: (action: PostMenuAction) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  if (body === null) {
    return (
      <Card tone="sunken">
        <Text color="textMuted">Post deleted</Text>
      </Card>
    );
  }
  const name = author ? (mine ? "You" : author.displayName) : DELETED_ACCOUNT;
  return (
    <Card>
      <View style={styles.post}>
        <View style={styles.row}>
          <AuthorLink author={author} label={name} when={when} onPress={onOpenAuthor} />
          {actions.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More actions"
              accessibilityState={{ expanded: menuOpen }}
              onPress={() => setMenuOpen((open) => !open)}
              style={({ pressed }) => [styles.more, pressed && { opacity: motion.pressOpacity }]}
            >
              <Icon ios="ellipsis" md="more_horiz" />
            </Pressable>
          )}
        </View>
        {title && (
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
        )}
        <Text>{body}</Text>
        <ReactionBar reactions={reactions} onToggle={onToggleReaction} />
        {menuOpen && (
          <View style={styles.menu}>
            {actions.map((action) => (
              <Button
                key={action}
                label={MENU_LABELS[action]}
                variant={action === "delete" ? "danger" : "secondary"}
                size="small"
                loading={busy && action === "delete"}
                onPress={() => {
                  setMenuOpen(false);
                  onAction(action);
                }}
              />
            ))}
          </View>
        )}
      </View>
    </Card>
  );
}

function AuthorLink({
  author,
  label,
  when,
  onPress,
}: {
  author: ForumAuthor | null;
  label: string;
  when: string;
  onPress: () => void;
}) {
  if (!author) {
    return (
      <View style={[styles.row, styles.author]}>
        <Avatar name={label} photoUrl={null} size="sm" />
        <View style={styles.rowText}>
          <Text variant="bodyStrong" color="textMuted" numberOfLines={1}>
            {label}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {when}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${author.displayName}, ${when}. Open their profile`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        styles.author,
        pressed && { opacity: motion.pressOpacity },
      ]}
    >
      <Avatar name={author.displayName} photoUrl={author.photoUrl} size="sm" />
      <View style={styles.rowText}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {when}
        </Text>
      </View>
    </Pressable>
  );
}

/** A heading over a group of cards. */
export function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <Text variant="heading" accessibilityRole="header" style={styles.heading}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  rowText: { flex: 1, gap: space[1] },
  author: { flex: 1, minHeight: size.minTap },
  post: { gap: space[3] },
  more: {
    minWidth: size.minTap,
    minHeight: size.minTap,
    alignItems: "center",
    justifyContent: "center",
  },
  reactions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  menu: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  heading: { paddingTop: space[2] },
});
