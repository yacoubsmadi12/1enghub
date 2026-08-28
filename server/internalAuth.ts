import { createHash, timingSafeEqual } from "node:crypto";
import { getInternalAccount, type InternalUsername } from "@shared/internal-auth";

const developmentPasswords: Record<InternalUsername, string> = {
  admin: "admin-dev-only",
  manager: "manager-dev-only",
  "team-member": "team-member-dev-only",
};

function configuredHash(username: InternalUsername) {
  const key = `ENGHUB_${username.toUpperCase().replace("-", "_")}_PASSWORD_HASH`;
  return process.env[key] || "";
}

export function verifyInternalCredentials(username: string, password: string) {
  const account = getInternalAccount(username);
  if (!account || password.length < 8) return null;
  const normalized = username.trim().toLowerCase() as InternalUsername;
  const encoded = configuredHash(normalized);
  if (encoded) {
    const [salt, expected] = encoded.split(":");
    if (!salt || !expected) return null;
    const actual = createHash("sha256").update(`${salt}:${password}`).digest("hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    const actualBuffer = Buffer.from(actual, "hex");
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer) ? account : null;
  }
  if (process.env.NODE_ENV !== "production" && password === developmentPasswords[normalized]) return account;
  return null;
}
