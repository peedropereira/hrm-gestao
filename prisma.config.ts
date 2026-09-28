import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrações usam a conexão direta (sem pooler) quando disponível.
// Na Vercel com Neon, DATABASE_URL_UNPOOLED é criada automaticamente.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL_UNPOOLED"] ?? process.env["DATABASE_URL"],
  },
});
