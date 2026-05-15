import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import app from '../app';
import db from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { signToken } from '../lib/jwt';
import { Role } from '@hotel/shared';
import { _resetStorage } from '../lib/storage';

const TEST_UPLOADS = path.resolve('./test-uploads-att');

const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

let adminToken: string;
let maintToken: string;
let buildingId: number;
let aptId: number;
let tenantId: number;
let ticketId: number;

const PDF_BUFFER = Buffer.from('%PDF-1.4 fake pdf content');

beforeAll(async () => {
  process.env.STORAGE_PATH = TEST_UPLOADS;
  process.env.STORAGE_TYPE = 'local';
  _resetStorage();

  fs.mkdirSync(TEST_UPLOADS, { recursive: true });

  // Clean up all attachments uploaded by test users (catches leftovers from prior failed runs)
  await testPrisma.$executeRaw`DELETE FROM "Attachment" WHERE "uploadedBy" IN (SELECT id FROM "User" WHERE email IN ('att_admin@test.com', 'att_maint@test.com'))`;
  await testPrisma.$executeRaw`DELETE FROM "Attachment" WHERE "entityType" = 'APARTMENT' AND "entityId" IN (SELECT id FROM "Apartment" WHERE number LIKE 'ATT-%')`;
  await testPrisma.$executeRaw`DELETE FROM "Attachment" WHERE "entityType" = 'TICKET' AND "entityId" IN (SELECT id FROM "MaintenanceTicket" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number LIKE 'ATT-%'))`;
  await testPrisma.$executeRaw`DELETE FROM "MaintenanceTicket" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number LIKE 'ATT-%')`;
  await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number LIKE 'ATT-%'`;
  await testPrisma.$executeRaw`DELETE FROM "Attachment" WHERE "entityType" = 'TENANT' AND "entityId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000099')`;
  await testPrisma.$executeRaw`DELETE FROM "Tenant" WHERE phone = '0500000099'`;
  await testPrisma.$executeRaw`DELETE FROM "Building" WHERE code = 'ATT-BLD'`;
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email IN ('att_admin@test.com', 'att_maint@test.com')`;

  const building = await testPrisma.building.create({
    data: { name: 'Att Building', code: 'ATT-BLD', address: '1 Att St' },
  });
  buildingId = building.id;

  const admin = await testPrisma.user.create({
    data: {
      name: 'Att Admin',
      email: 'att_admin@test.com',
      password: await hashPassword('password123'),
      role: Role.ADMIN,
    },
  });
  adminToken = `token=${signToken({ id: admin.id, role: admin.role, assignedBuildingId: null })}`;

  const maint = await testPrisma.user.create({
    data: {
      name: 'Att Maint',
      email: 'att_maint@test.com',
      password: await hashPassword('password123'),
      role: Role.MAINTENANCE,
    },
  });
  maintToken = `token=${signToken({ id: maint.id, role: maint.role, assignedBuildingId: null })}`;

  const apt = await testPrisma.apartment.create({
    data: { number: 'ATT-001', floor: 1, buildingId },
  });
  aptId = apt.id;

  const tenant = await testPrisma.tenant.create({
    data: { fullName: 'Att Tenant', phone: '0500000099', idNumber: 'ATT-ID-001' },
  });
  tenantId = tenant.id;

  const ticket = await testPrisma.maintenanceTicket.create({
    data: {
      apartmentId: aptId,
      description: 'Test ticket',
      priority: 'LOW',
      status: 'OPEN',
    },
  });
  ticketId = ticket.id;
});

afterAll(async () => {
  // Delete all attachments uploaded by test users first to avoid FK violations
  await testPrisma.$executeRaw`DELETE FROM "Attachment" WHERE "uploadedBy" IN (SELECT id FROM "User" WHERE email IN ('att_admin@test.com', 'att_maint@test.com'))`;
  await testPrisma.$executeRaw`DELETE FROM "Attachment" WHERE "entityType" = 'APARTMENT' AND "entityId" IN (SELECT id FROM "Apartment" WHERE number LIKE 'ATT-%')`;
  await testPrisma.$executeRaw`DELETE FROM "Attachment" WHERE "entityType" = 'TICKET' AND "entityId" IN (SELECT id FROM "MaintenanceTicket" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number LIKE 'ATT-%'))`;
  await testPrisma.$executeRaw`DELETE FROM "Attachment" WHERE "entityType" = 'TENANT' AND "entityId" IN (SELECT id FROM "Tenant" WHERE phone = '0500000099')`;
  await testPrisma.$executeRaw`DELETE FROM "MaintenanceTicket" WHERE "apartmentId" IN (SELECT id FROM "Apartment" WHERE number LIKE 'ATT-%')`;
  await testPrisma.$executeRaw`DELETE FROM "Apartment" WHERE number LIKE 'ATT-%'`;
  await testPrisma.$executeRaw`DELETE FROM "Tenant" WHERE phone = '0500000099'`;
  await testPrisma.$executeRaw`DELETE FROM "Building" WHERE code = 'ATT-BLD'`;
  await testPrisma.$executeRaw`DELETE FROM "User" WHERE email IN ('att_admin@test.com', 'att_maint@test.com')`;
  await testPrisma.$disconnect();
  await db.$disconnect();

  if (fs.existsSync(TEST_UPLOADS)) {
    fs.rmSync(TEST_UPLOADS, { recursive: true, force: true });
  }
});

describe('POST /api/v1/apartments/:id/attachments', () => {
  it('uploads a file and returns 201 with url', async () => {
    const res = await request(app)
      .post(`/api/v1/apartments/${aptId}/attachments`)
      .set('Cookie', adminToken)
      .attach('file', PDF_BUFFER, { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.filename).toBe('test.pdf');
    expect(res.body.mimeType).toBe('application/pdf');
    expect(res.body.size).toBe(PDF_BUFFER.length);
    expect(res.body.url).toMatch(/^\/files\/APARTMENT\//);
    expect(res.body.id).toBeTypeOf('number');

    const storagePath = res.body.url.replace('/files/', '');
    const fullPath = path.join(TEST_UPLOADS, storagePath);
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  it('returns 400 for invalid file type', async () => {
    const res = await request(app)
      .post(`/api/v1/apartments/${aptId}/attachments`)
      .set('Cookie', adminToken)
      .attach('file', Buffer.from('exe content'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid file type. Allowed: PDF, JPG, PNG, DOCX');
  });

  it('returns 404 when apartment does not exist', async () => {
    const res = await request(app)
      .post('/api/v1/apartments/99999/attachments')
      .set('Cookie', adminToken)
      .attach('file', PDF_BUFFER, { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Apartment not found');
  });

  it('returns 400 when no file is attached', async () => {
    const res = await request(app)
      .post(`/api/v1/apartments/${aptId}/attachments`)
      .set('Cookie', adminToken);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('File is required');
  });
});

describe('GET /api/v1/apartments/:id/attachments', () => {
  it('returns attachment list with url and uploadedBy', async () => {
    const res = await request(app)
      .get(`/api/v1/apartments/${aptId}/attachments`)
      .set('Cookie', adminToken);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const att = res.body[0];
    expect(att.filename).toBe('test.pdf');
    expect(att.url).toMatch(/^\/files\//);
    expect(att.uploadedBy).toMatchObject({ name: 'Att Admin' });
  });
});

describe('DELETE /api/v1/apartments/:id/attachments/:attId', () => {
  it('deletes the attachment and removes the file', async () => {
    const uploadRes = await request(app)
      .post(`/api/v1/apartments/${aptId}/attachments`)
      .set('Cookie', adminToken)
      .attach('file', PDF_BUFFER, { filename: 'to-delete.pdf', contentType: 'application/pdf' });

    const attId = uploadRes.body.id;
    const storagePath = uploadRes.body.url.replace('/files/', '');
    const fullPath = path.join(TEST_UPLOADS, storagePath);
    expect(fs.existsSync(fullPath)).toBe(true);

    const delRes = await request(app)
      .delete(`/api/v1/apartments/${aptId}/attachments/${attId}`)
      .set('Cookie', adminToken);

    expect(delRes.status).toBe(204);
    expect(fs.existsSync(fullPath)).toBe(false);
  });

  it('returns 404 when attachment belongs to different entity', async () => {
    const uploadRes = await request(app)
      .post(`/api/v1/apartments/${aptId}/attachments`)
      .set('Cookie', adminToken)
      .attach('file', PDF_BUFFER, { filename: 'wrong-entity.pdf', contentType: 'application/pdf' });

    const attId = uploadRes.body.id;

    const res = await request(app)
      .delete(`/api/v1/apartments/99999/attachments/${attId}`)
      .set('Cookie', adminToken);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Attachment not found');

    // clean up the orphaned attachment
    await request(app)
      .delete(`/api/v1/apartments/${aptId}/attachments/${attId}`)
      .set('Cookie', adminToken);
  });
});

describe('Auth enforcement', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .get(`/api/v1/apartments/${aptId}/attachments`);

    expect(res.status).toBe(401);
  });
});

describe('Ticket attachments (MAINTENANCE role)', () => {
  it('MAINTENANCE can upload to their tickets', async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set('Cookie', maintToken)
      .attach('file', PDF_BUFFER, { filename: 'damage.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/files\/TICKET\//);
  });

  it('MAINTENANCE cannot upload apartment attachments', async () => {
    const res = await request(app)
      .post(`/api/v1/apartments/${aptId}/attachments`)
      .set('Cookie', maintToken)
      .attach('file', PDF_BUFFER, { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(403);
  });
});
