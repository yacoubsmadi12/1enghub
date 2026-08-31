import { describe, expect, it } from "vitest";
import { getInternalAccount } from "../shared/internal-auth";
import { roleCan } from "../shared/permissions";

describe("ENGHUB role visibility", () => {
  it("maps internal accounts to the requested roles", () => {
    expect(getInternalAccount("admin")?.role).toBe("top_manager");
    expect(getInternalAccount("manager")?.role).toBe("manager");
    expect(getInternalAccount("team-member")?.role).toBe("team_member");
  });

  it("keeps user management and audit away from non-admin roles", () => {
    expect(roleCan("top_manager", "manage_users")).toBe(true);
    expect(roleCan("manager", "manage_users")).toBe(false);
    expect(roleCan("team_member", "manage_users")).toBe(false);
    expect(roleCan("top_manager", "view_audit")).toBe(true);
    expect(roleCan("manager", "view_audit")).toBe(false);
    expect(roleCan("team_member", "view_audit")).toBe(false);
  });
});
