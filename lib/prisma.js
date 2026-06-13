import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy"

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)

const globalForPrisma = globalThis

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
