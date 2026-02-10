import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./schema.prisma",
  migrations: {
    path: "./migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://postgres:iWFQfVtJEKNbcBclfAwySAoTmFNiAoEW@caboose.proxy.rlwy.net:17255/railway",
  },
});
