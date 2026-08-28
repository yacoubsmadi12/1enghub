import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["top_manager", "manager", "team_member"]);
export const assetTypeEnum = pgEnum("asset_type", [
  "tool",
  "script",
  "automation",
  "source_code",
  "documentation",
  "sop",
  "config_template",
  "dashboard",
  "report",
  "runbook",
  "troubleshooting_guide",
  "knowledge",
]);
export const assetStatusEnum = pgEnum("asset_status", [
  "draft",
  "testing",
  "pending_review",
  "changes_requested",
  "approved",
  "published",
  "active",
  "deprecated",
  "archived",
  "rejected",
]);
export const securityClassificationEnum = pgEnum("security_classification", [
  "public_internal",
  "internal",
  "confidential",
  "restricted",
  "highly_restricted",
]);
export const fileReviewStatusEnum = pgEnum("file_review_status", ["draft", "pending_review", "approved", "rejected", "published"]);
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "changes_requested", "rejected", "cancelled"]);
export const approvalKindEnum = pgEnum("approval_kind", ["asset_submission", "file_attachment", "version_release", "access_request"]);
export const shareRecipientTypeEnum = pgEnum("share_recipient_type", ["user", "team"]);
export const sharePermissionEnum = pgEnum("share_permission", ["view", "download", "contribute", "manage"]);
export const auditActionEnum = pgEnum("audit_action", [
  "asset_created",
  "asset_updated",
  "asset_submitted",
  "asset_approved",
  "asset_rejected",
  "asset_published",
  "file_uploaded",
  "file_downloaded",
  "asset_shared",
  "access_revoked",
  "role_changed",
  "ownership_transferred",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const departments = pgTable("departments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  ...timestamps,
});

export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 160 }).notNull(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
}, table => [index("team_department_idx").on(table.departmentId)]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  openId: varchar("open_id", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 160 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: userRoleEnum("role").default("team_member").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastSignedIn: timestamp("last_signed_in", { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
}, table => [index("user_role_idx").on(table.role)]);

export const teamMemberships = pgTable("team_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  isPrimary: boolean("is_primary").default(false).notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("team_membership_unique").on(table.teamId, table.userId),
  index("team_membership_user_idx").on(table.userId),
]);

export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  assetKey: varchar("asset_key", { length: 48 }).notNull().unique(),
  name: varchar("name", { length: 240 }).notNull(),
  summary: varchar("summary", { length: 480 }),
  description: text("description"),
  type: assetTypeEnum("type").notNull(),
  status: assetStatusEnum("status").default("draft").notNull(),
  classification: securityClassificationEnum("classification").default("internal").notNull(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  managerId: uuid("manager_id").references(() => users.id, { onDelete: "set null" }),
  homeTeamId: uuid("home_team_id").notNull().references(() => teams.id, { onDelete: "restrict" }),
  vendor: varchar("vendor", { length: 160 }),
  technology: varchar("technology", { length: 160 }),
  businessValue: text("business_value"),
  estimatedHoursSaved: integer("estimated_hours_saved").default(0).notNull(),
  estimatedCostSaved: integer("estimated_cost_saved").default(0).notNull(),
  currentVersion: varchar("current_version", { length: 48 }).default("0.1.0").notNull(),
  reviewDueAt: timestamp("review_due_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
}, table => [
  index("asset_team_status_idx").on(table.homeTeamId, table.status),
  index("asset_owner_updated_idx").on(table.ownerId, table.updatedAt),
  index("asset_type_status_idx").on(table.type, table.status),
  index("asset_search_support_idx").on(table.name, table.technology, table.vendor),
]);

export const assetVersions = pgTable("asset_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  version: varchar("version", { length: 48 }).notNull(),
  releaseNotes: text("release_notes"),
  submittedById: uuid("submitted_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  ...timestamps,
}, table => [
  uniqueIndex("asset_version_unique").on(table.assetId, table.version),
  index("asset_version_asset_idx").on(table.assetId, table.createdAt),
]);

