import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

function getConnectionString() {
  return process.env.ENGHUB_DATABASE_URL;
}

export function hasPostgresConfiguration() {
  return Boolean(getConnectionString());
}

/** Lazily initializes PostgreSQL so non-database tooling remains usable. */
export async function getDb() {
  const connectionString = getConnectionString();
  if (!connectionString) return null;

  if (!db) {
    try {
      pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 20_000 });
      db = drizzle(pool);
    } catch (error) {
      console.error("[Database] PostgreSQL initialization failed", error);
      pool = null;
      db = null;
    }
  }

  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const database = await getDb();
  if (!database) return;

  const now = new Date();
  const role = user.role ?? (user.openId === ENV.ownerOpenId ? "top_manager" : "team_member");
  const values: InsertUser = {
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role,
    lastSignedIn: user.lastSignedIn ?? now,
    updatedAt: now,
  };

  await database.insert(users).values(values).onConflictDoUpdate({
    target: users.openId,
    set: {
      name: values.name,
      email: values.email,
      loginMethod: values.loginMethod,
      lastSignedIn: values.lastSignedIn,
      updatedAt: now,
    },
  });
}

export async function getUserByOpenId(openId: string) {
  const database = await getDb();
  if (!database) return undefined;

  const result = await database.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function closeDatabasePool() {
  await pool?.end();
  pool = null;
  db = null;
}
