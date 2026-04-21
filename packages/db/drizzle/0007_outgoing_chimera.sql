CREATE TYPE "public"."silo_audit_actor_types" AS ENUM('user', 'api_key', 'system');--> statement-breakpoint
CREATE TYPE "public"."silo_audit_event_categories" AS ENUM('operational', 'configuration', 'security', 'lifecycle');--> statement-breakpoint
CREATE TYPE "public"."silo_audit_resource_types" AS ENUM('project', 'environment', 'api_key', 'file', 'file_key', 'organization', 'member', 'invitation', 'system');--> statement-breakpoint
CREATE TYPE "public"."silo_audit_statuses" AS ENUM('success', 'failure');--> statement-breakpoint
CREATE TABLE "silo_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"environment_id" text,
	"actor_type" "silo_audit_actor_types" NOT NULL,
	"actor_user_id" text,
	"actor_member_id" text,
	"actor_label" text,
	"event_code" text NOT NULL,
	"event_category" "silo_audit_event_categories" NOT NULL,
	"resource_type" "silo_audit_resource_types" NOT NULL,
	"resource_id" text,
	"resource_label" text,
	"status" "silo_audit_statuses" DEFAULT 'success' NOT NULL,
	"summary" text NOT NULL,
	"changes" jsonb,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "silo_audit_events" ADD CONSTRAINT "silo_audit_events_organization_id_silo_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."silo_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_audit_events" ADD CONSTRAINT "silo_audit_events_project_id_silo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."silo_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_audit_events" ADD CONSTRAINT "silo_audit_events_environment_id_silo_project_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."silo_project_environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_audit_events" ADD CONSTRAINT "silo_audit_events_actor_user_id_silo_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."silo_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_audit_events" ADD CONSTRAINT "silo_audit_events_actor_member_id_silo_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."silo_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_org_project_created_at_idx" ON "silo_audit_events" USING btree ("organization_id","project_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_org_project_env_created_at_idx" ON "silo_audit_events" USING btree ("organization_id","project_id","environment_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_org_category_created_at_idx" ON "silo_audit_events" USING btree ("organization_id","event_category","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_org_actor_user_created_at_idx" ON "silo_audit_events" USING btree ("organization_id","actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_org_event_code_created_at_idx" ON "silo_audit_events" USING btree ("organization_id","event_code","created_at");