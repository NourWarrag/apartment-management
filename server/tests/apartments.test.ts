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
let apt1Id: number;

beforeAll(async () => {
  await prisma.apartment.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: {
      name: 'Admin',
      email: 'admin@test.com',
      password: await hashPassword('password123'),
      role: 'ADMIN',
    },
  });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@test.com', password: 'password123' });
  adminCookie = loginRes.headers['set-cookie'][0];

  await prisma.user.create({
    data: {
      name: 'Maintenance',
      email: 'maintenance@test.com',
      password: await hashPassword('password123'),
      role: 'MAINTENANCE',
    },
  });

  const maintenanceLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'maintenance@test.com', password: 'password123' });
  maintenanceCookie = maintenanceLoginRes.headers['set-cookie'][0];
});

afterAll(async () => {
  await prisma.apartment.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('POST /api/v1/apartments', () => {
  it('creates an apartment', async () => {
    const res = await request(app)
      .post('/api/v1/apartments')
      .set('Cookie', adminCookie)
      .send({ number: '101', floor: 1 });
    expect(res.status).toBe(201);
    expect(res.body.number).toBe('101');
    expect(res.body.status).toBe('AVAILABLE');
    apt1Id = res.body.id;
  });

  it('returns 409 on duplicate apartment number', async () => {
    const res = await request(app)
      .post('/api/v1/apartments')
      .set('Cookie', adminCookie)
      .send({ number: '101', floor: 1 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Apartment number already exists');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/v1/apartments')
      .send({ number: '999', floor: 9 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for MAINTENANCE role', async () => {
    const res = await request(app)
      .post('/api/v1/apartments')
      .set('Cookie', maintenanceCookie)
      .send({ number: '777', floor: 7 });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/apartments', () => {
  it('returns list of apartments', async () => {
    const res = await request(app)
      .get('/api/v1/apartments')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by status', async () => {
    const res = await request(app)
      .get('/api/v1/apartments?status=AVAILABLE')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    res.body.forEach((a: { status: string }) => {
      expect(a.status).toBe('AVAILABLE');
    });
  });

  it('searches by number', async () => {
    const res = await request(app)
      .get('/api/v1/apartments?search=101')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.some((a: { number: string }) => a.number === '101')).toBe(true);
  });
});

describe('GET /api/v1/apartments/:id', () => {
  it('returns apartment detail', async () => {
    const res = await request(app)
      .get(`/api/v1/apartments/${apt1Id}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.number).toBe('101');
    expect(res.body).toHaveProperty('currentBooking');
    expect(res.body).toHaveProperty('tickets');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .get('/api/v1/apartments/99999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/apartments/:id', () => {
  it('updates apartment status', async () => {
    const res = await request(app)
      .put(`/api/v1/apartments/${apt1Id}`)
      .set('Cookie', adminCookie)
      .send({ status: 'MAINTENANCE' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('MAINTENANCE');
  });

  it('updates apartment number', async () => {
    const res = await request(app)
      .put(`/api/v1/apartments/${apt1Id}`)
      .set('Cookie', adminCookie)
      .send({ number: '101A', floor: 1 });
    expect(res.status).toBe(200);
    expect(res.body.number).toBe('101A');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .put('/api/v1/apartments/99999')
      .set('Cookie', adminCookie)
      .send({ status: 'AVAILABLE' });
    expect(res.status).toBe(404);
  });

  it('returns 403 for MAINTENANCE role', async () => {
    const res = await request(app)
      .put(`/api/v1/apartments/${apt1Id}`)
      .set('Cookie', maintenanceCookie)
      .send({ status: 'AVAILABLE' });
    expect(res.status).toBe(403);
  });
});
