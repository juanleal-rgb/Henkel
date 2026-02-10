import * as dotenv from "dotenv";
import path from "path";
import { defineConfig } from "prisma/config";

// Load .env.local from project root (used in this project)
// Use path.resolve to ensure correct path regardless of working directory
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

// Prisma 7 config for migrations, db push, and studio
export default defineConfig({
  schema: "./schema.prisma",
  migrations: {
    path: "./migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
