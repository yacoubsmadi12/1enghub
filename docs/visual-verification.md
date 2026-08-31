# ENGHUB visual verification

The desktop workspace keeps the dark enterprise shell with persistent role-aware navigation, live PostgreSQL metrics, governed asset library, and scoped governance actions. Authenticated views do not fall back to sample assets, metrics, or activity; an empty database renders explicit empty and connection states instead.

The mobile layout keeps the collapsible sidebar, responsive metrics, and usable library search. The login screen uses a lightweight animated telecom scene with tower silhouettes, signal arcs, network pulses, and a glass access card, so it does not depend on an external video asset.

## Internal login verification

The root route renders a username text field and password field. There is no username dropdown and no demo-preview bypass. The three provisioned accounts are `admin` (`top_manager`), `manager` (`manager`), and `team-member` (`team_member`); credentials are verified against salted hashes stored in PostgreSQL.

## Role verification

| Role | Expected workspace access | Expected controls |
|---|---|---|
| Top Manager | All assets and all teams | User management, role/team assignment, activation, approvals, audit, settings, sharing, publishing |
| Manager | Assigned team assets and team-scoped workspace | Review queue, approve/request changes/reject, publish approved assets, share governed team assets, create and submit within assigned team |
| Team Member | Own assets and assigned-team assets | Create/upload, edit own drafts, submit for review, view scoped library; no approvals, user management, audit, or settings |
