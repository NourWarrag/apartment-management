import { RequestHandler } from 'express';
import { FeatureFlag } from '@hotel/shared';
import { isFeatureEnabled } from '../features';

export function requireFeature(flag: FeatureFlag): RequestHandler {
  return (_req, res, next) => {
    if (!isFeatureEnabled(flag)) {
      res.status(403).json({ message: 'Module not enabled' });
      return;
    }
    next();
  };
}
