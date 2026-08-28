import { describe, expect, it } from "vitest";
import { managerCanReview, roleCan } from "../shared/permissions";

describe("ENGHUB role permissions", () => {
  it("allows team members to create and submit review requests", () => {
    expect(roleCan("team_member", "create_assets")).toBe(true);
    expect(roleCan("team_member", "request_review")).toBe(true);
    expect(roleCan("team_member", "approve_assets")).toBe(false);
  });

  it("limits managers to review within their team while top managers are global", () => {
    expect(managerCanReview("manager", true)).toBe(true);
    expect(managerCanReview("manager", false)).toBe(false);
    expect(managerCanReview("top_manager", false)).toBe(true);
  });

  it("keeps administrative settings unavailable to managers", () => {
    expect(roleCan("top_manager", "manage_settings")).toBe(true);
    expect(roleCan("manager", "manage_settings")).toBe(false);
  });
});
