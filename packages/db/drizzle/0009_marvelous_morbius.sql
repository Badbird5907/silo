DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_enum e
		JOIN pg_type t ON t.oid = e.enumtypid
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE t.typname = 'silo_audit_log_download_policy'
			AND n.nspname = 'public'
			AND e.enumlabel = 'all'
	) THEN
		ALTER TYPE "public"."silo_audit_log_download_policy" RENAME VALUE 'all' TO 'always';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "silo_projects" ADD COLUMN "audit_log_download_policy" "silo_audit_log_download_policy";--> statement-breakpoint
UPDATE "silo_projects"
SET "audit_log_download_policy" = CASE
	WHEN "audit_log_downloads" THEN 'always'::"public"."silo_audit_log_download_policy"
	ELSE 'disabled'::"public"."silo_audit_log_download_policy"
END;--> statement-breakpoint
ALTER TABLE "silo_projects" ALTER COLUMN "audit_log_download_policy" SET DEFAULT 'disabled'::"public"."silo_audit_log_download_policy";--> statement-breakpoint
ALTER TABLE "silo_projects" ALTER COLUMN "audit_log_download_policy" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "silo_projects" DROP COLUMN "audit_log_downloads";