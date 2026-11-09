import "dotenv/config";
import { defineConfig } from "prisma/config";

// The Prisma CLI (migrate, studio, seed) must use the DIRECT (non-pooled) Neon connection string.
// The application runtime uses the POOLED string (DATABASE_URL) — see src/lib/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    // DIRECT_URL (manual setup) or DATABASE_URL_UNPOOLED (injected by the Vercel ↔ Neon integration).
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
