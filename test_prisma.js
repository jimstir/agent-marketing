import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL || "postgresql://a:b@localhost:5432/mydb"
});
console.log("Success");
