import { PrismaClient } from '@prisma/client';

// Create Prisma client instance with logging
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
});

// Initial connection
prisma.$connect()
  .then(() => {
    console.log('✅ Database connected successfully');
  })
  .catch((error) => {
    console.error('❌ Initial database connection failed:', error);
  });

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  console.log('🔌 Database disconnected');
});

// Active health check - performs actual database query
export const isDatabaseConnected = async (): Promise<boolean> => {
  try {
    // Perform a simple query to verify connection is alive
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};

export default prisma;
