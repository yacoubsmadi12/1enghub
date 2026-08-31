import { COOKIE_NAME } from "@shared/const";
import { and, count, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { approvals, assetFiles, assetRelations, assetShares, assetVersions, assets, assetTags, auditEvents, notifications, tags, teamMemberships, teams, users } from "../drizzle/schema";
import { decisionToAssetStatus, canSubmitForReview } from "./workflow";
import { sdk } from "./_core/sdk";
import { hashPassword, normalizeInternalUsername, verifyPassword } from "./internalAuth";
import { getSessionCookieOptions } from "./_core/cookies";
import { getDb } from "./db";
import { storagePut } from "./storage";
import { inspectProjectArchive } from "./archive";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, managerForTeamProcedure, managerProcedure, protectedProcedure, publicProcedure, reviewDecisionProcedure, router, shareProcedure, teamMemberProcedure } from "./_core/trpc";

const internalLoginProcedure = publicProcedure.input(z.object({ username: z.string().trim().min(3).max(64), password: z.string().min(8).max(128) })).mutation(async ({ input, ctx }) => {
  const username = normalizeInternalUsername(input.username);
  if (!username) throw new Error("Invalid ENGHUB username or password");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable. Configure ENGHUB_DATABASE_URL before signing in.");
  const account = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  if (!account || !account.isActive || !account.passwordSalt || !account.passwordHash || !verifyPassword(input.password, account.passwordSalt, account.passwordHash)) {
    throw new Error("Invalid ENGHUB username or password");
  }
  const signedInAt = new Date();
  await db.update(users).set({ lastSignedIn: signedInAt, updatedAt: signedInAt }).where(eq(users.id, account.id));
  const token = await sdk.signSession({ openId: account.openId, appId: process.env.VITE_APP_ID || "enghub", name: account.name || username });
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 1000 * 60 * 60 * 12 });
  return { success: true, username, role: account.role } as const;
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    // Keep both names so older open tabs can finish their login after a deploy.
    login: internalLoginProcedure,
    internalLogin: internalLoginProcedure,
    me: publicProcedure.query(opts => {
      if (!opts.ctx.user) return null;
      const { passwordSalt: _passwordSalt, passwordHash: _passwordHash, ...safeUser } = opts.ctx.user;
      return safeUser;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    snapshot: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      let scope: SQL | undefined;
      if (ctx.user.role !== "top_manager") {
        const membershipRows = await db.select({ teamId: teamMemberships.teamId }).from(teamMemberships).where(eq(teamMemberships.userId, ctx.user.id));
        const teamIds = membershipRows.map(row => row.teamId);
        scope = teamIds.length ? or(eq(assets.ownerId, ctx.user.id), inArray(assets.homeTeamId, teamIds)) : eq(assets.ownerId, ctx.user.id);
      }
      const [total, active, pending] = await Promise.all([
        db.select({ value: count() }).from(assets).where(scope),
        db.select({ value: count() }).from(assets).where(scope ? and(scope, or(eq(assets.status, "active"), eq(assets.status, "published"))) : or(eq(assets.status, "active"), eq(assets.status, "published"))),
        db.select({ value: count() }).from(assets).where(scope ? and(scope, eq(assets.status, "pending_review")) : eq(assets.status, "pending_review")),
      ]);
      return { totalAssets: Number(total[0]?.value ?? 0), activeAssets: Number(active[0]?.value ?? 0), pendingApprovals: Number(pending[0]?.value ?? 0) };
    }),
  }),
  teams: router({
    available: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (ctx.user.role === "top_manager") {
        return db.select({ id: teams.id, name: teams.name, code: teams.code, description: teams.description }).from(teams).where(eq(teams.isActive, true)).orderBy(teams.name);
      }
      return db.select({ id: teams.id, name: teams.name, code: teams.code, description: teams.description }).from(teams).innerJoin(teamMemberships, eq(teamMemberships.teamId, teams.id)).where(and(eq(teamMemberships.userId, ctx.user.id), eq(teams.isActive, true))).orderBy(teams.name);
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
      return db.select({ id: users.id, username: users.username, name: users.name, email: users.email, role: users.role, isActive: users.isActive, lastSignedIn: users.lastSignedIn }).from(users).orderBy(users.name);
    }),
    createUser: adminProcedure.input(z.object({ username: z.string().trim().min(3).max(64), name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(320).optional().or(z.literal("")), role: z.enum(["top_manager", "manager", "team_member"]), temporaryPassword: z.string().min(8).max(128), teamId: z.string().uuid().optional(), isActive: z.boolean().default(true) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const username = normalizeInternalUsername(input.username);
      if (!username) throw new Error("Username may contain only letters, numbers, dots, underscores, and hyphens");
      const password = hashPassword(input.temporaryPassword);
      const openId = `internal:${username}`;
      const existing = await db.select({ id: users.id }).from(users).where(or(eq(users.username, username), eq(users.openId, openId))).limit(1);
      if (existing.length) throw new Error("Username already exists");
      const created = await db.transaction(async tx => {
        const rows = await tx.insert(users).values({ openId, username, name: input.name, email: input.email || null, loginMethod: "internal_username", role: input.role, isActive: input.isActive, passwordSalt: password.salt, passwordHash: password.hash }).returning({ id: users.id });
        if (input.teamId && rows[0]) await tx.insert(teamMemberships).values({ userId: rows[0].id, teamId: input.teamId, isPrimary: true });
        if (rows[0]) await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "user", entityId: rows[0].id, metadata: { event: "USER_CREATED", username, role: input.role, teamId: input.teamId ?? null } });
        return rows[0];
      });
      return { success: true, userId: created.id };
    }),
    updateUser: adminProcedure.input(z.object({ userId: z.string().uuid(), name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(320).optional().or(z.literal("")), role: z.enum(["top_manager", "manager", "team_member"]), isActive: z.boolean() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(users).set({ name: input.name, email: input.email || null, role: input.role, isActive: input.isActive, updatedAt: new Date() }).where(eq(users.id, input.userId));
      await db.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "user", entityId: input.userId, metadata: { event: "USER_UPDATED", role: input.role, isActive: input.isActive } });
      return { success: true };
    }),
    resetPassword: adminProcedure.input(z.object({ userId: z.string().uuid(), temporaryPassword: z.string().min(8).max(128) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const password = hashPassword(input.temporaryPassword);
      await db.update(users).set({ passwordSalt: password.salt, passwordHash: password.hash, updatedAt: new Date() }).where(eq(users.id, input.userId));
      await db.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "user", entityId: input.userId, metadata: { event: "PASSWORD_RESET" } });
      return { success: true };
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
      const [owner, team, versions, files, relations, activity] = await Promise.all([
        db.select({ name: users.name, username: users.username }).from(users).where(eq(users.id, asset.ownerId)).limit(1),
        db.select({ name: teams.name, code: teams.code, description: teams.description }).from(teams).where(eq(teams.id, asset.homeTeamId)).limit(1),
        db.select().from(assetVersions).where(eq(assetVersions.assetId, asset.id)).orderBy(desc(assetVersions.createdAt)),
        db.select().from(assetFiles).where(eq(assetFiles.assetId, asset.id)).orderBy(desc(assetFiles.createdAt)),
        db.select().from(assetRelations).where(or(eq(assetRelations.sourceAssetId, asset.id), eq(assetRelations.targetAssetId, asset.id))).orderBy(desc(assetRelations.createdAt)),
        db.select().from(auditEvents).where(eq(auditEvents.assetId, asset.id)).orderBy(desc(auditEvents.createdAt)).limit(30),
      ]);
      return { asset, owner: owner[0] ?? null, team: team[0] ?? null, versions, files, relations, activity };
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
    upload: protectedProcedure.input(z.object({ fileName: z.string().trim().min(1).max(255), contentType: z.string().trim().min(1).max(160), sizeBytes: z.number().int().positive().max(26214400), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/), dataBase64: z.string().min(1).max(36000000) })).mutation(async ({ input, ctx }) => {
      const bytes = Buffer.from(input.dataBase64, "base64");
      if (bytes.length !== input.sizeBytes) throw new Error("The uploaded project size could not be verified");
      const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
      if (checksumSha256 !== input.checksumSha256) throw new Error("The uploaded project checksum could not be verified");
      const inspected = await inspectProjectArchive(bytes, input.fileName, input.contentType);
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const uploadId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const uploaded = await storagePut(`enghub/projects/${ctx.user.id}/${uploadId}-${safeName}`, bytes, input.contentType);
      const archiveFile = { fileKey: uploaded.key, fileUrl: uploaded.url, fileName: input.fileName, relativePath: undefined, fileRole: inspected.isArchive ? "archive" as const : "project_file" as const, contentType: input.contentType, sizeBytes: input.sizeBytes, checksumSha256 };
      const projectFiles = [] as Array<{ fileKey: string; fileUrl: string; fileName: string; relativePath: string; fileRole: "project_file"; contentType: string; sizeBytes: number; checksumSha256: string }> ;
      for (const entry of inspected.isArchive ? inspected.entries : []) {
        const safePath = entry.relativePath.split("/").map(part => part.replace(/[^a-zA-Z0-9._-]+/g, "-")).join("/");
        const stored = await storagePut(`enghub/projects/${ctx.user.id}/${uploadId}/files/${safePath}`, entry.data, entry.contentType);
        projectFiles.push({ fileKey: stored.key, fileUrl: stored.url, fileName: entry.fileName, relativePath: entry.relativePath, fileRole: "project_file", contentType: entry.contentType, sizeBytes: entry.sizeBytes, checksumSha256: entry.checksumSha256 });
      }
      const db = await getDb();
      if (db) await db.insert(auditEvents).values({ actorId: ctx.user.id, action: "file_uploaded", entityType: "project_upload", metadata: { fileName: input.fileName, sizeBytes: input.sizeBytes, contentType: input.contentType, storageKey: uploaded.key, checksumSha256, archiveFormat: inspected.format, projectFileCount: inspected.fileCount, unpackedBytes: inspected.totalBytes } });
      return { file: archiveFile, project: { format: inspected.format, isArchive: inspected.isArchive, archiveName: inspected.archiveName, fileCount: inspected.fileCount, totalBytes: inspected.totalBytes, files: projectFiles } } as const;
    }),
    submit: protectedProcedure.input(z.object({ name: z.string().trim().min(3).max(240), summary: z.string().trim().max(480).optional(), type: z.enum(["tool", "script", "automation", "source_code", "documentation", "sop", "config_template", "report", "runbook", "troubleshooting_guide", "knowledge"]), classification: z.enum(["internal", "confidential", "restricted"]).default("internal"), homeTeamId: z.string().uuid(), technology: z.string().trim().max(160).optional(), version: z.string().trim().min(1).max(48).default("0.1.0"), tags: z.array(z.string().trim().min(1).max(72)).max(12).default([]), file: z.object({ fileKey: z.string().min(1).max(512), fileUrl: z.string().min(1).max(1024), fileName: z.string().min(1).max(255), relativePath: z.string().max(512).optional(), fileRole: z.enum(["archive", "project_file"]).default("project_file"), contentType: z.string().min(1).max(160), sizeBytes: z.number().int().positive().max(104857600), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).optional() }).optional(), project: z.object({ format: z.enum(["zip", "rar", "file"]), isArchive: z.boolean(), archiveName: z.string().max(255), fileCount: z.number().int().min(1).max(1000), totalBytes: z.number().int().positive().max(104857600), files: z.array(z.object({ fileKey: z.string().min(1).max(512), fileUrl: z.string().min(1).max(1024), fileName: z.string().min(1).max(255), relativePath: z.string().min(1).max(512), fileRole: z.literal("project_file"), contentType: z.string().min(1).max(160), sizeBytes: z.number().int().positive().max(26214400), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/) })).max(1000) }).optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      if (ctx.user.role !== "top_manager") {
        const membership = await db.select({ id: teamMemberships.id }).from(teamMemberships).where(and(eq(teamMemberships.userId, ctx.user.id), eq(teamMemberships.teamId, input.homeTeamId))).limit(1);
        if (!membership.length) throw new Error("Team membership is required to submit to this team");
      }
      const assetId = crypto.randomUUID();
      const assetKey = `ENG-${assetId.slice(0, 8).toUpperCase()}`;
      if (input.project?.isArchive && input.project.files.length !== input.project.fileCount) throw new Error("The project manifest does not match the extracted archive");
      const files = input.project ? [input.file, ...input.project.files].filter(Boolean) : input.file ? [input.file] : [];
      const uploadPrefix = `enghub/projects/${ctx.user.id}/`;
      if (files.some(file => !file?.fileKey.startsWith(uploadPrefix))) throw new Error("Uploaded project files must belong to the current account");
      await db.transaction(async tx => {
        await tx.insert(assets).values({ id: assetId, assetKey, name: input.name, summary: input.summary ?? null, type: input.type, classification: input.classification, status: "pending_review", ownerId: ctx.user.id, homeTeamId: input.homeTeamId, technology: input.technology ?? null, currentVersion: input.version });
        const version = (await tx.insert(assetVersions).values({ assetId, version: input.version, submittedById: ctx.user.id, releaseNotes: "Initial governed submission" }).returning())[0];
        if (files.length) {
          await tx.insert(assetFiles).values(files.map(file => ({ assetId, versionId: version?.id, uploadedById: ctx.user.id, fileName: file!.fileName, relativePath: file!.relativePath ?? null, fileRole: file!.fileRole ?? "project_file", storageKey: file!.fileKey, storageUrl: file!.fileUrl, contentType: file!.contentType, extension: file!.fileName.includes(".") ? file!.fileName.split(".").pop()!.toLowerCase() : "bin", sizeBytes: file!.sizeBytes, checksumSha256: file!.checksumSha256, reviewStatus: "draft" as const })));
          await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "file_uploaded", entityType: "asset_file", assetId, metadata: { fileCount: files.length, archiveFormat: input.project?.format ?? "file" } });
        }
        const normalizedTags = Array.from(new Set(input.tags.map(tag => tag.toLowerCase())));
        if (normalizedTags.length) {
          await tx.insert(tags).values(normalizedTags.map(name => ({ name }))).onConflictDoNothing();
          const tagRows = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.name, normalizedTags));
          if (tagRows.length) await tx.insert(assetTags).values(tagRows.map(tag => ({ assetId, tagId: tag.id }))).onConflictDoNothing();
        }
        const managers = await tx.select({ id: users.id }).from(users).innerJoin(teamMemberships, eq(teamMemberships.userId, users.id)).where(and(eq(users.role, "manager"), eq(users.isActive, true), eq(teamMemberships.teamId, input.homeTeamId))).limit(10);
        if (managers.length) await tx.insert(notifications).values(managers.map(manager => ({ userId: manager.id, type: "review_submitted" as const, title: "New asset awaiting review", body: `${input.name} was submitted for Manager review.`, assetId })));
        await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_submitted", entityType: "asset", entityId: assetId, assetId, metadata: { teamId: input.homeTeamId, hasFile: files.length > 0, projectFileCount: files.length, archiveFormat: input.project?.format ?? null } });
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
      if (ctx.user.role === "team_member" && asset.ownerId !== ctx.user.id) throw new Error("Only the asset owner can archive this asset");
      if (ctx.user.role === "manager" && asset.ownerId !== ctx.user.id) {
        const membership = await db.select({ id: teamMemberships.id }).from(teamMemberships).where(and(eq(teamMemberships.userId, ctx.user.id), eq(teamMemberships.teamId, asset.homeTeamId))).limit(1);
        if (!membership.length) throw new Error("Managers can archive assets only inside their assigned team");
      }
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
      const base = [eq(approvals.status, "pending"), eq(assets.status, "pending_review")];
      if (ctx.user.role !== "top_manager") {
        const membershipRows = await db.select({ teamId: teamMemberships.teamId }).from(teamMemberships).where(eq(teamMemberships.userId, ctx.user.id));
        const teamIds = membershipRows.map(row => row.teamId);
        if (!teamIds.length) return [];
        base.push(inArray(assets.homeTeamId, teamIds));
      }
      return db.select({ approvalId: approvals.id, assetId: assets.id, assetKey: assets.assetKey, name: assets.name, type: assets.type, status: assets.status, homeTeamId: assets.homeTeamId, requestedAt: approvals.requestedAt }).from(approvals).innerJoin(assets, eq(approvals.assetId, assets.id)).where(and(...base)).orderBy(desc(approvals.requestedAt));
    }),
  }),
});

export type AppRouter = typeof appRouter;
