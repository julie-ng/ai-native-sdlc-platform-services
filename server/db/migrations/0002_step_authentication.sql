ALTER TABLE "runs" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "steps" ADD COLUMN "role" text NOT NULL;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_role_check" CHECK ("steps"."role" IN ('planner', 'coder'));