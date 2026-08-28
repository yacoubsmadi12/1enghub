import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextFor(role: "top_manager" | "manager" | "team_member"): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: "00000000-0000-0000-0000-000000000010",
      openId: `policy-${role}`,
      name: role,
      email: `${role}@example.com`,
      loginMethod: "test",
      role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("ENGHUB review router policy", () => {
  it("allows a Top Manager to review any team without a membership lookup", async () => {
    const caller = appRouter.createCaller(contextFor("top_manager"));
    await expect(caller.assets.canReviewTeam({ teamId: "00000000-0000-4000-8000-000000000011" })).resolves.toBe(true);
  });

  it("denies Team Members before entering manager review scope", async () => {
    const caller = appRouter.createCaller(contextFor("team_member"));
    await expect(caller.assets.canReviewTeam({ teamId: "00000000-0000-4000-8000-000000000011" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
