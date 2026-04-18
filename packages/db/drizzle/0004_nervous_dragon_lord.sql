CREATE TYPE "public"."silo_image_delivery_policy" AS ENUM('disabled', 'public_only', 'public_and_private_opt_in');--> statement-breakpoint
ALTER TABLE "silo_file_keys" ADD COLUMN "serve_image" boolean;--> statement-breakpoint
ALTER TABLE "silo_projects" ADD COLUMN "image_delivery_policy" "silo_image_delivery_policy" DEFAULT 'disabled' NOT NULL;--> statement-breakpoint
ALTER TABLE "silo_projects" ADD COLUMN "preserve_image_exif" boolean DEFAULT false NOT NULL;