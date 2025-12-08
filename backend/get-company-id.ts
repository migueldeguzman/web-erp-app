import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getCompanyId() {
  const company = await prisma.company.findFirst();
  if (company) {
    console.log(company.id);
  } else {
    console.log('No company found');
  }
  await prisma.$disconnect();
}

getCompanyId();
