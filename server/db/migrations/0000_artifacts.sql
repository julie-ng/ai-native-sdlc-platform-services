CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"producer_step_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"kind" text,
	"title" text,
	"description" text,
	"state" text DEFAULT 'reserved' NOT NULL,
	"size_bytes" integer,
	"sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifacts_producer_step_id_name_unique" UNIQUE("producer_step_id","name"),
	CONSTRAINT "artifacts_state_check" CHECK (("artifacts"."state" = 'reserved' AND "artifacts"."size_bytes" IS NULL AND "artifacts"."sha256" IS NULL)
    OR ("artifacts"."state" = 'uploaded' AND "artifacts"."size_bytes" IS NOT NULL AND "artifacts"."sha256" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_producer_step_id_steps_id_fk" FOREIGN KEY ("producer_step_id") REFERENCES "public"."steps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;