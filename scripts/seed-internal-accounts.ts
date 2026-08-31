import { eq } from "drizzle-orm";
import { departments, teamMemberships, teams, users } from "../drizzle/schema";
import { closeDatabasePool, getDb } from "../server/db";
import { hashPassword, INTERNAL_ACCOUNT_SEEDS } from "../server/internalAuth";

const passwordByUsername = {
  admin: process.env.ENGHUB_ADMIN_PASSWORD,
  manager: process.env.ENGHUB_MANAGER_PASSWORD,
  "team-member": process.env.ENGHUB_TEAM_MEMBER_PASSWORD,
} as const;

async function main() {
  const db = await getDb();
  if (!db) throw new Error("ENGHUB_DATABASE_URL is required to seed internal accounts");
  const missing = Object.entries(passwordByUsername).filter(([, password]) => !password || password.length < 8).map(([username]) => username);
  if (missing.length) throw new Error(`Set passwords of at least 8 characters for: ${missing.join(", ")}`);

  await db.transaction(async tx => {
    const department = (await tx.insert(departments).values({ name: "Network Operations", code: "NOC" }).onConflictDoUpdate({ target: departments.code, set: { name: "Network Operations", updatedAt: new Date() } }).returning())[0];
    if (!department) throw new Error("Unable to create the Network Operations department");
    const team = (await tx.insert(teams).values({ departmentId: department.id, name: "RAN Engineering", code: "RAN", description: "Radio access network engineering and operations" }).onConflictDoUpdate({ target: teams.code, set: { departmentId: department.id, name: "RAN Engineering", isActive: true, updatedAt: new Date() } }).returning())[0];
    if (!team) throw new Error("Unable to create the RAN Engineering team");

    for (const seed of INTERNAL_ACCOUNT_SEEDS) {
      const credentials = hashPassword(passwordByUsername[seed.username]!);
      const account = (await tx.insert(users).values({ id: seed.id, openId: seed.openId, username: seed.username, passwordSalt: credentials.salt, passwordHash: credentials.hash, name: seed.name, email: null, loginMethod: "internal_username", role: seed.role, isActive: true }).onConflictDoUpdate({ target: users.username, set: { openId: seed.openId, passwordSalt: credentials.salt, passwordHash: credentials.hash, name: seed.name, loginMethod: "internal_username", role: seed.role, isActive: true, updatedAt: new Date() } }).returning())[0];
      if (!account) throw new Error(`Unable to provision ${seed.username}`);
      await tx.insert(teamMemberships).values({ userId: account.id, teamId: team.id, isPrimary: true }).onConflictDoNothing();
    }
  });

  console.log("Provisioned internal accounts: admin, manager, team-member");
  console.log("Provisioned team: RAN Engineering (RAN)");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await closeDatabasePool();
});
