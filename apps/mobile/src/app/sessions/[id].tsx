import type { Session } from "@love-all/domain";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Linking, Platform, StyleSheet, View } from "react-native";

import { Button, EmptyState, Icon, Loading, Screen, space, Tag, Text } from "@/design";
import { ParticipantRow, Section } from "@/features/sessions/components";
import {
  durationLabel,
  isEditable,
  kindLabel,
  levelRangeLabel,
  mapsUrl,
  sessionTags,
  spotsLabel,
  visibilityLabel,
  whenLabel,
} from "@/features/sessions/format";
import { SessionComments, SessionScore } from "@/features/session-activity/components";
import { canUseComments } from "@/features/session-activity/score";
import { PlayerActions } from "@/features/sessions/player-actions";
import { useNow, useSessionDetail } from "@/features/sessions/use-sessions";
import { authClient } from "@/lib/auth-client";
import { distanceLabel } from "@/lib/distance";

const openPlayer = (id: string) => router.push({ pathname: "/players/[id]", params: { id } });

/** Who stands where, in the order a player reads them: in, then waiting, then out. */
const STATE_ORDER = { accepted: 0, requested: 1, invited: 2, declined: 3, left: 4 } as const;

/** One session: when, where, what level, and who's playing. The host can edit and invite. */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, reload, replace } = useSessionDetail(id);
  const title = state.kind === "ready" ? kindLabel(state.session.kind) : "";

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title }} />
      {state.kind === "loading" ? <Loading label="Loading the session" /> : null}
      {state.kind === "missing" ? (
        <EmptyState
          title="Session not found"
          body="It may have been cancelled, or it isn't open to you."
          action={{ label: "Back to sessions", onPress: () => router.back() }}
        />
      ) : null}
      {state.kind === "error" ? (
        <EmptyState
          title="Couldn't load this session"
          body="Check your connection and try again."
          action={{ label: "Try again", onPress: reload }}
        />
      ) : null}
      {state.kind === "ready" ? (
        <SessionBody session={state.session} onChanged={reload} onReplaced={replace} />
      ) : null}
    </Screen>
  );
}

function SessionBody({
  session,
  onChanged,
  onReplaced,
}: {
  session: Session;
  /** Reloads the session after an action that answers with no content. */
  onChanged: () => void;
  /** Puts in a session an action already returned. */
  onReplaced: (session: Session) => void;
}) {
  const now = useNow();
  const { data: auth } = authClient.useSession();
  const meId = auth?.user.id ?? null;
  const tags = sessionTags(session, now);
  const isHost = session.me?.role === "host";
  const editable = isEditable(session, now);
  const spotsLeft = session.spots - session.acceptedCount;
  const distance = distanceLabel(session.distanceKm);
  const participants = [...session.participants].sort(
    (a, b) =>
      (a.role === "host" ? -1 : STATE_ORDER[a.state]) -
      (b.role === "host" ? -1 : STATE_ORDER[b.state]),
  );

  return (
    <>
      <View style={styles.hero}>
        {tags.length > 0 ? (
          <View style={styles.tags}>
            {tags.map((tag) => (
              <Tag key={tag.label} label={tag.label} tone={tag.tone} />
            ))}
          </View>
        ) : null}
        <Text variant="title" tabular>
          {whenLabel(session.startsAt)}
        </Text>
        <Text color="textMuted" tabular>
          {`${kindLabel(session.kind)} · ${durationLabel(session.durationMinutes)}`}
        </Text>
      </View>

      {/* Join, accept, approve and leave (#40) go here. */}
      <PlayerActions session={session} onChanged={onChanged} onReplaced={onReplaced} />

      <Section label="Court">
        <View style={styles.line}>
          <Icon ios="mappin.and.ellipse" md="location_on" />
          <View style={styles.fill}>
            <Text>{session.courtName}</Text>
            {distance ? (
              <Text variant="caption" color="textMuted" tabular>
                {distance}
              </Text>
            ) : null}
          </View>
        </View>
        {session.courtPoint ? (
          <Button
            variant="secondary"
            size="small"
            label="Open in Maps"
            icon={<Icon ios="map" md="map" size="sm" color="text" />}
            onPress={() =>
              void Linking.openURL(mapsUrl(session.courtPoint!, session.courtName, Platform.OS))
            }
          />
        ) : null}
      </Section>

      <Section label="Details">
        <Text tabular>{levelRangeLabel(session.levelMin, session.levelMax)}</Text>
        <Text tabular>{spotsLabel(session.acceptedCount, session.spots)}</Text>
        <Text>{visibilityLabel(session.visibility)}</Text>
        {session.notes ? <Text color="textMuted">{session.notes}</Text> : null}
      </Section>

      <Section label="Players">
        <View style={styles.list}>
          {participants.map((participant) => (
            <ParticipantRow
              key={participant.player.id}
              participant={participant}
              onPress={() => openPlayer(participant.player.id)}
            />
          ))}
        </View>
      </Section>

      <SessionScore
        session={session}
        meId={meId}
        now={now}
        onRecord={() => router.push({ pathname: "/sessions/score", params: { id: session.id } })}
      />

      {canUseComments(session.me) ? (
        <SessionComments
          sessionId={session.id}
          meId={meId}
          closed={session.status === "cancelled"}
        />
      ) : null}

      {isHost && editable ? (
        <View style={styles.actions}>
          {spotsLeft > 0 ? (
            <Button
              label="Invite players"
              icon={<Icon ios="person.badge.plus" md="person_add" size="sm" color="onAccent" />}
              onPress={() =>
                router.push({ pathname: "/sessions/invite", params: { id: session.id } })
              }
            />
          ) : null}
          <Button
            variant="secondary"
            label="Edit session"
            onPress={() => router.push({ pathname: "/sessions/edit", params: { id: session.id } })}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hero: { gap: space[2] },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  line: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  list: { gap: space[2] },
  actions: { gap: space[3] },
});
