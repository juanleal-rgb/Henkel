import { clearQueues } from "../src/lib/queue";
import { prisma } from "../src/lib/prisma";

async function main() {
  await clearQueues();
  console.log("Redis queues cleared");

  await prisma.supplierBatch.deleteMany({});
  console.log("Batches deleted");
  await prisma.pOConflict.deleteMany({});
  console.log("Conflicts deleted");
  await prisma.purchaseOrder.deleteMany({});
  console.log("POs deleted");
  await prisma.supplier.deleteMany({});
  console.log("Suppliers deleted");
}

main().then(() => process.exit(0));
