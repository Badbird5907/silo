ALTER TYPE "public"."silo_file_key_status" ADD VALUE 'deleted';--> statement-breakpoint
ALTER TABLE "silo_file_keys" DROP CONSTRAINT "silo_file_keys_file_id_silo_files_id_fk";
--> statement-breakpoint
ALTER TABLE "silo_file_keys" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "silo_file_keys" ADD CONSTRAINT "silo_file_keys_file_id_silo_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."silo_files"("id") ON DELETE set null ON UPDATE no action;