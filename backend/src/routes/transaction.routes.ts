import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as transactionController from '../controllers/transaction.controller';

const router = Router();

router.use(authenticate);

// List transactions with filters and pagination
router.get('/', transactionController.listTransactions);

// Create journal voucher (manual journal entry)
router.post('/', authorize('ADMIN', 'ACCOUNTANT'), transactionController.createJournalEntry);

// Get account balance
router.get('/account-balance/:accountId', transactionController.getAccountBalance);

// Get transaction by ID
router.get('/:id', transactionController.getTransaction);

// Post transaction (make permanent)
router.post('/:id/post', authorize('ADMIN', 'ACCOUNTANT'), transactionController.postTransaction);

// Void transaction (create reversal)
router.post('/:id/void', authorize('ADMIN'), transactionController.voidTransaction);

export default router;
