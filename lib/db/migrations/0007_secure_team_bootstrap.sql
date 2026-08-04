CREATE UNIQUE INDEX IF NOT EXISTS "team_members_mango_member_id_unique"
  ON "team_members" USING btree ("mango_member_id")
  WHERE "mango_member_id" IS NOT NULL;