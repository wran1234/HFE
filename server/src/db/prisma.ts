import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
if (!process.env.DATABASE_URL && process.env.NEON_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.NEON_DATABASE_URL;
}

declare global {
  // eslint-disable-next-line no-var
  var __hfePrisma: PrismaClient | undefined;
}

export const prisma =
  global.__hfePrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__hfePrisma = prisma;
}
