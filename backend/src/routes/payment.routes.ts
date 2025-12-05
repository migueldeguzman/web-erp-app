import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as paymentController from '../controllers/payment.controller';

const router = Router();

router.use(authenticate);

// List payments with filters
router.get('/', paymentController.listPayments);

// Create payment
router.post('/', authorize('ADMIN', 'ACCOUNTANT', 'MANAGER'), paymentController.createPayment);

// Get payment by ID
router.get('/:id', paymentController.getPayment);

// Post payment (create journal entry and update invoice)
router.post('/:id/post', authorize('ADMIN', 'ACCOUNTANT'), paymentController.postPayment);

// Void payment
router.post('/:id/void', authorize('ADMIN'), paymentController.voidPayment);

export default router;
