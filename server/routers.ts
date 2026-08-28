import { COOKIE_NAME } from "@shared/const";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { approvals, assetFiles, assetShares, assets, auditEvents, notifications, teamMemberships, users } from "../drizzle/schema";
import { decisionToAssetStatus, canSubmitForReview } from "./workflow";
import { getSessionCookieOptions } from "./_core/cookies";
import { getDb } from "./db";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, managerForTeamProcedure, managerProcedure, protectedProcedure, publicProcedure, reviewDecisionProcedure, router, shareProcedure, teamMemberProcedure } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
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
