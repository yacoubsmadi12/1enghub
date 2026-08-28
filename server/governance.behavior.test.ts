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
});
