# Proposal: keep uploaded menu photos across redeploys

Status: PROPOSAL for the owner. Nothing here has been applied to any hosting volume, bucket or account.

## What was found
The upload chain works end to end in a fresh environment (verified locally): upload -> file written under `UPLOADS_DIR`
-> URL `/api/uploads/<file>` saved on the menu item -> backend serves it statically -> Next rewrites `/api/*` to the
backend -> the thumbnail loads through the `next/image` optimizer. Raw and optimizer responses were both 200.

The one fragile link is **where the file lives**. Uploads are plain files on the backend's disk. If the host's disk is
ephemeral (wiped on each deploy/restart - typical of free PaaS tiers), the database still holds `/api/uploads/<file>` but the
file is gone, and the browser shows a broken-image icon (this matches the "paneer mutter" photo). Files already lost
cannot be recovered by any code change; re-upload them (or restore from a backup that included the uploads archive).

Also check on the host: `BACKEND_URL` is baked into the web build (Next rewrites), so the web image must be built with the
backend's real URL (docker-compose passes `http://backend:4000`).

## Option A (smallest): persistent volume
Mount a persistent disk/volume on the backend service and point uploads at it.
- Env: `UPLOADS_DIR=/data/uploads` (docker-compose.yml already does this with the `uploads_data` volume).
- On a PaaS: attach a persistent disk at `/data` and set `UPLOADS_DIR=/data/uploads`.
- No code change. The backend now logs a warning at startup in production when `UPLOADS_DIR` is not set.

## Option B: S3-compatible object storage
Store uploads in a bucket (an S3 client is already a dependency, used by backups) and save the public URL.
Needs a small code change (upload via `S3Client.PutObject` instead of multer disk storage, return the bucket/CDN URL, add the bucket host to
`images.remotePatterns` in `apps/web/next.config.ts`) - not built here because it is a new storage mode.
- Env (proposed): `UPLOADS_DRIVER=s3`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
  `UPLOADS_PUBLIC_BASE_URL`.

## Recommendation
Option A if the host supports persistent disks; Option B if it does not. Include `uploads.tar.gz` in whatever backup runs
(the existing backup service already archives `UPLOADS_DIR`).
