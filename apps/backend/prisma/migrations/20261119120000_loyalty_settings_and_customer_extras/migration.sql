-- Loyalty switches, customer-menu extras (Zomato/Swiggy, review link) and
-- WhatsApp templates, all per restaurant. Purely additive with safe defaults,
-- so existing restaurants and orders are unaffected.
ALTER TABLE "restaurants"
  ADD COLUMN "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "loyaltyMinOrderAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "loyaltyMinRedeemPoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "loyaltyExpiryDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryRedirectEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "zomatoUrl" TEXT,
  ADD COLUMN "swiggyUrl" TEXT,
  ADD COLUMN "reviewUrl" TEXT,
  ADD COLUMN "whatsappTemplates" JSONB;

ALTER TABLE "customers" ADD COLUMN "loyaltyLastEarnedAt" TIMESTAMP(3);

ALTER TABLE "orders" ADD COLUMN "loyaltyPointsEarned" INTEGER NOT NULL DEFAULT 0;
