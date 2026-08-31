import { describe, expect, it } from "vitest";
import { getInternalAccount } from "../shared/internal-auth";
import { hashPassword, normalizeInternalUsername, verifyPassword } from "./internalAuth";

describe("ENGHUB internal authentication", () => {
  it("maps the three provisioned usernames to the required roles", () => {
    expect(getInternalAccount("admin")?.role).toBe("top_manager");
    expect(getInternalAccount("manager")?.role).toBe("manager");
    expect(getInternalAccount("team-member")?.role).toBe("team_member");
  });

  it("normalizes provisioned and administrator-created usernames safely", () => {
    expect(normalizeInternalUsername("  MANAGER ")).toBe("manager");
    expect(normalizeInternalUsername("engineer.smith")).toBe("engineer.smith");
    expect(normalizeInternalUsername("bad username")).toBeNull();
    expect(normalizeInternalUsername("!!invalid!!")).toBeNull();
  });

  it("verifies a salted password hash and rejects wrong passwords", () => {
    const credentials = hashPassword("manager-local-password");
    expect(verifyPassword("manager-local-password", credentials.salt, credentials.hash)).toBe(true);
    expect(verifyPassword("wrong-password", credentials.salt, credentials.hash)).toBe(false);
  });
});
