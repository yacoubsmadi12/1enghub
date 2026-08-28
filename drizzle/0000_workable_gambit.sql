CREATE TYPE "public"."approval_kind" AS ENUM('asset_submission', 'file_attachment', 'version_release', 'access_request');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'changes_requested', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('draft', 'testing', 'pending_review', 'changes_requested', 'approved', 'published', 'active', 'deprecated', 'archived', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('tool', 'script', 'automation', 'source_code', 'documentation', 'sop', 'config_template', 'dashboard', 'report', 'runbook', 'troubleshooting_guide', 'knowledge');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('asset_created', 'asset_updated', 'asset_submitted', 'asset_approved', 'asset_rejected', 'asset_published', 'file_uploaded', 'file_downloaded', 'asset_shared', 'access_revoked', 'role_changed', 'ownership_transferred');--> statement-breakpoint
CREATE TYPE "public"."file_review_status" AS ENUM('draft', 'pending_review', 'approved', 'rejected', 'published');--> statement-breakpoint
CREATE TYPE "public"."security_classification" AS ENUM('public_internal', 'internal', 'confidential', 'restricted', 'highly_restricted');--> statement-breakpoint
CREATE TYPE "public"."share_permission" AS ENUM('view', 'download', 'contribute', 'manage');--> statement-breakpoint
CREATE TYPE "public"."share_recipient_type" AS ENUM('user', 'team');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('top_manager', 'manager', 'team_member');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"file_id" uuid,
	"version_id" uuid,
	"kind" "approval_kind" NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision_note" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "asset_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"purpose" text,
	"prerequisites" text,
	"installation" text,
	"configuration" text,
	"usage" text,
	"troubleshooting" text,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_documents_asset_id_unique" UNIQUE("asset_id")
);
--> statement-breakpoint
CREATE TABLE "asset_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"version_id" uuid,
	"uploaded_by_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"storage_url" varchar(1024) NOT NULL,
	"content_type" varchar(160) NOT NULL,
	"extension" varchar(24) NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" varchar(64),
	"review_status" "file_review_status" DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "asset_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_asset_id" uuid NOT NULL,
	"target_asset_id" uuid NOT NULL,
	"relation_type" varchar(48) NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"recipient_type" "share_recipient_type" NOT NULL,
	"recipient_user_id" uuid,
	"recipient_team_id" uuid,
	"permission" "share_permission" DEFAULT 'view' NOT NULL,
	"expires_at" timestamp with time zone,
	"granted_by_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_tags" (
	"asset_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"version" varchar(48) NOT NULL,
	"release_notes" text,
	"submitted_by_id" uuid NOT NULL,
	"approved_by_id" uuid,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_key" varchar(48) NOT NULL,
	"name" varchar(240) NOT NULL,
	"summary" varchar(480),
	"description" text,
	"type" "asset_type" NOT NULL,
	"status" "asset_status" DEFAULT 'draft' NOT NULL,
	"classification" "security_classification" DEFAULT 'internal' NOT NULL,
	"owner_id" uuid NOT NULL,
	"manager_id" uuid,
	"home_team_id" uuid NOT NULL,
	"vendor" varchar(160),
	"technology" varchar(160),
	"business_value" text,
	"estimated_hours_saved" integer DEFAULT 0 NOT NULL,
	"estimated_cost_saved" integer DEFAULT 0 NOT NULL,
	"current_version" varchar(48) DEFAULT '0.1.0' NOT NULL,
	"review_due_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_asset_key_unique" UNIQUE("asset_key")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" "audit_action" NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" uuid,
	"asset_id" uuid,
	"result" varchar(32) DEFAULT 'success' NOT NULL,
	"ip_address" varchar(64),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"code" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(64) NOT NULL,
	"title" varchar(240) NOT NULL,
	"body" text NOT NULL,
	"asset_id" uuid,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(72) NOT NULL,
	"color" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid,
	"name" varchar(160) NOT NULL,
	"code" varchar(32) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"open_id" varchar(128) NOT NULL,
	"name" varchar(160),
	"email" varchar(320),
	"login_method" varchar(64),
	"role" "user_role" DEFAULT 'team_member' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_signed_in" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_file_id_asset_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."asset_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_version_id_asset_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."asset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_documents" ADD CONSTRAINT "asset_documents_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_documents" ADD CONSTRAINT "asset_documents_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_files" ADD CONSTRAINT "asset_files_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_files" ADD CONSTRAINT "asset_files_version_id_asset_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."asset_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_files" ADD CONSTRAINT "asset_files_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relations" ADD CONSTRAINT "asset_relations_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relations" ADD CONSTRAINT "asset_relations_target_asset_id_assets_id_fk" FOREIGN KEY ("target_asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relations" ADD CONSTRAINT "asset_relations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_shares" ADD CONSTRAINT "asset_shares_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_shares" ADD CONSTRAINT "asset_shares_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_shares" ADD CONSTRAINT "asset_shares_recipient_team_id_teams_id_fk" FOREIGN KEY ("recipient_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_shares" ADD CONSTRAINT "asset_shares_granted_by_id_users_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_reviewer_status_idx" ON "approvals" USING btree ("reviewer_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "approval_asset_status_idx" ON "approvals" USING btree ("asset_id","status");--> statement-breakpoint
CREATE INDEX "asset_file_asset_status_idx" ON "asset_files" USING btree ("asset_id","review_status");--> statement-breakpoint
CREATE INDEX "asset_file_uploader_idx" ON "asset_files" USING btree ("uploaded_by_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_relation_unique" ON "asset_relations" USING btree ("source_asset_id","target_asset_id","relation_type");--> statement-breakpoint
CREATE INDEX "asset_relation_target_idx" ON "asset_relations" USING btree ("target_asset_id");--> statement-breakpoint
CREATE INDEX "asset_share_asset_idx" ON "asset_shares" USING btree ("asset_id","expires_at");--> statement-breakpoint
CREATE INDEX "asset_share_user_idx" ON "asset_shares" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "asset_share_team_idx" ON "asset_shares" USING btree ("recipient_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_tag_unique" ON "asset_tags" USING btree ("asset_id","tag_id");--> statement-breakpoint
CREATE INDEX "asset_tag_tag_idx" ON "asset_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_version_unique" ON "asset_versions" USING btree ("asset_id","version");--> statement-breakpoint
CREATE INDEX "asset_version_asset_idx" ON "asset_versions" USING btree ("asset_id","created_at");--> statement-breakpoint
CREATE INDEX "asset_team_status_idx" ON "assets" USING btree ("home_team_id","status");--> statement-breakpoint
CREATE INDEX "asset_owner_updated_idx" ON "assets" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "asset_type_status_idx" ON "assets" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "asset_search_support_idx" ON "assets" USING btree ("name","technology","vendor");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_asset_idx" ON "audit_events" USING btree ("asset_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_user_read_idx" ON "notifications" USING btree ("user_id","is_read","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_membership_unique" ON "team_memberships" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "team_membership_user_idx" ON "team_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_department_idx" ON "teams" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "users" USING btree ("role");