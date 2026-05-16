import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';
import * as accounts from '../controllers/accounting-accounts.controller';
import * as journal from '../controllers/accounting-journal.controller';
import * as reports from '../controllers/accounting-reports.controller';

const router = Router();

const FULL_ACCESS = [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE];

router.use(authMiddleware);
router.use(requireRole(...FULL_ACCESS));

// Chart of Accounts
router.get('/accounts', accounts.list);
router.post('/accounts', accounts.create);
router.patch('/accounts/:id', accounts.update);
router.post('/accounts/:id/activate', accounts.setActive);
router.post('/accounts/:id/deactivate', accounts.setActive);
router.post('/accounts/seed-starter', accounts.seedStarter);

// Journal entries
router.get('/journal-entries', journal.list);
router.get('/journal-entries/:id', journal.get);
router.post('/journal-entries/post', journal.createAndPost);   // static — must come before :id routes
router.post('/journal-entries', journal.createDraft);
router.patch('/journal-entries/:id', journal.updateDraft);
router.delete('/journal-entries/:id', journal.deleteDraft);
router.post('/journal-entries/:id/post', journal.postEntry);

// Reports
router.get('/reports/trial-balance', reports.trialBalance);
router.get('/reports/trial-balance.csv', reports.trialBalanceCsv);
router.get('/reports/general-ledger', reports.generalLedger);
router.get('/reports/general-ledger.csv', reports.generalLedgerCsv);

export default router;
