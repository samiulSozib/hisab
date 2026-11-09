import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma client for the app runtime.
 *
 * - On Neon (Vercel), DATABASE_URL is the *pooled* connection string (`-pooler` host) and we use the
 *   Neon serverless driver over WebSockets, which supports interactive transactions.
 * - Anywhere else (local Postgres / Docker) we use node-postgres.
 *
 * Sensitive / heavy columns are omitted by default and must be selected explicitly.
 */
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure your database.");
  }
  const adapter = /\.neon\.tech/.test(connectionString)
    ? new PrismaNeon({ connectionString })
    : new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    omit: {
      user: { passwordHash: true },
      attachment: { data: true },
    },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export type DbClient = ReturnType<typeof createClient>;
/** Client usable inside `db.$transaction(async (tx) => …)`. */
export type DbTx = Parameters<Parameters<DbClient["$transaction"]>[0]>[0];

const globalForPrisma = globalThis as unknown as { prisma?: DbClient };

function getClient(): DbClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

/** Lazily-initialised singleton (so `next build` does not require a database connection). */
export const db = new Proxy({} as DbClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
