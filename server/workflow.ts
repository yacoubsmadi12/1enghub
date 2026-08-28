import type { AssetStatus, UserRole } from "../drizzle/schema";

export type ReviewDecision = "approved" | "changes_requested" | "rejected";

export function canSubmitForReview(role: UserRole, currentStatus: AssetStatus) {
  return (role === "team_member" || role === "manager" || role === "top_manager") && ["draft", "testing", "changes_requested"].includes(currentStatus);
}

export function canManagerDecide(role: UserRole, isSameTeam: boolean) {
  return role === "top_manager" || (role === "manager" && isSameTeam);
}

export function decisionToAssetStatus(decision: ReviewDecision): AssetStatus {
  if (decision === "approved") return "approved";
  if (decision === "changes_requested") return "changes_requested";
  return "rejected";
}

export function canPublish(role: UserRole, status: AssetStatus) {
  return (role === "top_manager" || role === "manager") && status === "approved";
}

export function canSharePublishedAsset(status: AssetStatus) {
  return status === "published" || status === "active";
}
