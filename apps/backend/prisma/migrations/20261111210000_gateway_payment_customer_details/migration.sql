-- Additive, nullable: name/phone typed while paying online, saved as a customer on settle.
ALTER TABLE "gateway_payments" ADD COLUMN "customerName" TEXT,
ADD COLUMN "customerPhone" TEXT;
