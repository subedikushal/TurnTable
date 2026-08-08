-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DELETED', 'PSEUDONYMIZED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DueMode" AS ENUM ('ALL_DAY', 'TIME');

-- CreateEnum
CREATE TYPE "AssignmentStrategy" AS ENUM ('ROUND_ROBIN', 'FIXED');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'SKIPPED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SwapType" AS ENUM ('SWAP', 'COVER');

-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SplitMode" AS ENUM ('EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES');

-- CreateEnum
CREATE TYPE "FinancialStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'UTILITIES', 'INTERNET', 'GROCERIES', 'HOUSEHOLD_SUPPLIES', 'DINING_SHARED', 'TRANSPORT_SHARED', 'OTHER');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "oidc_subject" TEXT NOT NULL,
    "email" TEXT,
    "display_name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_memberships" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "household_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_invitations" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "created_by_member_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_email" TEXT,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_by_user_id" UUID,
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "created_by_member_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'ACTIVE',
    "recurrence_rule" TEXT,
    "start_local_date" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "due_mode" "DueMode" NOT NULL,
    "due_local_time" TIME(0),
    "assignment_strategy" "AssignmentStrategy" NOT NULL,
    "fixed_assignee_member_id" UUID,
    "rotation_cursor_position" INTEGER NOT NULL DEFAULT 0,
    "weight" SMALLINT NOT NULL DEFAULT 1,
    "reminder_offsets_minutes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_rotation_members" (
    "task_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "active_from" DATE,
    "active_until" DATE,

    CONSTRAINT "task_rotation_members_pkey" PRIMARY KEY ("task_id","member_id")
);

