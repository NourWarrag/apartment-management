import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@hotel.com' },
    update: {},
    create: { name: 'Admin User', email: 'admin@hotel.com', password, role: 'ADMIN' },
  });
  console.log('Seeded: admin@hotel.com / admin123');
}

main().finally(() => prisma.$disconnect());
