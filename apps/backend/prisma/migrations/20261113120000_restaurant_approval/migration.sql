-- Platform approval for restaurant signups. Additive only.
-- Backfill: the DEFAULT makes every existing restaurant APPROVED, so current
-- tenants keep working unchanged. New signups are set to PENDING by the app.
ALTER TABLE "restaurants" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "restaurants" ADD COLUMN "approvalDecidedAt" TIMESTAMP(3);
CREATE INDEX "restaurants_approvalStatus_idx" ON "restaurants"("approvalStatus");