-- CreateTable
CREATE TABLE "task_occurrences" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "local_date" DATE NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "nominal_assignee_member_id" UUID,
    "current_assignee_member_id" UUID,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "completed_by_member_id" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "skip_reason" TEXT,
    "is_user_modified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "task_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "away_periods" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "away_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swap_requests" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "type" "SwapType" NOT NULL,
    "source_occurrence_id" UUID NOT NULL,
    "target_occurrence_id" UUID,
    "target_member_id" UUID NOT NULL,
    "requested_by_member_id" UUID NOT NULL,
    "status" "SwapStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "decided_by_member_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "created_by_member_id" UUID NOT NULL,
    "payer_member_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "split_mode" "SplitMode" NOT NULL,
    "note" TEXT,
    "status" "FinancialStatus" NOT NULL DEFAULT 'ACTIVE',
    "voided_at" TIMESTAMPTZ(6),
    "voided_by_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_splits" (
    "expense_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "input_value" DECIMAL(20,8),

    CONSTRAINT "expense_splits_pkey" PRIMARY KEY ("expense_id","member_id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "payer_member_id" UUID NOT NULL,
    "receiver_member_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "settled_at" TIMESTAMPTZ(6) NOT NULL,
    "note" TEXT,
    "created_by_member_id" UUID NOT NULL,
    "status" "FinancialStatus" NOT NULL DEFAULT 'ACTIVE',
    "voided_at" TIMESTAMPTZ(6),
    "voided_by_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "member_id" UUID NOT NULL,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "task_reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "swap_events_enabled" BOOLEAN NOT NULL DEFAULT true,
    "expense_events_enabled" BOOLEAN NOT NULL DEFAULT true,
    "settlement_events_enabled" BOOLEAN NOT NULL DEFAULT true,
    "quiet_hours_start" TIME(0),
    "quiet_hours_end" TIME(0),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("member_id")
);

-- CreateTable
CREATE TABLE "push_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "platform" "PushPlatform" NOT NULL,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_events" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "actor_member_id" UUID,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "household_id" UUID,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "last_error_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "operation_scope" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_oidc_subject_key" ON "users"("oidc_subject");

-- CreateIndex
CREATE INDEX "household_memberships_user_id_status_idx" ON "household_memberships"("user_id", "status");

-- CreateIndex
CREATE INDEX "household_memberships_household_id_status_role_idx" ON "household_memberships"("household_id", "status", "role");

-- CreateIndex
CREATE UNIQUE INDEX "household_memberships_household_id_user_id_key" ON "household_memberships"("household_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "household_invitations_token_hash_key" ON "household_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "household_invitations_household_id_status_expires_at_idx" ON "household_invitations"("household_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "tasks_household_id_status_idx" ON "tasks"("household_id", "status");

-- CreateIndex
CREATE INDEX "task_rotation_members_member_id_idx" ON "task_rotation_members"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_rotation_members_task_id_position_key" ON "task_rotation_members"("task_id", "position");

-- CreateIndex
CREATE INDEX "task_occurrences_household_id_due_at_idx" ON "task_occurrences"("household_id", "due_at");

-- CreateIndex
CREATE INDEX "task_occurrences_current_assignee_member_id_due_at_idx" ON "task_occurrences"("current_assignee_member_id", "due_at");

-- CreateIndex
CREATE INDEX "task_occurrences_task_id_local_date_idx" ON "task_occurrences"("task_id", "local_date");

-- CreateIndex
CREATE UNIQUE INDEX "task_occurrences_task_id_local_date_due_at_key" ON "task_occurrences"("task_id", "local_date", "due_at");

-- CreateIndex
CREATE INDEX "away_periods_household_id_start_date_end_date_idx" ON "away_periods"("household_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "away_periods_member_id_start_date_end_date_idx" ON "away_periods"("member_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "swap_requests_household_id_status_created_at_idx" ON "swap_requests"("household_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "swap_requests_source_occurrence_id_idx" ON "swap_requests"("source_occurrence_id");

-- CreateIndex
CREATE INDEX "swap_requests_target_occurrence_id_idx" ON "swap_requests"("target_occurrence_id");

-- CreateIndex
CREATE INDEX "expenses_household_id_occurred_at_idx" ON "expenses"("household_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "expenses_household_id_category_occurred_at_idx" ON "expenses"("household_id", "category", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "expense_splits_member_id_expense_id_idx" ON "expense_splits"("member_id", "expense_id");

-- CreateIndex
CREATE INDEX "settlements_household_id_settled_at_idx" ON "settlements"("household_id", "settled_at" DESC);

-- CreateIndex
CREATE INDEX "settlements_payer_member_id_receiver_member_id_settled_at_idx" ON "settlements"("payer_member_id", "receiver_member_id", "settled_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");

-- CreateIndex
CREATE INDEX "push_devices_user_id_active_idx" ON "push_devices"("user_id", "active");

-- CreateIndex
CREATE INDEX "activity_events_household_id_created_at_idx" ON "activity_events"("household_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_actor_user_id_operation_scope_idempoten_key" ON "idempotency_records"("actor_user_id", "operation_scope", "idempotency_key");

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_memberships" ADD CONSTRAINT "household_memberships_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_memberships" ADD CONSTRAINT "household_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_fixed_assignee_member_id_fkey" FOREIGN KEY ("fixed_assignee_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_rotation_members" ADD CONSTRAINT "task_rotation_members_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_rotation_members" ADD CONSTRAINT "task_rotation_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_nominal_assignee_member_id_fkey" FOREIGN KEY ("nominal_assignee_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_current_assignee_member_id_fkey" FOREIGN KEY ("current_assignee_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_completed_by_member_id_fkey" FOREIGN KEY ("completed_by_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "away_periods" ADD CONSTRAINT "away_periods_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "away_periods" ADD CONSTRAINT "away_periods_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_source_occurrence_id_fkey" FOREIGN KEY ("source_occurrence_id") REFERENCES "task_occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_target_occurrence_id_fkey" FOREIGN KEY ("target_occurrence_id") REFERENCES "task_occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_target_member_id_fkey" FOREIGN KEY ("target_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_requested_by_member_id_fkey" FOREIGN KEY ("requested_by_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_decided_by_member_id_fkey" FOREIGN KEY ("decided_by_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payer_member_id_fkey" FOREIGN KEY ("payer_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_voided_by_member_id_fkey" FOREIGN KEY ("voided_by_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_payer_member_id_fkey" FOREIGN KEY ("payer_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_receiver_member_id_fkey" FOREIGN KEY ("receiver_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_voided_by_member_id_fkey" FOREIGN KEY ("voided_by_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_member_id_fkey" FOREIGN KEY ("actor_member_id") REFERENCES "household_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Database-only constraints required by the Data Model specification.
ALTER TABLE "tasks" ALTER COLUMN "reminder_offsets_minutes" SET NOT NULL;

ALTER TABLE "households"
  ADD CONSTRAINT "households_name_length_check" CHECK (char_length("name") BETWEEN 1 AND 120),
  ADD CONSTRAINT "households_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "households_version_check" CHECK ("version" >= 1);

ALTER TABLE "household_memberships"
  ADD CONSTRAINT "household_memberships_left_at_check" CHECK (("status" = 'ACTIVE' AND "left_at" IS NULL) OR "status" <> 'ACTIVE'),
  ADD CONSTRAINT "household_memberships_version_check" CHECK ("version" >= 1);

-- A partial unique index prevents multiple active owners. The application transaction
-- additionally prevents removing the final active owner.
CREATE UNIQUE INDEX "household_memberships_one_active_owner_idx"
  ON "household_memberships" ("household_id")
  WHERE "role" = 'OWNER' AND "status" = 'ACTIVE';

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_title_length_check" CHECK (char_length("title") BETWEEN 1 AND 120),
  ADD CONSTRAINT "tasks_due_shape_check" CHECK (
    ("due_mode" = 'TIME' AND "due_local_time" IS NOT NULL)
    OR ("due_mode" = 'ALL_DAY' AND "due_local_time" IS NULL)
  ),
  ADD CONSTRAINT "tasks_assignment_shape_check" CHECK (
    ("assignment_strategy" = 'FIXED' AND "fixed_assignee_member_id" IS NOT NULL)
    OR ("assignment_strategy" = 'ROUND_ROBIN' AND "fixed_assignee_member_id" IS NULL)
  ),
  ADD CONSTRAINT "tasks_weight_check" CHECK ("weight" > 0),
  ADD CONSTRAINT "tasks_reminder_offsets_check" CHECK (
    cardinality("reminder_offsets_minutes") <= 3
    AND 0 <= ALL("reminder_offsets_minutes")
  ),
  ADD CONSTRAINT "tasks_version_check" CHECK ("version" >= 1);

ALTER TABLE "task_rotation_members"
  ADD CONSTRAINT "task_rotation_members_position_check" CHECK ("position" >= 0),
  ADD CONSTRAINT "task_rotation_members_dates_check" CHECK (
    "active_from" IS NULL OR "active_until" IS NULL OR "active_until" >= "active_from"
  );

ALTER TABLE "task_occurrences"
  ADD CONSTRAINT "task_occurrences_completion_check" CHECK (
    ("status" = 'COMPLETED' AND "completed_by_member_id" IS NOT NULL AND "completed_at" IS NOT NULL)
    OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL)
  ),
  ADD CONSTRAINT "task_occurrences_version_check" CHECK ("version" >= 1);

CREATE INDEX "task_occurrences_scheduled_due_at_idx"
  ON "task_occurrences" ("due_at") WHERE "status" = 'SCHEDULED';

ALTER TABLE "away_periods"
  ADD CONSTRAINT "away_periods_date_order_check" CHECK ("end_date" >= "start_date");

ALTER TABLE "swap_requests"
  ADD CONSTRAINT "swap_requests_shape_check" CHECK (
    ("type" = 'SWAP' AND "target_occurrence_id" IS NOT NULL)
    OR ("type" = 'COVER' AND "target_occurrence_id" IS NULL)
  ),
  ADD CONSTRAINT "swap_requests_version_check" CHECK ("version" >= 1);

CREATE UNIQUE INDEX "swap_requests_one_pending_source_idx"
  ON "swap_requests" ("source_occurrence_id") WHERE "status" = 'PENDING';

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_description_length_check" CHECK (char_length("description") BETWEEN 1 AND 200),
  ADD CONSTRAINT "expenses_amount_positive_check" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "expenses_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "expenses_version_check" CHECK ("version" >= 1);

ALTER TABLE "expense_splits"
  ADD CONSTRAINT "expense_splits_amount_nonnegative_check" CHECK ("amount_minor" >= 0);

ALTER TABLE "settlements"
  ADD CONSTRAINT "settlements_amount_positive_check" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "settlements_distinct_members_check" CHECK ("payer_member_id" <> "receiver_member_id"),
  ADD CONSTRAINT "settlements_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "settlements_version_check" CHECK ("version" >= 1);

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_attempt_count_check" CHECK ("attempt_count" >= 0);

CREATE INDEX "outbox_events_pending_available_at_idx"
  ON "outbox_events" ("available_at") WHERE "status" = 'PENDING';

ALTER TABLE "idempotency_records"
  ADD CONSTRAINT "idempotency_records_expiry_check" CHECK ("expires_at" > "created_at");
