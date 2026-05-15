import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from './app';
import { FeatureFlag } from '@hotel/shared';

describe('GET /api/v1/config', () => {
  it('returns all feature flags as booleans (no auth required)', async () => {
    const res = await request(app).get('/api/v1/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features');
    const flags = res.body.features;
    for (const key of Object.values(FeatureFlag)) {
      expect(flags).toHaveProperty(key);
      expect(typeof flags[key]).toBe('boolean');
    }
  });
});
