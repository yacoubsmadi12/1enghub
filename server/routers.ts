import { COOKIE_NAME } from "@shared/const";
import { and, count, desc, eq, gt, ilike, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { approvals, assetDocuments, assetFiles, assetRelations, assetShares, assetVersions, assets, assetTags, auditEvents, notifications, passwordResetTokens, smtpSettings, tags, teamMemberships, teams, users } from "../drizzle/schema";
import { decisionToAssetStatus, canSubmitForReview } from "./workflow";
import { sdk } from "./_core/sdk";
import { hashPassword, normalizeInternalUsername, verifyPassword } from "./internalAuth";
import { getSessionCookieOptions } from "./_core/cookies";
import { getDb } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import { inspectProjectArchive } from "./archive";
import { decryptSecret, encryptSecret, sendPasswordResetEmail } from "./email";
import { parseUserImportWorkbook, type UserImportRow } from "./userImport";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, managerForTeamProcedure, managerProcedure, protectedProcedure, publicProcedure, reviewDecisionProcedure, router, shareProcedure, teamMemberProcedure } from "./_core/trpc";

const userRoleSchema = z.enum(["top_manager", "manager", "team_member"]);

function normalizedPersonName(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase();
}

async function resolveDirectReviewer(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, submitterId: string, teamId: string) {
  const submitter = (await db.select({ managerId: users.managerId }).from(users).where(eq(users.id, submitterId)).limit(1))[0];
  if (submitter?.managerId) {
    const directManager = (await db.select({ id: users.id }).from(users).where(and(eq(users.id, submitter.managerId), or(eq(users.role, "manager"), eq(users.role, "top_manager")), eq(users.isActive, true))).limit(1))[0];
    if (directManager) return directManager.id;
  }
  const teamManager = (await db.select({ id: users.id }).from(users).innerJoin(teamMemberships, eq(teamMemberships.userId, users.id)).where(and(eq(users.role, "manager"), ne(users.id, submitterId), eq(users.isActive, true), eq(teamMemberships.teamId, teamId))).limit(1))[0];
  if (teamManager) return teamManager.id;
  return (await db.select({ id: users.id }).from(users).where(and(eq(users.role, "top_manager"), eq(users.isActive, true))).limit(1))[0]?.id;
}

function inferredImportRole(row: UserImportRow, managerNumbers: Set<string>, managerNames: Set<string>) {
  return managerNumbers.has(row.employeeNumber) || managerNames.has(normalizedPersonName(row.fullName)) ? "manager" as const : "team_member" as const;
}

function importTeamName(row: UserImportRow) {
  return row.teamName || `${row.managerName || row.fullName} Team`;
}

