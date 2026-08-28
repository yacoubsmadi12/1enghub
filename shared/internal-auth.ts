export const INTERNAL_ACCOUNTS = {
  admin: { role: "top_manager", name: "ENGHUB Admin", openId: "internal:admin", id: "00000000-0000-4000-8000-000000000101" },
  manager: { role: "manager", name: "ENGHUB Manager", openId: "internal:manager", id: "00000000-0000-4000-8000-000000000102" },
  "team-member": { role: "team_member", name: "ENGHUB Team Member", openId: "internal:team-member", id: "00000000-0000-4000-8000-000000000103" },
} as const;

export type InternalUsername = keyof typeof INTERNAL_ACCOUNTS;
export function getInternalAccount(username: string) {
  return INTERNAL_ACCOUNTS[username.trim().toLowerCase() as InternalUsername] ?? null;
}
