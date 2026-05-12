import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

beforeAll(async () => {
  await prisma.user.deleteMany();
  await prisma.user.create({
    data: {
      name: 'Test Admin',
      email: 'admin@test.com',
      password: await hashPassword('password123'),
      role: 'ADMIN',
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('POST /api/v1/auth/login', () => {
  it('returns 200 and sets cookie on valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('admin@test.com');
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.com', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns 401 without cookie', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns user when authenticated', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    const cookie = loginRes.headers['set-cookie'][0];

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('admin@test.com');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the cookie', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    const cookie = loginRes.headers['set-cookie'][0];

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    const clearedCookie = res.headers['set-cookie'][0];
    expect(clearedCookie).toMatch(/token=;/);
  });
});
