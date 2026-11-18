import type { SessionParticipant, SessionSummary } from "@love-all/domain";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  Avatar,
  Card,
  Chip,
  Icon,
  motion,
  radius,
  size,
  space,
  Tag,
  Text,
  useColors,
} from "@/design";
import { DELETED_ACCOUNT } from "@/lib/deleted-account";
import { distanceLabel } from "@/lib/distance";
import { levelLabel } from "../players/components";
import {
  durationLabel,
  kindLabel,
  levelRangeLabel,
  sessionTags,
  spotsLabel,
  whenLabel,
} from "./format";

/**
 * One session in a list: when, what, where and who's hosting. Tags lead with
 * my place in it (an invite waiting on me) and its state.
 */
export function SessionCard({
  session,
  now,
  showHost,
  onPress,
  footer,
}: {
  session: SessionSummary;
  now: Date;
  /** Nearby lists show who's hosting; my own list mostly doesn't need it. */
  showHost: boolean;
  onPress: () => void;
  /** A last line, such as a past session's score. */
  footer?: ReactNode;
}) {
  const tags = sessionTags(session, now);
  const when = whenLabel(session.startsAt);
  const what = `${kindLabel(session.kind)} · ${durationLabel(session.durationMinutes)}`;
  const distance = distanceLabel(session.distanceKm);
  const where = distance ? `${session.courtName} · ${distance}` : session.courtName;
  const level = `${levelRangeLabel(session.levelMin, session.levelMax)} · ${spotsLabel(
    session.acceptedCount,
    session.spots,
  )}`;
  const host = `Hosted by ${session.host?.displayName ?? DELETED_ACCOUNT}`;
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={[
        ...tags.map((t) => t.label),
        when,
        what,
        where,
        level,
        showHost ? host : null,
      ]
        .filter(Boolean)
        .join(", ")}
      accessibilityHint="Opens the session"
      style={styles.card}
    >
      {tags.length > 0 ? (
        <View style={styles.tags}>
          {tags.map((tag) => (
            <Tag key={tag.label} label={tag.label} tone={tag.tone} />
          ))}
        </View>
      ) : null}
      <Text variant="subheading" numberOfLines={1} tabular>
        {when}
      </Text>
      <View>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {what}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1} tabular>
          {where}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1} tabular>
          {level}
        </Text>
      </View>
      {showHost ? (
        <View style={styles.host}>
          <Avatar
            name={session.host?.displayName ?? DELETED_ACCOUNT}
            photoUrl={session.host?.photoUrl ?? null}
            size="sm"
          />
          <Text variant="caption" numberOfLines={1} style={styles.fill}>
            {host}
          </Text>
        </View>
      ) : null}
      {footer}
    </Card>
  );
}

const PLACE_LABELS: Record<SessionParticipant["state"], string | null> = {
  accepted: null,
  invited: "Invited",
  requested: "Asked to join",
  declined: "Declined",
  left: "Left",
};

/** A player in a session: photo, name, level, and where they stand unless they're in. */
export function ParticipantRow({
  participant,
  onPress,
  trailing,
}: {
  participant: SessionParticipant;
  onPress: () => void;
  /** Room for an action on the row, such as approving a request. */
  trailing?: ReactNode;
}) {
  const { player, role, state } = participant;
  const place = role === "host" ? "Host" : PLACE_LABELS[state];
  const level = levelLabel(player.ntrp);
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={[player.displayName, level, place].filter(Boolean).join(", ")}
      accessibilityHint="Opens their profile"
      style={styles.row}
    >
      <Avatar name={player.displayName} photoUrl={player.photoUrl} />
      <View style={styles.fill}>
        <Text variant="subheading" numberOfLines={1}>
          {player.displayName}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1} tabular>
          {level}
        </Text>
      </View>
      {place ? (
        <Tag
          label={place}
          tone={state === "invited" || state === "requested" ? "clay" : "neutral"}
        />
      ) : null}
      {trailing}
    </Card>
  );
}

/** A player to pick in the invite list: a checkbox row with their photo, name and level. */
export function PickPlayerRow({
  player,
  meta,
  selected,
  onPress,
}: {
  player: { readonly displayName: string; readonly photoUrl: string | null };
  meta: string;
  selected: boolean;
  onPress: () => void;
}) {
  const palette = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${player.displayName}, ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pick,
        selected
          ? { backgroundColor: palette.accentSoft, borderColor: palette.accent }
          : { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && { opacity: motion.pressOpacity },
      ]}
    >
      <Avatar name={player.displayName} photoUrl={player.photoUrl} />
      <View style={styles.fill}>
        <Text variant="subheading" numberOfLines={1} color={selected ? "onAccentSoft" : "text"}>
          {player.displayName}
        </Text>
        <Text
          variant="caption"
          numberOfLines={1}
          color={selected ? "onAccentSoft" : "textMuted"}
          tabular
        >
          {meta}
        </Text>
      </View>
      {selected ? (
        <Icon ios="checkmark.circle.fill" md="check_circle" color="onAccentSoft" />
      ) : (
        <Icon ios="circle" md="radio_button_unchecked" color="textMuted" />
      )}
    </Pressable>
  );
}

/** A labelled group in a form or on the detail screen. */
export function Section({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View>
        <Text variant="heading" accessibilityRole="header">
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" color="textMuted">
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
      {error ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A wrapping row of pick-one chips. */
export function ChipChoices<T extends string | number | null>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {options.map((option) => (
        <Chip
          key={String(option.value)}
          label={option.label}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { gap: space[2] },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  host: { flexDirection: "row", alignItems: "center", gap: space[2] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  section: { gap: space[3] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: size.minTap,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    borderWidth: size.hairline,
    padding: space[3],
  },
});
