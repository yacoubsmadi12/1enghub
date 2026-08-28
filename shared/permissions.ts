import type { UserRole } from "../drizzle/schema";

export const ENGHUB_ROLES = ["top_manager", "manager", "team_member"] as const;

export type EnghubPermission =
  | "view_all_assets"
  | "manage_users"
  | "manage_teams"
  | "manage_settings"
  | "view_audit"
  | "approve_assets"
  | "manage_team"
  | "share_team_assets"
  | "create_assets"
  | "upload_files"
  | "edit_own_drafts"
  | "request_review";

export const rolePermissions: Record<UserRole, readonly EnghubPermission[]> = {
  top_manager: [
    "view_all_assets",
    "manage_users",
    "manage_teams",
    "manage_settings",
    "view_audit",
    "approve_assets",
    "manage_team",
    "share_team_assets",
    "create_assets",
    "upload_files",
    "edit_own_drafts",
    "request_review",
  ],
  manager: [
    "view_all_assets",
    "view_audit",
    "approve_assets",
    "manage_team",
    "share_team_assets",
    "create_assets",
    "upload_files",
    "edit_own_drafts",
    "request_review",
  ],
  team_member: ["create_assets", "upload_files", "edit_own_drafts", "request_review"],
};

export function roleCan(role: UserRole, permission: EnghubPermission) {
  return rolePermissions[role].includes(permission);
}

export function managerCanReview(role: UserRole, isSameTeam: boolean) {
  return role === "top_manager" || (role === "manager" && isSameTeam);
}

export function hasTeamScope(teamIds: readonly string[], targetTeamId: string) {
  return teamIds.some(teamId => teamId === targetTeamId);
}
