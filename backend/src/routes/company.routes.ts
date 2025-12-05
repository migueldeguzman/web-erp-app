import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as companyController from '../controllers/company.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Company CRUD routes
router.get('/', companyController.listCompanies);
router.get('/:id', companyController.getCompany);
router.post('/', authorize('ADMIN', 'ACCOUNTANT'), companyController.createCompany);
router.put('/:id', authorize('ADMIN', 'ACCOUNTANT'), companyController.updateCompany);
router.delete('/:id', authorize('ADMIN'), companyController.deleteCompany);

export default router;
