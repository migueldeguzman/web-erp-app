import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create default admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@vesla.com' },
    update: {},
    create: {
      email: 'admin@vesla.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('✅ Admin user created:');
  console.log('   Email: admin@vesla.com');
  console.log('   Password: admin123');
  console.log('   Role: ADMIN');

  // Create a default company
  const company = await prisma.company.upsert({
    where: { code: 'VESLA' },
    update: {},
    create: {
      code: 'VESLA',
      name: 'Vesla Motors',
      address: 'Dubai, UAE',
      phone: '+971-XXX-XXXX',
      email: 'info@vesla.com',
      taxNumber: 'TRN-123456789',
      isActive: true,
    },
  });

  console.log('✅ Default company created:');
  console.log(`   Code: ${company.code}`);
  console.log(`   Name: ${company.name}`);

  // Create test vehicles
  const vehicles = await Promise.all([
    prisma.vehicle.upsert({
      where: { plateNumber: 'DXB-12345' },
      update: {},
      create: {
        companyId: company.id,
        make: 'Nissan',
        model: 'Sunny',
        year: 2024,
        plateNumber: 'DXB-12345',
        vin: 'JN1CV6AR0BM123456',
        color: 'White',
        category: 'Sedan',
        dailyRate: 150.00,
        weeklyRate: 900.00,
        monthlyRate: 3000.00,
        mileage: 5000,
        fuelType: 'Petrol',
        transmission: 'Automatic',
        seats: 5,
        status: 'AVAILABLE',
        isBooked: false,
        description: 'Economy sedan, perfect for city driving',
      },
    }),
    prisma.vehicle.upsert({
      where: { plateNumber: 'DXB-67890' },
      update: {},
      create: {
        companyId: company.id,
        make: 'Toyota',
        model: 'Camry',
        year: 2024,
        plateNumber: 'DXB-67890',
        vin: 'JTNBK46K003123789',
        color: 'Silver',
        category: 'Sedan',
        dailyRate: 200.00,
        weeklyRate: 1200.00,
        monthlyRate: 4500.00,
        mileage: 3000,
        fuelType: 'Petrol',
        transmission: 'Automatic',
        seats: 5,
        status: 'AVAILABLE',
        isBooked: false,
        description: 'Comfortable mid-size sedan',
      },
    }),
    prisma.vehicle.upsert({
      where: { plateNumber: 'DXB-11111' },
      update: {},
      create: {
        companyId: company.id,
        make: 'Honda',
        model: 'Accord',
        year: 2024,
        plateNumber: 'DXB-11111',
        vin: 'JHLRE48H37C456789',
        color: 'Black',
        category: 'Sedan',
        dailyRate: 180.00,
        weeklyRate: 1080.00,
        monthlyRate: 4000.00,
        mileage: 8000,
        fuelType: 'Petrol',
        transmission: 'Automatic',
        seats: 5,
        status: 'AVAILABLE',
        isBooked: false,
        description: 'Reliable and fuel-efficient',
      },
    }),
  ]);

  console.log('✅ Test vehicles created:');
  vehicles.forEach(v => {
    console.log(`   ${v.make} ${v.model} ${v.year} - AED ${v.dailyRate}/day, AED ${v.monthlyRate}/month`);
  });

  console.log('\n✨ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
