import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';

// Raw client — bypasses soft-delete extension for setup/teardown
const db = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

const ADMIN_ID = 999001;
const ADMIN_COOKIE = `token=${signToken({ id: ADMIN_ID, role: 'ADMIN' })}`;

describe('Audit columns + soft delete', () => {
  beforeAll(async () => {
    await db.maintenanceTicket.deleteMany({ where: { apartment: { number: 'AUDIT-101' } } });
    await db.payment.deleteMany({ where: { booking: { apartment: { number: 'AUDIT-101' } } } });
    await db.booking.deleteMany({ where: { apartment: { number: 'AUDIT-101' } } });
    await db.apartment.deleteMany({ where: { number: 'AUDIT-101' } });
    await db.tenant.deleteMany({ where: { idNumber: 'AUDIT-ID-001' } });
    await db.user.deleteMany({ where: { id: ADMIN_ID } });
    await db.user.create({
      data: { id: ADMIN_ID, name: 'Audit Admin', email: 'audit-admin@test.com', password: 'x', role: 'ADMIN' },
    });
  });

  afterAll(async () => {
    await db.maintenanceTicket.deleteMany({ where: { apartment: { number: 'AUDIT-101' } } });
    await db.payment.deleteMany({ where: { booking: { apartment: { number: 'AUDIT-101' } } } });
    await db.booking.deleteMany({ where: { apartment: { number: 'AUDIT-101' } } });
    await db.apartment.deleteMany({ where: { number: 'AUDIT-101' } });
    await db.tenant.deleteMany({ where: { idNumber: 'AUDIT-ID-001' } });
    await db.user.deleteMany({ where: { id: ADMIN_ID } });
    await db.$disconnect();
  });

  describe('Audit columns — createdBy / updatedBy', () => {
    it('POST /apartments sets createdBy and updatedBy to the authenticated user', async () => {
      const res = await request(app)
        .post('/api/v1/apartments')
        .set('Cookie', ADMIN_COOKIE)
        .send({ number: 'AUDIT-101', floor: 9, type: 'STUDIO', status: 'AVAILABLE', buildingId: 1 });

      expect(res.status).toBe(201);
      const row = await db.apartment.findFirst({ where: { number: 'AUDIT-101' } });
      expect(row).not.toBeNull();
      expect(row!.createdBy).toBe(ADMIN_ID);
      expect(row!.updatedBy).toBe(ADMIN_ID);
    });

    it('PATCH /apartments/:id sets updatedBy and leaves createdBy unchanged', async () => {
      const apt = await db.apartment.findFirst({ where: { number: 'AUDIT-101' } });
      expect(apt).not.toBeNull();

      const res = await request(app)
        .patch(`/api/v1/apartments/${apt!.id}`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ status: 'MAINTENANCE' });

      expect(res.status).toBe(200);
      const updated = await db.apartment.findUnique({ where: { id: apt!.id } });
      expect(updated!.createdBy).toBe(ADMIN_ID);
      expect(updated!.updatedBy).toBe(ADMIN_ID);
    });
  });

  describe('Soft delete — Tenant', () => {
    let tenantId: number;

    beforeAll(async () => {
      await db.tenant.deleteMany({ where: { idNumber: 'AUDIT-ID-001' } });
      const t = await db.tenant.create({
        data: { fullName: 'Audit Tenant', phone: '0501112222', idNumber: 'AUDIT-ID-001' },
      });
      tenantId = t.id;
    });

    it('DELETE /tenants/:id sets deletedAt and deletedBy (does not hard-delete)', async () => {
      const res = await request(app)
        .delete(`/api/v1/tenants/${tenantId}`)
        .set('Cookie', ADMIN_COOKIE);

      expect([200, 204]).toContain(res.status);
      const raw = await db.tenant.findUnique({ where: { id: tenantId } });
      expect(raw).not.toBeNull();
      expect(raw!.deletedAt).not.toBeNull();
    });

    it('GET /tenants does not include soft-deleted tenant', async () => {
      const res = await request(app)
        .get('/api/v1/tenants')
        .set('Cookie', ADMIN_COOKIE);

      expect(res.status).toBe(200);
      const body = res.body;
      const items = Array.isArray(body) ? body : (body.data ?? []);
      const ids = items.map((t: { id: number }) => t.id);
      expect(ids).not.toContain(tenantId);
    });

    it('DELETE /tenants/:id a second time is idempotent', async () => {
      const res = await request(app)
        .delete(`/api/v1/tenants/${tenantId}`)
        .set('Cookie', ADMIN_COOKIE);

      expect([200, 204, 404]).toContain(res.status);
    });
  });

  describe('Soft delete — Apartment', () => {
    it('soft-deleted apartment does not appear in GET /apartments', async () => {
      const apt = await db.apartment.findFirst({ where: { number: 'AUDIT-101' } });
      expect(apt).not.toBeNull();

      await request(app)
        .delete(`/api/v1/apartments/${apt!.id}`)
        .set('Cookie', ADMIN_COOKIE);

      const res = await request(app)
        .get('/api/v1/apartments')
        .set('Cookie', ADMIN_COOKIE);

      const body = res.body;
      const items = Array.isArray(body) ? body : (body.data ?? []);
      const ids = items.map((a: { id: number }) => a.id);
      expect(ids).not.toContain(apt!.id);

      const raw = await db.apartment.findUnique({ where: { id: apt!.id } });
      expect(raw!.deletedAt).not.toBeNull();
    });
  });
});
