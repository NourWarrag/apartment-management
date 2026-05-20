import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { signToken } from '../lib/jwt';
import prisma from '../lib/prisma';

const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let adminToken: string;

beforeAll(async () => {
  await testPrisma.user.deleteMany({ where: { email: 'admin-brokers-test@test.com' } });
  const admin = await testPrisma.user.create({
    data: { name: 'Brokers Admin', email: 'admin-brokers-test@test.com', password: 'x', role: 'ADMIN' },
  });
  adminToken = `token=${signToken({ id: admin.id, role: 'ADMIN', assignedBuildingId: null })}`;
});

afterAll(async () => {
  await testPrisma.brokerAgent.deleteMany();
  await testPrisma.broker.deleteMany();
  await testPrisma.user.deleteMany({ where: { email: 'admin-brokers-test@test.com' } });
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await testPrisma.brokerAgent.deleteMany();
  await testPrisma.broker.deleteMany();
});

describe('Brokers API', () => {
  describe('POST /brokers', () => {
    it('creates a broker with required fields', async () => {
      const res = await request(app)
        .post('/api/v1/brokers')
        .set('Cookie', adminToken)
        .send({
          name: 'Acme Referrals',
          phone: '+971500000001',
          commissionType: 'PERCENT',
          defaultCommissionValue: 5,
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Acme Referrals');
      expect(res.body.status).toBe('ACTIVE');
      expect(Number(res.body.defaultCommissionValue)).toBe(5);
    });

    it('rejects missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/brokers')
        .set('Cookie', adminToken)
        .send({});
      expect(res.status).toBe(400);
    });

    it('rejects negative defaultCommissionValue', async () => {
      const res = await request(app)
        .post('/api/v1/brokers')
        .set('Cookie', adminToken)
        .send({
          name: 'X',
          phone: '+971500000002',
          commissionType: 'FLAT',
          defaultCommissionValue: -10,
        });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /brokers', () => {
    it('lists active brokers and excludes soft-deleted', async () => {
      const a = await testPrisma.broker.create({
        data: { name: 'Active', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      await testPrisma.broker.create({
        data: { name: 'Gone', phone: '+2', commissionType: 'PERCENT', defaultCommissionValue: 5, deletedAt: new Date() },
      });
      const res = await request(app)
        .get('/api/v1/brokers')
        .set('Cookie', adminToken);
      expect(res.status).toBe(200);
      expect(res.body.map((b: any) => b.id)).toEqual([a.id]);
    });

    it('search filter matches name (case-insensitive)', async () => {
      await testPrisma.broker.create({
        data: { name: 'Alpha Co', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      await testPrisma.broker.create({
        data: { name: 'Beta Co', phone: '+2', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      const res = await request(app)
        .get('/api/v1/brokers?search=alpha')
        .set('Cookie', adminToken);
      expect(res.body.map((b: any) => b.name)).toEqual(['Alpha Co']);
    });
  });

  describe('PATCH /brokers/:id', () => {
    it('updates the rate and notes', async () => {
      const b = await testPrisma.broker.create({
        data: { name: 'X', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      const res = await request(app)
        .patch(`/api/v1/brokers/${b.id}`)
        .set('Cookie', adminToken)
        .send({ defaultCommissionValue: 7.5, notes: 'now 7.5%' });
      expect(res.status).toBe(200);
      expect(Number(res.body.defaultCommissionValue)).toBe(7.5);
      expect(res.body.notes).toBe('now 7.5%');
    });
  });

  describe('DELETE /brokers/:id', () => {
    it('soft-deletes when no active agents and no commission-owed bookings', async () => {
      const b = await testPrisma.broker.create({
        data: { name: 'X', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      const res = await request(app)
        .delete(`/api/v1/brokers/${b.id}`)
        .set('Cookie', adminToken);
      expect(res.status).toBe(204);
      const after = await testPrisma.broker.findUnique({ where: { id: b.id } });
      expect(after?.deletedAt).not.toBeNull();
    });

    it('rejects soft-delete when broker has ACTIVE agents', async () => {
      const b = await testPrisma.broker.create({
        data: { name: 'X', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      await testPrisma.brokerAgent.create({
        data: { brokerId: b.id, fullName: 'A', phone: '+1', status: 'ACTIVE' },
      });
      const res = await request(app)
        .delete(`/api/v1/brokers/${b.id}`)
        .set('Cookie', adminToken);
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/active agents/i);
    });
  });

  describe('Agents nested under a broker', () => {
    it('creates an agent under a broker', async () => {
      const b = await testPrisma.broker.create({
        data: { name: 'X', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      const res = await request(app)
        .post(`/api/v1/brokers/${b.id}/agents`)
        .set('Cookie', adminToken)
        .send({ fullName: 'Jane', phone: '+97150000000' });
      expect(res.status).toBe(201);
      expect(res.body.brokerId).toBe(b.id);
      expect(res.body.fullName).toBe('Jane');
      expect(res.body.status).toBe('ACTIVE');
    });

    it('lists agents under a broker, excluding soft-deleted', async () => {
      const b = await testPrisma.broker.create({
        data: { name: 'X', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      const active = await testPrisma.brokerAgent.create({
        data: { brokerId: b.id, fullName: 'A', phone: '+1' },
      });
      await testPrisma.brokerAgent.create({
        data: { brokerId: b.id, fullName: 'B', phone: '+2', deletedAt: new Date() },
      });
      const res = await request(app)
        .get(`/api/v1/brokers/${b.id}/agents`)
        .set('Cookie', adminToken);
      expect(res.body.map((a: any) => a.id)).toEqual([active.id]);
    });

    it('agent PATCH can set commission override', async () => {
      const b = await testPrisma.broker.create({
        data: { name: 'X', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      const a = await testPrisma.brokerAgent.create({
        data: { brokerId: b.id, fullName: 'A', phone: '+1' },
      });
      const res = await request(app)
        .patch(`/api/v1/agents/${a.id}`)
        .set('Cookie', adminToken)
        .send({ commissionType: 'PERCENT', commissionValueOverride: 10 });
      expect(res.status).toBe(200);
      expect(res.body.commissionType).toBe('PERCENT');
      expect(Number(res.body.commissionValueOverride)).toBe(10);
    });
  });

  describe('GET /agents?search=', () => {
    it('flat agent search across brokers, grouped in response', async () => {
      const b1 = await testPrisma.broker.create({
        data: { name: 'B1', phone: '+1', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      const b2 = await testPrisma.broker.create({
        data: { name: 'B2', phone: '+2', commissionType: 'PERCENT', defaultCommissionValue: 5 },
      });
      await testPrisma.brokerAgent.create({ data: { brokerId: b1.id, fullName: 'Alice', phone: '+1' } });
      await testPrisma.brokerAgent.create({ data: { brokerId: b2.id, fullName: 'Alex', phone: '+2' } });

      const res = await request(app)
        .get('/api/v1/agents?search=al')
        .set('Cookie', adminToken);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      const names = res.body.flatMap((g: any) => g.agents.map((a: any) => a.fullName));
      expect(names.sort()).toEqual(['Alex', 'Alice']);
    });
  });
});
