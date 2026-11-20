import type { Prisma, PrismaClient } from '@prisma/client';

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * The customer of ONE branch whose stored phone equals this normalised number.
 * Stored phones are normalised in SQL the same way normalizePhone() does
 * (digits only, no 00 prefix, no 91 country code, no trunk 0) so legacy
 * "+91 98765-43210" rows are found, while a short number never matches a
 * different customer whose number merely ends with the same digits. The phone
 * is the only identity: names are never compared.
 */
export async function findCustomerByPhone(
  client: Client,
  branchId: string,
  phone: string,
): Promise<{ id: string; name: string | null; phone: string | null } | null> {
  const rows: { id: string; name: string | null; phone: string | null }[] =
    await client.$queryRaw`
      SELECT id, name, phone FROM (
        SELECT id, name, phone, "createdAt",
          regexp_replace(regexp_replace(phone, '[^0-9]', '', 'g'), '^00', '') AS digits
        FROM customers
        WHERE "branchId" = ${branchId} AND phone IS NOT NULL
      ) c
      WHERE (CASE
          WHEN length(digits) = 12 AND left(digits, 2) = '91' THEN substr(digits, 3)
          WHEN length(digits) = 11 AND left(digits, 1) = '0' THEN substr(digits, 2)
          ELSE digits
        END) = ${phone}
      ORDER BY "createdAt" ASC, id ASC LIMIT 1`;
  return rows[0] ?? null;
}
