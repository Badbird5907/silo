CREATE TYPE "public"."silo_audit_log_download_policy" AS ENUM('disabled', 'all', 'signed_only');--> statement-breakpoint
ALTER TABLE "silo_audit_events" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "silo_projects" ADD COLUMN "audit_log_retention_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "silo_projects" ADD COLUMN "audit_log_downloads" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "silo_projects" ADD COLUMN "usage_event_retention_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "silo_usage_events" ADD COLUMN "expires_at" timestamp;