import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { and, eq } from "drizzle-orm";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { approvals, assets, teamMemberships } from "../../drizzle/schema";
import { getDb } from "../db";
import { hasTeamScope, roleCan } from "../../shared/permissions";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });
export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  if (!opts.ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user } });
});
export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(t.middleware(async opts => {
  if (!opts.ctx.user || opts.ctx.user.role !== "top_manager") throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user } });
}));

export const managerProcedure = t.procedure.use(t.middleware(async opts => {
  if (!opts.ctx.user || !roleCan(opts.ctx.user.role, "manage_team")) throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
  return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user } });
}));

export const managerForTeamProcedure = t.procedure.use(t.middleware(async opts => {
  const user = opts.ctx.user;
  if (!user || (user.role !== "manager" && user.role !== "top_manager")) throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
  if (user.role === "top_manager") return opts.next({ ctx: { ...opts.ctx, user } });
  const rawInput = await opts.getRawInput();
  const teamId = rawInput && typeof rawInput === "object" && "teamId" in rawInput ? (rawInput as { teamId?: unknown }).teamId : undefined;
  if (typeof teamId !== "string") throw new TRPCError({ code: "BAD_REQUEST", message: "A team scope is required" });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const rows = await db.select({ teamId: teamMemberships.teamId }).from(teamMemberships).where(eq(teamMemberships.userId, user.id));
  if (!hasTeamScope(rows.map(row => row.teamId), teamId)) throw new TRPCError({ code: "FORBIDDEN", message: "Manager access is limited to the assigned team" });
  return opts.next({ ctx: { ...opts.ctx, user, memberships: rows } });
}));

export const teamMemberProcedure = t.procedure.use(t.middleware(async opts => {
  const user = opts.ctx.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const memberships = await db.select().from(teamMemberships).where(eq(teamMemberships.userId, user.id));
  if (memberships.length === 0 && user.role !== "top_manager") throw new TRPCError({ code: "FORBIDDEN", message: "Team membership required" });
  return opts.next({ ctx: { ...opts.ctx, user, memberships } });
}));

export const reviewDecisionProcedure = t.procedure.use(t.middleware(async opts => {
  const user = opts.ctx.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  const rawInput = await opts.getRawInput();
  const approvalId = rawInput && typeof rawInput === "object" && "approvalId" in rawInput ? (rawInput as { approvalId?: unknown }).approvalId : undefined;
  if (typeof approvalId !== "string") throw new TRPCError({ code: "BAD_REQUEST", message: "An approval is required" });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const approval = (await db.select().from(approvals).where(eq(approvals.id, approvalId)).limit(1))[0];
  if (!approval) throw new TRPCError({ code: "NOT_FOUND", message: "Approval not found" });
  const asset = (await db.select().from(assets).where(eq(assets.id, approval.assetId)).limit(1))[0];
  if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });
  if (user.role !== "top_manager" && (user.role !== "manager" || approval.reviewerId !== user.id)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the assigned direct Manager can review this project" });
  }
  return opts.next({ ctx: { ...opts.ctx, user, approval, asset } });
}));

export const shareProcedure = t.procedure.use(t.middleware(async opts => {
  const user = opts.ctx.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  const rawInput = await opts.getRawInput();
  const assetId = rawInput && typeof rawInput === "object" && "assetId" in rawInput ? (rawInput as { assetId?: unknown }).assetId : undefined;
  if (typeof assetId !== "string") throw new TRPCError({ code: "BAD_REQUEST", message: "An asset is required" });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const asset = (await db.select().from(assets).where(eq(assets.id, assetId)).limit(1))[0];
  if (!asset || (asset.status !== "approved" && asset.status !== "published" && asset.status !== "active")) throw new TRPCError({ code: "FORBIDDEN", message: "Only published assets can be shared" });
  if (user.role !== "top_manager" && asset.ownerId !== user.id) {
    const rows = await db.select({ teamId: teamMemberships.teamId }).from(teamMemberships).where(eq(teamMemberships.userId, user.id));
    if (user.role !== "manager" || !hasTeamScope(rows.map(row => row.teamId), asset.homeTeamId)) throw new TRPCError({ code: "FORBIDDEN", message: "Sharing is limited to the asset team" });
  }
  return opts.next({ ctx: { ...opts.ctx, user, asset } });
}));
