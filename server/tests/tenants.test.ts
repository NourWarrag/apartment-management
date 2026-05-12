import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let adminCookie: string;
let maintenanceCookie: string;
let receptionistCookie: string;
let tenant1Id: number;

beforeAll(async () => {
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: {
      name: 'Admin',
      email: 'admin@test.com',
      password: await hashPassword('password123'),
      role: 'ADMIN',
    },
  });

  await prisma.user.create({
    data: {
      name: 'Maintenance',
      email: 'maintenance@test.com',
      password: await hashPassword('password123'),
      role: 'MAINTENANCE',
    },
  });

  await prisma.user.create({
    data: {
      name: 'Receptionist',
      email: 'reception@test.com',
      password: await hashPassword('password123'),
      role: 'RECEPTIONIST',
    },
  });

  await prisma.tenant.create({
    data: { fullName: 'Second Tenant', phone: '+971502222222', idNumber: 'B99999999' },
  });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@test.com', password: 'password123' });
  adminCookie = loginRes.headers['set-cookie'][0];

  const maintenanceLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'maintenance@test.com', password: 'password123' });
  maintenanceCookie = maintenanceLoginRes.headers['set-cookie'][0];

  const receptionLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'reception@test.com', password: 'password123' });
  receptionistCookie = receptionLoginRes.headers['set-cookie'][0];
});

afterAll(async () => {
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('POST /api/v1/tenants', () => {
  it('creates a tenant', async () => {
    const res = await request(app)
      .post('/api/v1/tenants')
      .set('Cookie', adminCookie)
      .send({ fullName: 'Ali Hassan', phone: '+971501234567', idNumber: 'A12345678' });
    expect(res.status).toBe(201);
    expect(res.body.fullName).toBe('Ali Hassan');
    expect(res.body.idNumber).toBe('A12345678');
    tenant1Id = res.body.id;
  });

  it('returns 409 on duplicate idNumber', async () => {
    const res = await request(app)
      .post('/api/v1/tenants')
      .set('Cookie', adminCookie)
      .send({ fullName: 'Ali Duplicate', phone: '+971509999999', idNumber: 'A12345678' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('ID number already registered');
  });

  it('returns 400 on missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/tenants')
      .set('Cookie', adminCookie)
      .send({ fullName: 'Incomplete' });
    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/v1/tenants')
      .send({ fullName: 'Ghost', phone: '000', idNumber: 'GHOST01' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for MAINTENANCE role', async () => {
    const res = await request(app)
      .post('/api/v1/tenants')
      .set('Cookie', maintenanceCookie)
      .send({ fullName: 'Blocked', phone: '+97150000', idNumber: 'BLOCKED01' });
    expect(res.status).toBe(403);
  });

  it('allows RECEPTIONIST role to create tenant', async () => {
    const res = await request(app)
      .post('/api/v1/tenants')
      .set('Cookie', receptionistCookie)
      .send({ fullName: 'Reception Tenant', phone: '+971503333333', idNumber: 'C11111111' });
    expect(res.status).toBe(201);
    expect(res.body.fullName).toBe('Reception Tenant');
  });
});

describe('GET /api/v1/tenants', () => {
  it('returns list of tenants', async () => {
    const res = await request(app)
      .get('/api/v1/tenants')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('searches by name', async () => {
    const res = await request(app)
      .get('/api/v1/tenants?search=Ali')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.some((t: { fullName: string }) => t.fullName.includes('Ali'))).toBe(true);
  });

  it('searches by idNumber', async () => {
    const res = await request(app)
      .get('/api/v1/tenants?search=A12345678')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.some((t: { idNumber: string }) => t.idNumber === 'A12345678')).toBe(true);
  });

  it('searches by phone', async () => {
    const res = await request(app)
      .get('/api/v1/tenants?search=501234567')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.some((t: { phone: string }) => t.phone.includes('501234567'))).toBe(true);
  });
});

describe('GET /api/v1/tenants/:id', () => {
  it('returns tenant detail with bookings', async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${tenant1Id}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('Ali Hassan');
    expect(res.body).toHaveProperty('bookings');
    expect(Array.isArray(res.body.bookings)).toBe(true);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/99999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/abc')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/v1/tenants/:id', () => {
  it('updates tenant phone', async () => {
    const res = await request(app)
      .put(`/api/v1/tenants/${tenant1Id}`)
      .set('Cookie', adminCookie)
      .send({ phone: '+971501111111' });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('+971501111111');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .put('/api/v1/tenants/99999')
      .set('Cookie', adminCookie)
      .send({ phone: '+971509999999' });
    expect(res.status).toBe(404);
  });

  it('returns 403 for MAINTENANCE role', async () => {
    const res = await request(app)
      .put(`/api/v1/tenants/${tenant1Id}`)
      .set('Cookie', maintenanceCookie)
      .send({ phone: '+971508888888' });
    expect(res.status).toBe(403);
  });

  it('returns 409 when updating to a duplicate idNumber', async () => {
    const res = await request(app)
      .put(`/api/v1/tenants/${tenant1Id}`)
      .set('Cookie', adminCookie)
      .send({ idNumber: 'B99999999' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('ID number already registered');
  });

  it('allows RECEPTIONIST role to update tenant', async () => {
    const res = await request(app)
      .put(`/api/v1/tenants/${tenant1Id}`)
      .set('Cookie', receptionistCookie)
      .send({ phone: '+971507777777' });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('+971507777777');
  });
});
