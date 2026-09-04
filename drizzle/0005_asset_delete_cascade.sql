-- Ensure existing VM databases use the same governed asset deletion policy as the application.
ALTER TABLE "approvals" DROP CONSTRAINT IF EXISTS "approvals_asset_id_assets_id_fk";
ALTER TABLE "asset_documents" DROP CONSTRAINT IF EXISTS "asset_documents_asset_id_assets_id_fk";
ALTER TABLE "asset_files" DROP CONSTRAINT IF EXISTS "asset_files_asset_id_assets_id_fk";
ALTER TABLE "asset_relations" DROP CONSTRAINT IF EXISTS "asset_relations_source_asset_id_assets_id_fk";
ALTER TABLE "asset_relations" DROP CONSTRAINT IF EXISTS "asset_relations_target_asset_id_assets_id_fk";
ALTER TABLE "asset_shares" DROP CONSTRAINT IF EXISTS "asset_shares_asset_id_assets_id_fk";
ALTER TABLE "asset_tags" DROP CONSTRAINT IF EXISTS "asset_tags_asset_id_assets_id_fk";
ALTER TABLE "asset_versions" DROP CONSTRAINT IF EXISTS "asset_versions_asset_id_assets_id_fk";
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_asset_id_assets_id_fk";

ALTER TABLE "approvals" ADD CONSTRAINT "approvals_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;
ALTER TABLE "asset_documents" ADD CONSTRAINT "asset_documents_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;
ALTER TABLE "asset_files" ADD CONSTRAINT "asset_files_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;
ALTER TABLE "asset_relations" ADD CONSTRAINT "asset_relations_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;
ALTER TABLE "asset_relations" ADD CONSTRAINT "asset_relations_target_asset_id_assets_id_fk" FOREIGN KEY ("target_asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;
ALTER TABLE "asset_shares" ADD CONSTRAINT "asset_shares_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;
ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;
