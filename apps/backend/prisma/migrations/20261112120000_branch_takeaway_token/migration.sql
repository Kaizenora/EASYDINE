-- Takeaway QR: per-branch opaque token, so the public takeaway link no longer
-- uses the (non-secret) branch id. Additive and nullable.
ALTER TABLE "branches" ADD COLUMN "takeawayToken" TEXT;
CREATE UNIQUE INDEX "branches_takeawayToken_key" ON "branches"("takeawayToken");
