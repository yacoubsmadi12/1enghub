import { describe, expect, it } from "vitest";
import { getInternalAccount } from "../shared/internal-auth";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext {
  const now = new Date();
  return { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { cookie: () => undefined } as TrpcContext["res"] };
}

describe("ENGHUB internal authentication", () => {
  it("maps the three visible usernames to the required roles", () => {
    expect(getInternalAccount("admin")?.role).toBe("top_manager");
    expect(getInternalAccount("manager")?.role).toBe("manager");
    expect(getInternalAccount("team-member")?.role).toBe("team_member");
  });

  it("issues a session for a valid internal username", async () => {
    const result = await appRouter.createCaller(context()).auth.internalLogin({ username: "admin", password: "admin-dev-only" });
    expect(result).toMatchObject({ success: true, username: "admin", role: "top_manager" });
  });

  it("rejects unknown usernames", async () => {
    await expect(appRouter.createCaller(context()).auth.internalLogin({ username: "unknown-user", password: "unknown-dev" })).rejects.toThrow("Invalid ENGHUB username or password");
  });

  it("does not mint a Top Manager session with a wrong password", async () => {
    await expect(appRouter.createCaller(context()).auth.internalLogin({ username: "admin", password: "wrong-password" })).rejects.toThrow("Invalid ENGHUB username or password");
  });
});
