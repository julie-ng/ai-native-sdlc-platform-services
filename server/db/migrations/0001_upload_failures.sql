ALTER TABLE "artifacts" DROP CONSTRAINT "artifacts_state_check";--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "details" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_state_check" CHECK (("artifacts"."state" = 'reserved' AND "artifacts"."size_bytes" IS NULL AND "artifacts"."sha256" IS NULL AND "artifacts"."details" IS NULL)
    OR ("artifacts"."state" = 'uploaded' AND "artifacts"."size_bytes" IS NOT NULL AND "artifacts"."sha256" IS NOT NULL)
    OR ("artifacts"."state" = 'failed' AND "artifacts"."size_bytes" IS NULL AND "artifacts"."sha256" IS NULL));