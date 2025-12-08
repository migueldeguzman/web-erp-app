import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as issueController from '../controllers/issue.controller';

const router = Router();

// All routes require authentication and ADMIN role
router.use(authenticate);
router.use(authorize('ADMIN'));

/**
 * Issue Management Routes (ADMIN only)
 */

// Get issue statistics (must be before /:id route)
// GET /api/admin/issues/stats
router.get('/stats', issueController.getIssueStats);

// List all issues with pagination and filters
// GET /api/admin/issues?page=1&limit=20&status=OPEN&priority=HIGH&type=BUG&search=login
router.get('/', issueController.listIssues);

// Get single issue with comments
// GET /api/admin/issues/:id
router.get('/:id', issueController.getIssueById);

// Create new issue
// POST /api/admin/issues
router.post('/', issueController.createIssue);

// Update issue
// PUT /api/admin/issues/:id
router.put('/:id', issueController.updateIssue);

// Delete issue
// DELETE /api/admin/issues/:id
router.delete('/:id', issueController.deleteIssue);

// Add comment to issue
// POST /api/admin/issues/:id/comments
router.post('/:id/comments', issueController.addComment);

export default router;
