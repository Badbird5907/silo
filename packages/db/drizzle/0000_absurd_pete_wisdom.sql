CREATE TYPE "public"."silo_file_access_types" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."silo_file_key_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."silo_file_lifecycle_job_kind" AS ENUM('delete_object', 'abort_multipart', 'finalize_failed_filekey', 'repair_missing_object');--> statement-breakpoint
CREATE TYPE "public"."silo_file_lifecycle_job_state" AS ENUM('pending', 'leased', 'retry', 'done', 'dead');--> statement-breakpoint
CREATE TYPE "public"."silo_project_environment_types" AS ENUM('development', 'staging', 'production');--> statement-breakpoint
CREATE TYPE "public"."silo_resource_lifecycle_state" AS ENUM('active', 'deleting');--> statement-breakpoint
CREATE TYPE "public"."silo_usage_event_types" AS ENUM('upload_started', 'upload_completed', 'upload_failed', 'download');--> statement-breakpoint
CREATE TYPE "public"."silo_webhook_attempt_status" AS ENUM('success', 'retry', 'failed');--> statement-breakpoint
CREATE TYPE "public"."silo_webhook_event_types" AS ENUM('upload.completed', 'upload.failed');--> statement-breakpoint
CREATE TABLE "silo_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"created_by_id" text,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "silo_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "silo_callback_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"queue_message_id" text,
	"environment_id" text NOT NULL,
	"project_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "silo_webhook_attempt_status" NOT NULL,
	"response_status" integer,
	"response_body" text,
	"error" text,
	"latency_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"callback_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silo_file_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"access_key" text NOT NULL,
	"file_id" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"environment_id" text NOT NULL,
	"project_id" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"callback_metadata" jsonb,
	"claimed_hash" text,
	"claimed_mime_type" text,
	"claimed_size" bigint NOT NULL,
	"status" "silo_file_key_status" DEFAULT 'pending' NOT NULL,
	"adapter_data" jsonb,
	"expires_at" timestamp,
	"upload_completed_at" timestamp,
	"upload_failed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silo_file_lifecycle_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "silo_file_lifecycle_job_kind" NOT NULL,
	"state" "silo_file_lifecycle_job_state" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"project_id" text,
	"environment_id" text,
	"file_key_id" text,
	"file_id" text,
	"adapter_data" jsonb,
	"idempotency_key" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 10 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp,
	"last_error" text,
	"last_http_status" integer,
	"last_error_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"dead_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "silo_files" (
	"id" text PRIMARY KEY NOT NULL,
	"hash" text,
	"mime_type" text NOT NULL,
	"size" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"environment_id" text NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silo_project_environments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" "silo_project_environment_types" NOT NULL,
	"lifecycle_state" "silo_resource_lifecycle_state" DEFAULT 'active' NOT NULL,
	"owner_user_id" text,
	"webhook_enabled" boolean DEFAULT false NOT NULL,
	"webhook_url" text,
	"webhook_secret" text,
	"webhook_events" "silo_webhook_event_types"[] DEFAULT '{}'::silo_webhook_event_types[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silo_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"default_file_access" "silo_file_access_types" DEFAULT 'private' NOT NULL,
	"lifecycle_state" "silo_resource_lifecycle_state" DEFAULT 'active' NOT NULL,
	"pending_upload_fail_after_minutes" integer DEFAULT 1440 NOT NULL,
	"parent_organization_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "silo_projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "silo_usage_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"environment_id" text,
	"date" date NOT NULL,
	"uploads_started" integer DEFAULT 0 NOT NULL,
	"uploads_completed" integer DEFAULT 0 NOT NULL,
	"uploads_failed" integer DEFAULT 0 NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"bytes_uploaded" bigint DEFAULT 0 NOT NULL,
	"bytes_downloaded" bigint DEFAULT 0 NOT NULL,
	"storage_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silo_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"event_type" "silo_usage_event_types" NOT NULL,
	"bytes" bigint,
	"file_id" text,
	"api_key_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silo_webhook_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"queue_message_id" text,
	"environment_id" text NOT NULL,
	"project_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "silo_webhook_attempt_status" NOT NULL,
	"response_status" integer,
	"response_body" text,
	"error" text,
	"latency_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"webhook_job_id" text,
	"request_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silo_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silo_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silo_members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "silo_organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "silo_organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "silo_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "silo_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "silo_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "silo_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "silo_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "silo_api_keys" ADD CONSTRAINT "silo_api_keys_project_id_silo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."silo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_api_keys" ADD CONSTRAINT "silo_api_keys_organization_id_silo_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."silo_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_api_keys" ADD CONSTRAINT "silo_api_keys_environment_id_silo_project_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."silo_project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_api_keys" ADD CONSTRAINT "silo_api_keys_created_by_id_silo_members_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."silo_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_callback_attempts" ADD CONSTRAINT "silo_callback_attempts_environment_id_silo_project_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."silo_project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_callback_attempts" ADD CONSTRAINT "silo_callback_attempts_project_id_silo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."silo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_file_keys" ADD CONSTRAINT "silo_file_keys_file_id_silo_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."silo_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_file_keys" ADD CONSTRAINT "silo_file_keys_environment_id_silo_project_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."silo_project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_file_keys" ADD CONSTRAINT "silo_file_keys_project_id_silo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."silo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_file_lifecycle_jobs" ADD CONSTRAINT "silo_file_lifecycle_jobs_project_id_silo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."silo_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_file_lifecycle_jobs" ADD CONSTRAINT "silo_file_lifecycle_jobs_environment_id_silo_project_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."silo_project_environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_file_lifecycle_jobs" ADD CONSTRAINT "silo_file_lifecycle_jobs_file_key_id_silo_file_keys_id_fk" FOREIGN KEY ("file_key_id") REFERENCES "public"."silo_file_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_file_lifecycle_jobs" ADD CONSTRAINT "silo_file_lifecycle_jobs_file_id_silo_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."silo_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_files" ADD CONSTRAINT "silo_files_environment_id_silo_project_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."silo_project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_files" ADD CONSTRAINT "silo_files_project_id_silo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."silo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_project_environments" ADD CONSTRAINT "silo_project_environments_project_id_silo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."silo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_project_environments" ADD CONSTRAINT "silo_project_environments_owner_user_id_silo_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."silo_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_projects" ADD CONSTRAINT "silo_projects_parent_organization_id_silo_organizations_id_fk" FOREIGN KEY ("parent_organization_id") REFERENCES "public"."silo_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_usage_daily" ADD CONSTRAINT "silo_usage_daily_organization_id_silo_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."silo_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_usage_daily" ADD CONSTRAINT "silo_usage_daily_project_id_silo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."silo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_usage_daily" ADD CONSTRAINT "silo_usage_daily_environment_id_silo_project_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."silo_project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_usage_events" ADD CONSTRAINT "silo_usage_events_organization_id_silo_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."silo_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_usage_events" ADD CONSTRAINT "silo_usage_events_project_id_silo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."silo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_usage_events" ADD CONSTRAINT "silo_usage_events_environment_id_silo_project_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."silo_project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_usage_events" ADD CONSTRAINT "silo_usage_events_file_id_silo_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."silo_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_usage_events" ADD CONSTRAINT "silo_usage_events_api_key_id_silo_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."silo_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_webhook_attempts" ADD CONSTRAINT "silo_webhook_attempts_environment_id_silo_project_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."silo_project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_webhook_attempts" ADD CONSTRAINT "silo_webhook_attempts_project_id_silo_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."silo_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_accounts" ADD CONSTRAINT "silo_accounts_user_id_silo_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."silo_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_invitations" ADD CONSTRAINT "silo_invitations_organization_id_silo_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."silo_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_invitations" ADD CONSTRAINT "silo_invitations_inviter_id_silo_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."silo_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_members" ADD CONSTRAINT "silo_members_organization_id_silo_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."silo_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_members" ADD CONSTRAINT "silo_members_user_id_silo_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."silo_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silo_sessions" ADD CONSTRAINT "silo_sessions_user_id_silo_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."silo_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "callback_attempts_event_idx" ON "silo_callback_attempts" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "callback_attempts_idempotency_idx" ON "silo_callback_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "callback_attempts_event_attempt_idx" ON "silo_callback_attempts" USING btree ("event_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "file_keys_project_access_key_idx" ON "silo_file_keys" USING btree ("project_id","access_key");--> statement-breakpoint
CREATE INDEX "file_keys_status_expires_at_idx" ON "silo_file_keys" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "file_keys_metadata_gin_idx" ON "silo_file_keys" USING gin ("metadata");--> statement-breakpoint
CREATE UNIQUE INDEX "file_lifecycle_jobs_idempotency_key_idx" ON "silo_file_lifecycle_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "file_lifecycle_jobs_state_next_attempt_idx" ON "silo_file_lifecycle_jobs" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "file_lifecycle_jobs_lease_expires_idx" ON "silo_file_lifecycle_jobs" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE INDEX "file_lifecycle_jobs_file_key_kind_idx" ON "silo_file_lifecycle_jobs" USING btree ("file_key_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_daily_org_project_env_date_idx" ON "silo_usage_daily" USING btree ("organization_id","project_id","environment_id","date");--> statement-breakpoint
CREATE INDEX "webhook_attempts_event_idx" ON "silo_webhook_attempts" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "webhook_attempts_idempotency_idx" ON "silo_webhook_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_attempts_event_attempt_idx" ON "silo_webhook_attempts" USING btree ("event_id","attempt_number");--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "silo_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "silo_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "silo_verifications" USING btree ("identifier");