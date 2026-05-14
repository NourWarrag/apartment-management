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

  // Apartments
  const aptData = [
    { number: '101', floor: 1, type: 'STUDIO', status: 'OCCUPIED' },
    { number: '102', floor: 1, type: 'ONE_BEDROOM', status: 'AVAILABLE' },
    { number: '103', floor: 1, type: 'TWO_BEDROOM', status: 'RESERVED' },
    { number: '201', floor: 2, type: 'ONE_BEDROOM', status: 'OCCUPIED' },
    { number: '202', floor: 2, type: 'PENTHOUSE', status: 'MAINTENANCE' },
    { number: '203', floor: 2, type: 'STUDIO', status: 'AVAILABLE' },
    { number: '301', floor: 3, type: 'TWO_BEDROOM', status: 'OCCUPIED' },
    { number: '302', floor: 3, type: 'ONE_BEDROOM', status: 'PENDING_CHECKOUT' },
    { number: '401', floor: 4, type: 'PENTHOUSE', status: 'OCCUPIED' },
    { number: '402', floor: 4, type: 'STUDIO', status: 'AVAILABLE' },
    { number: '501', floor: 5, type: 'TWO_BEDROOM', status: 'OCCUPIED' },
    { number: '502', floor: 5, type: 'ONE_BEDROOM', status: 'RESERVED' },
  ] as const;

  const apartments: { id: number; number: string }[] = [];
  for (const apt of aptData) {
    const record = await prisma.apartment.upsert({
      where: { buildingId_number: { buildingId: 1, number: apt.number } },
      update: { type: apt.type as any, status: apt.status as any },
      create: { number: apt.number, floor: apt.floor, type: apt.type as any, status: apt.status as any },
    });
    apartments.push(record);
  }

  // Tenants
  const tenantData = [
    { fullName: 'Ahmed Al-Rashidi', phone: '+971501234567', idNumber: 'UAE-001', kycStatus: 'VERIFIED', tier: 'GOLD', notes: 'Prefers email contact. Long-term resident.' },
    { fullName: 'Fatima Al-Zahra', phone: '+971502345678', idNumber: 'UAE-002', kycStatus: 'VERIFIED', tier: 'PLATINUM', notes: null },
    { fullName: 'James Wilson', phone: '+971503456789', idNumber: 'UK-001', kycStatus: 'PENDING', tier: 'NEW', notes: null },
    { fullName: 'Sara Al-Mansoori', phone: '+971504567890', idNumber: 'UAE-003', kycStatus: 'VERIFIED', tier: 'SILVER', notes: 'Quiet hours after 10pm.' },
    { fullName: 'Michael Chen', phone: '+971505678901', idNumber: 'CN-001', kycStatus: 'ACTION_REQUIRED', tier: 'NEW', notes: 'Awaiting passport copy.' },
    { fullName: 'Nour Al-Hassan', phone: '+971506789012', idNumber: 'UAE-004', kycStatus: 'VERIFIED', tier: 'GOLD', notes: null },
    { fullName: 'David Thompson', phone: '+971507890123', idNumber: 'US-001', kycStatus: 'VERIFIED', tier: 'SILVER', notes: null },
  ] as const;

  const tenants: { id: number; fullName: string }[] = [];
  for (const t of tenantData) {
    const record = await prisma.tenant.upsert({
      where: { idNumber: t.idNumber },
      update: { kycStatus: t.kycStatus as any, tier: t.tier as any, notes: t.notes },
      create: { fullName: t.fullName, phone: t.phone, idNumber: t.idNumber, kycStatus: t.kycStatus as any, tier: t.tier as any, notes: t.notes },
    });
    tenants.push(record);
  }

  // Bookings — some active, one upcoming, one ending soon
  const now = new Date();
  const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86400000);

  const bookings = [
    { apartmentNumber: '101', tenantIdNumber: 'UAE-001', checkIn: d(-60), checkOut: d(30) },
    { apartmentNumber: '201', tenantIdNumber: 'UAE-002', checkIn: d(-90), checkOut: d(5) },  // pending checkout soon
    { apartmentNumber: '301', tenantIdNumber: 'UK-001',  checkIn: d(-30), checkOut: d(60) },
    { apartmentNumber: '302', tenantIdNumber: 'UAE-003', checkIn: d(-10), checkOut: d(2) },  // pending checkout very soon
    { apartmentNumber: '401', tenantIdNumber: 'CN-001',  checkIn: d(-45), checkOut: d(45) },
    { apartmentNumber: '501', tenantIdNumber: 'UAE-004', checkIn: d(-20), checkOut: d(40) },
    { apartmentNumber: '103', tenantIdNumber: 'US-001',  checkIn: d(3),   checkOut: d(63) }, // upcoming check-in
  ];

  for (const b of bookings) {
    const apt = apartments.find((a) => a.number === b.apartmentNumber)!;
    const tenant = tenants.find((t) => {
      const td = tenantData.find((x) => x.idNumber === b.tenantIdNumber);
      return td && t.fullName === td.fullName;
    })!;

    const existing = await prisma.booking.findFirst({ where: { apartmentId: apt.id, tenantId: tenant.id } });
    if (!existing) {
      const booking = await prisma.booking.create({
        data: {
          apartmentId: apt.id,
          tenantId: tenant.id,
          checkIn: b.checkIn,
          checkOut: b.checkOut,
          totalAmount: 5000,
        },
      });
      // Add a payment for each booking
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          amount: 5000,
          method: 'CARD',
          status: b.checkIn <= now ? 'PAID' : 'PENDING',
          paidAt: b.checkIn <= now ? b.checkIn : null,
        },
      });
    }
  }

  console.log('Seeded: admin@hotel.com / admin123');
  console.log(`Seeded: ${apartments.length} apartments, ${tenants.length} tenants, ${bookings.length} bookings`);
}

main().finally(() => prisma.$disconnect());
