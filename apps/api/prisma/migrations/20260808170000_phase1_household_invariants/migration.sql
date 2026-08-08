-- Phase 1 strengthens lifecycle and cross-row household invariants that Prisma
-- cannot represent directly.

ALTER TABLE "household_memberships"
  DROP CONSTRAINT "household_memberships_left_at_check",
  ADD CONSTRAINT "household_memberships_left_at_check" CHECK (
    ("status" = 'ACTIVE' AND "left_at" IS NULL)
    OR ("status" <> 'ACTIVE' AND "left_at" IS NOT NULL)
  );

ALTER TABLE "household_invitations"
  ADD CONSTRAINT "household_invitations_token_hash_check" CHECK (
    "token_hash" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "household_invitations_expiry_check" CHECK (
    "expires_at" > "created_at"
  ),
  ADD CONSTRAINT "household_invitations_acceptance_check" CHECK (
    (
      "status" = 'ACCEPTED'
      AND "accepted_by_user_id" IS NOT NULL
      AND "accepted_at" IS NOT NULL
    )
    OR (
      "status" <> 'ACCEPTED'
      AND "accepted_by_user_id" IS NULL
      AND "accepted_at" IS NULL
    )
  );

CREATE FUNCTION enforce_household_exactly_one_active_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_household_id uuid;
  owner_count integer;
BEGIN
  target_household_id := CASE
    WHEN TG_TABLE_NAME = 'households' THEN NEW.id
    ELSE COALESCE(NEW.household_id, OLD.household_id)
  END;

  IF NOT EXISTS (SELECT 1 FROM households WHERE id = target_household_id) THEN
    RETURN NULL;
  END IF;

  SELECT count(*)
    INTO owner_count
    FROM household_memberships
   WHERE household_id = target_household_id
     AND role = 'OWNER'
     AND status = 'ACTIVE';

  IF owner_count <> 1 THEN
    RAISE EXCEPTION 'household must have exactly one active owner'
      USING ERRCODE = '23514',
            CONSTRAINT = 'household_exactly_one_active_owner';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "households_exactly_one_active_owner_trigger"
AFTER INSERT OR UPDATE ON "households"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_household_exactly_one_active_owner();

CREATE CONSTRAINT TRIGGER "memberships_exactly_one_active_owner_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "household_memberships"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_household_exactly_one_active_owner();
