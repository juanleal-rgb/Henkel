import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Update batch to IN_PROGRESS
  const batch = await prisma.supplierBatch.update({
    where: { id: "cmkn3xhhb07w803qb52hujdqb" },
    data: {
      status: "IN_PROGRESS",
      attemptCount: 1,
    },
  });
  console.log("Batch updated:", batch.id, batch.status);

  // Update POs to IN_PROGRESS
  const pos = await prisma.purchaseOrder.updateMany({
    where: { batchId: "cmkn3xhhb07w803qb52hujdqb" },
    data: { status: "IN_PROGRESS" },
  });
  console.log("POs updated:", pos.count);

  // Get PO IDs for later
  const poList = await prisma.purchaseOrder.findMany({
    where: { batchId: "cmkn3xhhb07w803qb52hujdqb" },
    select: { id: true, poNumber: true },
  });
  console.log("PO IDs:");
  poList.forEach((po) => console.log(`  ${po.poNumber}: ${po.id}`));
}

main()
  .catch(console.error)
  .finally(() => {
    prisma.$disconnect();
    pool.end();
  });
