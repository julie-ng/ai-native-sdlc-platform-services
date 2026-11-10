ALTER TABLE "runs" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "steps" ADD COLUMN "task_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_task_type_check" CHECK ("steps"."task_type" IN ('planner', 'coder'));