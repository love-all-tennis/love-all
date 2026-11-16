-- Detroit is the launch metro. Centered on downtown; 60 km reaches Pontiac,
-- Mount Clemens, Ann Arbor's east side and Monroe's north edge.
INSERT INTO "metro" ("slug", "name", "center_point", "radius_km")
VALUES ('detroit', 'Detroit', ST_SetSRID(ST_MakePoint(-83.0458, 42.3314), 4326), 60)
ON CONFLICT ("slug") DO NOTHING;
