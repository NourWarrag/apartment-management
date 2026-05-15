import { Router } from 'express';
import { FeatureFlag } from '@hotel/shared';
import { isFeatureEnabled } from '../features';

const router = Router();

router.get('/', (_req, res) => {
  const features = Object.values(FeatureFlag).reduce(
    (acc, flag) => { acc[flag] = isFeatureEnabled(flag); return acc; },
    {} as Record<FeatureFlag, boolean>
  );
  res.json({ features });
});

export default router;
