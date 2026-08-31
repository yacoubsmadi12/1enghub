import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { INTERNAL_ACCOUNTS, type InternalUsername } from "@shared/internal-auth";

export type InternalAccountSeed = {
  username: InternalUsername;
  openId: string;
  id: string;
  name: string;
  role: "top_manager" | "manager" | "team_member";
};

export const INTERNAL_ACCOUNT_SEEDS: readonly InternalAccountSeed[] = Object.entries(INTERNAL_ACCOUNTS).map(([username, account]) => ({
  username: username as InternalUsername,
  openId: account.openId,
  id: account.id,
  name: account.name,
  role: account.role,
}));

export function normalizeInternalUsername(username: string): string | null {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized)) return null;
  return normalized;
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: createHash("sha256").update(`${salt}:${password}`).digest("hex"),
  };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  if (!salt || !expectedHash) return false;
  const actual = Buffer.from(hashPassword(password, salt).hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
