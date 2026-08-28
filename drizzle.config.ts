import { defineConfig } from "drizzle-kit";

const connectionString = process.env.ENGHUB_DATABASE_URL;
if (!connectionString) {
  throw new Error("ENGHUB_DATABASE_URL is required to run Drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
