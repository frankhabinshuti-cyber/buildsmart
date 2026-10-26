import { Router } from 'express';
import { authenticate, optionalAuth, requireRole, ROLES as R } from '../middleware/auth.js'; // eslint-disable-line no-unused-vars
import { validate } from '../middleware/validate.js';
import { authLimiter, writeLimiter } from '../middleware/rateLimiters.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import * as S from '../validation/schemas.js';
import * as auth from '../controllers/auth.controller.js';
import * as projects from '../controllers/projects.controller.js';
import * as tasks from '../controllers/tasks.controller.js';
import * as expenses from '../controllers/expenses.controller.js';
import * as materials from '../controllers/materials.controller.js';
import * as quotes from '../controllers/quotations.controller.js';
import * as market from '../controllers/marketplace.controller.js';
import * as notifications from '../controllers/notifications.controller.js';
import * as dashboard from '../controllers/dashboard.controller.js';
import * as admin from '../controllers/admin.controller.js';

const router = Router();
const staff = [R.COMPANY, R.MANAGER];            // admin always passes requireRole
const providers = [R.COMPANY, R.ENGINEER, R.WORKER, R.SUPPLIER, R.MANAGER];
const notClient = [R.COMPANY, R.MANAGER, R.ENGINEER, R.WORKER, R.SUPPLIER];

router.get('/health', (req, res) => res.json({ data: { status: 'ok', time: new Date().toISOString() } }));

// ---- Authentication (public, rate limited)
router.post('/auth/register', authLimiter, validate(S.registerSchema), h(auth.register));
router.post('/auth/login', authLimiter, validate(S.loginSchema), h(auth.login));
router.post('/auth/forgot-password', authLimiter, validate(S.forgotSchema), h(auth.forgotPassword));
router.post('/auth/reset-password', authLimiter, validate(S.resetSchema), h(auth.resetPassword));
router.post('/auth/logout', authenticate, h(auth.logout));
router.get('/auth/me', authenticate, h(auth.me));
router.patch('/auth/me', authenticate, validate(S.profileSchema), h(auth.updateProfile));
router.post('/auth/change-password', authenticate, authLimiter, validate(S.changePasswordSchema), h(auth.changePassword));
router.get('/users/lookup', authenticate, requireRole(...staff), h(auth.lookupUsers));

// ---- Marketplace (reading is public)
router.get('/marketplace/categories', h(market.categories));
router.get('/marketplace/services', validate(S.serviceQuery, 'query'), h(market.listServices));
router.get('/marketplace/services/mine', authenticate, h(market.myServices));
router.get('/marketplace/services/:id', h(market.getService));
router.post('/marketplace/services', authenticate, requireRole(...providers), writeLimiter, validate(S.serviceSchema), h(market.createService));
router.put('/marketplace/services/:id', authenticate, requireRole(...providers), validate(S.serviceSchema), h(market.updateService));
router.delete('/marketplace/services/:id', authenticate, requireRole(...providers), h(market.deleteService));
router.post('/marketplace/services/:id/reviews', authenticate, requireRole(R.CLIENT), writeLimiter, validate(S.reviewSchema), h(market.addReview));
router.get('/companies', h(market.listCompanies));
router.get('/companies/mine', authenticate, requireRole(R.COMPANY), h(market.myCompany));
router.put('/companies/mine', authenticate, requireRole(R.COMPANY), validate(S.companySchema), h(market.saveCompany));

// ---- Everything below needs a login
router.use(authenticate);

router.get('/dashboard', h(dashboard.summary));

// Projects
router.get('/projects', validate(S.projectQuery, 'query'), h(projects.list));
router.post('/projects', requireRole(...staff), writeLimiter, validate(S.projectSchema), h(projects.create));
router.get('/projects/:id', h(projects.get));
router.patch('/projects/:id', validate(S.projectUpdateSchema), h(projects.update));
router.delete('/projects/:id', h(projects.archive));
router.post('/projects/:id/restore', h(projects.restore));
router.post('/projects/:id/members', validate(S.memberSchema), h(projects.addMember));
router.delete('/projects/:id/members/:userId', h(projects.removeMember));
router.post('/projects/:id/milestones', validate(S.milestoneSchema), h(projects.addMilestone));
router.put('/projects/:id/milestones/:milestoneId', validate(S.milestoneSchema), h(projects.updateMilestone));
router.delete('/projects/:id/milestones/:milestoneId', h(projects.deleteMilestone));
router.post('/projects/:id/progress', validate(S.progressSchema), h(projects.addProgress));
router.get('/projects/:id/messages', h(projects.listMessages));
router.post('/projects/:id/messages', writeLimiter, validate(S.messageSchema), h(projects.postMessage));
router.get('/projects/:id/expenses', h(expenses.list));
router.post('/projects/:id/expenses', writeLimiter, validate(S.expenseSchema), h(expenses.create));
router.patch('/expenses/:id/review', validate(S.expenseReviewSchema), h(expenses.review));

// Tasks
router.get('/tasks', validate(S.taskQuery, 'query'), h(tasks.list));
router.post('/tasks', validate(S.taskSchema), h(tasks.create));
router.patch('/tasks/:id', validate(S.taskUpdateSchema), h(tasks.update));
router.delete('/tasks/:id', h(tasks.remove));
router.get('/tasks/:id/history', h(tasks.history));

// Materials and inventory (clients cannot see stock)
router.get('/suppliers', requireRole(...notClient), h(materials.listSuppliers));
router.post('/suppliers', requireRole(...staff), validate(S.supplierSchema), h(materials.createSupplier));
router.get('/materials', requireRole(...notClient), h(materials.list));
router.post('/materials', requireRole(R.COMPANY, R.MANAGER, R.SUPPLIER), validate(S.materialSchema), h(materials.create));
router.patch('/materials/:id', requireRole(R.COMPANY, R.MANAGER, R.SUPPLIER), validate(S.materialUpdateSchema), h(materials.update));
router.get('/materials/:id/movements', requireRole(...notClient), h(materials.listMovements));
router.post('/materials/:id/movements', requireRole(...staff), writeLimiter, validate(S.movementSchema), h(materials.addMovement));

// Quotations
router.get('/quotation-requests', h(quotes.listRequests));
router.post('/quotation-requests', requireRole(R.CLIENT), writeLimiter, validate(S.quotationRequestSchema), h(quotes.createRequest));
router.get('/quotation-requests/:id', h(quotes.getRequest));
router.post('/quotation-requests/:id/quotations', requireRole(...providers), writeLimiter, validate(S.quotationSchema), h(quotes.submitQuotation));
router.post('/quotations/:id/accept', requireRole(R.CLIENT), h(quotes.accept));
router.post('/quotations/:id/reject', requireRole(R.CLIENT), h(quotes.reject));

// Notifications
router.get('/notifications', h(notifications.list));
router.get('/notifications/unread-count', h(notifications.unreadCount));
router.post('/notifications/read-all', h(notifications.markAllRead));
router.patch('/notifications/:id/read', h(notifications.markRead));

// Administration (super administrator only)
router.use('/admin', requireRole()); // empty list: only super_admin passes
router.get('/admin/stats', h(admin.stats));
router.get('/admin/users', validate(S.adminUserQuery, 'query'), h(admin.listUsers));
router.patch('/admin/users/:id', validate(S.adminUserUpdate), h(admin.updateUser));
router.get('/admin/audit-logs', h(admin.auditLogs));

export default router;
