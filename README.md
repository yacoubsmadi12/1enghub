

## ENGHUB local deployment

ENGHUB is prepared for Ubuntu with PostgreSQL. The executable schema migration is located at `drizzle/0000_workable_gambit.sql`, the TypeScript source of truth is `drizzle/schema.ts`, and the detailed setup guide is `docs/ubuntu-postgres-setup.md`. Use `docs/environment.template` as a safe configuration reference, set `ENGHUB_DATABASE_URL` in a protected local environment, apply the migration with `psql`, then run `pnpm install`, `pnpm check`, `pnpm test`, and `pnpm dev`. Do not commit database credentials or expose them to frontend code.
