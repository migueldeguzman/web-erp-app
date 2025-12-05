import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as accountController from '../controllers/account.controller';

const router = Router();

router.use(authenticate);

// Get chart of accounts (hierarchical tree view)
router.get('/chart-of-accounts', accountController.getChartOfAccounts);

// List accounts with filters
router.get('/', accountController.listAccounts);

// Create new account
router.post('/', authorize('ADMIN', 'ACCOUNTANT'), accountController.createAccount);

// Get account by ID
router.get('/:id', accountController.getAccount);

// Update account
router.patch('/:id', authorize('ADMIN', 'ACCOUNTANT'), accountController.updateAccount);

// Deactivate account (soft delete)
router.delete('/:id', authorize('ADMIN'), accountController.deactivateAccount);

export default router;
