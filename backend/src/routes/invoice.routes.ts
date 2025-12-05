import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as invoiceController from '../controllers/invoice.controller';

const router = Router();

router.use(authenticate);

// List invoices with filters
router.get('/', invoiceController.listInvoices);

// Create invoice
router.post('/', authorize('ADMIN', 'ACCOUNTANT', 'MANAGER'), invoiceController.createInvoice);

// Get invoice by ID
router.get('/:id', invoiceController.getInvoice);

// Post invoice (create journal entry)
router.post('/:id/post', authorize('ADMIN', 'ACCOUNTANT'), invoiceController.postInvoice);

// Void invoice
router.post('/:id/void', authorize('ADMIN'), invoiceController.voidInvoice);

export default router;
