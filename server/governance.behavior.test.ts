import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(role: "top_manager" | "manager" | "team_member"): TrpcContext {
  const now = new Date();
  return { user: { id: "00000000-0000-4000-8000-000000000001", openId: `governance-${role}`, name: "Governance Test", email: "governance@example.com", loginMethod: "test", role, createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("ENGHUB governance behavior", () => {
  it("denies role changes outside the Top Manager role", async () => {
    const caller = appRouter.createCaller(context("manager"));
    await expect(caller.administration.changeRole({ userId: "00000000-0000-4000-8000-000000000002", role: "team_member" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns an empty notification list when no database is configured", async () => {
    const caller = appRouter.createCaller(context("team_member"));
    await expect(caller.notifications.list()).resolves.toEqual([]);
  });

  it("allows a Top Manager to access administration read procedures", async () => {
    const caller = appRouter.createCaller(context("top_manager"));
    await expect(caller.administration.listUsers()).resolves.toEqual([]);
    await expect(caller.administration.listTeams()).resolves.toEqual([]);
  });

  it("denies every administration procedure to a Team Member", async () => {
    const caller = appRouter.createCaller(context("team_member"));
    await expect(caller.administration.listUsers()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.administration.listTeams()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.administration.setActive({ userId: "00000000-0000-4000-8000-000000000002", isActive: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.administration.assignTeam({ userId: "00000000-0000-4000-8000-000000000002", teamId: "00000000-0000-4000-8000-000000000003", isPrimary: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies role changes to a Manager", async () => {
    const caller = appRouter.createCaller(context("manager"));
    await expect(caller.administration.changeRole({ userId: "00000000-0000-4000-8000-000000000002", role: "team_member" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
