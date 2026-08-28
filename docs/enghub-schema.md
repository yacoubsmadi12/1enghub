# ENGHUB PostgreSQL schema

The database is normalized around the engineering asset lifecycle. `users`, `departments`, `teams`, and `team_memberships` provide the organization and authorization context. `assets` stores asset metadata and lifecycle state. `asset_versions` and `asset_files` preserve version history while keeping file bytes outside PostgreSQL; only the storage key, serving URL, content type, size, extension, and optional SHA-256 checksum are stored.

`tags` and `asset_tags` support reusable classification. `asset_relations` stores dependencies and related assets. `asset_documents` stores structured documentation sections. `approvals` records each requested decision and the reviewer responsible for it. `asset_shares` supports user/team recipients, permissions, expiration, and revocation. `notifications` provides the in-product notification inbox, while `audit_events` records sensitive actions as append-oriented history.

## Role invariants

| Role | Allowed governance scope |
|---|---|
| `top_manager` | Organization-wide oversight, users, teams, roles, settings, audit, and all assets. |
| `manager` | Own team members, team assets, approvals, sharing within permitted policy, and team analytics. |
| `team_member` | Create and edit own draft assets, upload new versions into restricted review, and view assets granted to the user or team. |

## Publication invariant

An asset or attachment submitted by a `team_member` must remain restricted while its approval record is `pending`. A `manager` assigned to the asset's team must approve it before the asset can transition to `approved`, `published`, or `active`. Rejection and change requests require a reason. The backend must enforce this invariant; frontend visibility is only a convenience.

## Migration

The executable migration is `drizzle/0000_workable_gambit.sql`. The TypeScript source of truth is `drizzle/schema.ts`. If the schema changes, generate a new migration with:

```bash
ENGHUB_DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/enghub' pnpm drizzle-kit generate
```

Review the generated SQL before applying it to production. Never drop or rewrite production tables without an explicit backup and migration plan.
