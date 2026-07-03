import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () =>
  new PrismaClient({
    log:
      process.env.PRISMA_QUERY_LOG === "true"
        ? ["query", "info", "warn", "error"]
        : ["warn", "error"],
  });

const globalForPrisma = global;
const prisma = globalForPrisma.__alfajrPrisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__alfajrPrisma = prisma;
}

export default prisma;
