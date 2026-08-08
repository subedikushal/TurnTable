-- Household and membership trigger rows have different shapes. Branch before
-- referencing table-specific fields so PostgreSQL never resolves a missing
-- household_id field on a households row.
CREATE OR REPLACE FUNCTION enforce_household_exactly_one_active_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_household_id uuid;
  owner_count integer;
BEGIN
  IF TG_TABLE_NAME = 'households' THEN
    target_household_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target_household_id := OLD.household_id;
  ELSE
    target_household_id := NEW.household_id;
  END IF;

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
