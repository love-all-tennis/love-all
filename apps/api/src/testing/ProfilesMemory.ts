import { Me, Profile, type SessionUser } from "@love-all/domain";
import { Effect, Layer } from "effect";
import { roundHomePoint } from "../db/geo";
import { Profiles } from "../Profiles";

type ProfileFields = ConstructorParameters<typeof Profile>[0];

export const ProfilesMemory = Layer.sync(Profiles, () => {
  const profiles = new Map<string, ProfileFields>();
  const schedules = new Map<string, Me["availability"]>();

  const get = (user: SessionUser) =>
    Effect.sync(
      () =>
        new Me({
          user,
          profile: profiles.has(user.id) ? new Profile(profiles.get(user.id)!) : null,
          availability: schedules.get(user.id) ?? [],
        }),
    );

  const ensure = (user: SessionUser) =>
    profiles.get(user.id) ?? {
      displayName: user.name,
      photoUrl: null,
      homePoint: null,
      metro: null,
      searchRadiusKm: 15,
      ntrp: null,
      handedness: null,
      playsSingles: false,
      playsDoubles: false,
      playsHitting: false,
      bio: null,
    };

  return Profiles.of({
    get,
    update: (user, { homePoint, ...rest }) =>
      Effect.suspend(() => {
        const current = ensure(user);
        const rounded = homePoint && roundHomePoint({ x: homePoint.lng, y: homePoint.lat });
        profiles.set(user.id, {
          ...current,
          ...rest,
          homePoint:
            rounded === undefined
              ? current.homePoint
              : rounded && { lat: rounded.y, lng: rounded.x },
        });

        return get(user);
      }),
    replaceAvailability: (user, blocks) =>
      Effect.sync(() => {
        profiles.set(user.id, ensure(user));

        const sorted = [...blocks].sort(
          (a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime),
        );

        schedules.set(user.id, sorted);

        return sorted;
      }),
  });
});
