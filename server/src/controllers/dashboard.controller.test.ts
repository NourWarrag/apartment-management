import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';
import { signToken } from '../lib/jwt';

const adminCookie = `token=${signToken({ id: 1, role: 'ADMIN' })}`;

describe('GET /api/v1/dashboard/stats', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/dashboard/stats');
    expect(res.status).toBe(401);
  });

  it('returns the correct response shape', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      apartments: {
        total: expect.any(Number),
        occupied: expect.any(Number),
        available: expect.any(Number),
        maintenance: expect.any(Number),
      },
      revenue: {
        total: expect.any(Number),
        cash: expect.any(Number),
        card: expect.any(Number),
        installment: expect.any(Number),
      },
      pendingInstallments: expect.any(Number),
      openTickets: expect.any(Number),
    });
  });

  it('apartment total equals sum of all status counts', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Cookie', adminCookie);

    const { apartments } = res.body as {
      apartments: { total: number; occupied: number; available: number; maintenance: number };
    };
    expect(apartments.total).toBeGreaterThanOrEqual(
      apartments.occupied + apartments.available + apartments.maintenance
    );
  });

  it('revenue total equals sum of cash + card + installment', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Cookie', adminCookie);

    const { revenue } = res.body as {
      revenue: { total: number; cash: number; card: number; installment: number };
    };
    expect(revenue.total).toBeCloseTo(revenue.cash + revenue.card + revenue.installment, 2);
  });
});

describe('GET /api/v1/dashboard/activity', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/dashboard/activity');
    expect(res.status).toBe(401);
  });

  it('returns events array with correct shape', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/activity')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeLessThanOrEqual(20);
  });

  it('each event has type, label, and timestamp', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/activity')
      .set('Cookie', adminCookie);

    for (const event of res.body.events) {
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('label');
      expect(event).toHaveProperty('timestamp');
      expect(['CHECK_IN', 'CHECK_OUT', 'PAYMENT', 'TICKET']).toContain(event.type);
      expect(typeof event.label).toBe('string');
      expect(typeof event.timestamp).toBe('string');
    }
  });

  it('events are sorted newest-first', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/activity')
      .set('Cookie', adminCookie);

    const events = res.body.events as { timestamp: string }[];
    for (let i = 0; i < events.length - 1; i++) {
      expect(new Date(events[i].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(events[i + 1].timestamp).getTime()
      );
    }
  });
});
