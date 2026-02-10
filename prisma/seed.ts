/**
 * Database Seed Script - Trinity PO Caller
 *
 * Creates initial data:
 * - Admin user (admin@trinity.com / AdmiU99&$)
 * - System configuration defaults
 *
 * Run with: bun run db:seed
 */

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

// Create Prisma client with pg adapter
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding Trinity PO Caller database...\n");

  // ============================================================================
  // 1. Create Admin User
  // ============================================================================
  console.log("👤 Creating admin user...");

  const passwordHash = await hash("AdmiU99&$", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@trinity.com" },
    update: {
      passwordHash,
    },
    create: {
      email: "admin@trinity.com",
      name: "Admin User",
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
  });

  console.log(`   ✓ Created user: ${admin.email} (password: AdmiU99&$)\n`);

  // ============================================================================
  // 2. Create System Configuration
  // ============================================================================
  console.log("⚙️  Creating system configuration...");

  const configDefaults = [
    {
      key: "maxPOsPerBatch",
      value: 10,
      description: "Maximum number of POs to include in a single supplier call",
    },
    {
      key: "maxRetryAttempts",
      value: 5,
      description: "Maximum number of call attempts before marking batch as failed",
    },
    {
      key: "businessHoursStart",
      value: 8,
      description: "Start of business hours (24-hour format)",
    },
    {
      key: "businessHoursEnd",
      value: 17,
      description: "End of business hours (24-hour format)",
    },
    {
      key: "businessTimezone",
      value: "America/Chicago",
      description: "Timezone for business hours calculations",
    },
    {
      key: "queuePollIntervalMs",
      value: 5000,
      description: "How often to poll queues for processing (milliseconds)",
    },
    {
      key: "maxConcurrentCalls",
      value: 5,
      description: "Maximum number of simultaneous calls to make",
    },
  ];

  for (const config of configDefaults) {
    await prisma.pOSystemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: {
        key: config.key,
        value: config.value,
        description: config.description,
      },
    });
    console.log(`   ✓ ${config.key}: ${JSON.stringify(config.value)}`);
  }

  console.log(`\n✅ Seeding complete!\n`);
  console.log(`   📊 Summary:`);
  console.log(`      - 1 Admin user`);
  console.log(`      - ${configDefaults.length} System config entries\n`);
  console.log(`   🔐 Login credentials:`);
  console.log(`      Email: admin@trinity.com`);
  console.log(`      Password: AdmiU99&$\n`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
