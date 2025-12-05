import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as customerController from '../controllers/customer.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Customer CRUD routes
router.get('/', customerController.listCustomers);
router.get('/:id', customerController.getCustomer);
router.post('/', authorize('ADMIN', 'ACCOUNTANT', 'MANAGER'), customerController.createCustomer);
router.put('/:id', authorize('ADMIN', 'ACCOUNTANT', 'MANAGER'), customerController.updateCustomer);
router.delete('/:id', authorize('ADMIN'), customerController.deleteCustomer);

export default router;
