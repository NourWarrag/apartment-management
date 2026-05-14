import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let ADMIN_COOKIE: string;
let FINANCE_COOKIE: string;
let RECEP_COOKIE: string;

describe('Buildings API', () => {
  let buildingId: number;
  let aptId: number;

  beforeAll(async () => {
    // Clean up any leftover test data
    await testPrisma.apartment.deleteMany({ where: { number: 'BLD-001' } });
    await testPrisma.building.deleteMany({ where: { code: { in: ['T1', 'T2'] } } });
    await testPrisma.user.deleteMany({ where: { email: 'admin-bld@test.com' } });

    // Create a real user so the audit FK (createdBy) resolves
    const admin = await testPrisma.user.create({
      data: { name: 'Admin BLD', email: 'admin-bld@test.com', password: 'x', role: 'ADMIN' },
    });
    ADMIN_COOKIE = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;
    FINANCE_COOKIE = `token=${signToken({ id: admin.id, role: 'FINANCE', assignedBuildingId: null })}`;
    RECEP_COOKIE = `token=${signToken({ id: admin.id, role: 'RECEPTIONIST', assignedBuildingId: null })}`;
  });

  afterAll(async () => {
    await testPrisma.apartment.deleteMany({ where: { number: 'BLD-001' } });
    await testPrisma.building.deleteMany({ where: { code: { in: ['T1', 'T2'] } } });
    await testPrisma.user.deleteMany({ where: { email: 'admin-bld@test.com' } });
    await testPrisma.$disconnect();
    await prisma.$disconnect();
  });

  it('POST /buildings returns 403 for non-ADMIN', async () => {
    const res = await request(app)
      .post('/api/v1/buildings')
      .set('Cookie', RECEP_COOKIE)
      .send({ name: 'Tower 1', code: 'T1', address: '1 Main St' });
    expect(res.status).toBe(403);
  });

  it('POST /buildings creates a building', async () => {
    const res = await request(app)
      .post('/api/v1/buildings')
      .set('Cookie', ADMIN_COOKIE)
      .send({ name: 'Tower 1', code: 'T1', address: '1 Main St' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: expect.any(Number), name: 'Tower 1', code: 'T1', address: '1 Main St' });
    buildingId = res.body.id;
  });

  it('POST /buildings returns 409 for duplicate code', async () => {
    const res = await request(app)
      .post('/api/v1/buildings')
      .set('Cookie', ADMIN_COOKIE)
      .send({ name: 'Tower 1 Dup', code: 'T1', address: 'x' });
    expect(res.status).toBe(409);
  });

  it('GET /buildings returns array including created building', async () => {
    const res = await request(app).get('/api/v1/buildings').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((b: { id: number }) => b.id === buildingId)).toBe(true);
  });

  it('PATCH /buildings/:id updates name', async () => {
    const res = await request(app)
      .patch(`/api/v1/buildings/${buildingId}`)
      .set('Cookie', ADMIN_COOKIE)
      .send({ name: 'Tower One' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Tower One');
  });

  it('DELETE /buildings/:id returns 409 when building has apartments', async () => {
    const apt = await testPrisma.apartment.create({
      data: { number: 'BLD-001', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId },
    });
    aptId = apt.id;
    const res = await request(app)
      .delete(`/api/v1/buildings/${buildingId}`)
      .set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(409);
  });

  it('DELETE /buildings/:id succeeds when no apartments', async () => {
    await testPrisma.apartment.delete({ where: { id: aptId } });
    const res = await request(app)
      .delete(`/api/v1/buildings/${buildingId}`)
      .set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(204);
  });

  it('GET /apartments?buildingId= filters by building', async () => {
    const b = await testPrisma.building.create({ data: { name: 'Tower 2', code: 'T2', address: '' } });
    await testPrisma.apartment.create({
      data: { number: 'BLD-001', floor: 1, type: 'STUDIO', status: 'AVAILABLE', buildingId: b.id },
    });

    const res = await request(app)
      .get(`/api/v1/apartments?buildingId=${b.id}`)
      .set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    const apts = Array.isArray(res.body) ? res.body : res.body.data ?? [];
    expect(apts.length).toBeGreaterThan(0);
    expect(apts.every((a: { building?: { id: number } }) => a.building?.id === b.id)).toBe(true);

    // Cleanup
    await testPrisma.apartment.deleteMany({ where: { buildingId: b.id } });
    await testPrisma.building.delete({ where: { id: b.id } });
  });

  it('GET /reports/buildings returns per-building rows + global totals', async () => {
    const res = await request(app).get('/api/v1/reports/buildings').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const global = res.body.find((r: { buildingId: null | number }) => r.buildingId === null);
    expect(global).toBeDefined();
    expect(global).toMatchObject({
      buildingName: 'All Buildings',
      totalApartments: expect.any(Number),
      occupied: expect.any(Number),
      occupancyRate: expect.any(Number),
      monthlyRevenue: expect.any(Number),
      openTickets: expect.any(Number),
    });
  });

  it('GET /reports/buildings returns 403 for non-ADMIN/FINANCE', async () => {
    const res = await request(app).get('/api/v1/reports/buildings').set('Cookie', RECEP_COOKIE);
    expect(res.status).toBe(403);
  });

  it('GET /reports/buildings returns 200 for FINANCE role', async () => {
    const res = await request(app).get('/api/v1/reports/buildings').set('Cookie', FINANCE_COOKIE);
    expect(res.status).toBe(200);
  });
});
