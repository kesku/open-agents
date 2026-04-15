ALTER TABLE "sessions" ADD COLUMN "git_mutation_lease_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "git_mutation_lease_type" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "git_mutation_lease_expires_at" timestamp;