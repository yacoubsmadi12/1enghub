import { COOKIE_NAME } from "@shared/const";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { approvals, assetFiles, assetRelations, assetShares, assetVersions, assets, auditEvents, notifications, teamMemberships, teams, users } from "../drizzle/schema";
import { decisionToAssetStatus, canSubmitForReview } from "./workflow";
import { getInternalAccount } from "@shared/internal-auth";
import { sdk } from "./_core/sdk";
import { verifyInternalCredentials } from "./internalAuth";
import { getSessionCookieOptions } from "./_core/cookies";
import { getDb } from "./db";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, managerForTeamProcedure, managerProcedure, protectedProcedure, publicProcedure, reviewDecisionProcedure, router, shareProcedure, teamMemberProcedure } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    internalLogin: publicProcedure.input(z.object({ username: z.string().trim().min(3).max(32), password: z.string().min(8).max(128) })).mutation(async ({ input, ctx }) => {
      const account = verifyInternalCredentials(input.username, input.password);
      if (!account) throw new Error("Invalid ENGHUB username or password");
      const token = await sdk.signSession({ openId: account.openId, appId: process.env.VITE_APP_ID || "enghub", name: account.name });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 1000 * 60 * 60 * 12 });
      const db = await getDb();
      if (db) {
        try {
          await db.insert(users).values({ id: account.id, openId: account.openId, name: account.name, email: null, loginMethod: "internal_username", role: account.role, isActive: true }).onConflictDoUpdate({ target: users.openId, set: { name: account.name, role: account.role, lastSignedIn: new Date(), updatedAt: new Date() } });
        } catch (error) { console.warn("[Auth] Internal account persistence deferred:", error); }
      }
      return { success: true, username: input.username, role: account.role } as const;
    }),
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    snapshot: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return null;
      const [total, active, pending] = await Promise.all([
        db.select({ value: count() }).from(assets),
        db.select({ value: count() }).from(assets).where(or(eq(assets.status, "active"), eq(assets.status, "published"))),
        db.select({ value: count() }).from(assets).where(eq(assets.status, "pending_review")),
      ]);
      return { totalAssets: Number(total[0]?.value ?? 0), activeAssets: Number(active[0]?.value ?? 0), pendingApprovals: Number(pending[0]?.value ?? 0) };
    }),
  }),
  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(notifications).where(eq(notifications.userId, ctx.user.id)).orderBy(desc(notifications.createdAt)).limit(50);
    }),
    markRead: protectedProcedure.input(z.object({ notificationId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, input.notificationId), eq(notifications.userId, ctx.user.id)));
      return { success: true };
    }),
  }),
  administration: router({
    listUsers: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, lastSignedIn: users.lastSignedIn }).from(users).orderBy(users.name);
    }),
    listTeams: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: teams.id, name: teams.name, code: teams.code, isActive: teams.isActive }).from(teams).orderBy(teams.name);
    }),
    setActive: adminProcedure.input(z.object({ userId: z.string().uuid(), isActive: z.boolean() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(users).set({ isActive: input.isActive, updatedAt: new Date() }).where(eq(users.id, input.userId));
      await db.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "user", entityId: input.userId, metadata: { field: "isActive", value: input.isActive } });
      return { success: true };
    }),
    assignTeam: adminProcedure.input(z.object({ userId: z.string().uuid(), teamId: z.string().uuid(), isPrimary: z.boolean().default(false) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(teamMemberships).values({ userId: input.userId, teamId: input.teamId, isPrimary: input.isPrimary });
      await db.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "team_membership", entityId: input.userId, metadata: { teamId: input.teamId, isPrimary: input.isPrimary } });
      return { success: true };
    }),
    changeRole: adminProcedure.input(z.object({ userId: z.string().uuid(), role: z.enum(["top_manager", "manager", "team_member"]) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const target = (await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
      if (!target) throw new Error("User not found");
      await db.transaction(async tx => {
        await tx.update(users).set({ role: input.role, updatedAt: new Date() }).where(eq(users.id, input.userId));
        await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "role_changed", entityType: "user", entityId: input.userId, metadata: { from: target.role, to: input.role } });
      });
      return { success: true };
    }),
  }),
  assets: router({
    get: protectedProcedure.input(z.object({ assetId: z.string().uuid() })).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const asset = (await db.select().from(assets).where(eq(assets.id, input.assetId)).limit(1))[0];
      if (!asset) return null;
      if (ctx.user.role !== "top_manager") {
        const membership = await db.select({ id: teamMemberships.id }).from(teamMemberships).where(and(eq(teamMemberships.teamId, asset.homeTeamId), eq(teamMemberships.userId, ctx.user.id))).limit(1);
        if (asset.ownerId !== ctx.user.id && membership.length === 0) throw new Error("Asset is outside your team scope");
      }
      const [versions, files, relations, activity] = await Promise.all([
        db.select().from(assetVersions).where(eq(assetVersions.assetId, asset.id)).orderBy(desc(assetVersions.createdAt)),
        db.select().from(assetFiles).where(eq(assetFiles.assetId, asset.id)).orderBy(desc(assetFiles.createdAt)),
        db.select().from(assetRelations).where(or(eq(assetRelations.sourceAssetId, asset.id), eq(assetRelations.targetAssetId, asset.id))).orderBy(desc(assetRelations.createdAt)),
        db.select().from(auditEvents).where(eq(auditEvents.assetId, asset.id)).orderBy(desc(auditEvents.createdAt)).limit(30),
      ]);
      return { asset, versions, files, relations, activity };
    }),
    list: protectedProcedure
      .input(z.object({ query: z.string().trim().max(120).optional(), type: z.string().max(48).optional(), status: z.string().max(48).optional(), limit: z.number().int().min(1).max(100).default(24) }).optional())
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return [];
        const filters = [];
        if (input?.query) filters.push(or(ilike(assets.name, `%${input.query}%`), ilike(assets.technology, `%${input.query}%`)));
        if (input?.type) filters.push(eq(assets.type, input.type as typeof assets.type.enumValues[number]));
        if (input?.status) filters.push(eq(assets.status, input.status as typeof assets.status.enumValues[number]));
        if (ctx.user.role !== "top_manager") {
          const membershipRows = await db.select({ teamId: teamMemberships.teamId }).from(teamMemberships).where(eq(teamMemberships.userId, ctx.user.id));
          const teamIds = membershipRows.map(row => row.teamId);
          filters.push(teamIds.length ? or(eq(assets.ownerId, ctx.user.id), inArray(assets.homeTeamId, teamIds)) : eq(assets.ownerId, ctx.user.id));
        }
        return db.select().from(assets).where(filters.length ? and(...filters) : undefined).orderBy(desc(assets.updatedAt)).limit(input?.limit ?? 24);
      }),
    submit: protectedProcedure.input(z.object({ name: z.string().trim().min(3).max(240), summary: z.string().trim().max(480).optional(), type: z.enum(["tool", "script", "automation", "source_code", "documentation", "sop", "config_template", "report", "runbook", "troubleshooting_guide", "knowledge"]), classification: z.enum(["internal", "confidential", "restricted"]).default("internal"), homeTeamId: z.string().uuid(), technology: z.string().trim().max(160).optional(), version: z.string().trim().min(1).max(48).default("0.1.0"), file: z.object({ fileKey: z.string().min(1).max(512), fileUrl: z.string().url(), fileName: z.string().min(1).max(255), contentType: z.string().min(1).max(160), sizeBytes: z.number().int().positive().max(524288000), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).optional() }).optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      if (ctx.user.role === "team_member") {
        const membership = await db.select({ id: teamMemberships.id }).from(teamMemberships).where(and(eq(teamMemberships.userId, ctx.user.id), eq(teamMemberships.teamId, input.homeTeamId))).limit(1);
        if (!membership.length) throw new Error("Team membership is required to submit to this team");
      }
      const assetId = crypto.randomUUID();
      const assetKey = `ENG-${assetId.slice(0, 8).toUpperCase()}`;
      await db.transaction(async tx => {
        await tx.insert(assets).values({ id: assetId, assetKey, name: input.name, summary: input.summary ?? null, type: input.type, classification: input.classification, status: "pending_review", ownerId: ctx.user.id, homeTeamId: input.homeTeamId, technology: input.technology ?? null, currentVersion: input.version });
        const version = (await tx.insert(assetVersions).values({ assetId, version: input.version, submittedById: ctx.user.id, releaseNotes: "Initial governed submission" }).returning())[0];
        if (input.file) await tx.insert(assetFiles).values({ assetId, versionId: version?.id, uploadedById: ctx.user.id, fileName: input.file.fileName, storageKey: input.file.fileKey, storageUrl: input.file.fileUrl, contentType: input.file.contentType, extension: input.file.fileName.includes(".") ? input.file.fileName.split(".").pop()!.toLowerCase() : "bin", sizeBytes: input.file.sizeBytes, checksumSha256: input.file.checksumSha256, reviewStatus: "draft" });
        const managers = await tx.select({ id: users.id }).from(users).innerJoin(teamMemberships, eq(teamMemberships.userId, users.id)).where(and(eq(users.role, "manager"), eq(users.isActive, true), eq(teamMemberships.teamId, input.homeTeamId))).limit(10);
        if (managers.length) await tx.insert(notifications).values(managers.map(manager => ({ userId: manager.id, type: "review_submitted" as const, title: "New asset awaiting review", body: `${input.name} was submitted for Manager review.`, assetId })));
        await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_submitted", entityType: "asset", entityId: assetId, assetId, metadata: { teamId: input.homeTeamId, hasFile: Boolean(input.file) } });
      });
      return { success: true, assetId, status: "pending_review" as const };
    }),
    publish: managerForTeamProcedure.input(z.object({ teamId: z.string().uuid(), assetId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const asset = (await db.select().from(assets).where(eq(assets.id, input.assetId)).limit(1))[0];
      if (!asset || asset.homeTeamId !== input.teamId) throw new Error("Asset is outside the selected team");
      if (asset.status !== "approved") throw new Error("Only approved assets can be published");
      const now = new Date();
      await db.transaction(async tx => {
        await tx.update(assets).set({ status: "published", publishedAt: now, updatedAt: now }).where(eq(assets.id, asset.id));
        await tx.update(assetFiles).set({ reviewStatus: "published", updatedAt: now }).where(and(eq(assetFiles.assetId, asset.id), eq(assetFiles.reviewStatus, "approved")));
        await tx.insert(notifications).values({ userId: asset.ownerId, type: "asset_published", title: "Asset published", body: `${asset.name} is now available in the governed library.`, assetId: asset.id });
        await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_published", entityType: "asset", entityId: asset.id, assetId: asset.id, metadata: {} });
      });
      return { success: true };
    }),
    archive: protectedProcedure.input(z.object({ assetId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const asset = (await db.select().from(assets).where(eq(assets.id, input.assetId)).limit(1))[0];
      if (!asset) throw new Error("Asset not found");
      if (ctx.user.role !== "top_manager" && ctx.user.role !== "manager" && asset.ownerId !== ctx.user.id) throw new Error("Only an authorized owner can archive this asset");
      const now = new Date();
      await db.update(assets).set({ status: "archived", archivedAt: now, updatedAt: now }).where(eq(assets.id, asset.id));
      await db.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "asset", entityId: asset.id, assetId: asset.id, metadata: { transition: "archived" } });
      return { success: true };
    }),
    canReviewTeam: managerForTeamProcedure.input(z.object({ teamId: z.string().uuid() })).query(async ({ ctx }) => ctx.user.role === "top_manager" || ctx.user.role === "manager"),
    canShare: protectedProcedure.input(z.object({ assetId: z.string().uuid() })).query(async ({ input, ctx }) => {
      if (ctx.user.role === "top_manager") return true;
      const db = await getDb();
      if (!db) return false;
      const rows = await db.select({ ownerId: assets.ownerId, status: assets.status, homeTeamId: assets.homeTeamId }).from(assets).where(eq(assets.id, input.assetId)).limit(1);
      const asset = rows[0];
      if (!asset || (asset.status !== "published" && asset.status !== "active")) return false;
      if (asset.ownerId === ctx.user.id) return true;
      if (ctx.user.role !== "manager") return false;
      const membership = await db.select({ id: teamMemberships.id }).from(teamMemberships).where(and(eq(teamMemberships.teamId, asset.homeTeamId), eq(teamMemberships.userId, ctx.user.id))).limit(1);
      return membership.length > 0;
    }),
    share: shareProcedure.input(z.object({ assetId: z.string().uuid(), recipientType: z.enum(["user", "team"]), recipientUserId: z.string().uuid().optional(), recipientTeamId: z.string().uuid().optional(), permission: z.enum(["view", "download", "contribute", "manage"]).default("view"), expiresAt: z.coerce.date().optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      if (input.recipientType === "user" && !input.recipientUserId) throw new Error("A recipient user is required");
      if (input.recipientType === "team" && !input.recipientTeamId) throw new Error("A recipient team is required");
      const result = await db.transaction(async tx => {
        const share = (await tx.insert(assetShares).values({ assetId: input.assetId, recipientType: input.recipientType, recipientUserId: input.recipientUserId, recipientTeamId: input.recipientTeamId, permission: input.permission, expiresAt: input.expiresAt ?? null, grantedById: ctx.user.id }).returning())[0];
        await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_shared", entityType: "asset_share", entityId: share?.id, assetId: input.assetId, metadata: { recipientType: input.recipientType, permission: input.permission } });
        return share;
      });
      return { success: true, shareId: result?.id };
    }),
    registerFile: teamMemberProcedure.input(z.object({ assetId: z.string().uuid(), fileKey: z.string().min(1).max(512), fileUrl: z.string().url(), fileName: z.string().min(1).max(255), contentType: z.string().min(1).max(120), sizeBytes: z.number().int().positive().max(524288000), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const asset = (await db.select().from(assets).where(eq(assets.id, input.assetId)).limit(1))[0];
      if (!asset || (asset.ownerId !== ctx.user.id && ctx.user.role !== "top_manager")) throw new Error("Only the asset owner can register this file");
      const file = (await db.insert(assetFiles).values({ assetId: asset.id, storageKey: input.fileKey, storageUrl: input.fileUrl, fileName: input.fileName, contentType: input.contentType, extension: input.fileName.includes(".") ? input.fileName.split(".").pop()!.toLowerCase() : "bin", sizeBytes: input.sizeBytes, checksumSha256: input.checksumSha256, uploadedById: ctx.user.id, reviewStatus: "draft" }).returning())[0];
      await db.insert(auditEvents).values({ actorId: ctx.user.id, action: "file_uploaded", entityType: "asset_file", entityId: file?.id, assetId: asset.id, metadata: { bytesPersistedInDatabase: false, contentType: input.contentType } });
      return { success: true, fileId: file?.id, reviewStatus: "draft" as const };
    }),
    submitFileForReview: teamMemberProcedure.input(z.object({ assetId: z.string().uuid(), fileId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const file = (await db.select().from(assetFiles).where(and(eq(assetFiles.id, input.fileId), eq(assetFiles.assetId, input.assetId))).limit(1))[0];
      const asset = (await db.select().from(assets).where(eq(assets.id, input.assetId)).limit(1))[0];
      if (!file || !asset || file.uploadedById !== ctx.user.id) throw new Error("Only the uploader can submit this attachment");
      const reviewerId = asset.managerId ?? (await db.select({ id: users.id }).from(users).where(eq(users.role, "top_manager")).limit(1))[0]?.id;
      if (!reviewerId) throw new Error("No reviewer is configured for this asset");
      await db.transaction(async tx => {
        await tx.update(assetFiles).set({ reviewStatus: "pending_review", updatedAt: new Date() }).where(eq(assetFiles.id, file.id));
        await tx.insert(approvals).values({ assetId: asset.id, fileId: file.id, kind: "file_attachment", requestedById: ctx.user.id, reviewerId });
        await tx.insert(notifications).values({ userId: reviewerId, type: "approval_required", title: "Attachment review requested", body: `${file.fileName} is waiting for review.`, assetId: asset.id });
        await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "file_uploaded", entityType: "asset_file", entityId: file.id, assetId: asset.id, metadata: { reviewStatus: "pending_review" } });
      });
      return { success: true };
    }),
    submitForReview: teamMemberProcedure.input(z.object({ assetId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const asset = (await db.select().from(assets).where(eq(assets.id, input.assetId)).limit(1))[0];
      if (!asset) throw new Error("Asset not found");
      if (asset.ownerId !== ctx.user.id && ctx.user.role !== "top_manager" && ctx.user.role !== "manager") throw new Error("Only an authorized owner can submit this asset");
      if (!canSubmitForReview(ctx.user.role, asset.status)) throw new Error("Asset is not eligible for review");
      const reviewerId = asset.managerId ?? (await db.select({ id: users.id }).from(users).where(eq(users.role, "top_manager")).limit(1))[0]?.id;
      if (!reviewerId) throw new Error("No reviewer is configured for this asset");
      const now = new Date();
      const result = await db.transaction(async tx => {
        await tx.update(assets).set({ status: "pending_review", updatedAt: now }).where(eq(assets.id, input.assetId));
        const approval = (await tx.insert(approvals).values({ assetId: input.assetId, kind: "asset_submission", requestedById: ctx.user.id, reviewerId }).returning())[0];
        await tx.insert(notifications).values({ userId: reviewerId, type: "approval_required", title: "Asset review requested", body: `${asset.name} is waiting for your review.`, assetId: asset.id });
        await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_submitted", entityType: "asset", entityId: asset.id, assetId: asset.id, metadata: { reviewerId } });
        return approval;
      });
      return { success: true, approvalId: result?.id };
    }),
    decide: reviewDecisionProcedure.input(z.object({ approvalId: z.string().uuid(), decision: z.enum(["approved", "changes_requested", "rejected"]), note: z.string().trim().max(2000).optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const approval = ctx.approval;
      const asset = ctx.asset;
      const nextStatus = decisionToAssetStatus(input.decision);
      const now = new Date();
      await db.transaction(async tx => {
        await tx.update(approvals).set({ status: input.decision, decisionNote: input.note ?? null, decidedAt: now }).where(eq(approvals.id, input.approvalId));
        if (approval.fileId) {
          await tx.update(assetFiles).set({ reviewStatus: input.decision === "approved" ? "approved" : "rejected", approvedAt: input.decision === "approved" ? now : null, updatedAt: now }).where(eq(assetFiles.id, approval.fileId));
        } else {
          await tx.update(assets).set({ status: nextStatus, updatedAt: now }).where(eq(assets.id, asset.id));
        }
        await tx.insert(notifications).values({ userId: approval.requestedById, type: `asset_${input.decision}`, title: `Asset ${input.decision.replace("_", " ")}`, body: input.note ?? `${asset.name} received a review decision.`, assetId: asset.id });
        await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: input.decision === "approved" ? "asset_approved" : input.decision === "rejected" ? "asset_rejected" : "asset_updated", entityType: "approval", entityId: approval.id, assetId: asset.id, metadata: { note: input.note ?? null } });
      });
      return { success: true, status: nextStatus };
    }),
  }),
  governance: router({
    managerQueue: managerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (ctx.user.role === "top_manager") return db.select().from(assets).where(eq(assets.status, "pending_review")).orderBy(desc(assets.updatedAt));
      const membershipRows = await db.select({ teamId: teamMemberships.teamId }).from(teamMemberships).where(eq(teamMemberships.userId, ctx.user.id));
      const teamIds = membershipRows.map(row => row.teamId);
      if (!teamIds.length) return [];
      return db.select().from(assets).where(and(eq(assets.status, "pending_review"), inArray(assets.homeTeamId, teamIds))).orderBy(desc(assets.updatedAt));
    }),
  }),
});

export type AppRouter = typeof appRouter;
