ALTER TABLE "asset_files" ADD COLUMN "relative_path" varchar(512);--> statement-breakpoint
ALTER TABLE "asset_files" ADD COLUMN "file_role" varchar(24) DEFAULT 'project_file' NOT NULL;