# Verification notes

- Login screen renders a telecom-themed animated CSS scene with towers, signal arcs, network pulses, and no username dropdown or demo bypass in the application UI.
- Admin login reached the dashboard as `ENGHUB Admin` / `Top Manager`; navigation includes Teams, Audit, and Settings.
- Manager login reached the dashboard as `ENGHUB Manager` / `Manager`; navigation includes Teams and governance actions but does not include Audit or Settings. The live workspace shows zero assets because the seeded database is intentionally empty.
- The bottom `Preview mode` strip is injected by the hosting preview wrapper, not by ENGHUB application code.


The team-member login reached `ENGHUB Team Member` / `Team Member · RAN`. Its navigation includes Overview, Asset library, My assets, Shared with me, Knowledge hub, and Requests only; Approvals, Analytics, Audit, Settings, and Teams are absent. The dashboard and live workspace loaded with zero assets from the seeded empty database.


Opening `/workspace/audit` directly while authenticated as Team Member renders `Access restricted` and does not load the audit workspace. This confirms the role guard works at the route layer as well as in navigation.


Navigation/logout refinement verification: Home now uses Wouter `useLocation` navigation for sidebar and Create asset actions instead of full-page assignment. Asset cards open an in-app modal and the modal's Open asset action uses SPA navigation. A visible topbar Sign out action was added in addition to the sidebar action because the preview wrapper can overlap the bottom of the sidebar. Clicking Asset library changed the URL to `/library` without a full reload. Clicking the topbar Sign out returned immediately to the redesigned Welcome back login screen and cleared the authenticated workspace.


Repository-style intake verification: the redesigned `/assets/new` page renders a GitHub-inspired project upload flow. Team selection is name/code based (`RAN Engineering · RAN`), with no UUID or storage URL inputs. A non-sensitive `enghub-upload-smoke.zip` test archive (345 B) was uploaded successfully; the UI displayed `Project stored securely`, size, and SHA-256 prefix. Because Forge/S3 variables are not present in this local sandbox, `storagePut` used the local development fallback at `.data/storage`, while production environments with Forge credentials continue to use object storage. The page auto-filled the project name and summary from the archive filename.


Final project intake verification: after confirming the browser action, `enghub-upload-smoke.zip` was committed as asset `ef7ee76c-dd5b-48c5-9a75-752b94fea64c`. PostgreSQL verified one `assets` row (`pending_review`), one `asset_versions` row (`0.1.0`), and one `asset_files` row with 345 bytes, `application/zip`, draft review status, and SHA-256 prefix `9d85657a4e38`. The local storage file exists at `.data/storage/enghub/projects/...zip` with the same 345-byte size. Asset detail now renders `ENGHUB Admin`, `RAN Engineering · RAN`, `345 B`, `application/zip`, and an Open link. The upload fallback keeps local development functional without Forge credentials; deployment with Forge credentials uses the configured object storage path.


Login error verification: the reported `Unexpected token '<', "<!doctype"... is not valid JSON` was caused by an old open tab calling `auth.login` while the server exposed `auth.internalLogin`. Added a compatibility alias so both `auth.login` and `auth.internalLogin` use the same database-backed procedure. Direct API probe now returns HTTP 200 with JSON `{success:true, username:"manager", role:"manager"}` and the browser successfully logged in as `ENGHUB Manager` with the Manager-scoped navigation.
