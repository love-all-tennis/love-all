import type { Conversation, DirectMessage } from "@love-all/domain";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar, Card, motion, radius, size, space, Text, useColors } from "@/design";
import { timeAgo } from "@/features/session-activity/comments";
import { previewLine, timeOfDay, unreadBadge, unreadLabel } from "./messages";

/** One conversation in the inbox: photo, name, the last message, and an unread mark. */
export function ConversationRow({
  conversation,
  now,
  onPress,
}: {
  conversation: Conversation;
  now: Date;
  onPress: () => void;
}) {
  const palette = useColors();
  const { otherPlayer, lastMessage, unreadCount } = conversation;
  const unread = unreadCount > 0;
  const when = lastMessage ? timeAgo(lastMessage.createdAt, now) : "";
  const preview = previewLine(conversation);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={[
        otherPlayer.displayName,
        unread ? unreadLabel(unreadCount) : null,
        preview,
        when,
      ]
        .filter(Boolean)
        .join(", ")}
      accessibilityHint="Opens the conversation"
      style={styles.row}
    >
      <Avatar name={otherPlayer.displayName} photoUrl={otherPlayer.photoUrl} />
      <View style={styles.text}>
        <View style={styles.top}>
          <Text variant="subheading" numberOfLines={1} style={styles.name}>
            {otherPlayer.displayName}
          </Text>
          <Text variant="caption" color="textMuted" tabular>
            {when}
          </Text>
        </View>
        <View style={styles.top}>
          <Text
            variant={unread ? "bodyStrong" : "caption"}
            color={unread ? "text" : "textMuted"}
            numberOfLines={1}
            style={styles.name}
          >
            {preview}
          </Text>
          {unread ? (
            <View
              style={[styles.badge, { backgroundColor: palette.accentSoft }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text variant="label" color="onAccentSoft" tabular>
                {unreadBadge(unreadCount)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

/**
 * One message. Mine sit on the right on a soft green; theirs on the left on
 * a card surface. Pressing one of theirs opens the report option.
 */
export function MessageBubble({
  message,
  senderName,
  onLongPress,
}: {
  message: DirectMessage;
  senderName: string;
  onLongPress?: () => void;
}) {
  const palette = useColors();
  const mine = message.mine;
  const time = timeOfDay(message.createdAt);

  return (
    <View style={[styles.bubbleRow, mine ? styles.end : styles.start]}>
      <Pressable
        accessibilityRole={onLongPress ? "button" : "text"}
        accessibilityLabel={`${mine ? "You" : senderName}, ${time}: ${message.body}`}
        accessibilityHint={onLongPress ? "Long press to report this message" : undefined}
        accessibilityActions={onLongPress ? [{ name: "longpress", label: "Report" }] : undefined}
        onAccessibilityAction={onLongPress}
        onLongPress={onLongPress}
        disabled={!onLongPress}
        style={({ pressed }) => [
          styles.bubble,
          mine
            ? { backgroundColor: palette.accentSoft }
            : {
                backgroundColor: palette.surface,
                borderColor: palette.border,
                borderWidth: size.hairline,
              },
          pressed && { opacity: motion.pressOpacity },
        ]}
      >
        <Text color={mine ? "onAccentSoft" : "text"}>{message.body}</Text>
        <Text variant="caption" color={mine ? "onAccentSoft" : "textMuted"} tabular>
          {time}
        </Text>
      </Pressable>
    </View>
  );
}

/** "Today", "Yesterday", "Mon, Nov 17" between days. */
export function DayHeading({ label }: { label: string }) {
  return (
    <Text variant="label" color="textMuted" accessibilityRole="header" style={styles.day} tabular>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  text: { flex: 1, gap: space[1] },
  top: { flexDirection: "row", alignItems: "center", gap: space[2] },
  name: { flex: 1 },
  badge: {
    minWidth: size.icon.lg,
    paddingHorizontal: space[2],
    borderRadius: radius.full,
    alignItems: "center",
  },
  bubbleRow: { flexDirection: "row" },
  start: { justifyContent: "flex-start" },
  end: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.lg,
    borderCurve: "continuous",
    gap: space[1],
  },
  day: { textAlign: "center", paddingVertical: space[2] },
});