function teamCodeForName(name: string) {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "IMPORTED";
  return `${slug}-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`.slice(0, 32);
}

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
    requestPasswordReset: publicProcedure.input(z.object({ identifier: z.string().trim().min(3).max(320) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const normalized = input.identifier.toLowerCase();
      const account = (await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(or(eq(users.username, normalized), eq(users.email, normalized))).limit(1))[0];
      const smtp = (await db.select().from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1))[0];
      if (account?.email && smtp) {
        const rawToken = randomBytes(32).toString("hex");
        await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, account.id));
        await db.insert(passwordResetTokens).values({ userId: account.id, tokenHash: createHash("sha256").update(rawToken).digest("hex"), expiresAt: new Date(Date.now() + 30 * 60 * 1000) });
        const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
        const host = process.env.PUBLIC_APP_URL || `${protocol}://${ctx.req.get("host")}`;
        await sendPasswordResetEmail({ host: smtp.host, port: smtp.port, secure: smtp.secure, username: smtp.username, password: decryptSecret(smtp.passwordEncrypted), fromEmail: smtp.fromEmail }, account.email, `${host}/forgot-password?token=${rawToken}`, account.name);
      }
      return { success: true, message: "If the account exists and has an email address, a reset link has been sent." };
    }),
    resetPassword: publicProcedure.input(z.object({ token: z.string().min(32).max(128), newPassword: z.string().min(8).max(128) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const tokenHash = createHash("sha256").update(input.token).digest("hex");
      const row = (await db.select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId }).from(passwordResetTokens).where(and(eq(passwordResetTokens.tokenHash, tokenHash), gt(passwordResetTokens.expiresAt, new Date()), isNull(passwordResetTokens.usedAt))).limit(1))[0];
      if (!row) throw new Error("This reset link is invalid or has expired");
      const password = hashPassword(input.newPassword);
      await db.transaction(async tx => { await tx.update(users).set({ passwordSalt: password.salt, passwordHash: password.hash, updatedAt: new Date() }).where(eq(users.id, row.userId)); await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id)); });
      return { success: true };
    }),
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
      const visibleAssets = await db.select({ ownerId: assets.ownerId, homeTeamId: assets.homeTeamId, status: assets.status, estimatedHoursSaved: assets.estimatedHoursSaved, estimatedCostSaved: assets.estimatedCostSaved, createdAt: assets.createdAt }).from(assets).where(scope);
      const teamsRows = await db.select({ id: teams.id, name: teams.name }).from(teams);
      const usersRows = await db.select({ id: users.id, name: users.name, username: users.username, role: users.role }).from(users);
      const teamName = new Map(teamsRows.map(item => [item.id, item.name]));
      const userName = new Map(usersRows.map(item => [item.id, item.name || item.username || "Unknown"]));
      const teamScoreMap = visibleAssets.reduce((map, item) => { const current = map.get(item.homeTeamId) || { teamId: item.homeTeamId, team: teamName.get(item.homeTeamId) || "Unassigned", successful: 0, hoursSaved: 0, score: 0 }; const successful = ["approved", "published", "active"].includes(item.status); current.successful += successful ? 1 : 0; current.hoursSaved += item.estimatedHoursSaved || 0; current.score += (successful ? 25 : 5) + Math.min(item.estimatedHoursSaved || 0, 100); map.set(item.homeTeamId, current); return map; }, new Map<string, { teamId: string; team: string; successful: number; hoursSaved: number; score: number }>());
      const teamScores = Array.from(teamScoreMap.values()).sort((a, b) => b.score - a.score).slice(0, 6);
      const contributorMap = new Map<string, { userId: string; user: string; uploads: number; successful: number; hoursSaved: number; score: number }>();
      for (const item of visibleAssets) { const current = contributorMap.get(item.ownerId) || { userId: item.ownerId, user: userName.get(item.ownerId) || "Unknown", uploads: 0, successful: 0, hoursSaved: 0, score: 0 }; const successful = ["approved", "published", "active"].includes(item.status); current.uploads += 1; current.successful += successful ? 1 : 0; current.hoursSaved += item.estimatedHoursSaved || 0; current.score += (successful ? 30 : 8) + Math.min(item.estimatedHoursSaved || 0, 100); contributorMap.set(item.ownerId, current); }
      return { totalAssets: Number(total[0]?.value ?? 0), activeAssets: Number(active[0]?.value ?? 0), pendingApprovals: Number(pending[0]?.value ?? 0), hoursSaved: visibleAssets.reduce((sum, item) => sum + (item.estimatedHoursSaved || 0), 0), teamScores, topContributors: Array.from(contributorMap.values()).sort((a, b) => b.score - a.score).slice(0, 6) };
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
    getSmtpSettings: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return null;
      const row = (await db.select({ host: smtpSettings.host, port: smtpSettings.port, secure: smtpSettings.secure, username: smtpSettings.username, fromEmail: smtpSettings.fromEmail }).from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1))[0];
      return row ?? null;
    }),
    saveSmtpSettings: adminProcedure.input(z.object({ host: z.string().trim().min(1).max(255), port: z.number().int().min(1).max(65535), secure: z.boolean(), username: z.string().trim().min(1).max(320), password: z.string().max(512).optional(), fromEmail: z.string().trim().email().max(320) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const current = (await db.select({ passwordEncrypted: smtpSettings.passwordEncrypted }).from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1))[0];
      const passwordEncrypted = input.password ? encryptSecret(input.password) : current?.passwordEncrypted;
      if (!passwordEncrypted) throw new Error("SMTP password is required for the first setup");
      await db.insert(smtpSettings).values({ id: 1, host: input.host, port: input.port, secure: input.secure, username: input.username, passwordEncrypted, fromEmail: input.fromEmail, updatedById: ctx.user.id }).onConflictDoUpdate({ target: smtpSettings.id, set: { host: input.host, port: input.port, secure: input.secure, username: input.username, passwordEncrypted, fromEmail: input.fromEmail, updatedById: ctx.user.id, updatedAt: new Date() } });
      return { success: true };
    }),
    listUsers: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: users.id, username: users.username, employeeNumber: users.employeeNumber, managerId: users.managerId, name: users.name, email: users.email, role: users.role, isActive: users.isActive, lastSignedIn: users.lastSignedIn }).from(users).orderBy(users.name);
    }),
    createUser: adminProcedure.input(z.object({ username: z.string().trim().min(3).max(64), employeeNumber: z.string().trim().max(64).optional().or(z.literal("")), name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(320).optional().or(z.literal("")), role: userRoleSchema, temporaryPassword: z.string().min(8).max(128), managerId: z.string().uuid().optional(), teamId: z.string().uuid().optional(), isActive: z.boolean().default(true) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const username = normalizeInternalUsername(input.username);
      if (!username) throw new Error("Username may contain only letters, numbers, dots, underscores, and hyphens");
      const password = hashPassword(input.temporaryPassword);
      const openId = `internal:${username}`;
      const existing = await db.select({ id: users.id }).from(users).where(input.employeeNumber ? or(eq(users.username, username), eq(users.openId, openId), eq(users.employeeNumber, input.employeeNumber)) : or(eq(users.username, username), eq(users.openId, openId))).limit(1);
      if (existing.length) throw new Error("Username or Employee Number already exists");
      if (input.managerId) {
        const manager = (await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, input.managerId)).limit(1))[0];
        if (!manager || (manager.role !== "manager" && manager.role !== "top_manager")) throw new Error("The selected direct manager is invalid");
      }
      const created = await db.transaction(async tx => {
        const rows = await tx.insert(users).values({ openId, username, employeeNumber: input.employeeNumber || null, managerId: input.managerId ?? null, name: input.name, email: input.email || null, loginMethod: "internal_username", role: input.role, isActive: input.isActive, passwordSalt: password.salt, passwordHash: password.hash }).returning({ id: users.id });
        if (input.teamId && rows[0]) await tx.insert(teamMemberships).values({ userId: rows[0].id, teamId: input.teamId, isPrimary: true });
        if (rows[0]) await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "user", entityId: rows[0].id, metadata: { event: "USER_CREATED", username, role: input.role, teamId: input.teamId ?? null } });
        return rows[0];
      });
      return { success: true, userId: created.id };
    }),
    importUsers: adminProcedure.input(z.object({ fileName: z.string().trim().min(1).max(255), dataBase64: z.string().min(1).max(7000000) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      if (!/\.(xlsx?|csv)$/i.test(input.fileName)) throw new Error("Only .xlsx, .xls, or .csv files are supported");
      const bytes = Buffer.from(input.dataBase64, "base64");
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("The Excel file must be between 1 byte and 5 MB");
      const rows = parseUserImportWorkbook(bytes);
      const managerNumbers = new Set(rows.map(row => row.managerNumber).filter(Boolean) as string[]);
      const managerNames = new Set(rows.map(row => normalizedPersonName(row.managerName)).filter(Boolean));
      const result = await db.transaction(async tx => {
        const currentUsers = await tx.select({ id: users.id, employeeNumber: users.employeeNumber, username: users.username, name: users.name, role: users.role }).from(users);
        const byEmployee = new Map(currentUsers.filter(row => row.employeeNumber).map(row => [row.employeeNumber!, row]));
        const byUsername = new Map(currentUsers.filter(row => row.username).map(row => [row.username!, row]));
        const byName = new Map(currentUsers.filter(row => row.name).map(row => [normalizedPersonName(row.name), row]));
        const importedByEmployee = new Map<string, { id: string; role: typeof users.$inferSelect.role }>();
        const importedRows = rows.map(row => ({ row, username: normalizeInternalUsername(row.username), role: inferredImportRole(row, managerNumbers, managerNames) }));
        for (const item of importedRows) {
          if (!item.username) throw new Error(`Row ${item.row.rowNumber}: invalid username`);
          const employeeMatch = byEmployee.get(item.row.employeeNumber);
          const usernameMatch = byUsername.get(item.username);
          if (usernameMatch && (!employeeMatch || usernameMatch.id !== employeeMatch.id)) throw new Error(`Row ${item.row.rowNumber}: username ${item.username} is already assigned to another account`);
          const existing = employeeMatch ?? usernameMatch;
          const password = hashPassword(item.row.password);
          const role: typeof users.$inferSelect.role = existing?.role === "top_manager" ? "top_manager" : item.role;
          if (existing) {
            await tx.update(users).set({ openId: `internal:${item.username}`, username: item.username, employeeNumber: item.row.employeeNumber, name: item.row.fullName, email: item.row.email, loginMethod: "internal_username", role, isActive: true, passwordSalt: password.salt, passwordHash: password.hash, updatedAt: new Date() }).where(eq(users.id, existing.id));
            importedByEmployee.set(item.row.employeeNumber, { id: existing.id, role });
            byEmployee.set(item.row.employeeNumber, { ...existing, employeeNumber: item.row.employeeNumber, username: item.username, name: item.row.fullName, role });
            byUsername.set(item.username, { ...existing, employeeNumber: item.row.employeeNumber, username: item.username, name: item.row.fullName, role });
            byName.set(normalizedPersonName(item.row.fullName), { ...existing, employeeNumber: item.row.employeeNumber, username: item.username, name: item.row.fullName, role });
          } else {
            const created = (await tx.insert(users).values({ openId: `internal:${item.username}`, username: item.username, employeeNumber: item.row.employeeNumber, name: item.row.fullName, email: item.row.email, loginMethod: "internal_username", role, isActive: true, passwordSalt: password.salt, passwordHash: password.hash }).returning({ id: users.id }))[0];
            if (!created) throw new Error(`Row ${item.row.rowNumber}: account could not be created`);
            importedByEmployee.set(item.row.employeeNumber, { id: created.id, role });
            const createdUser: { id: string; employeeNumber: string; username: string; name: string; role: typeof users.$inferSelect.role } = { id: created.id, employeeNumber: item.row.employeeNumber, username: item.username, name: item.row.fullName, role };
            byEmployee.set(item.row.employeeNumber, createdUser);
            byUsername.set(item.username, createdUser);
            byName.set(normalizedPersonName(item.row.fullName), createdUser);
          }
        }

        const teamIds = new Map<string, string>();
        const existingTeams = await tx.select({ id: teams.id, name: teams.name }).from(teams);
        for (const team of existingTeams) teamIds.set(normalizedPersonName(team.name), team.id);
        for (const item of importedRows) {
          const teamName = importTeamName(item.row).trim();
          const teamKey = normalizedPersonName(teamName);
          let teamId = teamIds.get(teamKey);
          if (!teamId) {
            const createdTeam = (await tx.insert(teams).values({ name: teamName, code: teamCodeForName(teamName), isActive: true }).returning({ id: teams.id }))[0];
            if (!createdTeam) throw new Error(`Row ${item.row.rowNumber}: team could not be created`);
            teamId = createdTeam.id;
            teamIds.set(teamKey, teamId);
          }
          const current = importedByEmployee.get(item.row.employeeNumber);
          if (!current) throw new Error(`Row ${item.row.rowNumber}: imported account could not be resolved`);
          const manager = item.row.managerNumber ? importedByEmployee.get(item.row.managerNumber) ?? byEmployee.get(item.row.managerNumber) : item.row.managerName ? byName.get(normalizedPersonName(item.row.managerName)) : undefined;
          if (manager && manager.id === current.id) throw new Error(`Row ${item.row.rowNumber}: an employee cannot manage itself`);
          if (manager && manager.role !== "manager" && manager.role !== "top_manager") throw new Error(`Row ${item.row.rowNumber}: direct manager must have Manager or Top Manager role`);
          await tx.update(users).set({ managerId: manager?.id ?? null, updatedAt: new Date() }).where(eq(users.id, current.id));
          await tx.insert(teamMemberships).values({ userId: current.id, teamId, isPrimary: true }).onConflictDoNothing();
          await tx.update(teamMemberships).set({ isPrimary: true }).where(and(eq(teamMemberships.userId, current.id), eq(teamMemberships.teamId, teamId)));
          await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "user", entityId: current.id, metadata: { event: "USER_IMPORTED", rowNumber: item.row.rowNumber, employeeNumber: item.row.employeeNumber, role: current.role, managerId: manager?.id ?? null, teamId } });
        }
        return { imported: rows.length, managers: importedRows.filter(item => item.role === "manager").length, teamMembers: importedRows.filter(item => item.role === "team_member").length, teams: teamIds.size };
      });
      return { success: true, ...result };
    }),
    updateUser: adminProcedure.input(z.object({ userId: z.string().uuid(), employeeNumber: z.string().trim().max(64).optional().or(z.literal("")), managerId: z.string().uuid().optional(), name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(320).optional().or(z.literal("")), role: userRoleSchema, isActive: z.boolean() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const duplicate = input.employeeNumber ? await db.select({ id: users.id }).from(users).where(eq(users.employeeNumber, input.employeeNumber)).limit(1) : [];
      if (duplicate.length && duplicate[0].id !== input.userId) throw new Error("Employee Number already exists");
      if (input.managerId) {
        if (input.managerId === input.userId) throw new Error("A user cannot manage itself");
        const manager = (await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, input.managerId)).limit(1))[0];
        if (!manager || (manager.role !== "manager" && manager.role !== "top_manager")) throw new Error("The selected direct manager is invalid");
      }
      if (input.role === "team_member") {
        const directReports = await db.select({ id: users.id }).from(users).where(eq(users.managerId, input.userId)).limit(1);
        if (directReports.length) throw new Error("Reassign direct reports before changing this user to Team Member");
      }
      await db.update(users).set({ employeeNumber: input.employeeNumber || null, managerId: input.managerId ?? null, name: input.name, email: input.email || null, role: input.role, isActive: input.isActive, updatedAt: new Date() }).where(eq(users.id, input.userId));
      await db.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "user", entityId: input.userId, metadata: { event: "USER_UPDATED", employeeNumber: input.employeeNumber || null, managerId: input.managerId ?? null, role: input.role, isActive: input.isActive } });
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
    deleteUser: adminProcedure.input(z.object({ userId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      if (input.userId === ctx.user.id) throw new Error("You cannot delete your own administrator account");
      const target = (await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
      if (!target) throw new Error("User not found");
      const targetRole = (await db.select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1))[0]?.role;
      if (targetRole === "top_manager") throw new Error("Top Manager accounts cannot be deleted; change the password or disable the account instead.");
      const [ownedAssets, uploadedFiles, versions, approvalsRequested, approvalsReviewed, auditRows] = await Promise.all([
        db.select({ id: assets.id }).from(assets).where(eq(assets.ownerId, input.userId)).limit(1),
        db.select({ id: assetFiles.id }).from(assetFiles).where(eq(assetFiles.uploadedById, input.userId)).limit(1),
        db.select({ id: assetVersions.id }).from(assetVersions).where(eq(assetVersions.submittedById, input.userId)).limit(1),
        db.select({ id: approvals.id }).from(approvals).where(eq(approvals.requestedById, input.userId)).limit(1),
        db.select({ id: approvals.id }).from(approvals).where(eq(approvals.reviewerId, input.userId)).limit(1),
        db.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.actorId, input.userId)).limit(1),
      ]);
      if (ownedAssets.length || uploadedFiles.length || versions.length || approvalsRequested.length || approvalsReviewed.length || auditRows.length) throw new Error("This user has governed history or assets. Disable the account instead of deleting it to preserve audit integrity.");
      await db.transaction(async tx => {
        await tx.delete(teamMemberships).where(eq(teamMemberships.userId, input.userId));
        await tx.update(users).set({ managerId: null }).where(eq(users.managerId, input.userId));
        await tx.delete(users).where(eq(users.id, input.userId));
        await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "user", entityId: input.userId, metadata: { event: "USER_DELETED", username: target.username } });
      });
      return { success: true };
    }),
    deleteUsers: adminProcedure.input(z.object({ userIds: z.array(z.string().uuid()).min(1).max(500) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const userIds = Array.from(new Set(input.userIds));
      let deleted = 0;
      let disabled = 0;
      const skipped: string[] = [];
      await db.transaction(async tx => {
        for (const userId of userIds) {
          if (userId === ctx.user.id) { skipped.push(userId); continue; }
          const target = (await tx.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, userId)).limit(1))[0];
          if (!target) { skipped.push(userId); continue; }
          const targetRole = (await tx.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1))[0]?.role;
          if (targetRole === "top_manager") { skipped.push(userId); continue; }
          const [ownedAssets, uploadedFiles, versions, approvalsRequested, approvalsReviewed, auditRows] = await Promise.all([
            tx.select({ id: assets.id }).from(assets).where(eq(assets.ownerId, userId)).limit(1),
            tx.select({ id: assetFiles.id }).from(assetFiles).where(eq(assetFiles.uploadedById, userId)).limit(1),
            tx.select({ id: assetVersions.id }).from(assetVersions).where(eq(assetVersions.submittedById, userId)).limit(1),
            tx.select({ id: approvals.id }).from(approvals).where(eq(approvals.requestedById, userId)).limit(1),
            tx.select({ id: approvals.id }).from(approvals).where(eq(approvals.reviewerId, userId)).limit(1),
            tx.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.actorId, userId)).limit(1),
          ]);
          if (ownedAssets.length || uploadedFiles.length || versions.length || approvalsRequested.length || approvalsReviewed.length || auditRows.length) {
            await tx.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, userId));
            await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "user", entityId: userId, metadata: { event: "USER_DISABLED_BY_BULK_DELETE", username: target.username } });
            disabled += 1;
            continue;
          }
          await tx.delete(teamMemberships).where(eq(teamMemberships.userId, userId));
          await tx.update(users).set({ managerId: null }).where(eq(users.managerId, userId));
          await tx.delete(users).where(eq(users.id, userId));
          await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "user", entityId: userId, metadata: { event: "USER_DELETED", username: target.username } });
          deleted += 1;
        }
      });
      return { success: true, deleted, disabled, skipped };
    }),
    assignTeam: adminProcedure.input(z.object({ userId: z.string().uuid(), teamId: z.string().uuid(), isPrimary: z.boolean().default(false) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(teamMemberships).values({ userId: input.userId, teamId: input.teamId, isPrimary: input.isPrimary }).onConflictDoNothing();
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
  manager: router({
    listMyTeamMembers: managerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: users.id, employeeNumber: users.employeeNumber, username: users.username, name: users.name, email: users.email, role: users.role, isActive: users.isActive }).from(users).where(and(eq(users.managerId, ctx.user.id), eq(users.role, "team_member"))).orderBy(users.name);
    }),
    listMyTeams: managerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: teams.id, name: teams.name, code: teams.code, description: teams.description }).from(teams).innerJoin(teamMemberships, eq(teamMemberships.teamId, teams.id)).where(and(eq(teamMemberships.userId, ctx.user.id), eq(teams.isActive, true))).orderBy(teams.name);
    }),
    createTeamMember: managerProcedure.input(z.object({ employeeNumber: z.string().trim().min(1).max(64), username: z.string().trim().min(3).max(64), name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(320).optional().or(z.literal("")), temporaryPassword: z.string().min(8).max(128), teamId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "manager") throw new Error("Only a Manager can create team members from this screen");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const username = normalizeInternalUsername(input.username);
      if (!username) throw new Error("Username may contain only letters, numbers, dots, underscores, and hyphens");
      const teamScope = await db.select({ id: teamMemberships.id }).from(teamMemberships).where(and(eq(teamMemberships.userId, ctx.user.id), eq(teamMemberships.teamId, input.teamId)));
      if (!teamScope.length) throw new Error("You can create members only inside your assigned team");
      const existing = await db.select({ id: users.id }).from(users).where(or(eq(users.username, username), eq(users.employeeNumber, input.employeeNumber))).limit(1);
      if (existing.length) throw new Error("Username or Employee Number already exists");
      const password = hashPassword(input.temporaryPassword);
      const created = await db.transaction(async tx => {
        const row = (await tx.insert(users).values({ openId: `internal:${username}`, username, employeeNumber: input.employeeNumber, managerId: ctx.user.id, name: input.name, email: input.email || null, loginMethod: "internal_username", role: "team_member", isActive: true, passwordSalt: password.salt, passwordHash: password.hash }).returning({ id: users.id }))[0];
        if (!row) throw new Error("Team member could not be created");
        await tx.insert(teamMemberships).values({ userId: row.id, teamId: input.teamId, isPrimary: true });
        await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "user", entityId: row.id, metadata: { event: "TEAM_MEMBER_CREATED", employeeNumber: input.employeeNumber, managerId: ctx.user.id, teamId: input.teamId } });
        return row;
      });
      return { success: true, userId: created.id };
    }),
    importTeamMembers: managerProcedure.input(z.object({ teamId: z.string().uuid(), fileName: z.string().trim().min(1).max(255), dataBase64: z.string().min(1).max(7000000) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "manager") throw new Error("Only a Manager can import team members from this screen");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const scope = await db.select({ id: teamMemberships.id }).from(teamMemberships).where(and(eq(teamMemberships.userId, ctx.user.id), eq(teamMemberships.teamId, input.teamId))).limit(1);
      if (!scope.length) throw new Error("You can import members only inside your assigned team");
      if (!/\.(xlsx?|csv)$/i.test(input.fileName)) throw new Error("Only .xlsx, .xls, or .csv files are supported");
      const bytes = Buffer.from(input.dataBase64, "base64");
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("The Excel file must be between 1 byte and 5 MB");
      const rows = parseUserImportWorkbook(bytes);
      const managerName = normalizedPersonName(ctx.user.name);
      const managerNumber = ctx.user.employeeNumber?.trim() || "";
      const managerRows = rows.filter(row => row.managerNumber || row.managerName);
      if (managerRows.some(row => (row.managerNumber && row.managerNumber !== managerNumber) || (row.managerName && normalizedPersonName(row.managerName) !== managerName))) throw new Error("Every imported row must belong to the logged-in Manager");
      const referencedNumbers = new Set(rows.map(row => row.managerNumber).filter(Boolean) as string[]);
      if (rows.some(row => referencedNumbers.has(row.employeeNumber))) throw new Error("Managers cannot be created through the team-member import; use the Top Manager import for managers");
      const result = await db.transaction(async tx => {
        let imported = 0;
        for (const row of rows) {
          const username = normalizeInternalUsername(row.username);
          if (!username) throw new Error(`Row ${row.rowNumber}: invalid username`);
          const existing = await tx.select({ id: users.id }).from(users).where(or(eq(users.username, username), eq(users.employeeNumber, row.employeeNumber))).limit(1);
          if (existing.length) throw new Error(`Row ${row.rowNumber}: username or Employee Number already exists`);
          const password = hashPassword(row.password);
          const created = (await tx.insert(users).values({ openId: `internal:${username}`, username, employeeNumber: row.employeeNumber, managerId: ctx.user.id, name: row.fullName, email: row.email, loginMethod: "internal_username", role: "team_member", isActive: true, passwordSalt: password.salt, passwordHash: password.hash }).returning({ id: users.id }))[0];
          if (!created) throw new Error(`Row ${row.rowNumber}: account could not be created`);
          await tx.insert(teamMemberships).values({ userId: created.id, teamId: input.teamId, isPrimary: true });
          await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "user", entityId: created.id, metadata: { event: "TEAM_MEMBER_IMPORTED", rowNumber: row.rowNumber, employeeNumber: row.employeeNumber, managerId: ctx.user.id, teamId: input.teamId } });
          imported += 1;
        }
        return { imported };
      });
      return { success: true, ...result };
    }),
  }),
  assets: router({
    get: protectedProcedure.input(z.object({ assetId: z.string().trim().min(1).max(64) })).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const asset = (await db.select().from(assets).where(or(eq(assets.id, input.assetId), eq(assets.assetKey, input.assetId))).limit(1))[0];
      if (!asset) return null;
      if (asset.status === "pending_review" && ctx.user.role === "manager" && asset.managerId !== ctx.user.id) throw new Error("Pending projects are visible only to the assigned Manager");
      if (ctx.user.role !== "top_manager") {
        const membership = await db.select({ id: teamMemberships.id }).from(teamMemberships).where(and(eq(teamMemberships.teamId, asset.homeTeamId), eq(teamMemberships.userId, ctx.user.id))).limit(1);
        const isAssignedManager = asset.managerId === ctx.user.id;
        if (asset.ownerId !== ctx.user.id && !isAssignedManager && membership.length === 0) throw new Error("Asset is outside your team scope");
      }
      const [owner, team, versions, files, relations, activity, document] = await Promise.all([
        db.select({ name: users.name, username: users.username }).from(users).where(eq(users.id, asset.ownerId)).limit(1),
        db.select({ name: teams.name, code: teams.code, description: teams.description }).from(teams).where(eq(teams.id, asset.homeTeamId)).limit(1),
        db.select().from(assetVersions).where(eq(assetVersions.assetId, asset.id)).orderBy(desc(assetVersions.createdAt)),
        db.select().from(assetFiles).where(eq(assetFiles.assetId, asset.id)).orderBy(desc(assetFiles.createdAt)),
        db.select().from(assetRelations).where(or(eq(assetRelations.sourceAssetId, asset.id), eq(assetRelations.targetAssetId, asset.id))).orderBy(desc(assetRelations.createdAt)),
        db.select().from(auditEvents).where(eq(auditEvents.assetId, asset.id)).orderBy(desc(auditEvents.createdAt)).limit(30),
        db.select().from(assetDocuments).where(eq(assetDocuments.assetId, asset.id)).limit(1),
      ]);
      const safeFiles = files.map(({ storageUrl: _storageUrl, ...file }) => file);
      return { asset, owner: owner[0] ?? null, team: team[0] ?? null, versions, files: safeFiles, relations, activity, document: document[0] ?? null };
    }),
    updateDetails: protectedProcedure.input(z.object({ assetId: z.string().uuid(), description: z.string().trim().max(10000).optional(), businessValue: z.string().trim().max(10000).optional(), estimatedHoursSaved: z.number().int().min(0).max(1000000).optional(), estimatedCostSaved: z.number().int().min(0).max(1000000000).optional(), document: z.object({ purpose: z.string().max(5000).optional(), prerequisites: z.string().max(5000).optional(), installation: z.string().max(10000).optional(), configuration: z.string().max(10000).optional(), usage: z.string().max(10000).optional(), troubleshooting: z.string().max(10000).optional() }).optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const asset = (await db.select({ id: assets.id, ownerId: assets.ownerId, managerId: assets.managerId }).from(assets).where(eq(assets.id, input.assetId)).limit(1))[0];
      if (!asset) throw new Error("Asset not found");
      if (ctx.user.role !== "top_manager" && asset.ownerId !== ctx.user.id && asset.managerId !== ctx.user.id) throw new Error("Only the asset owner or assigned Manager can edit this asset");
      await db.transaction(async tx => {
        const assetUpdate: Partial<typeof assets.$inferInsert> = { updatedAt: new Date() };
        if (input.description !== undefined) assetUpdate.description = input.description || null;
        if (input.businessValue !== undefined) assetUpdate.businessValue = input.businessValue || null;
        if (input.estimatedHoursSaved !== undefined) assetUpdate.estimatedHoursSaved = input.estimatedHoursSaved;
        if (input.estimatedCostSaved !== undefined) assetUpdate.estimatedCostSaved = input.estimatedCostSaved;
        await tx.update(assets).set(assetUpdate).where(eq(assets.id, input.assetId));
        if (input.document) {
          const existing = (await tx.select({ assetId: assetDocuments.assetId }).from(assetDocuments).where(eq(assetDocuments.assetId, input.assetId)).limit(1))[0];
          if (existing) await tx.update(assetDocuments).set({ ...input.document, updatedById: ctx.user.id, updatedAt: new Date() }).where(eq(assetDocuments.assetId, input.assetId));
          else await tx.insert(assetDocuments).values({ assetId: input.assetId, ...input.document, updatedById: ctx.user.id });
        }
        await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "asset", entityId: input.assetId, assetId: input.assetId, metadata: { event: "ASSET_DETAILS_UPDATED" } });
      });
      return { success: true };
    }),
    openFile: protectedProcedure.input(z.object({ fileId: z.string().uuid() })).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const file = (await db.select().from(assetFiles).where(eq(assetFiles.id, input.fileId)).limit(1))[0];
      if (!file) throw new Error("File not found");
      const asset = (await db.select({ id: assets.id, ownerId: assets.ownerId, homeTeamId: assets.homeTeamId, managerId: assets.managerId, status: assets.status }).from(assets).where(eq(assets.id, file.assetId)).limit(1))[0];
      if (!asset) throw new Error("Asset not found");
      if (ctx.user.role !== "top_manager") {
        if (asset.status === "pending_review" && (ctx.user.role !== "manager" || asset.managerId !== ctx.user.id)) throw new Error("Pending project files are restricted to the assigned Manager");
        const membership = await db.select({ id: teamMemberships.id }).from(teamMemberships).where(and(eq(teamMemberships.teamId, asset.homeTeamId), eq(teamMemberships.userId, ctx.user.id))).limit(1);
        const isAssignedManager = asset.managerId === ctx.user.id;
        if (asset.ownerId !== ctx.user.id && !isAssignedManager && membership.length === 0) throw new Error("File is outside your team scope");
      }
      const url = await storageGetSignedUrl(file.storageKey);
      await db.insert(auditEvents).values({ actorId: ctx.user.id, action: "file_downloaded", entityType: "asset_file", entityId: file.id, assetId: asset.id, metadata: { fileName: file.fileName, reviewStatus: file.reviewStatus } });
      return { url, fileName: file.fileName, contentType: file.contentType };
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
          filters.push(teamIds.length ? or(eq(assets.ownerId, ctx.user.id), eq(assets.managerId, ctx.user.id), inArray(assets.homeTeamId, teamIds)) : or(eq(assets.ownerId, ctx.user.id), eq(assets.managerId, ctx.user.id)));
        }
        return db.select().from(assets).where(filters.length ? and(...filters) : undefined).orderBy(desc(assets.updatedAt)).limit(input?.limit ?? 24);
      }),
    myAssets: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(assets).where(eq(assets.ownerId, ctx.user.id)).orderBy(desc(assets.updatedAt));
    }),
    sharedWithMe: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const teamRows = await db.select({ teamId: teamMemberships.teamId }).from(teamMemberships).where(eq(teamMemberships.userId, ctx.user.id));
      const teamIds = teamRows.map(row => row.teamId);
      const shareScope = teamIds.length ? or(eq(assetShares.recipientUserId, ctx.user.id), inArray(assetShares.recipientTeamId, teamIds)) : eq(assetShares.recipientUserId, ctx.user.id);
      const shareRows = await db.select({ assetId: assetShares.assetId }).from(assetShares).where(and(shareScope, isNull(assetShares.revokedAt), or(isNull(assetShares.expiresAt), gt(assetShares.expiresAt, new Date()))));
      const assetIds = Array.from(new Set(shareRows.map(row => row.assetId)));
      if (!assetIds.length) return [];
      return db.select().from(assets).where(and(inArray(assets.id, assetIds), or(eq(assets.status, "approved"), eq(assets.status, "published"), eq(assets.status, "active")))).orderBy(desc(assets.updatedAt));
    }),
    knowledgeHub: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (ctx.user.role === "top_manager") return db.select().from(assets).where(or(eq(assets.status, "approved"), eq(assets.status, "published"), eq(assets.status, "active"))).orderBy(desc(assets.updatedAt));
      const teamRows = await db.select({ teamId: teamMemberships.teamId }).from(teamMemberships).where(eq(teamMemberships.userId, ctx.user.id));
      const teamIds = teamRows.map(row => row.teamId);
      if (!teamIds.length) return [];
      return db.select().from(assets).where(and(inArray(assets.homeTeamId, teamIds), or(eq(assets.status, "approved"), eq(assets.status, "published"), eq(assets.status, "active")))).orderBy(desc(assets.updatedAt));
    }),
    upload: protectedProcedure.input(z.object({ fileName: z.string().trim().min(1).max(255), contentType: z.string().trim().min(1).max(160), sizeBytes: z.number().int().positive().max(26214400), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), dataBase64: z.string().min(1).max(36000000) })).mutation(async ({ input, ctx }) => {
      const bytes = Buffer.from(input.dataBase64, "base64");
      if (bytes.length !== input.sizeBytes) throw new Error("The uploaded project size could not be verified");
      const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
      if (input.checksumSha256 && checksumSha256 !== input.checksumSha256) throw new Error("The uploaded project checksum could not be verified");
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
    submit: protectedProcedure.input(z.object({ name: z.string().trim().min(3).max(240), summary: z.string().trim().max(480).optional(), description: z.string().trim().max(10000).optional(), businessValue: z.string().trim().max(10000).optional(), estimatedHoursSaved: z.number().int().min(0).max(1000000).default(0), estimatedCostSaved: z.number().int().min(0).max(1000000000).default(0), document: z.object({ purpose: z.string().max(5000).optional(), prerequisites: z.string().max(5000).optional(), installation: z.string().max(10000).optional(), configuration: z.string().max(10000).optional(), usage: z.string().max(10000).optional(), troubleshooting: z.string().max(10000).optional() }).optional(), type: z.enum(["tool", "script", "automation", "source_code", "documentation", "sop", "config_template", "report", "runbook", "troubleshooting_guide", "knowledge"]), classification: z.enum(["internal", "confidential", "restricted"]).default("internal"), homeTeamId: z.string().uuid(), technology: z.string().trim().max(160).optional(), version: z.string().trim().min(1).max(48).default("0.1.0"), tags: z.array(z.string().trim().min(1).max(72)).max(12).default([]), file: z.object({ fileKey: z.string().min(1).max(512), fileUrl: z.string().min(1).max(1024), fileName: z.string().min(1).max(255), relativePath: z.string().max(512).optional(), fileRole: z.enum(["archive", "project_file"]).default("project_file"), contentType: z.string().min(1).max(160), sizeBytes: z.number().int().positive().max(104857600), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).optional() }).optional(), project: z.object({ format: z.enum(["zip", "rar", "file"]), isArchive: z.boolean(), archiveName: z.string().max(255), fileCount: z.number().int().min(1).max(1000), totalBytes: z.number().int().positive().max(104857600), files: z.array(z.object({ fileKey: z.string().min(1).max(512), fileUrl: z.string().min(1).max(1024), fileName: z.string().min(1).max(255), relativePath: z.string().min(1).max(512), fileRole: z.literal("project_file"), contentType: z.string().min(1).max(160), sizeBytes: z.number().int().positive().max(26214400), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/) })).max(1000) }).optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      if (ctx.user.role !== "top_manager") {
        const membership = await db.select({ id: teamMemberships.id }).from(teamMemberships).where(and(eq(teamMemberships.userId, ctx.user.id), eq(teamMemberships.teamId, input.homeTeamId))).limit(1);
        if (!membership.length) throw new Error("Team membership is required to submit to this team");
      }
      const assetId = crypto.randomUUID();
      const assetKey = `ENG-${assetId.slice(0, 8).toUpperCase()}`;
      const reviewerId = await resolveDirectReviewer(db, ctx.user.id, input.homeTeamId);
      if (!reviewerId) throw new Error("No direct Manager or Top Manager is configured for this team");
      if (input.project?.isArchive && input.project.files.length !== input.project.fileCount) throw new Error("The project manifest does not match the extracted archive");
      const files = input.project ? [input.file, ...input.project.files].filter(Boolean) : input.file ? [input.file] : [];
      const uploadPrefix = `enghub/projects/${ctx.user.id}/`;
      if (files.some(file => !file?.fileKey.startsWith(uploadPrefix))) throw new Error("Uploaded project files must belong to the current account");
      await db.transaction(async tx => {
        await tx.insert(assets).values({ id: assetId, assetKey, name: input.name, summary: input.summary ?? null, description: input.description ?? null, businessValue: input.businessValue ?? null, estimatedHoursSaved: input.estimatedHoursSaved, estimatedCostSaved: input.estimatedCostSaved, type: input.type, classification: input.classification, status: "pending_review", ownerId: ctx.user.id, managerId: reviewerId, homeTeamId: input.homeTeamId, technology: input.technology ?? null, currentVersion: input.version });
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
        if (input.document) await tx.insert(assetDocuments).values({ assetId, ...input.document, updatedById: ctx.user.id });
        await tx.insert(approvals).values({ assetId, kind: "asset_submission", requestedById: ctx.user.id, reviewerId });
        await tx.insert(notifications).values({ userId: reviewerId, type: "approval_required", title: "New asset awaiting review", body: `${input.name} was submitted for your Manager review.`, assetId });
        await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_submitted", entityType: "asset", entityId: assetId, assetId, metadata: { teamId: input.homeTeamId, reviewerId, hasFile: files.length > 0, projectFileCount: files.length, archiveFormat: input.project?.format ?? null } });
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
    deleteAsset: protectedProcedure.input(z.object({ assetId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const asset = (await db.select({ id: assets.id, ownerId: assets.ownerId, name: assets.name, status: assets.status }).from(assets).where(eq(assets.id, input.assetId)).limit(1))[0];
      if (!asset) throw new Error("Asset not found");
      if (ctx.user.role !== "top_manager" && asset.ownerId !== ctx.user.id) throw new Error("Only the asset owner or Top Manager can delete this project");
      await db.transaction(async tx => {
        await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_updated", entityType: "asset", entityId: asset.id, assetId: asset.id, metadata: { event: "ASSET_DELETED", assetName: asset.name, previousStatus: asset.status } });
        await tx.delete(assetRelations).where(or(eq(assetRelations.sourceAssetId, asset.id), eq(assetRelations.targetAssetId, asset.id)));
        await tx.delete(assetShares).where(eq(assetShares.assetId, asset.id));
        await tx.delete(notifications).where(eq(notifications.assetId, asset.id));
        await tx.delete(approvals).where(eq(approvals.assetId, asset.id));
        await tx.delete(assetTags).where(eq(assetTags.assetId, asset.id));
        await tx.delete(assetDocuments).where(eq(assetDocuments.assetId, asset.id));
        await tx.delete(assetFiles).where(eq(assetFiles.assetId, asset.id));
        await tx.delete(assetVersions).where(eq(assetVersions.assetId, asset.id));
        await tx.delete(assets).where(eq(assets.id, asset.id));
      });
      return { success: true, status: "deleted" as const };
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
      const reviewerId = asset.managerId ?? await resolveDirectReviewer(db, file.uploadedById, asset.homeTeamId);
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
      const reviewerId = asset.managerId ?? await resolveDirectReviewer(db, asset.ownerId, asset.homeTeamId);
      if (!reviewerId) throw new Error("No reviewer is configured for this asset");
      const now = new Date();
      const result = await db.transaction(async tx => {
        await tx.update(assets).set({ status: "pending_review", managerId: reviewerId, updatedAt: now }).where(eq(assets.id, input.assetId));
        const approval = (await tx.insert(approvals).values({ assetId: input.assetId, kind: "asset_submission", requestedById: ctx.user.id, reviewerId }).returning())[0];
        await tx.insert(notifications).values({ userId: reviewerId, type: "approval_required", title: "Asset review requested", body: `${asset.name} is waiting for your review.`, assetId: asset.id });
        await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "asset_submitted", entityType: "asset", entityId: asset.id, assetId: asset.id, metadata: { reviewerId } });
        return approval;
      });
      return { success: true, approvalId: result?.id };
    }),
    requests: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ approvalId: approvals.id, assetId: assets.id, assetKey: assets.assetKey, name: assets.name, type: assets.type, assetStatus: assets.status, approvalStatus: approvals.status, reviewerId: approvals.reviewerId, requestedAt: approvals.requestedAt, decidedAt: approvals.decidedAt, decisionNote: approvals.decisionNote }).from(approvals).innerJoin(assets, eq(approvals.assetId, assets.id)).where(eq(approvals.requestedById, ctx.user.id)).orderBy(desc(approvals.requestedAt));
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
      const base = [eq(approvals.status, "pending"), or(eq(assets.status, "pending_review"), eq(approvals.kind, "file_attachment"))];
      if (ctx.user.role !== "top_manager") base.push(eq(approvals.reviewerId, ctx.user.id));
      return db.select({ approvalId: approvals.id, assetId: assets.id, assetKey: assets.assetKey, name: assets.name, type: assets.type, status: assets.status, homeTeamId: assets.homeTeamId, requestedAt: approvals.requestedAt }).from(approvals).innerJoin(assets, eq(approvals.assetId, assets.id)).where(and(...base)).orderBy(desc(approvals.requestedAt));
    }),
  }),
});

export type AppRouter = typeof appRouter;
