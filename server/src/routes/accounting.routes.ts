import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';
import * as accounts from '../controllers/accounting-accounts.controller';
import * as journal from '../controllers/accounting-journal.controller';
import * as reports from '../controllers/accounting-reports.controller';
import * as mapping from '../controllers/accounting-mapping.controller';
import * as taxCodes from '../controllers/accounting-taxcodes.controller';
import * as reversal from '../controllers/accounting-reversal.controller';
import * as setup from '../controllers/accounting-setup.controller';
import * as backfill from '../controllers/accounting-backfill.controller';
import * as vatReturn from '../controllers/accounting-vat-return.controller';
import * as statements from '../controllers/accounting-statements.controller';
import * as periods from '../controllers/accounting-periods.controller';
import * as yearClose from '../controllers/accounting-year-close.controller';
import * as expenses from '../controllers/accounting-expenses.controller';
import { reverseEntry as reverseEntryHandler } from '../controllers/accounting-reversal.controller';
import * as bankAccounts from '../controllers/accounting-bank-accounts.controller';
import * as bankStatements from '../controllers/accounting-bank-statements.controller';
import * as reconciliations from '../controllers/accounting-reconciliations.controller';
import { uploadFile, uploadCsv } from '../middleware/upload.middleware';

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

// Mapping
router.get('/mapping', mapping.list);
router.patch('/mapping/:key', mapping.setOne);

// Tax codes
router.get('/tax-codes', taxCodes.list);
router.post('/tax-codes', taxCodes.create);
router.patch('/tax-codes/:id', taxCodes.update);
router.post('/tax-codes/:id/deactivate', taxCodes.deactivate);

// Reversal
router.post('/payments/:id/reverse', reversal.reverse);

// VAT return
router.get('/reports/vat-return', vatReturn.vatReturn);
router.get('/reports/vat-return.csv', vatReturn.vatReturnCsv);

// Admin-only: setup + backfill
const adminOnly = requireRole(Role.ADMIN, Role.SUPER_ADMIN);
router.post('/setup', adminOnly, setup.setup);
router.post('/backfill', adminOnly, backfill.run);

// Phase 3: Statements
router.get('/reports/income-statement', statements.incomeStatement);
router.get('/reports/income-statement.csv', statements.incomeStatementCsv);
router.get('/reports/balance-sheet', statements.balanceSheet);
router.get('/reports/balance-sheet.csv', statements.balanceSheetCsv);
router.get('/reports/cash-flow', statements.cashFlow);
router.get('/reports/cash-flow.csv', statements.cashFlowCsv);

// Phase 3: Fiscal periods
router.get('/fiscal-periods', periods.list);
router.post('/fiscal-periods/:year/:month/lock', adminOnly, periods.lock);
router.post('/fiscal-periods/:year/:month/unlock', adminOnly, periods.unlock);

// Phase 3: Year-end close
router.post('/fiscal-years/:year/close', adminOnly, yearClose.close);

// Phase 3: Manual JE reversal (works on any POSTED JE except PAYMENT_AUTO)
router.post('/journal-entries/:id/reverse', reverseEntryHandler);

// Phase 3: Expense entry
router.post('/expenses', expenses.create);

// Phase 4: Bank accounts
router.get('/bank-accounts', bankAccounts.list);
router.post('/bank-accounts', bankAccounts.create);
router.patch('/bank-accounts/:id', bankAccounts.update);
router.patch('/bank-accounts/:id/csv-mapping', bankAccounts.updateCsvMapping);
router.post('/bank-accounts/:id/deactivate', bankAccounts.deactivate);

// Phase 4: Bank statements
router.post('/bank-accounts/:id/statements/preview', uploadCsv, bankStatements.preview);
router.post('/bank-accounts/:id/statements', uploadCsv, bankStatements.importStatement);
router.get('/bank-accounts/:id/statements', bankStatements.listStatements);
router.delete('/bank-statements/:id', bankStatements.deleteStatement);

// Phase 4: Reconciliations
router.post('/reconciliations', reconciliations.create);
router.get('/reconciliations', reconciliations.list);
router.get('/reconciliations/:id', reconciliations.get);
router.post('/reconciliations/:id/auto-match', reconciliations.autoMatch);
router.post('/reconciliations/:id/match', reconciliations.manualMatch);
router.delete('/reconciliations/:id/match/:bankLineId', reconciliations.unmatch);
router.post('/reconciliations/:id/adjustment', reconciliations.adjustment);
router.post('/reconciliations/:id/close', reconciliations.close);
router.post('/reconciliations/:id/reopen', adminOnly, reconciliations.reopen);
router.get('/reconciliations/:id/report.csv', reconciliations.reportCsv);

export default router;