export const assetFiles = pgTable("asset_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").references(() => assetVersions.id, { onDelete: "set null" }),
  uploadedById: uuid("uploaded_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  storageKey: varchar("storage_key", { length: 512 }).notNull().unique(),
  storageUrl: varchar("storage_url", { length: 1024 }).notNull(),
  contentType: varchar("content_type", { length: 160 }).notNull(),
  extension: varchar("extension", { length: 24 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  checksumSha256: varchar("checksum_sha256", { length: 64 }),
  reviewStatus: fileReviewStatusEnum("review_status").default("draft").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...timestamps,
}, table => [
  index("asset_file_asset_status_idx").on(table.assetId, table.reviewStatus),
  index("asset_file_uploader_idx").on(table.uploadedById, table.createdAt),
]);

export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 72 }).notNull().unique(),
  color: varchar("color", { length: 16 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assetTags = pgTable("asset_tags", {
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, table => [uniqueIndex("asset_tag_unique").on(table.assetId, table.tagId), index("asset_tag_tag_idx").on(table.tagId)]);

export const assetRelations = pgTable("asset_relations", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceAssetId: uuid("source_asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  targetAssetId: uuid("target_asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  relationType: varchar("relation_type", { length: 48 }).notNull(),
  createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("asset_relation_unique").on(table.sourceAssetId, table.targetAssetId, table.relationType),
  index("asset_relation_target_idx").on(table.targetAssetId),
]);

export const assetDocuments = pgTable("asset_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  assetId: uuid("asset_id").notNull().unique().references(() => assets.id, { onDelete: "cascade" }),
  purpose: text("purpose"),
  prerequisites: text("prerequisites"),
  installation: text("installation"),
  configuration: text("configuration"),
  usage: text("usage"),
  troubleshooting: text("troubleshooting"),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const approvals = pgTable("approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").references(() => assetFiles.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").references(() => assetVersions.id, { onDelete: "cascade" }),
  kind: approvalKindEnum("kind").notNull(),
  status: approvalStatusEnum("status").default("pending").notNull(),
  requestedById: uuid("requested_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewerId: uuid("reviewer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  decisionNote: text("decision_note"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}, table => [
  index("approval_reviewer_status_idx").on(table.reviewerId, table.status, table.requestedAt),
  index("approval_asset_status_idx").on(table.assetId, table.status),
]);

export const assetShares = pgTable("asset_shares", {
  id: uuid("id").defaultRandom().primaryKey(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  recipientType: shareRecipientTypeEnum("recipient_type").notNull(),
  recipientUserId: uuid("recipient_user_id").references(() => users.id, { onDelete: "cascade" }),
  recipientTeamId: uuid("recipient_team_id").references(() => teams.id, { onDelete: "cascade" }),
  permission: sharePermissionEnum("permission").default("view").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  grantedById: uuid("granted_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("asset_share_asset_idx").on(table.assetId, table.expiresAt),
  index("asset_share_user_idx").on(table.recipientUserId),
  index("asset_share_team_idx").on(table.recipientTeamId),
]);

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  body: text("body").notNull(),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "cascade" }),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("notification_user_read_idx").on(table.userId, table.isRead, table.createdAt)]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: auditActionEnum("action").notNull(),
  entityType: varchar("entity_type", { length: 64 }).notNull(),
  entityId: uuid("entity_id"),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
  result: varchar("result", { length: 32 }).default("success").notNull(),
  ipAddress: varchar("ip_address", { length: 64 }),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("audit_entity_idx").on(table.entityType, table.entityId, table.createdAt),
  index("audit_asset_idx").on(table.assetId, table.createdAt),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type AssetStatus = (typeof assetStatusEnum.enumValues)[number];
export type AssetType = (typeof assetTypeEnum.enumValues)[number];
