ALTER TABLE "silo_usage_daily" ALTER COLUMN "storage_bytes" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "silo_usage_daily" ALTER COLUMN "storage_bytes" DROP NOT NULL;--> statement-breakpoint
UPDATE "silo_usage_daily" SET "storage_bytes" = NULL;
