import { Router } from 'express';
import { stats, activity, revenueTrend } from '../controllers/dashboard.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/stats', stats);
router.get('/activity', activity);
router.get('/revenue-trend', revenueTrend);

export default router;
