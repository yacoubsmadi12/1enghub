import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext {
  const now = new Date();
  return {
    user: { id: "00000000-0000-4000-8000-000000000001", openId: "detail-test", name: "Detail Test", email: "detail@example.com", loginMethod: "test", role: "top_manager", createdAt: now, updatedAt: now, lastSignedIn: now },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("assets.get", () => {
  it("returns a safe null result when the downloadable app has no database configured", async () => {
    const caller = appRouter.createCaller(context());
    const result = await caller.assets.get({ assetId: "00000000-0000-4000-8000-000000000002" });
    expect(result).toBeNull();
  });
});
