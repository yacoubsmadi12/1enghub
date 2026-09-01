# ENGHUB PostgreSQL schema

The database is normalized around the engineering asset lifecycle. `users`, `departments`, `teams`, and `team_memberships` provide the organization and authorization context. Each user may have a unique `employee_number` and a self-referencing `manager_id`; this direct reporting line is the source of truth for manager-scoped onboarding and review routing. `assets` stores asset metadata and lifecycle state. `asset_versions` and `asset_files` preserve version history while keeping file bytes outside PostgreSQL; only the storage key, serving URL, content type, size, extension, and optional SHA-256 checksum are stored.

`tags` and `asset_tags` support reusable classification. `asset_relations` stores dependencies and related assets. `asset_documents` stores structured documentation sections. `approvals` records each requested decision and the reviewer responsible for it. `asset_shares` supports user/team recipients, permissions, expiration, and revocation. `notifications` provides the in-product notification inbox, while `audit_events` records sensitive actions as append-oriented history.

## Role invariants

| Role | Allowed governance scope |
|---|---|
| `top_manager` | Organization-wide oversight, users, teams, roles, settings, audit, and all assets. |
| `manager` | Own team members, team assets, approvals, sharing within permitted policy, and team analytics. |
| `team_member` | Create and edit own draft assets, upload new versions into restricted review, and view assets granted to the user or team. |

## Publication invariant

An asset or attachment submitted by a `team_member` must remain restricted while its approval record is `pending`. The system assigns the submitter's active direct Manager as `assets.manager_id` and `approvals.reviewer_id`; only that Manager or a `top_manager` can see the pending item in the approval queue and decide it. Rejection and change requests require a reason. The backend must enforce this invariant; frontend visibility is only a convenience.

## User import format

The Top Manager import accepts `.xlsx`, `.xls`, and `.csv` files with `Employee Number`, `Full Name`, `Manager Number`, `Manager Name`, `user name`, `password`, and `Email Address`. `Team Name` is optional; when supplied, the team is created or reused. Any employee number referenced by another row's `Manager Number`, or any full name referenced by `Manager Name`, is assigned the `manager` role. Other rows become `team_member` accounts. The import validates all rows before committing one database transaction, hashes passwords server-side, and records audit events.

Managers can use the My team screen to create or import only `team_member` accounts whose Manager Number or Manager Name identifies the logged-in Manager. The selected existing team is enforced server-side.

## Migration

The executable migrations are `drizzle/0000_workable_gambit.sql` through the latest migration in `drizzle/`. The TypeScript source of truth is `drizzle/schema.ts`. The current change is in `drizzle/0003_eager_shinobi_shaw.sql`. If the schema changes, generate a new migration with:

```bash
ENGHUB_DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/enghub' pnpm drizzle-kit generate
```

Review the generated SQL before applying it to production. Never drop or rewrite production tables without an explicit backup and migration plan.
