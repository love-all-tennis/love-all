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
import {
  CancelSessionButton,
  JoinRequests,
  SessionJoinActions,
  useJoinChanges,
} from "@/features/sessions/joining-components";
import { pendingRequests } from "@/features/sessions/joining";
import { authClient } from "@/lib/auth-client";
import { useNow, useSessionDetail } from "@/features/sessions/use-sessions";
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
  const changes = useJoinChanges({
    session,
    myId: auth?.user.id,
    replace: onReplaced,
    reload: onChanged,
  });
  const tags = sessionTags(session, now);
  const isHost = session.me?.role === "host";
  const editable = isEditable(session, now);
  // While the host can still answer, requests get their own section with Approve and Decline.
  const requestsShown = isHost && editable && pendingRequests(session).length > 0;
  const spotsLeft = session.spots - session.acceptedCount;
  const distance = distanceLabel(session.distanceKm);
  const participants = [...session.participants]
    .filter((p) => !(requestsShown && p.state === "requested"))
    .sort(
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

      <SessionJoinActions session={session} now={now} changes={changes} />

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

      <JoinRequests session={session} now={now} changes={changes} onOpenPlayer={openPlayer} />

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
          <CancelSessionButton session={session} changes={changes} />
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
