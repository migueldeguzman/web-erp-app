import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany();
  console.log(JSON.stringify(companies, null, 2));
  await prisma.$disconnect();
}

main();
