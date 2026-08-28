import { describe, expect, it } from "vitest";
import { canManagerDecide, canPublish, canSharePublishedAsset, canSubmitForReview, decisionToAssetStatus } from "./workflow";

describe("ENGHUB asset workflow", () => {
  it("allows a team member to submit a draft but not publish it", () => {
    expect(canSubmitForReview("team_member", "draft")).toBe(true);
    expect(canPublish("team_member", "approved")).toBe(false);
  });

  it("requires a same-team manager or top manager for decisions", () => {
    expect(canManagerDecide("manager", true)).toBe(true);
    expect(canManagerDecide("manager", false)).toBe(false);
    expect(canManagerDecide("top_manager", false)).toBe(true);
  });

  it("maps review decisions to controlled lifecycle states", () => {
    expect(decisionToAssetStatus("approved")).toBe("approved");
    expect(decisionToAssetStatus("changes_requested")).toBe("changes_requested");
    expect(decisionToAssetStatus("rejected")).toBe("rejected");
    expect(canSharePublishedAsset("approved")).toBe(false);
    expect(canSharePublishedAsset("published")).toBe(true);
  });
});
