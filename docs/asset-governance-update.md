# Asset governance update

## What changed

Team members can now document an asset's detailed explanation, achieved business value, hours saved, cost saved, purpose, installation, usage, and troubleshooting guidance. These fields are available during initial submission and from the asset detail editor.

The asset detail page shows a clear workflow: Submitted, Manager review, Approved, Published, and Reusable. The owner can attach additional files from the detail page; each attachment is registered and submitted to the assigned Manager for review.

The assigned Manager can open the asset and its governed files even when the Manager is not a direct team membership row. Team members can open their own assets and approved assets in their team scope. Top Managers retain full access.

Dashboard links now use the asset UUID, while `assets.get` also accepts the human-readable `ENG-...` asset key for backwards compatibility.

Top Managers can edit user profile fields and delete an individual user from User Management. Deletion is deliberately blocked for users with governed assets, approvals, versions, uploaded files, or audit history; disable the account instead to preserve traceability.

## VM deployment

After pulling the commit, run `pnpm install --frozen-lockfile`, `pnpm build`, then restart the existing PM2 process with `pm2 restart enghub --update-env`. No new migration is required for these changes because the value fields and `asset_documents` table already exist in the current schema.

## Existing assets

For an asset created before approval records were added, use the existing approval backfill procedure or resubmit it. For an already approved asset, the owner or assigned Manager can open the detail page and use **Edit details** to add the value and usage guide.

## Security boundary

File access remains protected by the backend. Raw storage URLs are not exposed in asset detail responses; opening a file requests a signed URL after the user is authorized. User passwords remain server-side hashed and are never returned by the API.
