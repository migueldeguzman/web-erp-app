import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    const [users, companies, vehicles, bookings, customers, invoices, accounts, transactions] = await Promise.all([
      prisma.user.count(),
      prisma.company.count(),
      prisma.vehicle.count(),
      prisma.booking.count(),
      prisma.customer.count(),
      prisma.invoice.count(),
      prisma.account.count(),
      prisma.transaction.count(),
    ]);

    console.log('\n📊 Database Status After Reset:');
    console.log('================================');
    console.log('Users:', users);
    console.log('Companies:', companies);
    console.log('Customers:', customers);
    console.log('Accounts:', accounts);
    console.log('Vehicles:', vehicles);
    console.log('Bookings:', bookings);
    console.log('Invoices:', invoices);
    console.log('Transactions:', transactions);
    console.log('================================\n');

    if (users === 0 && companies === 0 && vehicles === 0) {
      console.log('⚠️  ALL DATA WAS REMOVED');
      console.log('The database was completely reset.');
      console.log('\nNext steps:');
      console.log('1. Create admin user');
      console.log('2. Create company');
      console.log('3. Set up chart of accounts');
      console.log('4. Add vehicles for rental');
    } else {
      console.log('✅ Database has existing data');
    }
  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
