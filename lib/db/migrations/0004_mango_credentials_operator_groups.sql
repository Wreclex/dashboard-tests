-- Mango KPI reports require GroupId[] params harvested from the CCC session
-- (<member_id>.operator_groups in localStorage). Cache them per user.
ALTER TABLE "mango_credentials" ADD COLUMN IF NOT EXISTS "operator_groups" text;
