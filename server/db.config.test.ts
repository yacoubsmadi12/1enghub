import { describe, expect, it } from "vitest";

describe("ENGHUB PostgreSQL configuration", () => {
  it("does not fall back to the starter database connection", async () => {
    const previousEnghubUrl = process.env.ENGHUB_DATABASE_URL;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.ENGHUB_DATABASE_URL;
    process.env.DATABASE_URL = "mysql://starter-database";

    const { hasPostgresConfiguration } = await import("./db");
    expect(hasPostgresConfiguration()).toBe(false);

    process.env.ENGHUB_DATABASE_URL = previousEnghubUrl;
    process.env.DATABASE_URL = previousDatabaseUrl;
  });
});

